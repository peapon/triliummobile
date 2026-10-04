/**
 * The main-thread ⇄ worker contract.
 *
 * The database *must* live in a worker: the OPFS SAH-Pool VFS depends on
 * `FileSystemFileHandle.createSyncAccessHandle()`, which browsers expose only to workers. That
 * constraint is also the reason upstream's own standalone build runs its entire core in a dedicated
 * worker rather than on the page.
 *
 * The split is a happy accident for the UI, though: every SQLite call in this app is synchronous and
 * potentially slow on a large vault, and behind a worker boundary none of it can block a frame.
 *
 * The engine and store run *inside* the worker unchanged — only this boundary is asynchronous, so
 * the protocol code keeps its synchronous `SqlDatabase` and stays recognisable next to upstream.
 */

import type { NoteDetail, NoteSummary } from "./data.js";

export interface AppCounts {
  notes: number;
  branches: number;
  attributes: number;
  blobs: number;
}

export interface SyncSummary {
  ok: boolean;
  pulled: number;
  pushed: number;
  diverged: number;
  durationMs: number;
  message: string;
}

export interface ProgressEvent {
  phase: "connecting" | "pulling" | "pushing" | "verifying" | "done" | "error";
  message: string;
  pulled?: number;
  outstanding?: number;
}

/** Methods the UI can call. Every one of them crosses the worker boundary. */
export interface AppApi {
  /** Resolves once the worker has opened the local replica. */
  ready(): Promise<boolean>;
  isConfigured(): Promise<boolean>;
  serverHost(): Promise<string | null>;
  counts(): Promise<AppCounts>;
  childrenOf(parentNoteId: string): Promise<NoteSummary[]>;
  childCount(parentNoteId: string): Promise<number>;
  breadcrumb(noteId: string): Promise<Array<{ noteId: string; title: string }>>;
  getNote(noteId: string): Promise<NoteDetail | null>;
  search(query: string, limit?: number): Promise<NoteSummary[]>;
  recent(limit?: number): Promise<NoteSummary[]>;
  createTextNote(options: { parentNoteId: string; title: string; content: string }): Promise<{ noteId: string }>;
  inboxNoteId(): Promise<string>;
  /** Replace a note's HTML — the tablet's light-editing path. */
  updateNoteContent(noteId: string, content: string): Promise<void>;
  /** Read a note's ink layer, creating the attachment on first save. */
  loadInk(noteId: string): Promise<{ attachmentId: string | null; doc: string | null }>;
  saveInk(noteId: string, doc: string): Promise<{ attachmentId: string }>;
  maxBlobContentSize(): Promise<number>;
  setMaxBlobContentSize(value: number): Promise<void>;
  /**
   * Fetch a stubbed note's content on demand. Returns whether anything was downloaded.
   */
  fetchNoteBlob(noteId: string): Promise<{ fetched: boolean; stubbed: boolean; bytes: number; error?: string }>;
  /** Attachments owned by a note, with a flag for ones this device has not downloaded. */
  listAttachments(
    noteId: string
  ): Promise<Array<{ attachmentId: string; role: string; title: string; mime: string; stubbed: boolean }>>;
  fetchAttachmentBlob(
    attachmentId: string
  ): Promise<{ fetched: boolean; stubbed: boolean; bytes: number; error?: string }>;
  cacheStats(): Promise<{ entries: number; bytes: number; stubbed: number; budget: number }>;
  /** Which vault this replica belongs to, for the settings screen. */
  vaultInfo(): Promise<{
    serverHost: string | null;
    documentId: string | null;
    counts: AppCounts;
  }>;
  /** Discard the local replica without touching the connection settings. */
  clearLocalData(): Promise<void>;
  setBlobBudget(bytes: number): Promise<void>;
  /**
   * Tell the worker to route HTTP through the native bridge rather than `fetch`.
   *
   * The worker cannot detect the shell itself: the injected object exists on the main frame only.
   */
  useNativeHttp(enabled: boolean): Promise<void>;
  configure(serverHost: string, password: string): Promise<void>;
  sync(): Promise<SyncSummary>;
  pendingPushCount(): Promise<number>;
  reset(): Promise<void>;
}

export type RpcMethod = keyof AppApi;

export type RpcRequest = {
  [K in RpcMethod]: { id: number; method: K; params: Parameters<AppApi[K]> };
}[RpcMethod];

export type RpcResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

/**
 * One HTTP request the worker wants performed, and its result.
 *
 * The sync engine lives in the worker (the OPFS database has to), but on HarmonyOS the only way out
 * to the network is the `triliumNative` bridge, which is injected into the main frame alone. So the
 * worker hands each request up and waits.
 */
export interface HttpRelayRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  bodyBase64: string;
}

export interface HttpRelayResult {
  status: number;
  headers: Record<string, string>;
  bodyBase64: string;
  error?: string;
}

export type WorkerMessage =
  | RpcResponse
  | { event: "progress"; progress: ProgressEvent }
  | { event: "http"; id: number; request: HttpRelayRequest };

export type MainMessage = { event: "httpResult"; id: number; result: HttpRelayResult };

/**
 * Promise-per-call proxy over `postMessage`. Deliberately minimal: no request batching, no
 * cancellation, no streaming — the UI issues one call at a time per view render, and progress
 * arrives as unsolicited events rather than being polled.
 */
export class WorkerClient implements AppApi {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

  progressHandler: ((progress: ProgressEvent) => void) | null = null;

  constructor(private readonly worker: Worker) {
    worker.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;

      if ("event" in message && message.event === "progress") {
        this.progressHandler?.(message.progress);
        return;
      }

      const response = message as RpcResponse;
      const entry = this.pending.get(response.id);
      if (!entry) return;

      this.pending.delete(response.id);
      if (response.ok) entry.resolve(response.result);
      else entry.reject(new Error(response.error));
    });
  }

  /**
   * `ReturnType<AppApi[K]>` is already the promise type, so this returns it directly rather than
   * wrapping it again — a double wrap is `Promise<Promise<T>>` and loses every method's real type.
   */
  private call<K extends RpcMethod>(method: K, ...params: Parameters<AppApi[K]>): ReturnType<AppApi[K]> {
    const id = this.nextId++;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ id, method, params });
    }) as ReturnType<AppApi[K]>;
  }

  ready = () => this.call("ready");
  isConfigured = () => this.call("isConfigured");
  serverHost = () => this.call("serverHost");
  counts = () => this.call("counts");
  childrenOf = (parentNoteId: string) => this.call("childrenOf", parentNoteId);
  childCount = (parentNoteId: string) => this.call("childCount", parentNoteId);
  breadcrumb = (noteId: string) => this.call("breadcrumb", noteId);
  getNote = (noteId: string) => this.call("getNote", noteId);
  search = (query: string, limit?: number) => this.call("search", query, limit);
  recent = (limit?: number) => this.call("recent", limit);

  createTextNote = (options: { parentNoteId: string; title: string; content: string }) =>
    this.call("createTextNote", options);

  inboxNoteId = () => this.call("inboxNoteId");
  updateNoteContent = (noteId: string, content: string) => this.call("updateNoteContent", noteId, content);
  loadInk = (noteId: string) => this.call("loadInk", noteId);
  saveInk = (noteId: string, doc: string) => this.call("saveInk", noteId, doc);
  maxBlobContentSize = () => this.call("maxBlobContentSize");
  setMaxBlobContentSize = (value: number) => this.call("setMaxBlobContentSize", value);
  fetchNoteBlob = (noteId: string) => this.call("fetchNoteBlob", noteId);
  listAttachments = (noteId: string) => this.call("listAttachments", noteId);
  fetchAttachmentBlob = (attachmentId: string) => this.call("fetchAttachmentBlob", attachmentId);
  cacheStats = () => this.call("cacheStats");
  vaultInfo = () => this.call("vaultInfo");
  clearLocalData = () => this.call("clearLocalData");
  setBlobBudget = (bytes: number) => this.call("setBlobBudget", bytes);
  useNativeHttp = (enabled: boolean) => this.call("useNativeHttp", enabled);
  configure = (serverHost: string, password: string) => this.call("configure", serverHost, password);
  sync = () => this.call("sync");
  pendingPushCount = () => this.call("pendingPushCount");
  reset = () => this.call("reset");
}

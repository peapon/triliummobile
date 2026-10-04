/**
 * The worker half: owns the local replica, the transport and the sync engine.
 *
 * Everything below this file is the same code the Node integration tests exercise — the worker only
 * adds an RPC skin, because the storage driver requires a worker's synchronous OPFS access.
 */

import { BlobCache, DEFAULT_BLOB_CACHE_BYTES } from "../../../src/store/blob-cache.js";
import { NoteQueries } from "./data.js";
import type { HttpRelayResult, MainMessage } from "./rpc.js";
import type { ProgressEvent, RpcRequest, WorkerMessage } from "./rpc.js";
import { LocalStore, OPTION_DOCUMENT_SECRET, OPTION_SYNC_MAX_BLOB_CONTENT_SIZE, OPTION_SYNC_SERVER_HOST } from "../../../src/store/local-store.js";
import { openSqliteWasmDatabase } from "../../../src/store/sqlite-wasm.js";
import { SyncEngine } from "../../../src/sync/engine.js";
import { DEFAULT_MAX_BLOB_CONTENT_SIZE, SyncTransport } from "../../../src/sync/transport.js";

const OPTION_INBOX_NOTE_ID = "triliumMobile.inboxNoteId";
const OPTION_BLOB_BUDGET = "triliumMobile.blobCacheBudget";
const ROOT_NOTE_ID = "root";

let store: LocalStore;
let queries: NoteQueries;
let peerInstanceId: string | null = null;

/**
 * A logged-in transport, kept so out-of-band blob fetches reuse the session instead of performing
 * their own HMAC login per download.
 */
let session: SyncTransport | null = null;

/**
 * Whether HTTP must go through the native bridge.
 *
 * Set by {@link handle} when the main frame reports that a bridge exists. The worker cannot tell on
 * its own: `triliumNative` is injected into the main frame, not into workers.
 */
let useNativeHttp = false;
let relaySeq = 1;
const relayPending = new Map<number, (result: HttpRelayResult) => void>();

/**
 * `fetch`, implemented as a request to the main frame.
 *
 * Shaped like the real thing so `SyncTransport` cannot tell the difference — it already accepts a
 * `fetchImpl`, which is why this costs the protocol nothing.
 */
async function bridgeFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const method = (init.method ?? "GET").toUpperCase();

  const headers: Record<string, string> = {};
  new Headers(init.headers ?? {}).forEach((value, key) => {
    headers[key] = value;
  });

  const bodyBase64 = init.body ? bytesToBase64(await bodyBytes(init.body)) : "";

  const id = relaySeq++;
  const result = await new Promise<HttpRelayResult>((resolve) => {
    relayPending.set(id, resolve);
    post({ event: "http", id, request: { url, method, headers, bodyBase64 } });
  });

  if (result.error && result.status === 0) throw new TypeError(result.error);

  const bytes = base64ToBytes(result.bodyBase64);
  const body = result.status === 204 || result.status === 304 ? null : bytes;

  return new Response(body, {
    status: result.status,
    headers: new Headers(result.headers ?? {})
  });
}

async function bodyBytes(body: BodyInit): Promise<Uint8Array> {
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  return new TextEncoder().encode(String(body));
}

function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(out);
}

function base64ToBytes(base64: string): Uint8Array {
  if (base64 === "") return new Uint8Array(0);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function ensureSession(): Promise<SyncTransport> {
  if (session) return session;

  const host = store.getOption(OPTION_SYNC_SERVER_HOST);
  const secret = store.getOption(OPTION_DOCUMENT_SECRET);
  if (!host || !secret) throw new Error("尚未配置服务端");

  const probe = new SyncTransport({
    serverHost: host,
    documentSecret: secret,
    syncVersion: 0,
    ...(useNativeHttp ? { fetchImpl: bridgeFetch as typeof fetch } : {})
  });
  const status = await probe.getSetupStatus();

  const transport = new SyncTransport({
    serverHost: host,
    documentSecret: secret,
    syncVersion: status.syncVersion,
    maxBlobContentSize: maxBlobContentSize(),
    ...(useNativeHttp ? { fetchImpl: bridgeFetch as typeof fetch } : {})
  });

  await transport.login();
  session = transport;
  return transport;
}

function blobBudgetBytes(): number {
  const raw = store.getOption(OPTION_BLOB_BUDGET);
  const parsed = raw === null ? DEFAULT_BLOB_CACHE_BYTES : Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_BLOB_CACHE_BYTES;
}

function post(message: WorkerMessage): void {
  (globalThis as unknown as Worker).postMessage(message);
}

function report(progress: ProgressEvent): void {
  post({ event: "progress", progress });
}

/** The instance id must outlive reloads, or every restart re-pushes the whole journal. */
async function persistentInstanceId(): Promise<string> {
  const cacheKey = "triliummobile.instanceId";

  // OPFS is the durable store, but the id is needed before the database opens, so it also goes in
  // the Cache API — available in a worker, unlike localStorage.
  try {
    const cache = await caches.open("triliummobile");
    const hit = await cache.match(cacheKey);
    if (hit) return await hit.text();

    const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    const value = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");

    await cache.put(cacheKey, new Response(value));
    return value;
  } catch {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
  }
}

async function boot(): Promise<void> {
  const instanceId = await persistentInstanceId();
  const db = await openSqliteWasmDatabase({ filename: "document.db", vfs: "opfs-sahpool" });

  store = new LocalStore(db, instanceId);
  store.initializeSchema();
  queries = new NoteQueries(store.database);
}

/**
 * Capture target. Trilium has no inbox convention, so the client keeps its own: one note under root
 * whose id is remembered, created on first capture. Capturing straight into `root` would mix quick
 * notes into the user's real top-level structure.
 */
function ensureInbox(): string {
  const remembered = store.getOption(OPTION_INBOX_NOTE_ID);
  if (remembered && store.queryRaw("SELECT 1 AS x FROM notes WHERE noteId = ?", [remembered])) {
    return remembered;
  }

  const existing = store.queryRaw("SELECT noteId FROM notes WHERE title = ? AND isDeleted = 0 LIMIT 1", [
    "速记 Inbox"
  ]);

  if (existing?.noteId) {
    store.setOption(OPTION_INBOX_NOTE_ID, String(existing.noteId));
    return String(existing.noteId);
  }

  const created = store.createTextNote({
    parentNoteId: ROOT_NOTE_ID,
    title: "速记 Inbox",
    content: "<p>由 TriliumMobile 自动创建，手机端的速记都会落在这里。</p>"
  });

  store.setOption(OPTION_INBOX_NOTE_ID, created.noteId);
  return created.noteId;
}

/**
 * First-run setup: resolve the sync credentials from the server.
 *
 * The password is used exactly once, to read the seed. Upstream's HMAC login never sees it — which
 * is also why TOTP cannot be enforced on the sync path at all.
 */
async function configure(serverHost: string, password: string): Promise<void> {
  const probe = new SyncTransport({
    serverHost,
    documentSecret: "",
    syncVersion: 0,
    ...(useNativeHttp ? { fetchImpl: bridgeFetch as typeof fetch } : {})
  });
  const status = await probe.getSetupStatus();

  if (!status.isInitialized) {
    throw new Error("该服务端尚未初始化，请先在浏览器里完成一遍 Trilium 初始化。");
  }

  const seed = await probe.fetchSyncSeed(password);
  const documentId = seed.options.find((option) => option.name === "documentId")?.value;
  const documentSecret = seed.options.find((option) => option.name === "documentSecret")?.value;

  if (!documentSecret || !documentId) {
    throw new Error("服务端没有返回 documentId / documentSecret，密码可能不正确。");
  }

  store.setOption(OPTION_SYNC_SERVER_HOST, serverHost.replace(/\/+$/, ""));
  store.setOption(OPTION_DOCUMENT_SECRET, documentSecret);
  session = null;
}

async function sync(): Promise<{
  ok: boolean;
  pulled: number;
  pushed: number;
  diverged: number;
  durationMs: number;
  message: string;
}> {
  const host = store.getOption(OPTION_SYNC_SERVER_HOST);
  const secret = store.getOption(OPTION_DOCUMENT_SECRET);

  if (!host || !secret) throw new Error("尚未配置服务端");

  report({ phase: "connecting", message: "正在连接服务端…" });

  const transport = new SyncTransport({
    serverHost: host,
    documentSecret: secret,
    // Read from the server rather than assumed: a mismatch is a hard 400 with no fallback, and the
    // released 0.106.0 reports 39 while `main` reports 40.
    syncVersion: 0,
    maxBlobContentSize: maxBlobContentSize(),
    ...(useNativeHttp ? { fetchImpl: bridgeFetch as typeof fetch } : {})
  });

  const status = await transport.getSetupStatus();
  transport.syncVersion = status.syncVersion;

  // Publish the session so out-of-band blob fetches reuse it rather than logging in again.
  session = transport;

  const engine = new SyncEngine({
    store,
    transport,
    onProgress: ({ pulled, outstanding }) =>
      report({
        phase: "pulling",
        message: outstanding > 0 ? `正在拉取…还剩 ${outstanding} 项` : "正在拉取…",
        pulled,
        outstanding
      })
  });

  report({ phase: "pushing", message: "正在推送本地改动…" });

  try {
    const result = await engine.sync();
    peerInstanceId = transport.serverInstanceId;

    if (result.divergedSectors.length > 0) {
      const message = `内容哈希校验未通过：${result.divergedSectors.length} 个分区不一致`;
      report({ phase: "error", message });
      return {
        ok: false,
        pulled: result.pulled,
        pushed: result.pushed,
        diverged: result.divergedSectors.length,
        durationMs: result.durationMs,
        message
      };
    }

    report({ phase: "done", message: "同步完成" });

    return {
      ok: true,
      pulled: result.pulled,
      pushed: result.pushed,
      diverged: 0,
      durationMs: result.durationMs,
      message: `同步完成：拉取 ${result.pulled} 项，用时 ${(result.durationMs / 1000).toFixed(1)}s`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report({ phase: "error", message });
    return { ok: false, pulled: 0, pushed: 0, diverged: 0, durationMs: 0, message };
  }
}

function maxBlobContentSize(): number {
  const raw = store.getOption(OPTION_SYNC_MAX_BLOB_CONTENT_SIZE);
  if (raw === null) return DEFAULT_MAX_BLOB_CONTENT_SIZE;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_MAX_BLOB_CONTENT_SIZE;
}

async function handle(request: Exclude<RpcRequest, { method: "ready" }>): Promise<unknown> {
  switch (request.method) {
    case "isConfigured":
      return Boolean(store.getOption(OPTION_SYNC_SERVER_HOST)) && Boolean(store.getOption(OPTION_DOCUMENT_SECRET));
    case "serverHost":
      return store.getOption(OPTION_SYNC_SERVER_HOST);
    case "counts":
      return queries.counts();
    case "childrenOf":
      return queries.childrenOf(request.params[0]);
    case "childCount":
      return queries.childCount(request.params[0]);
    case "breadcrumb":
      return queries.breadcrumb(request.params[0]);
    case "getNote":
      return queries.getNote(request.params[0]);
    case "search":
      return queries.search(request.params[0], request.params[1] ?? 40);
    case "recent":
      return queries.recent(request.params[0] ?? 30);
    case "createTextNote":
      return store.createTextNote(request.params[0]);
    case "inboxNoteId":
      return ensureInbox();
    case "updateNoteContent":
      store.updateNoteContent(request.params[0], request.params[1]);
      return undefined;
    case "loadInk": {
      const noteId = request.params[0];
      const attachment = store.findInkAttachment(noteId);
      if (!attachment) return { attachmentId: null, doc: null };

      return {
        attachmentId: attachment.attachmentId,
        doc: store.readAttachmentContent(attachment.attachmentId)
      };
    }
    case "saveInk": {
      const noteId = request.params[0];
      const doc = request.params[1];
      const existing = store.findInkAttachment(noteId);

      if (existing) {
        store.updateAttachmentContent(existing.attachmentId, doc);
        return { attachmentId: existing.attachmentId };
      }

      const created = store.createAttachment({
        ownerId: noteId,
        role: "ink",
        mime: "application/json",
        title: "ink-main.json",
        content: doc
      });

      // The note references its ink layer, so the placeholder travels with the note itself rather
      // than being inferred from whichever attachments happen to exist (ADR D7).
      const note = queries.getNote(noteId);
      if (note && !note.content.includes("trilium-ink")) {
        store.updateNoteContent(noteId, `${note.content}<div class="trilium-ink" data-ink-id="main"></div>`);
      }

      return { attachmentId: created.attachmentId };
    }
    case "maxBlobContentSize":
      return maxBlobContentSize();
    case "setMaxBlobContentSize":
      store.setOption(OPTION_SYNC_MAX_BLOB_CONTENT_SIZE, String(request.params[0]));
      return undefined;
    case "useNativeHttp":
      useNativeHttp = request.params[0];
      return undefined;
    case "configure":
      return configure(request.params[0], request.params[1]);
    case "sync":
      return sync();
    case "pendingPushCount": {
      const pending = store.collectChangesToPush().filter(
        (change) => !peerInstanceId || change.instanceId !== peerInstanceId
      );
      return pending.length;
    }
    case "fetchNoteBlob": {
      const transport = await ensureSession();
      return new BlobCache(store, transport, blobBudgetBytes()).ensureNote(request.params[0]);
    }
    case "fetchAttachmentBlob": {
      const transport = await ensureSession();
      return new BlobCache(store, transport, blobBudgetBytes()).ensureAttachment(request.params[0]);
    }
    case "listAttachments":
      return store.listAttachments(request.params[0]).map((attachment) => ({
        attachmentId: attachment.attachmentId,
        role: attachment.role,
        title: attachment.title,
        mime: attachment.mime,
        stubbed: attachment.blobId ? store.isBlobStubbed(attachment.blobId) : false
      }));
    case "cacheStats":
      return { ...store.cacheStats(), budget: blobBudgetBytes() };
    case "setBlobBudget":
      store.setOption(OPTION_BLOB_BUDGET, String(request.params[0]));
      store.evictBlobs(request.params[0]);
      return undefined;
    case "reset":
      store.setOption(OPTION_DOCUMENT_SECRET, "");
      store.setOption(OPTION_SYNC_SERVER_HOST, "");
      peerInstanceId = null;
      session = null;
      return undefined;
  }
}

/**
 * Opening the database is asynchronous and every handler needs it, so requests queue behind this
 * promise rather than being rejected while the WASM module loads.
 */
const ready: Promise<void> = boot().catch((error) => {
  post({
    event: "progress",
    progress: { phase: "error", message: `本地数据库初始化失败：${String(error)}` }
  });
  throw error;
});

globalThis.addEventListener("message", async (event: MessageEvent<RpcRequest | MainMessage>) => {
  const request = event.data as RpcRequest & MainMessage;

  // A relay reply is not a request: it resolves the promise `bridgeFetch` is awaiting.
  if ((request as MainMessage).event === "httpResult") {
    const settle = relayPending.get(request.id);
    if (settle) {
      relayPending.delete(request.id);
      settle(request.result);
    }
    return;
  }

  try {
    await ready;

    if (request.method === "ready") {
      post({ id: request.id, ok: true, result: true });
      return;
    }

    const result = await handle(request);
    post({ id: request.id, ok: true, result });
  } catch (error) {
    post({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

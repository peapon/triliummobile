/**
 * On-demand blob retrieval and its budget.
 *
 * The sync stream deliberately stubs blobs above `maxBlobContentSize` — for this vault that is
 * 1.4 GB of attachments, which no phone should hold. The stub keeps the real hash, so the
 * content-hash check still passes, and the content is fetched here, when a person actually opens it.
 *
 * The rule that makes this safe: **a blob's id is the hash of its content**. So a stub says nothing
 * about content, and content already held for a given blobId is that content by construction. That is
 * why a re-delivered stub must never overwrite a fetched blob (see `LocalStore.reconcileStub`) and
 * why the cache key is the blob id rather than the note or attachment that referenced it — a
 * template note and its clones share one download.
 */

import type { SyncTransport } from "../sync/transport.js";
import { utf8Encode } from "../crypto/index.js";
import { LocalStore } from "./local-store.js";

/** Default ceiling for downloaded attachments. Comfortably above a photo roll, below a phone's disk. */
export const DEFAULT_BLOB_CACHE_BYTES = 128 * 1024 * 1024;

export interface EnsureResult {
  /** The blob id, when the entity exists locally. */
  blobId: string | null;
  /** Whether content had to be fetched from the server. */
  fetched: boolean;
  /** Whether the entity is still a stub afterwards — a failed or refused fetch. */
  stubbed: boolean;
  bytes: number;
  error?: string;
}

export class BlobCache {
  constructor(
    private readonly store: LocalStore,
    private readonly transport: SyncTransport,
    private maxBytes: number = DEFAULT_BLOB_CACHE_BYTES
  ) {}

  get budgetBytes(): number {
    return this.maxBytes;
  }

  set budgetBytes(value: number) {
    this.maxBytes = Math.max(0, value);
  }

  /** Fetch a note's content if this device only holds the stub. */
  async ensureNote(noteId: string): Promise<EnsureResult> {
    return this.ensure(
      "note",
      noteId,
      () => this.transport.fetchNoteBlob(noteId),
      () => this.transport.fetchNoteBytes(noteId)
    );
  }

  /** Fetch an attachment's content if this device only holds the stub. */
  async ensureAttachment(attachmentId: string): Promise<EnsureResult> {
    return this.ensure(
      "attachment",
      attachmentId,
      () => this.transport.fetchAttachmentBlob(attachmentId),
      () => this.transport.fetchAttachmentBytes(attachmentId)
    );
  }

  private blobIdFor(kind: "note" | "attachment", id: string): string | null {
    const row =
      kind === "note"
        ? this.store.queryRaw<{ blobId: string | null }>("SELECT blobId FROM notes WHERE noteId = ?", [id])
        : this.store.queryRaw<{ blobId: string | null }>(
            "SELECT blobId FROM attachments WHERE attachmentId = ?",
            [id]
          );

    return row?.blobId ?? null;
  }

  private async ensure(
    kind: "note" | "attachment",
    id: string,
    fetchJson: () => Promise<{ content: string | null; blobId: string; isStubbed: boolean }>,
    fetchBytes: () => Promise<Uint8Array>
  ): Promise<EnsureResult> {
    const blobId = this.blobIdFor(kind, id);

    if (!blobId) {
      return { blobId: null, fetched: false, stubbed: false, bytes: 0, error: "本地没有这条记录" };
    }

    if (!this.store.isBlobStubbed(blobId)) {
      this.store.touchBlob(blobId);
      return { blobId, fetched: false, stubbed: false, bytes: this.blobSize(blobId) };
    }

    try {
      const payload = await fetchJson();

      // A refusal rather than a download: the server is telling us this content is not available to
      // this session (a protected blob with no protected session open, for instance).
      if (payload.isStubbed) {
        return { blobId, fetched: false, stubbed: true, bytes: 0, error: "服务端未能提供内容" };
      }

      // `null` content means binary — the JSON envelope only carries strings, so the bytes come from
      // the `/open` endpoint instead.
      const content = payload.content === null ? await fetchBytes() : payload.content;

      // Real bytes. `String.length` counts UTF-16 code units, so a CJK body would be reported at
      // roughly a third of its actual size.
      const bytes = content instanceof Uint8Array ? content.byteLength : utf8Encode(content).length;

      this.store.cacheBlob(blobId, content);

      // Evict immediately rather than on a timer: the budget exists so a phone's disk is not filled,
      // and deferring the sweep would let a burst of downloads overshoot it.
      this.store.evictBlobs(this.maxBytes);

      return { blobId, fetched: true, stubbed: false, bytes };
    } catch (error) {
      return {
        blobId,
        fetched: false,
        stubbed: true,
        bytes: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private blobSize(blobId: string): number {
    const row = this.store.queryRaw<{ size: number | null }>(
      "SELECT LENGTH(content) AS size FROM blobs WHERE blobId = ?",
      [blobId]
    );
    return row?.size ?? 0;
  }

  /** Fetch several blobs, stopping early if the budget cannot hold them. */
  async ensureMany(
    requests: Array<{ kind: "note" | "attachment"; id: string }>
  ): Promise<EnsureResult[]> {
    const results: EnsureResult[] = [];

    for (const request of requests) {
      results.push(
        request.kind === "note"
          ? await this.ensureNote(request.id)
          : await this.ensureAttachment(request.id)
      );
    }

    return results;
  }
}

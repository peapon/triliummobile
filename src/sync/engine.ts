/**
 * The sync engine: one round of Trilium's protocol, ported from `services/sync.ts`.
 *
 * Upstream's order is not arbitrary and is reproduced exactly:
 *
 *     login -> push -> pull -> push -> finished -> content-hash check
 *
 * The push before the pull is what lets a change we already hold reach the server before its
 * version arrives; the push after the pull is what delivers anything the pull *bounced* (our copy
 * was newer, so it was re-stamped and must go out). Dropping either one desynchronises quietly.
 *
 * The content-hash check closes the round. It is the only thing that detects the failure mode this
 * protocol actually has: every HTTP call succeeds, and the two sides still disagree.
 */

import { computeEntityHashes, diffEntityHashes, toHashable, type FailedCheck } from "./content-hash.js";
import { SyncTransport } from "./transport.js";
import type { EntityChange, EntityChangeRecord } from "./types.js";
import { LocalStore } from "../store/local-store.js";

/** `MAX_SECTOR_RESYNC_ATTEMPTS` — after this many failed checks the round gives up loudly. */
export const MAX_SECTOR_RESYNC_ATTEMPTS = 3;

/** Safety valve so a server that never reports progress cannot spin forever. */
const MAX_PULL_PAGES = 100_000;
const MAX_PUSH_BATCHES = 100_000;

export interface SyncRoundResult {
  pushed: number;
  pulled: number;
  erased: number;
  bouncedBack: number;
  pullPages: number;
  pushBatches: number;
  durationMs: number;
  divergedSectors: FailedCheck[];
}

export interface EngineOptions {
  store: LocalStore;
  transport: SyncTransport;
  /** Called after each applied batch so a UI can invalidate what changed. */
  onApplied?: (updated: Record<string, string[]>) => void;
  /** Reports progress during a long initial sync. */
  onProgress?: (progress: { pulled: number; outstanding: number }) => void;
}

export class SyncEngine {
  constructor(private readonly options: EngineOptions) {}

  private get store(): LocalStore {
    return this.options.store;
  }

  private get transport(): SyncTransport {
    return this.options.transport;
  }

  async sync(): Promise<SyncRoundResult> {
    const started = Date.now();

    const login = await this.transport.login();
    const peerInstanceId = login.instanceId;

    // A server whose journal ends below our cursor means we are ahead of it — upstream lowers the
    // cursor here, which is the "document directory was copied to a new device" recovery path.
    if (this.store.lastSyncedPull > login.maxEntityChangeId) {
      this.store.lastSyncedPull = login.maxEntityChangeId;
    }

    const before = this.store.lastSyncedPush;
    const pushStats = { batches: 0 };
    await this.pushChanges(peerInstanceId, pushStats);

    const pullStats = await this.pullChanges(peerInstanceId);

    await this.pushChanges(peerInstanceId, pushStats);

    await this.transport.finished();

    const diverged = await this.verifyContentHash();

    return {
      pushed: this.store.lastSyncedPush - before,
      pulled: pullStats.records,
      erased: pullStats.erased,
      bouncedBack: pullStats.bounced,
      pullPages: pullStats.pages,
      pushBatches: pushStats.batches,
      durationMs: Date.now() - started,
      divergedSectors: diverged
    };
  }

  // --------------------------------------------------------------------- push

  /**
   * `pushChanges()`.
   *
   * The cursor discipline is the subtle part. Rows stamped with the peer's instance id are skipped,
   * and the cursor is allowed to advance over them — but only persisted when nothing was actually
   * sent. When something *is* sent, the cursor takes the id of the last record in the request, which
   * may be lower than a skipped row's id; that row is then re-examined next round. Advancing past it
   * would drop it, which is precisely the bug upstream's own comment warns about.
   */
  private async pushChanges(
    peerInstanceId: string,
    stats: { batches: number }
  ): Promise<void> {
    let cursor = this.store.lastSyncedPush;

    for (let guard = 0; guard < MAX_PUSH_BATCHES; guard++) {
      const rows = this.store.collectChangesToPush();
      if (rows.length === 0) return;

      const outgoing: EntityChange[] = [];
      for (const ec of rows) {
        if (this.store.isOwnEcho(ec, peerInstanceId)) {
          cursor = ec.id ?? cursor;
          continue;
        }
        outgoing.push(ec);
      }

      if (outgoing.length === 0) {
        // The whole batch was the peer's; persist the advance and fetch the next one.
        this.store.lastSyncedPush = cursor;
        continue;
      }

      const records = this.buildEntityChangeRecords(outgoing);
      await this.transport.update(records, this.store.localInstanceId);
      stats.batches++;

      const lastSent = records[records.length - 1]?.entityChange.id;
      if (lastSent !== undefined) {
        cursor = lastSent;
        this.store.lastSyncedPush = lastSent;
      } else {
        return;
      }
    }

    throw new Error(`Push did not converge after ${MAX_PUSH_BATCHES} batches`);
  }

  /** Attach each change's entity row, base64-encoding blob content as the wire format requires. */
  private buildEntityChangeRecords(changes: EntityChange[]): EntityChangeRecord[] {
    const records: EntityChangeRecord[] = [];

    for (const ec of changes) {
      const entity = this.readEntityRow(ec.entityName, ec.entityId);
      records.push(entity ? { entityChange: ec, entity } : { entityChange: ec });
    }

    return records;
  }

  private readEntityRow(entityName: string, entityId: string): Record<string, unknown> | undefined {
    const pk = ENTITY_PK[entityName];
    if (!pk) return undefined;

    const found = this.options.store.queryRaw(`SELECT * FROM "${entityName}" WHERE "${pk}" = ?`, [
      entityId
    ]);
    if (!found) return undefined;

    if (entityName === "blobs" && found.content !== null && found.content !== undefined) {
      found.content = encodeBlobContent(found.content);
    }

    return found;
  }

  // --------------------------------------------------------------------- pull

  private async pullChanges(peerInstanceId: string): Promise<{
    records: number;
    erased: number;
    bounced: number;
    pages: number;
  }> {
    let cursor = this.store.lastSyncedPull;
    let records = 0;
    let erased = 0;
    let bounced = 0;
    let pages = 0;

    for (; pages < MAX_PULL_PAGES; pages++) {
      const page = await this.transport.getChanged(cursor, this.store.localInstanceId);

      if (page.entityChanges.length === 0 && page.outstandingPullCount === 0) break;

      if (page.entityChanges.length > 0) {
        const applied = this.store.applyEntityChanges(page.entityChanges, peerInstanceId);
        records += applied.applied + applied.erased;
        erased += applied.erased;
        bounced += applied.bouncedBack;
        this.options.onApplied?.(applied.updated);
      }

      // The server deliberately withholds cursor advancement past rows it did not serve, so this
      // value — not the requested id, and not maxEntityChangeId — is the new cursor.
      cursor = page.lastEntityChangeId;
      this.store.lastSyncedPull = cursor;

      this.options.onProgress?.({ pulled: records, outstanding: page.outstandingPullCount });

      if (page.outstandingPullCount === 0 && page.entityChanges.length === 0) break;
      if (page.entityChanges.length === 0) break;
    }

    return { records, erased, bounced, pages };
  }

  // ----------------------------------------------------------- content hash

  /**
   * `checkContentHash()` — fold our journal and compare with the server's, sector by sector.
   *
   * On a mismatch the sector is queued on *both* sides and the round retries, because the usual
   * cause is a specific batch which was lost or half-applied. After three attempts the mismatch is
   * returned rather than swallowed: a silent divergence is the one outcome worth failing loudly on.
   */
  private async verifyContentHash(): Promise<FailedCheck[]> {
    let lastFailures: FailedCheck[] = [];

    for (let attempt = 1; attempt <= MAX_SECTOR_RESYNC_ATTEMPTS; attempt++) {
      const local = computeEntityHashes(this.journal());
      const remote = await this.transport.check();
      const failures = diffEntityHashes(local, remote.entityHashes);

      if (failures.length === 0) return [];

      lastFailures = failures;

      if (attempt === MAX_SECTOR_RESYNC_ATTEMPTS) break;

      for (const failure of failures) {
        await this.transport.queueSector(failure.entityName, failure.sector);
      }

      await this.pullChanges(this.transport.serverInstanceId ?? "");
      await this.pushChanges(this.transport.serverInstanceId ?? "", { batches: 0 });
      await this.transport.finished();
    }

    return lastFailures;
  }

  /** The journal in `entity_changes.id` order, which is the order the fold depends on. */
  private journal(): EntityChange[] {
    return this.options.store.allChanges();
  }
}

const ENTITY_PK: Record<string, string> = {
  notes: "noteId",
  branches: "branchId",
  attributes: "attributeId",
  revisions: "revisionId",
  attachments: "attachmentId",
  blobs: "blobId",
  options: "name",
  etapi_tokens: "etapiTokenId"
};

/** `encodeBase64` for push: text content becomes UTF-8 bytes first, then base64. */
function encodeBlobContent(content: unknown): string {
  if (typeof content === "string") {
    return Buffer.from(content, "utf8").toString("base64");
  }
  if (content instanceof Uint8Array) {
    return Buffer.from(content).toString("base64");
  }
  return "";
}

export { toHashable };

/**
 * The local replica: schema, option access, journal application and cursor bookkeeping.
 *
 * This is the client-side port of two upstream modules, and it follows them clause by clause
 * because the rules are load-bearing rather than stylistic:
 *
 * - `services/sync_update.ts` — `updateEntities` / `updateNormalEntity` / `eraseEntity`
 * - `services/entity_changes.ts` — `putEntityChange` and its three variants
 *
 * The one rule worth stating up front: **a hash received from a peer is stored verbatim and never
 * recomputed.** Hashes are the protocol's currency, and recomputing them would reintroduce every
 * ambiguity upstream's own history has (see `../entities/hashes.ts`).
 */

import {
  calculateBlobHash,
  generateEntityHash,
  toEntityRow,
  type EntityName
} from "../entities/hashes.js";
import { base64Decode, hashedBlobId, utf8Encode } from "../crypto/index.js";
import { randomString } from "../util/random.js";
import type { SqlDatabase, SqlValue } from "./database.js";
import {
  BOOLEAN_INT_COLUMNS,
  EMPTY_BLOB_ID,
  ENTITY_PRIMARY_KEYS,
  ERASABLE_ENTITIES,
  SCHEMA_SQL
} from "./schema.js";
import type { EntityChange, EntityChangeRecord } from "../sync/types.js";

/** Options the client owns locally. Mirrors the names upstream stores. */
export const OPTION_LAST_SYNCED_PULL = "lastSyncedPull";
export const OPTION_LAST_SYNCED_PUSH = "lastSyncedPush";
export const OPTION_DOCUMENT_ID = "documentId";
export const OPTION_DOCUMENT_SECRET = "documentSecret";
export const OPTION_SYNC_SERVER_HOST = "syncServerHost";
export const OPTION_SYNC_MAX_BLOB_CONTENT_SIZE = "syncMaxBlobContentSize";
/** Ceiling for downloaded attachments. Local-only, so it survives a vault switch. */
export const OPTION_BLOB_CACHE_BUDGET = "triliumMobile.blobCacheBudget";

/**
 * Options that participate in sync. Upstream keeps a whitelist; everything else is local-only and
 * must never be pushed, which is what `isSynced = 0` on the options row encodes.
 */
export const SYNCED_OPTIONS = new Set([
  "dbVersion",
  "initialized",
  "documentId",
  "documentSecret",
  "syncServerHost",
  "syncServerTimeout",
  "syncProxy",
  "syncMaxBlobContentSize",
  "theme",
  "locale",
  "textNoteEditorType",
  "codeNoteTheme",
  "spellCheckEnabled",
  "spellCheckLanguageCode",
  "firstDayOfWeek",
  "firstWeekOfYear",
  "minDaysInFirstWeek"
]);

export interface ApplyResult {
  applied: number;
  erased: number;
  skippedAlreadyApplied: number;
  bouncedBack: number;
  /** entityName -> entityIds written, for UI invalidation. */
  updated: Record<string, string[]>;
}

export class LocalStore {
  constructor(
    private readonly db: SqlDatabase,
    /** This installation's 12-character id, used to stamp changes we originate. */
    private readonly instanceId: string = randomString(12)
  ) {
    // Search matches a note's *text*, not its mark-up: a query for "div" matched 42 notes by finding
    // `<div>`, and not one of them had it in the title. `LIKE` cannot skip tags on its own.
    db.registerFunction("strip_tags", (html) =>
      typeof html === "string" ? html.replace(/<[^>]*>/g, " ") : ""
    );
}

  get localInstanceId(): string {
    return this.instanceId;
  }

  /** The underlying handle, for read-only query helpers that live outside the protocol layer. */
  get database(): SqlDatabase {
    return this.db;
  }

  initializeSchema(): void {
    this.db.exec(SCHEMA_SQL);
  }

  // ------------------------------------------------------------------ options

  getOption(name: string): string | null {
    const row = this.db.get<{ value: string }>("SELECT value FROM options WHERE name = ?", [name]);
    return row?.value ?? null;
  }

  /** Options holding numbers are stored as text upstream (`lastSyncedPull` is often "57818.0"). */
  getNumericOption(name: string, fallback = 0): number {
    const raw = this.getOption(name);
    if (raw === null) return fallback;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  setOption(name: string, value: string, synced = false): void {
    this.db.run(
      `INSERT OR REPLACE INTO options (name, value, isSynced, utcDateModified)
       VALUES (?, ?, ?, ?)`,
      [name, value, synced || SYNCED_OPTIONS.has(name) ? 1 : 0, utcNowDateTime()]
    );
  }

  setNumericOption(name: string, value: number): void {
    // Upstream writes these via `String(number)`, which is what produces the "57818" form seen in
    // real databases. The float-tolerant reader above exists because some are stored as "57818.0".
    this.setOption(name, String(value));
  }

  get lastSyncedPull(): number {
    return this.getNumericOption(OPTION_LAST_SYNCED_PULL, 0);
  }

  set lastSyncedPull(value: number) {
    this.setNumericOption(OPTION_LAST_SYNCED_PULL, value);
  }

  get lastSyncedPush(): number {
    return this.getNumericOption(OPTION_LAST_SYNCED_PUSH, 0);
  }

  set lastSyncedPush(value: number) {
    this.setNumericOption(OPTION_LAST_SYNCED_PUSH, value);
  }

  // ------------------------------------------------------- journal bookkeeping

  /**
   * `putEntityChange()` — normalise and upsert a journal row.
   *
   * `instanceId` defaults to *ours*, which is what makes a change eligible for pushing. Passing a
   * peer's instance id is how a received change is prevented from bouncing straight back.
   */
  putEntityChange(ec: Partial<EntityChange> & { entityName: string; entityId: string }): void {
    const changeId = ec.changeId ?? randomString(12);
    const instanceId = ec.instanceId ?? this.instanceId;

    this.db.run(
      `INSERT OR REPLACE INTO entity_changes
         (entityName, entityId, hash, isErased, changeId, componentId, instanceId, isSynced, utcDateChanged)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ec.entityName,
        ec.entityId,
        ec.hash ?? "",
        toInt(ec.isErased),
        changeId,
        ec.componentId ?? "NA",
        instanceId,
        ec.isSynced ? 1 : 0,
        ec.utcDateChanged ?? utcNowDateTime()
      ]
    );
  }

  /**
   * `putEntityChangeForOtherInstances()` — the conflict bounce-back.
   *
   * When our copy of an entity is strictly newer than the peer's, the peer's row is *not* applied.
   * Re-stamping our change with a fresh `changeId` and our own `instanceId` is what puts it back in
   * the push queue so the other side eventually learns about it. Skipping this loses the edit
   * silently and permanently.
   */
  private putEntityChangeForOtherInstances(localEC: EntityChange): void {
    this.putEntityChange({ ...localEC, changeId: undefined, instanceId: this.instanceId });
  }

  // ------------------------------------------------------------------- apply

  /**
   * `updateEntities()` — apply a batch of pulled records.
   *
   * `senderInstanceId` is the *peer's* id (from login), and it is what received rows get stamped
   * with so the next push skips them.
   */
  applyEntityChanges(records: EntityChangeRecord[], senderInstanceId: string): ApplyResult {
    const result: ApplyResult = {
      applied: 0,
      erased: 0,
      skippedAlreadyApplied: 0,
      bouncedBack: 0,
      updated: {}
    };

    if (records.length === 0) return result;

    this.db.transaction(() => {
      for (const record of records) {
        const { entityChange } = record;

        // At-least-once delivery: a change we have already seen is skipped by its changeId.
        const alreadyApplied = this.db.get(
          "SELECT 1 AS present FROM entity_changes WHERE changeId = ?",
          [entityChange.changeId]
        );
        if (alreadyApplied) {
          result.skippedAlreadyApplied++;
          continue;
        }

        // Options with isSynced = false arrive without a row; nothing to apply.
        if (!record.entity && entityChange.entityName === "options") continue;

        if (entityChange.entityName === "note_reordering") {
          this.applyNoteReordering(entityChange, record.entity);
          result.applied++;
          continue;
        }

        const outcome = this.applyNormalEntity(entityChange, record.entity, senderInstanceId);
        if (outcome === "applied") result.applied++;
        else if (outcome === "erased") result.erased++;
        else if (outcome === "bounced") result.bouncedBack++;

        if (outcome === "applied" || outcome === "erased") {
          const list = (result.updated[entityChange.entityName] ??= []);
          list.push(entityChange.entityId);
        }
      }
    });

    return result;
  }

  private applyNormalEntity(
    remoteEC: EntityChange,
    remoteEntityRow: Record<string, unknown> | undefined,
    senderInstanceId: string
  ): "applied" | "erased" | "bounced" | "noop" {
    const localEC = this.db.get<EntityChange>(
      "SELECT * FROM entity_changes WHERE entityName = ? AND entityId = ?",
      [remoteEC.entityName, remoteEC.entityId]
    );

    const remoteChangedAt = remoteEC.utcDateChanged;
    const localIsOlderOrSame =
      !!localEC && !!localEC.utcDateChanged && !!remoteChangedAt && localEC.utcDateChanged <= remoteChangedAt;

    if (!localEC || localIsOlderOrSame) {
      if (remoteEC.isErased) {
        this.eraseEntity(remoteEC);
      } else {
        if (!remoteEntityRow) {
          throw new Error(
            `Empty entity row for ${remoteEC.entityName}/${remoteEC.entityId} (changeId ${remoteEC.changeId})`
          );
        }
        const row = this.reconcileStub(remoteEC.entityName, remoteEntityRow);
        this.replaceRow(remoteEC.entityName, row);
      }

      if (
        !localEC ||
        localIsOlderOrSame ||
        localEC.hash !== remoteEC.hash ||
        toInt(localEC.isErased) !== toInt(remoteEC.isErased)
      ) {
        // Stamped with the *peer's* instance id: we are not the origin, so this must not be pushed.
        this.putEntityChange({ ...remoteEC, instanceId: senderInstanceId });
      }

      return remoteEC.isErased ? "erased" : "applied";
    }

    if (
      (localEC.hash !== remoteEC.hash || toInt(localEC.isErased) !== toInt(remoteEC.isErased)) &&
      !localIsOlderOrSame
    ) {
      this.putEntityChangeForOtherInstances(localEC);
      return "bounced";
    }

    return "noop";
  }

  /**
   * Refuse to let a sync stub erase content this device already downloaded.
   *
   * A stub carries empty content but the *real* hash, so it says nothing about the content — while a
   * blob's id is the hash of its content, so a blobId we already hold content for is, by
   * construction, that same content. Re-applying a stub over a fetched blob would silently throw the
   * download away and re-stub the note.
   */
  private reconcileStub(entityName: string, row: Record<string, unknown>): Record<string, unknown> {
    const processed = preProcessContent(entityName, row);

    if (entityName !== "blobs") return processed;

    const blobId = processed.blobId;
    if (typeof blobId !== "string" || blobId === EMPTY_BLOB_ID) return processed;
    if (!isStubContent(processed.content)) return processed;

    const cached = this.db.get<{ content: unknown }>(
      "SELECT content FROM blobs WHERE blobId = ?",
      [blobId]
    );

    if (cached && !isStubContent(cached.content)) {
      return { ...processed, content: cached.content };
    }

    return processed;
  }

  // ------------------------------------------------------------ blob cache

  /**
   * Whether a blob's stored content is a sync stub rather than its real content.
   *
   * `EMPTY_BLOB_ID` is excluded because empty content is a legitimate state for a genuinely empty
   * note, and an empty note must not be offered as "download this".
   */
  isBlobStubbed(blobId: string): boolean {
    if (blobId === EMPTY_BLOB_ID) return false;

    const row = this.db.get<{ content: unknown }>("SELECT content FROM blobs WHERE blobId = ?", [blobId]);
    return !row || isStubContent(row.content);
  }

  /** Store content fetched out of band, and record it for the LRU sweep. */
  cacheBlob(blobId: string, content: string | Uint8Array, now: Date = new Date()): void {
    const bytes = typeof content === "string" ? utf8Encode(content).length : content.byteLength;

    this.db.transaction(() => {
      this.db.run("UPDATE blobs SET content = ? WHERE blobId = ?", [content, blobId]);
      this.db.run(
        `INSERT INTO blob_cache (blobId, byteSize, lastAccess) VALUES (?, ?, ?)
         ON CONFLICT(blobId) DO UPDATE SET byteSize = excluded.byteSize, lastAccess = excluded.lastAccess`,
        [blobId, bytes, utcNowDateTime(now)]
      );
    });
  }

  /** Record a read, so the sweep evicts what is genuinely least used. */
  touchBlob(blobId: string, now: Date = new Date()): void {
    this.db.run("UPDATE blob_cache SET lastAccess = ? WHERE blobId = ?", [utcNowDateTime(now), blobId]);
  }

  /**
   * Drop least-recently-used downloaded blobs until the cache fits its budget.
   *
   * Eviction restores the stub — empty content — which is exactly the state the blob arrived in, so
   * an evicted blob is indistinguishable from one that was never fetched. The `entity_changes` row is
   * deliberately untouched: the hash describes the real content and must not be recomputed from a
   * stub.
   */
  evictBlobs(maxBytes: number, now: Date = new Date()): { evicted: number; freedBytes: number } {
    const total = this.db.get<{ bytes: number | null }>(
      "SELECT SUM(byteSize) AS bytes FROM blob_cache"
    );
    let excess = (total?.bytes ?? 0) - maxBytes;

    if (excess <= 0) return { evicted: 0, freedBytes: 0 };

    const candidates = this.db.all<{ blobId: string; byteSize: number }>(
      "SELECT blobId, byteSize FROM blob_cache ORDER BY lastAccess ASC"
    );

    let evicted = 0;
    let freedBytes = 0;

    for (const candidate of candidates) {
      if (excess <= 0) break;

      this.db.run("UPDATE blobs SET content = '' WHERE blobId = ?", [candidate.blobId]);
      this.db.run("DELETE FROM blob_cache WHERE blobId = ?", [candidate.blobId]);

      excess -= candidate.byteSize;
      freedBytes += candidate.byteSize;
      evicted++;
    }

    void now;
    return { evicted, freedBytes };
  }

  cacheStats(): { entries: number; bytes: number; stubbed: number } {
    const row = this.db.get<{ entries: number; bytes: number | null }>(
      "SELECT COUNT(*) AS entries, SUM(byteSize) AS bytes FROM blob_cache"
    );

    const stubbed = this.db.get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM blobs
        WHERE blobId != ? AND (content IS NULL OR LENGTH(content) = 0)`,
      [EMPTY_BLOB_ID]
    );

    return { entries: row?.entries ?? 0, bytes: row?.bytes ?? 0, stubbed: stubbed?.c ?? 0 };
  }

  /** `eraseEntity()` — a tombstone deletes the row, for exactly these tables. */
  private eraseEntity(ec: EntityChange): void {
    if (!ERASABLE_ENTITIES.has(ec.entityName)) {
      // Upstream logs "Cannot erase" and leaves the row alone; there is no row to leave here either.
      return;
    }

    const pk = ENTITY_PRIMARY_KEYS[ec.entityName];
    if (!pk) return;

    this.db.run(`DELETE FROM "${ec.entityName}" WHERE "${pk}" = ?`, [ec.entityId]);
  }

  /** `note_reordering` carries a map of `{branchId: notePosition}` rather than a table row. */
  private applyNoteReordering(ec: EntityChange, entity: Record<string, unknown> | undefined): void {
    if (!entity) return;

    for (const [branchId, notePosition] of Object.entries(entity)) {
      this.db.run("UPDATE branches SET notePosition = ? WHERE branchId = ?", [
        notePosition as SqlValue,
        branchId
      ]);
    }

    this.putEntityChange({ ...ec, instanceId: this.instanceId });
  }

  private replaceRow(entityName: string, row: Record<string, unknown>): void {
    const keys = Object.keys(row);
    if (keys.length === 0) return;

    const booleans = BOOLEAN_INT_COLUMNS[entityName] ?? [];
    const values = keys.map((key) => {
      const value = row[key];
      if (booleans.includes(key)) return toInt(value);
      return (value ?? null) as SqlValue;
    });

    const columns = keys.map((k) => `"${k}"`).join(", ");
    const placeholders = keys.map(() => "?").join(", ");

    this.db.run(
      `INSERT OR REPLACE INTO "${entityName}" (${columns}) VALUES (${placeholders})`,
      values
    );
  }

  // -------------------------------------------------------------------- push

  /**
   * `pushChanges()` — the rows this client must send.
   *
   * Two filters, both essential: `isSynced = 1` excludes local-only options, and skipping rows
   * stamped with the *peer's* instance id stops us echoing back everything we just pulled.
   */
  collectChangesToPush(limit = 1000): EntityChange[] {
    const rows = this.db.all<EntityChange>(
      `SELECT * FROM entity_changes WHERE isSynced = 1 AND id > ? ORDER BY id LIMIT ?`,
      [this.lastSyncedPush, limit]
    );
    return rows;
  }

  /** The peer's journal rows are also skipped on push, but the cursor must move past them. */
  isOwnEcho(ec: EntityChange, peerInstanceId: string | null): boolean {
    return peerInstanceId !== null && ec.instanceId === peerInstanceId;
  }

  // -------------------------------------------------------------- local writes

  /**
   * Create a text note under `parentNoteId` — the phone's primary action ("速记").
   *
   * This is the first write path in the client, and it is where the hash rules finally matter: an
   * entity we originate has no hash to inherit, so one must be computed, using the creation-path
   * convention (`../entities/hashes.ts`). Getting it wrong here does not fail the push — it makes
   * the other side's content-hash check disagree, every round, forever.
   */
  /**
   * Create a note under `parentNoteId`, with its own blob.
   *
   * One path for every note type this client can make. Text and image notes differ only in `type`,
   * `mime`, and whether the bytes are a string or a `Uint8Array` — the rows, the branch, and the
   * three entity changes are identical, which is exactly how Trilium models it. An image note is not
   * a special case in the database; it is a note whose blob happens to be a PNG.
   */
  createNote(options: {
    parentNoteId: string;
    title: string;
    type: string;
    mime: string;
    content: string | Uint8Array;
    now?: Date;
  }): { noteId: string; branchId: string; blobId: string } {
    const now = options.now ?? new Date();
    const utc = utcNowDateTime(now);
    const local = localDateTime(now);

    const noteId = randomString(12);
    const branchId = randomString(12);
    const blobId = hashedBlobId(options.content);

    const blobRow = {
      blobId,
      content: options.content,
      textRepresentation: null,
      dateModified: local,
      utcDateModified: utc
    };

    const noteRow = {
      noteId,
      title: options.title,
      isProtected: 0,
      type: options.type,
      mime: options.mime,
      blobId,
      isDeleted: 0,
      deleteId: null,
      dateCreated: local,
      dateModified: local,
      utcDateCreated: utc,
      utcDateModified: utc
    };

    const branchRow = {
      branchId,
      noteId,
      parentNoteId: options.parentNoteId,
      notePosition: this.nextNotePosition(options.parentNoteId),
      prefix: null,
      isExpanded: 0,
      isDeleted: 0,
      deleteId: null,
      utcDateModified: utc
    };

    this.db.transaction(() => {
      this.replaceRow("blobs", blobRow);
      this.replaceRow("notes", noteRow);
      this.replaceRow("branches", branchRow);

      // Blob hashing has its own formula, so it does not go through `recordLocalChange`.
      this.putEntityChange({
        entityName: "blobs",
        entityId: blobId,
        hash: calculateBlobHash(blobRow),
        isErased: 0,
        utcDateChanged: utc,
        isSynced: 1
      });
      this.recordLocalChange("notes", noteId, noteRow, utc);
      this.recordLocalChange("branches", branchId, branchRow, utc);
    });

    return { noteId, branchId, blobId };
  }

  createTextNote(options: {
    parentNoteId: string;
    title: string;
    content: string;
    now?: Date;
  }): { noteId: string; branchId: string; blobId: string } {
    return this.createNote({ ...options, type: "text", mime: "text/html" });
  }

  /** An image note: the picture is the note, which is how Trilium stores a standalone image. */
  createImageNote(options: {
    parentNoteId: string;
    title: string;
    mime: string;
    bytes: Uint8Array;
    now?: Date;
  }): { noteId: string; branchId: string; blobId: string } {
    const mime = options.mime.startsWith("image/") ? options.mime : "image/png";
    return this.createNote({
      parentNoteId: options.parentNoteId,
      title: options.title,
      type: "image",
      mime,
      content: options.bytes,
      now: options.now
    });
  }

  updateNoteContent(noteId: string, content: string, now: Date = new Date()): void {
    const existing = this.db.get<{ blobId: string | null }>(
      "SELECT blobId FROM notes WHERE noteId = ?",
      [noteId]
    );

    if (!existing) throw new Error(`Cannot update content of unknown note ${noteId}`);

    const utc = utcNowDateTime(now);
    const local = localDateTime(now);
    const blobId = hashedBlobId(content);

    this.db.transaction(() => {
      const blobRow = {
        blobId,
        content,
        textRepresentation: null,
        dateModified: local,
        utcDateModified: utc
      };

      this.replaceRow("blobs", blobRow);
      this.db.run(
        "UPDATE notes SET blobId = ?, dateModified = ?, utcDateModified = ? WHERE noteId = ?",
        [blobId, local, utc, noteId]
      );

      this.recordLocalChange("blobs", blobId, blobRow, utc);

      const noteRow = this.db.get<Record<string, unknown>>("SELECT * FROM notes WHERE noteId = ?", [noteId]);
      if (noteRow) this.recordLocalChange("notes", noteId, noteRow, utc);
    });
  }

  /**
   * Create an attachment owned by a note — where ink stroke files live (see ADR D7).
   *
   * Attachments are ordinary synced entities: a blob holds the bytes and the attachment row binds it
   * to its owner, so an ink file reaches every other device through the same journal as everything
   * else, with no side channel.
   */
  createAttachment(options: {
    ownerId: string;
    role: string;
    mime: string;
    title: string;
    /** `string` for the text-ish attachments this client already made (ink JSON); bytes otherwise. */
    content: string | Uint8Array;
    now?: Date;
  }): { attachmentId: string; blobId: string } {
    const now = options.now ?? new Date();
    const utc = utcNowDateTime(now);
    const local = localDateTime(now);

    const attachmentId = randomString(12);
    const blobId = hashedBlobId(options.content);

    const blobRow = {
      blobId,
      content: options.content,
      textRepresentation: null,
      dateModified: local,
      utcDateModified: utc
    };

    const attachmentRow = {
      attachmentId,
      ownerId: options.ownerId,
      role: options.role,
      mime: options.mime,
      title: options.title,
      isProtected: 0,
      position: this.nextAttachmentPosition(options.ownerId),
      blobId,
      dateModified: local,
      utcDateModified: utc,
      utcDateScheduledForErasureSince: null,
      isDeleted: 0,
      deleteId: null
    };

    this.db.transaction(() => {
      this.replaceRow("blobs", blobRow);
      this.replaceRow("attachments", attachmentRow);
      this.recordLocalChange("blobs", blobId, blobRow, utc);
      this.recordLocalChange("attachments", attachmentId, attachmentRow, utc);
    });

    return { attachmentId, blobId };
  }

  /**
   * Replace an attachment's content.
   *
   * An ink layer is rewritten on every save, and because blobs are content-addressed each save also
   * produces a new blob; the old one becomes unreferenced and the server's own sweep collects it.
   */
  updateAttachmentContent(attachmentId: string, content: string, now: Date = new Date()): void {
    const existing = this.db.get<{ ownerId: string }>(
      "SELECT ownerId FROM attachments WHERE attachmentId = ?",
      [attachmentId]
    );

    if (!existing) throw new Error(`Cannot update content of unknown attachment ${attachmentId}`);

    const utc = utcNowDateTime(now);
    const local = localDateTime(now);
    const blobId = hashedBlobId(content);

    this.db.transaction(() => {
      const blobRow = {
        blobId,
        content,
        textRepresentation: null,
        dateModified: local,
        utcDateModified: utc
      };

      this.replaceRow("blobs", blobRow);
      this.db.run(
        "UPDATE attachments SET blobId = ?, dateModified = ?, utcDateModified = ? WHERE attachmentId = ?",
        [blobId, local, utc, attachmentId]
      );

      this.recordLocalChange("blobs", blobId, blobRow, utc);

      const attachmentRow = this.db.get<Record<string, unknown>>(
        "SELECT * FROM attachments WHERE attachmentId = ?",
        [attachmentId]
      );
      if (attachmentRow) this.recordLocalChange("attachments", attachmentId, attachmentRow, utc);
    });
  }

  /** A note's ink layer, identified by the conventional title. */
  findInkAttachment(noteId: string): { attachmentId: string; title: string } | null {
    const row = this.db.get<{ attachmentId: string; title: string }>(
      `SELECT attachmentId, title FROM attachments
        WHERE ownerId = ? AND role = 'ink' AND isDeleted = 0
        ORDER BY position LIMIT 1`,
      [noteId]
    );
    return row ?? null;
  }

  /** Attachments owned by a note, newest last. Used to find a note's ink file. */
  listAttachments(ownerId: string): Array<{ attachmentId: string; role: string; title: string; mime: string; blobId: string | null }> {
    return this.db.all(
      `SELECT attachmentId, role, title, mime, blobId FROM attachments
        WHERE ownerId = ? AND isDeleted = 0 ORDER BY position`,
      [ownerId]
    );
  }

  /** An attachment's raw bytes and mime, for rendering an inline image. */
  readAttachmentBytes(attachmentId: string): { content: unknown; mime: string } | null {
    const row = this.db.get<{ content: unknown; mime: string }>(
      `SELECT b.content AS content, a.mime AS mime FROM attachments a JOIN blobs b ON b.blobId = a.blobId
        WHERE a.attachmentId = ?`,
      [attachmentId]
    );
    return row ?? null;
  }

  /** Decoded text content of an attachment, for reading a stroke file back. */
  readAttachmentContent(attachmentId: string): string | null {
    const row = this.db.get<{ content: unknown }>(
      `SELECT b.content FROM attachments a JOIN blobs b ON b.blobId = a.blobId
        WHERE a.attachmentId = ?`,
      [attachmentId]
    );

    if (!row) return null;
    if (typeof row.content === "string") return row.content;
    if (row.content instanceof Uint8Array) return new TextDecoder().decode(row.content);
    return null;
  }

  /**
   * Record a change this client originated.
   *
   * The row is normalised before hashing: upstream hashes *entity objects* (`isProtected` as a
   * boolean), so hashing the raw SQLite row would produce a hash no peer agrees with.
   */
  private recordLocalChange(entityName: EntityName, entityId: string, row: Record<string, unknown>, utc: string): void {
    this.putEntityChange({
      entityName,
      entityId,
      hash: generateEntityHash(entityName, toEntityRow(entityName, row)),
      isErased: 0,
      utcDateChanged: utc,
      isSynced: 1
    });
  }

  private nextAttachmentPosition(ownerId: string): number {
    const row = this.db.get<{ maxPosition: number | null }>(
      "SELECT MAX(position) AS maxPosition FROM attachments WHERE ownerId = ? AND isDeleted = 0",
      [ownerId]
    );
    return (row?.maxPosition ?? 0) + 10;
  }

  /** Positions are spaced by 10 upstream, so a note can always be slotted between two others. */
  private nextNotePosition(parentNoteId: string): number {
    const row = this.db.get<{ maxPosition: number | null }>(
      "SELECT MAX(notePosition) AS maxPosition FROM branches WHERE parentNoteId = ? AND isDeleted = 0",
      [parentNoteId]
    );
    return (row?.maxPosition ?? 0) + 10;
  }

  // ------------------------------------------------------------------ helpers

  /** Generic single-row read, for the engine's entity lookups and the blob cache. */
  queryRaw<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []): T | undefined {
    return this.db.get<T>(sql, params);
  }

  /** The whole journal in id order — the order the content-hash fold depends on. */
  allChanges(): EntityChange[] {
    return this.db.all<EntityChange>("SELECT * FROM entity_changes WHERE isSynced = 1 ORDER BY id");
  }

  count(entityName: string): number {
    const row = this.db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM "${entityName}"`);
    return row?.c ?? 0;
  }

  maxJournalId(): number {
    const row = this.db.get<{ m: number | null }>("SELECT MAX(id) AS m FROM entity_changes");
    return row?.m ?? 0;
  }

  /**
   * Discard the local replica, keeping only this device's connection settings.
   *
   * A replica belongs to exactly one vault, identified by its `documentId`. Pointing the client at a
   * different server without wiping first leaves the previous vault's rows in place while the cursors
   * still index the *old* server's journal — and the next sync then pushes those rows to the new
   * server and pulls its rows on top. The two vaults interleave, and the damage is not reversible
   * from this side.
   *
   * Everything derived from the vault goes: the entity tables, the journal, the blob cache, and every
   * option that arrived over sync. The transport settings survive, because they are how the client is
   * told where to go next.
   */
  wipeReplica(): void {
    const preserved = new Set([
      OPTION_SYNC_SERVER_HOST,
      OPTION_DOCUMENT_SECRET,
      OPTION_SYNC_MAX_BLOB_CONTENT_SIZE,
      OPTION_BLOB_CACHE_BUDGET
    ]);

    this.db.transaction(() => {
      for (const table of [
        "notes",
        "branches",
        "attributes",
        "revisions",
        "attachments",
        "blobs",
        "etapi_tokens",
        "entity_changes",
        "blob_cache"
      ]) {
        this.db.run(`DELETE FROM "${table}"`);
      }

      // Options are a mix of vault data and this device's own settings, so they are filtered rather
      // than truncated. The inbox id lives here too, and it pointed at a note in the other vault.
      const names = this.db.all<{ name: string }>("SELECT name FROM options");
      for (const { name } of names) {
        if (!preserved.has(name)) this.db.run("DELETE FROM options WHERE name = ?", [name]);
      }

      this.setNumericOption(OPTION_LAST_SYNCED_PULL, 0);
      this.setNumericOption(OPTION_LAST_SYNCED_PUSH, 0);
    });
  }

  /** The vault this replica belongs to, or null when it has never synced. */
  get documentId(): string | null {
    return this.getOption(OPTION_DOCUMENT_ID);
  }

  set documentId(value: string | null) {
    if (value === null) this.db.run("DELETE FROM options WHERE name = ?", [OPTION_DOCUMENT_ID]);
    else this.setOption(OPTION_DOCUMENT_ID, value);
  }

  close(): void {
    this.db.close();
  }
}

/** `dateUtils.utcNowDateTime()` — ISO-8601 with a space separator, keeping the trailing `Z`. */
export function utcNowDateTime(date: Date = new Date()): string {
  return date.toISOString().replace("T", " ");
}

/** `dateUtils.localNowDateTime()` — the same instant with the local offset, as Trilium stores it. */
export function localDateTime(date: Date = new Date()): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(offsetMinutes);

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.` +
    `${pad(date.getMilliseconds(), 3)}${sign}${pad(Math.floor(absolute / 60))}${pad(absolute % 60)}`
  );
}

function toInt(value: unknown): number {
  return value ? 1 : 0;
}

/**
 * `preProcessContent()` — blob content travels base64-encoded and is stored as bytes.
 *
 * An empty result becomes `""` rather than a zero-length buffer: upstream notes that a zero-length
 * buffer historically round-tripped as NULL and was flagged as an inconsistency.
 */
export function preProcessContent(
  entityName: string,
  row: Record<string, unknown>
): Record<string, unknown> {
  if (entityName !== "blobs" || row.content === null || row.content === undefined) {
    return row;
  }

  if (typeof row.content !== "string") {
    return row;
  }

  const bytes = base64ToBytes(row.content);
  return { ...row, content: bytes.length === 0 ? "" : bytes };
}

/**
 * Whether stored content is a sync stub.
 *
 * An empty string, a zero-length buffer and NULL are all "no content here"; which one appears
 * depends on whether the row was written by a pull, by a fetch or by eviction.
 */
export function isStubContent(content: unknown): boolean {
  if (content === null || content === undefined) return true;
  if (typeof content === "string") return content.length === 0;
  if (content instanceof Uint8Array) return content.byteLength === 0;
  return false;
}

export function base64ToBytes(base64: string): Uint8Array {
  if (base64 === "") return new Uint8Array(0);
  // Portable decode rather than `Buffer`: this module runs inside a WebView worker, where `Buffer`
  // does not exist.
  return base64Decode(base64);
}

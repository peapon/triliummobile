/**
 * Trilium's database schema, copied verbatim from the reference implementation.
 *
 * A sync client must reproduce the server's schema exactly: the protocol applies raw rows
 * (`REPLACE INTO <entityName>`), so a missing column or a different type surfaces as a corrupt
 * local replica rather than an error.
 *
 * Source: `packages/trilium-core/src/assets/schema.sql` (upstream, main branch).
 *
 * Deviations from upstream, deliberate and confined to this file:
 * - `recent_notes`, `user_data` and `sessions` are omitted: they are local-only, never synced.
 * - Indexes that exist purely for desktop search (`IDX_notes_title`, `IDX_notes_type`, the date
 *   indexes) are kept, because a mobile client searches locally too.
 */

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "entity_changes" (
                                                id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                                                entityName TEXT NOT NULL,
                                                entityId TEXT NOT NULL,
                                                hash TEXT NOT NULL,
                                                isErased INT NOT NULL,
                                                changeId TEXT NOT NULL,
                                                componentId TEXT NOT NULL,
                                                instanceId TEXT NOT NULL,
                                                isSynced INTEGER NOT NULL,
                                                utcDateChanged TEXT NOT NULL
                                                );
CREATE TABLE IF NOT EXISTS "etapi_tokens"
(
    etapiTokenId TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    tokenHash TEXT NOT NULL,
    utcDateCreated TEXT NOT NULL,
    utcDateModified TEXT NOT NULL,
    isDeleted INT NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS "branches" (
                                          branchId TEXT NOT NULL,
                                          noteId TEXT NOT NULL,
                                          parentNoteId TEXT NOT NULL,
                                          notePosition INTEGER NOT NULL,
                                          prefix TEXT,
                                          isExpanded INTEGER NOT NULL DEFAULT 0,
                                          isDeleted INTEGER NOT NULL DEFAULT 0,
                                          deleteId TEXT DEFAULT NULL,
                                          utcDateModified TEXT NOT NULL,
                                          PRIMARY KEY(branchId));
CREATE TABLE IF NOT EXISTS "notes" (
                                       noteId TEXT NOT NULL,
                                       title TEXT NOT NULL DEFAULT "note",
                                       isProtected INT NOT NULL DEFAULT 0,
                                       type TEXT NOT NULL DEFAULT 'text',
                                       mime TEXT NOT NULL DEFAULT 'text/html',
                                       blobId TEXT DEFAULT NULL,
                                       isDeleted INT NOT NULL DEFAULT 0,
                                       deleteId TEXT DEFAULT NULL,
                                       dateCreated TEXT NOT NULL,
                                       dateModified TEXT NOT NULL,
                                       utcDateCreated TEXT NOT NULL,
                                       utcDateModified TEXT NOT NULL,
                                       PRIMARY KEY(noteId));
CREATE TABLE IF NOT EXISTS "revisions" (revisionId TEXT NOT NULL PRIMARY KEY,
                                             noteId TEXT NOT NULL,
                                             type TEXT DEFAULT '' NOT NULL,
                                             mime TEXT DEFAULT '' NOT NULL,
                                             title TEXT NOT NULL,
                                             description TEXT DEFAULT '' NOT NULL,
                                             source TEXT DEFAULT 'auto' NOT NULL,
                                             isProtected INT NOT NULL DEFAULT 0,
                                             blobId TEXT DEFAULT NULL,
                                             utcDateLastEdited TEXT NOT NULL,
                                             utcDateCreated TEXT NOT NULL,
                                             utcDateModified TEXT NOT NULL,
                                             dateLastEdited TEXT NOT NULL,
                                             dateCreated TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS "options"
(
    name TEXT not null PRIMARY KEY,
    value TEXT not null,
    isSynced INTEGER default 0 not null,
    utcDateModified TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS "attributes"
(
    attributeId      TEXT not null primary key,
    noteId       TEXT not null,
    type         TEXT not null,
    name         TEXT not null,
    value        TEXT default '' not null,
    position     INT  default 0 not null,
    utcDateModified TEXT not null,
    isDeleted    INT  not null,
    deleteId     TEXT DEFAULT NULL,
    isInheritable int DEFAULT 0 NULL);
CREATE TABLE IF NOT EXISTS "blobs" (
                                               blobId TEXT NOT NULL,
                                               content TEXT NULL DEFAULT NULL,
                                               textRepresentation TEXT DEFAULT NULL,
                                               dateModified TEXT NOT NULL,
                                               utcDateModified TEXT NOT NULL,
                                               PRIMARY KEY(blobId)
);
CREATE TABLE IF NOT EXISTS "attachments"
(
    attachmentId      TEXT not null primary key,
    ownerId       TEXT not null,
    role         TEXT not null,
    mime         TEXT not null,
    title        TEXT not null,
    isProtected    INT  not null DEFAULT 0,
    position     INT  default 0 not null,
    blobId    TEXT DEFAULT null,
    dateModified TEXT NOT NULL,
    utcDateModified TEXT not null,
    utcDateScheduledForErasureSince TEXT DEFAULT NULL,
    isDeleted    INT  not null,
    deleteId    TEXT DEFAULT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS "IDX_entityChanges_entityName_entityId" ON "entity_changes" (entityName, entityId);
CREATE INDEX IF NOT EXISTS "IDX_entity_changes_changeId" ON "entity_changes" (changeId);
CREATE INDEX IF NOT EXISTS IDX_entity_changes_isSynced_id ON entity_changes (isSynced, id);
CREATE INDEX IF NOT EXISTS IDX_entity_changes_isErased_entityName ON entity_changes (isErased, entityName);
CREATE INDEX IF NOT EXISTS IDX_branches_noteId_parentNoteId ON branches (noteId, parentNoteId);
CREATE INDEX IF NOT EXISTS IDX_branches_parentNoteId_isDeleted_notePosition ON branches (parentNoteId, isDeleted, notePosition);
CREATE INDEX IF NOT EXISTS IDX_notes_title ON notes (title);
CREATE INDEX IF NOT EXISTS IDX_notes_type ON notes (type);
CREATE INDEX IF NOT EXISTS IDX_notes_blobId on notes (blobId);
CREATE INDEX IF NOT EXISTS IDX_revisions_blobId on revisions (blobId);
CREATE INDEX IF NOT EXISTS IDX_revisions_noteId ON revisions (noteId);
CREATE INDEX IF NOT EXISTS IDX_attachments_blobId on attachments (blobId);
CREATE INDEX IF NOT EXISTS IDX_attachments_ownerId_role on attachments (ownerId, role);
CREATE INDEX IF NOT EXISTS IDX_attributes_name_value on attributes (name, value);
CREATE INDEX IF NOT EXISTS IDX_attributes_noteId_index on attributes (noteId);
CREATE INDEX IF NOT EXISTS IDX_attributes_value_index on attributes (value);

-- Local-only. The server has no such table and nothing here is ever synced: it tracks which blobs
-- this device has actually downloaded, so an LRU sweep can hand the space back. Upstream keeps
-- local-only tables too (recent_notes, user_data, sessions); this one is ours.
CREATE TABLE IF NOT EXISTS blob_cache (
    blobId     TEXT PRIMARY KEY,
    byteSize   INTEGER NOT NULL,
    lastAccess TEXT NOT NULL
);
`;

/**
 * The blob id of genuinely empty content.
 *
 * A sync stub — a blob whose real content exceeded this device's size cap — is served with empty
 * content, so "empty" alone does not identify one. Upstream distinguishes them by comparing against
 * this constant, and content-addressing makes that sound: a blob's id *is* the hash of its content,
 * so empty content can only carry this id.
 */
export const EMPTY_BLOB_ID = "z4PhNX7vuL3xVChQ1m2A";

/**
 * Tables that participate in sync, and the column that identifies a row.
 *
 * `note_reordering` is deliberately absent: it is a pseudo-entity that exists only in
 * `entity_changes`, and it is excluded from the content-hash fold.
 */
export const ENTITY_PRIMARY_KEYS: Record<string, string> = {
  notes: "noteId",
  branches: "branchId",
  attributes: "attributeId",
  revisions: "revisionId",
  attachments: "attachmentId",
  blobs: "blobId",
  options: "name",
  etapi_tokens: "etapiTokenId"
};

/**
 * Tables an erase (`isErased = 1`) deletes from. Upstream hard-codes exactly this list
 * (`sync_update.ts`); anything else logs "Cannot erase" and leaves the row alone.
 */
export const ERASABLE_ENTITIES = new Set([
  "notes",
  "branches",
  "attributes",
  "revisions",
  "attachments",
  "blobs"
]);

/**
 * Columns whose values must round-trip as integers even though they arrive as JSON booleans.
 * Writing `true` into an INTEGER column makes SQLite store `1` anyway, but being explicit keeps
 * the local rows byte-identical to the server's, which is what the hash fold compares.
 */
export const BOOLEAN_INT_COLUMNS: Record<string, readonly string[]> = {
  notes: ["isProtected", "isDeleted"],
  branches: ["isExpanded", "isDeleted"],
  attributes: ["isDeleted", "isInheritable"],
  revisions: ["isProtected"],
  attachments: ["isProtected", "isDeleted"],
  options: ["isSynced"],
  etapi_tokens: ["isDeleted"],
  entity_changes: ["isErased", "isSynced"]
};

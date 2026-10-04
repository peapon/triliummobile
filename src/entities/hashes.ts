/**
 * Entity hashes — the single most failure-prone part of the Trilium sync protocol.
 *
 * Upstream computes a hash per entity and folds it into a content hash that both peers compare at
 * the end of every sync round. If a client's formula differs by one byte, sync appears to work and
 * then loops forever on `CONTENT_HASH_MISMATCH`. So this module ports the rules literally:
 *
 * - `hashedProperties` are joined as `` `|${value}` `` in the **declared order**.
 * - `undefined`/`null` stringify as JS `String()` would (`"undefined"` / `"null"`), not `""`.
 * - `generateHash(isDeleted)` appends a literal `"|deleted"` when the flag is set.
 * - The result is truncated to 10 characters.
 * - `blobs` bypasses all of the above with its own formula.
 *
 * Sources (read directly, not inferred):
 * - `packages/trilium-core/src/becca/entities/abstract_becca_entity.ts:63-76`
 * - `packages/trilium-core/src/becca/entities/{bnote,bbranch,battribute,brevision,battachment,bblob,boption,betapi_token}.ts`
 * - `packages/trilium-core/src/services/blob.ts:175-179`
 * - `packages/trilium-core/src/services/entity_changes.ts:104` (`note_reordering` → `"N/A"`)
 */

import { trilogyHash } from "../crypto/index.js";

export type EntityName =
  | "notes"
  | "branches"
  | "attributes"
  | "revisions"
  | "attachments"
  | "blobs"
  | "options"
  | "etapi_tokens"
  | "note_reordering";

/** Order is significant: it determines the string that gets hashed. */
const HASHED_PROPERTIES: Record<string, readonly string[]> = {
  notes: ["noteId", "title", "isProtected", "type", "mime", "blobId"],
  branches: ["branchId", "noteId", "parentNoteId", "prefix"],
  attributes: ["attributeId", "noteId", "type", "name", "value", "isInheritable"],
  revisions: [
    "revisionId",
    "noteId",
    "title",
    "description",
    "source",
    "isProtected",
    "dateLastEdited",
    "dateCreated",
    "utcDateLastEdited",
    "utcDateCreated",
    "utcDateModified",
    "blobId"
  ],
  attachments: [
    "attachmentId",
    "ownerId",
    "role",
    "mime",
    "title",
    "blobId",
    "utcDateScheduledForErasureSince"
  ],
  blobs: ["blobId", "content"],
  options: ["name", "value"],
  etapi_tokens: [
    "etapiTokenId",
    "name",
    "tokenHash",
    "utcDateCreated",
    "utcDateModified",
    "isDeleted"
  ]
};

/**
 * Columns stored as SQLite INTEGER 0/1 that upstream materialises as real booleans before hashing.
 * Getting these wrong changes `"false"` into `"0"` and silently breaks the content-hash check.
 */
const BOOLEAN_COLUMNS: Record<string, readonly string[]> = {
  notes: ["isProtected"],
  branches: ["isExpanded"],
  attributes: ["isInheritable"],
  revisions: ["isProtected"],
  attachments: [],
  etapi_tokens: ["isDeleted"]
};

export type EntityRow = Record<string, unknown>;

/**
 * Columns that are `null` in the database but may have been hashed either as `"null"` or as
 * `"undefined"`, because upstream's hash depends on how the entity reached memory:
 *
 * - **Creation path** — `new BAttachment({ ownerId, role, mime, title, blobId })` passes an object
 *   literal that *omits* `utcDateScheduledForErasureSince`, so `this.utcDateScheduledForErasureSince`
 *   is `undefined` and the hash contains `"undefined"`.
 * - **Reload path** — an entity loaded from SQLite (`null`) and then re-saved keeps the key with a
 *   `null` value, so the hash contains `"null"`. `services/notes.ts:579-583` does exactly this when
 *   it clears a pending erasure.
 *
 * Measured, not guessed: in a freshly created database every attachment uses `"undefined"`; in a
 * long-lived vault 1735 use `"null"` and 573 use `"undefined"`.
 *
 * The protocol tolerates this because **hashes are stored and transmitted, never recomputed**: an
 * entity that arrives over sync carries its originator's hash, and both peers compare those. The
 * ambiguity only matters for entities *we* create, where the creation path is the right answer — so
 * that is the default here, and `toEntityRowPreservingNulls` exposes the other convention for
 * verification tooling.
 */
const NULLABLE_HASH_COLUMNS: Record<string, readonly string[]> = {
  attachments: ["utcDateScheduledForErasureSince"]
};

/** Convert a raw row using the creation-path convention (see {@link NULLABLE_HASH_COLUMNS}). */
export function toEntityRow(entityName: EntityName, raw: EntityRow): EntityRow {
  return normalizeRow(entityName, raw, true);
}

/** Convert a raw row using the reload-path convention (nulls stay `null`). */
export function toEntityRowPreservingNulls(entityName: EntityName, raw: EntityRow): EntityRow {
  return normalizeRow(entityName, raw, false);
}

function normalizeRow(entityName: EntityName, raw: EntityRow, dropNullableKeys: boolean): EntityRow {
  const normalized: EntityRow = { ...raw };

  for (const column of BOOLEAN_COLUMNS[entityName] ?? []) {
    if (column in normalized && normalized[column] !== null && normalized[column] !== undefined) {
      normalized[column] = Boolean(normalized[column]);
    }
  }

  if (dropNullableKeys) {
    for (const column of NULLABLE_HASH_COLUMNS[entityName] ?? []) {
      if (normalized[column] === null) {
        delete normalized[column];
      }
    }
  }

  return normalized;
}

/**
 * `blobService.calculateContentHash()` — note this is un-prefixed, un-truncated, computed over the
 * **stored** content (ciphertext for protected blobs), and includes `textRepresentation` only when
 * it is non-empty.
 */
export function calculateBlobHash(blob: {
  blobId: string;
  content: string | null | undefined;
  textRepresentation?: string | null;
}): string {
  const textRepresentationSegment = blob.textRepresentation ? `|${blob.textRepresentation}` : "";
  return trilogyHash(`${blob.blobId}|${(blob.content ?? "").toString()}${textRepresentationSegment}`);
}

/**
 * `AbstractBeccaEntity.generateHash()`.
 *
 * @param isDeleted passed by the deletion paths only; a full entity-change rebuild calls
 *   `generateHash()` with no argument, so the `"|deleted"` suffix is *not* applied there.
 */
export function generateEntityHash(
  entityName: EntityName,
  row: EntityRow,
  isDeleted = false
): string {
  if (entityName === "note_reordering") {
    return "N/A";
  }

  if (entityName === "blobs") {
    return calculateBlobHash({
      blobId: String(row.blobId ?? ""),
      content: (row.content ?? null) as string | null,
      textRepresentation: (row.textRepresentation ?? null) as string | null
    });
  }

  const properties = HASHED_PROPERTIES[entityName];
  if (!properties) {
    throw new Error(`No hashed properties declared for entity '${entityName}'`);
  }

  let contentToHash = "";
  for (const propertyName of properties) {
    // Template literal, matching upstream exactly: undefined -> "undefined", null -> "null".
    contentToHash += `|${row[propertyName]}`;
  }

  if (isDeleted) {
    contentToHash += "|deleted";
  }

  return trilogyHash(contentToHash).substring(0, 10);
}

export { HASHED_PROPERTIES, BOOLEAN_COLUMNS };

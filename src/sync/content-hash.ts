/**
 * The content-hash cross-check — Trilium's end-of-round divergence detector.
 *
 * Both peers independently fold their journal into one hash per `(entityName, sector)` and compare.
 * A mismatch means rows were lost, duplicated or mis-hashed, and triggers a sector re-queue.
 *
 * Ported from `packages/trilium-core/src/services/content_hash.ts`. The subtleties that make it a
 * "works or loops forever" component:
 *
 * - Only rows with `isSynced = 1` participate, and `note_reordering` is excluded entirely.
 * - Rows are sorted by `entityId` **with upstream's exact comparator**, which never returns 0. That
 *   is not a valid comparator for ties, so array order decides — and since the server's rows arrive in
 *   `entity_changes.id` order, we sort in that same order to reproduce its result.
 * - The accumulated string is `hash + isErased` where `isErased` is the **raw SQLite integer**.
 *   Upstream reads it with `getRawRows()`, which yields `0`/`1`, so the fold appends `"0"`/`"1"` —
 *   *not* `"false"`/`"true"`. Getting this wrong mismatches every sector while looking plausible;
 *   it was caught by the end-to-end probe, not by reading the code.
 */

import { trilogyHash } from "../crypto/index.js";
import type { EntityChange } from "./types.js";

export const EXCLUDED_ENTITY_NAMES = new Set(["note_reordering"]);

/** Minimal shape the fold needs; accepts both wire records and journal rows. */
export interface HashableChange {
  entityName: string;
  entityId: string;
  hash: string;
  isErased: boolean | number;
  isSynced: boolean | number;
}

/**
 * Fold changes into `{ entityName: { sector: hash } }`.
 *
 * @param changes must be in `entity_changes.id` ascending order to reproduce the server's result.
 */
export function computeEntityHashes(
  changes: readonly HashableChange[]
): Record<string, Record<string, string>> {
  const rows = changes
    .filter((change) => Boolean(change.isSynced))
    .filter((change) => !EXCLUDED_ENTITY_NAMES.has(change.entityName))
    .map((change) => ({
      entityName: change.entityName,
      entityId: change.entityId,
      hash: change.hash,
      // Raw SQLite integer semantics — appended as "0"/"1", matching upstream's getRawRows().
      isErased: Number(change.isErased) ? 1 : 0
    }));

  // Upstream's comparator verbatim, including its refusal to return 0. V8's sort is stable, so ties
  // retain the incoming (id) order — which is what the server's SQLite row order gives it too.
  rows.sort((a, b) => (a.entityId < b.entityId ? -1 : 1));

  const hashMap: Record<string, Record<string, string>> = {};

  for (const row of rows) {
    const entityHashMap = (hashMap[row.entityName] ??= {});
    const sector = row.entityId[0] ?? "";
    entityHashMap[sector] = (entityHashMap[sector] ?? "") + row.hash + row.isErased;
  }

  for (const entityHashMap of Object.values(hashMap)) {
    for (const sector of Object.keys(entityHashMap)) {
      entityHashMap[sector] = trilogyHash(entityHashMap[sector]!);
    }
  }

  return hashMap;
}

export interface FailedCheck {
  entityName: string;
  sector: string;
  local?: string;
  remote?: string;
}

/** Compare our fold against the server's `/api/sync/check` payload, sector by sector. */
export function diffEntityHashes(
  local: Record<string, Record<string, string>>,
  remote: Record<string, Record<string, string>>
): FailedCheck[] {
  const failures: FailedCheck[] = [];

  for (const entityName of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const localSectors = local[entityName] ?? {};
    const remoteSectors = remote[entityName] ?? {};

    for (const sector of new Set([...Object.keys(localSectors), ...Object.keys(remoteSectors)])) {
      if (localSectors[sector] !== remoteSectors[sector]) {
        failures.push({
          entityName,
          sector,
          local: localSectors[sector],
          remote: remoteSectors[sector]
        });
      }
    }
  }

  return failures;
}

/** Convenience for accumulating pulled records into the shape `computeEntityHashes` expects. */
export function toHashable(record: { entityChange: EntityChange }): HashableChange {
  const ec = record.entityChange;
  return {
    entityName: ec.entityName,
    entityId: ec.entityId,
    hash: ec.hash,
    isErased: ec.isErased,
    // A record that reached us over the wire is synced by definition.
    isSynced: 1
  };
}

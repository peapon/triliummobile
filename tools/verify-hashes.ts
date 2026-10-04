/**
 * Verify our entity-hash implementation against a *real* Trilium database.
 *
 * A unit test can only prove we match our own understanding. This tool proves we match Trilium:
 * it reads a live `document.db`, recomputes the hash of every entity from its current row, and
 * compares against the hash Trilium itself recorded in `entity_changes`.
 *
 * It tries four interpretations per row — {creation-path, reload-path} x {plain, "|deleted"} —
 * because upstream's hash is not always reconstructible from the stored row (see
 * `NULLABLE_HASH_COLUMNS` in `src/entities/hashes.ts`). A row only counts as a genuine mismatch if
 * none of the four reproduces it.
 *
 * Usage:
 *   pnpm exec tsx tools/verify-hashes.ts [path/to/document.db]
 *
 * Read-only by construction; it never writes to the database.
 */

import { writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import {
  generateEntityHash,
  toEntityRow,
  toEntityRowPreservingNulls,
  type EntityName
} from "../src/entities/hashes.js";

const DEFAULT_DB = `${process.env.HOME}/Library/Application Support/trilium-data/document.db`;

/** entityName -> [table, primaryKeyColumn] */
const ENTITY_TABLES: Record<string, [string, string]> = {
  notes: ["notes", "noteId"],
  branches: ["branches", "branchId"],
  attributes: ["attributes", "attributeId"],
  revisions: ["revisions", "revisionId"],
  attachments: ["attachments", "attachmentId"],
  options: ["options", "name"],
  etapi_tokens: ["etapi_tokens", "etapiTokenId"]
};

interface Tally {
  checked: number;
  byVariant: Record<string, number>;
  missed: number;
  samples: string[];
}

function emptyTally(): Tally {
  return { checked: 0, byVariant: {}, missed: 0, samples: [] };
}

function main(): void {
  const dbPath = process.argv[2] ?? DEFAULT_DB;
  const db = new DatabaseSync(dbPath, { readOnly: true });

  const tallies = new Map<string, Tally>();
  const misses: Array<{ entityName: string; entityId: string; expected: string; ours: string }> = [];
  let erasedSkipped = 0;

  for (const [entityName, [table, pk]] of Object.entries(ENTITY_TABLES)) {
    const tally = emptyTally();
    tallies.set(entityName, tally);

    const changes = db
      .prepare(`SELECT entityId, hash, isErased FROM entity_changes WHERE entityName = ? ORDER BY id`)
      .all(entityName) as Array<{ entityId: string; hash: string; isErased: number }>;

    for (const change of changes) {
      // Erased rows have no entity left to recompute from and use a separate ("deleted") formula.
      if (change.isErased) {
        erasedSkipped++;
        continue;
      }

      tally.checked++;

      const row = db.prepare(`SELECT * FROM ${table} WHERE ${pk} = ?`).get(change.entityId) as
        | Record<string, unknown>
        | undefined;

      if (!row) {
        tally.missed++;
        misses.push({
          entityName,
          entityId: change.entityId,
          expected: change.hash,
          ours: "<no row>"
        });
        continue;
      }

      const attempts: Array<[variant: "creation" | "reload", isDeleted: boolean]> = [
        ["creation", false],
        ["reload", false],
        ["creation", true],
        ["reload", true]
      ];

      let matched: string | null = null;
      let plainHash = "";

      for (const [variant, isDeleted] of attempts) {
        const normalized =
          variant === "creation"
            ? toEntityRow(entityName as EntityName, row)
            : toEntityRowPreservingNulls(entityName as EntityName, row);

        const hash = generateEntityHash(entityName as EntityName, normalized, isDeleted);
        if (!plainHash && variant === "creation" && !isDeleted) plainHash = hash;

        if (hash === change.hash) {
          matched = isDeleted ? `${variant}+deleted` : variant;
          break;
        }
      }

      if (matched) {
        tally.byVariant[matched] = (tally.byVariant[matched] ?? 0) + 1;
      } else {
        tally.missed++;
        misses.push({
          entityName,
          entityId: change.entityId,
          expected: change.hash,
          ours: plainHash
        });
        if (tally.samples.length < 3) {
          tally.samples.push(
            `  ${entityName}/${change.entityId}\n` +
              `    expected ${change.hash}\n` +
              `    ours     ${plainHash}\n` +
              `    row      ${JSON.stringify(row).slice(0, 220)}`
          );
        }
      }
    }
  }

  db.close();

  const missPath = "/tmp/hash-misses.json";
  writeFileSync(missPath, JSON.stringify(misses, null, 1));

  const variants = [...new Set([...tallies.values()].flatMap((t) => Object.keys(t.byVariant)))].sort();

  console.log(`\nEntity-hash verification against ${dbPath}\n${"=".repeat(78)}`);
  console.log(
    "entity".padEnd(14) +
      "checked".padStart(9) +
      variants.map((v) => v.padStart(16)).join("") +
      "MISS".padStart(8)
  );

  let totalChecked = 0;
  let totalMissed = 0;
  const totalByVariant: Record<string, number> = {};

  for (const [entityName, t] of tallies) {
    totalChecked += t.checked;
    totalMissed += t.missed;
    for (const [v, n] of Object.entries(t.byVariant)) {
      totalByVariant[v] = (totalByVariant[v] ?? 0) + n;
    }

    console.log(
      entityName.padEnd(14) +
        String(t.checked).padStart(9) +
        variants.map((v) => String(t.byVariant[v] ?? 0).padStart(16)).join("") +
        String(t.missed).padStart(8)
    );
  }

  console.log("-".repeat(78));
  console.log(
    "TOTAL".padEnd(14) +
      String(totalChecked).padStart(9) +
      variants.map((v) => String(totalByVariant[v] ?? 0).padStart(16)).join("") +
      String(totalMissed).padStart(8)
  );

  const reproduced = totalChecked - totalMissed;
  const pct = totalChecked === 0 ? 0 : (reproduced / totalChecked) * 100;
  console.log(`\nReproduced: ${reproduced}/${totalChecked} (${pct.toFixed(3)}%)`);
  console.log(`Erased rows skipped (no entity left to rebuild from): ${erasedSkipped}`);
  console.log(`Mismatch detail written to ${missPath}`);

  if (totalMissed > 0) {
    console.log("\nUnexplained mismatches:");
    for (const [, t] of tallies) {
      for (const s of t.samples) console.log(s);
    }
    process.exitCode = 1;
  } else {
    console.log("\nEvery entity hash was reproduced by one of the known conventions.");
  }
}

main();

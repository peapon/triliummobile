/**
 * Reverse-engineer a hash mismatch: for one entity, try substituting each hashed property's value
 * with plausible alternatives and report which single substitution reproduces Trilium's own hash.
 *
 * This exists because a mismatch can come from a *representation* difference (null vs "", a number
 * vs a string, a boolean vs 0/1) that no amount of reading the happy path will reveal.
 *
 * Usage: pnpm exec tsx tools/diagnose-hash.ts <entityName> <entityId> [dbPath]
 */

import { DatabaseSync } from "node:sqlite";

import { trilogyHash } from "../src/crypto/index.js";
import { HASHED_PROPERTIES, type EntityName } from "../src/entities/hashes.js";

const DEFAULT_DB = `${process.env.HOME}/Library/Application Support/trilium-data/document.db`;

const ENTITY_TABLES: Record<string, [string, string]> = {
  notes: ["notes", "noteId"],
  branches: ["branches", "branchId"],
  attributes: ["attributes", "attributeId"],
  revisions: ["revisions", "revisionId"],
  attachments: ["attachments", "attachmentId"],
  options: ["options", "name"],
  etapi_tokens: ["etapi_tokens", "etapiTokenId"]
};

/** Plausible alternative encodings for a value. */
function candidates(value: unknown): Array<[string, unknown]> {
  const raw = value as string | number | null | undefined;
  const out: Array<[string, unknown]> = [
    ["<raw>", raw],
    ["empty-string", ""],
    ["null", null],
    ["undefined", undefined],
    ["zero", 0],
    ["one", 1],
    ["bool-false", false],
    ["bool-true", true]
  ];

  if (raw !== null && raw !== undefined) {
    out.push(["String()", String(raw)]);
    if (typeof raw === "number") out.push(["number-as-is", raw]);
    // SQLite may hand back "1" where upstream materialises 1, or vice versa.
    if (raw === 0 || raw === 1) {
      out.push(["num", Number(raw)]);
      out.push(["bool", Boolean(raw)]);
    }
  }

  return out;
}

function buildContent(entityName: EntityName, row: Record<string, unknown>, isDeleted: boolean): string {
  let contentToHash = "";
  for (const propertyName of HASHED_PROPERTIES[entityName]!) {
    contentToHash += `|${row[propertyName]}`;
  }
  if (isDeleted) contentToHash += "|deleted";
  return contentToHash;
}

function main(): void {
  const [entityName, entityId] = process.argv.slice(2) as [EntityName, string];
  const dbPath = process.argv[4] ?? DEFAULT_DB;

  if (!entityName || !entityId) {
    console.error("usage: diagnose-hash.ts <entityName> <entityId> [dbPath]");
    process.exit(2);
  }

  const db = new DatabaseSync(dbPath, { readOnly: true });
  const [table, pk] = ENTITY_TABLES[entityName]!;

  const change = db
    .prepare(`SELECT hash FROM entity_changes WHERE entityName = ? AND entityId = ?`)
    .get(entityName, entityId) as { hash: string } | undefined;

  if (!change) {
    console.error(`No entity_changes row for ${entityName}/${entityId}`);
    process.exit(2);
  }

  const row = db.prepare(`SELECT * FROM ${table} WHERE ${pk} = ?`).get(entityId) as
    | Record<string, unknown>
    | undefined;

  if (!row) {
    console.error(`No row in ${table} for ${entityId}`);
    process.exit(2);
  }

  db.close();

  const properties = HASHED_PROPERTIES[entityName]!;
  console.log(`\n${entityName}/${entityId}`);
  console.log(`expected hash : ${change.hash}`);
  console.log(`\nrow:`);
  for (const [k, v] of Object.entries(row)) {
    console.log(`  ${k.padEnd(34)} = ${JSON.stringify(v)}  (${typeof v})`);
  }

  for (const isDeleted of [false, true]) {
    const baseline = buildContent(entityName, row, isDeleted);
    const baselineHash = trilogyHash(baseline).substring(0, 10);
    const suffix = isDeleted ? " [+|deleted]" : "";
    console.log(`\nbaseline${suffix}: ${baselineHash}${baselineHash === change.hash ? "   <== MATCH" : ""}`);
    console.log(`  input: ${JSON.stringify(baseline).slice(0, 400)}`);
  }

  console.log(`\nSingle-property substitutions that reproduce the expected hash:`);
  let found = 0;

  for (const isDeleted of [false, true]) {
    for (const property of properties) {
      const current = row[property];
      for (const [label, alternative] of candidates(current)) {
        if (alternative === current) continue;

        const probe = { ...row, [property]: alternative };
        const hash = trilogyHash(buildContent(entityName, probe, isDeleted)).substring(0, 10);

        if (hash === change.hash) {
          found++;
          console.log(
            `  ${property}: ${JSON.stringify(current)} (${typeof current})` +
              ` -> ${label} = ${JSON.stringify(alternative)}` +
              (isDeleted ? "  with |deleted" : "")
          );
        }
      }
    }
  }

  if (found === 0) {
    console.log("  (no single property) — trying pairs...");

    outer: for (const isDeleted of [false, true]) {
      for (let i = 0; i < properties.length; i++) {
        for (let j = i + 1; j < properties.length; j++) {
          const pi = properties[i]!;
          const pj = properties[j]!;
          for (const [labelI, altI] of candidates(row[pi])) {
            if (altI === row[pi]) continue;
            for (const [labelJ, altJ] of candidates(row[pj])) {
              if (altJ === row[pj]) continue;
              const probe = { ...row, [pi]: altI, [pj]: altJ };
              if (trilogyHash(buildContent(entityName, probe, isDeleted)).substring(0, 10) === change.hash) {
                console.log(`  ${pi} -> ${labelI} (${JSON.stringify(altI)})  AND  ${pj} -> ${labelJ} (${JSON.stringify(altJ)})${isDeleted ? "  with |deleted" : ""}`);
                found++;
                if (found > 6) break outer;
              }
            }
          }
        }
      }
    }
    if (found === 0) console.log("  (nothing — reference hash is stale for this row, or uses a value not present in the table)");
  }
}

main();

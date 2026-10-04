import { describe, expect, it } from "vitest";

import { computeEntityHashes, diffEntityHashes } from "./content-hash.js";
import { trilogyHash } from "../crypto/index.js";

/**
 * These tests pin down behaviour that was established by running the engine against a real Trilium
 * server, not by reading its source. Each one corresponds to a way the check can fail while every
 * HTTP call still returns 200.
 */

const change = (
  entityName: string,
  entityId: string,
  hash: string,
  isErased: boolean | number = 0
) => ({ entityName, entityId, hash, isErased, isSynced: 1 });

/** Reproduce the fold the slow, obvious way, so the production code is not compared against itself. */
function foldManually(
  rows: Array<{ entityName: string; entityId: string; hash: string; isErased: boolean | number }>
): Record<string, Record<string, string>> {
  const sorted = [...rows].sort((a, b) => (a.entityId < b.entityId ? -1 : 1));
  const out: Record<string, Record<string, string>> = {};

  for (const row of sorted) {
    if (!("isSynced" in row) && false) continue;
    out[row.entityName] ??= {};
    const sector = row.entityId[0]!;
    out[row.entityName]![sector] =
      (out[row.entityName]![sector] ?? "") + row.hash + (Number(row.isErased) ? 1 : 0);
  }

  for (const sectors of Object.values(out)) {
    for (const key of Object.keys(sectors)) sectors[key] = trilogyHash(sectors[key]!);
  }

  return out;
}

describe("computeEntityHashes", () => {
  it("folds hash + isErased as raw 0/1, not booleans", () => {
    // THE regression that cost a full debugging cycle: upstream reads isErased with getRawRows(),
    // so the accumulated string is `hash + "1"`, never `hash + "true"`.
    const asBoolean = computeEntityHashes([change("notes", "a1", "HASH", true)]);
    const asInteger = computeEntityHashes([change("notes", "a1", "HASH", 1)]);
    const asZero = computeEntityHashes([change("notes", "a1", "HASH", false)]);

    expect(asBoolean).toEqual(asInteger);

    const expectedTombstone = trilogyHash("HASH1");
    const expectedLive = trilogyHash("HASH0");
    expect(asBoolean.notes!.a).toBe(expectedTombstone);
    expect(asZero.notes!.a).toBe(expectedLive);
    expect(expectedTombstone).not.toBe(expectedLive);
  });

  it("excludes note_reordering and unsynced rows", () => {
    const hashes = computeEntityHashes([
      change("notes", "a1", "HASH"),
      { ...change("note_reordering", "b2", "N/A"), isSynced: 1 },
      { ...change("notes", "c3", "HASH2"), isSynced: 0 }
    ]);

    expect(Object.keys(hashes)).toEqual(["notes"]);
    // Only a1 contributed; c3 was unsynced and b2 is excluded by name.
    expect(hashes.notes!.a).toBe(trilogyHash("HASH0"));
    expect(hashes.notes!.c).toBeUndefined();
  });

  it("groups by the first character of the entity id", () => {
    const hashes = computeEntityHashes([
      change("notes", "aaa", "H1"),
      change("notes", "abc", "H2"),
      change("notes", "zzz", "H3")
    ]);

    expect(Object.keys(hashes.notes!).sort()).toEqual(["a", "z"]);
    // Both 'a' ids fold into one sector, ordered by entityId ascending.
    expect(hashes.notes!.a).toBe(trilogyHash("H10" + "H20"));
    expect(hashes.notes!.z).toBe(trilogyHash("H30"));
  });

  it("matches an independent hand-rolled fold", () => {
    const rows = [
      change("notes", "m1", "AA", 0),
      change("branches", "b1", "BB", 1),
      change("notes", "m2", "CC", 1),
      change("blobs", "z9", "DD", 0)
    ];

    expect(computeEntityHashes(rows)).toEqual(foldManually(rows));
  });

  it("returns an empty object for no input", () => {
    expect(computeEntityHashes([])).toEqual({});
  });
});

describe("diffEntityHashes", () => {
  it("reports nothing when both sides agree", () => {
    const hashes = computeEntityHashes([change("notes", "a1", "HASH")]);
    expect(diffEntityHashes(hashes, hashes)).toEqual([]);
  });

  it("reports a sector present on only one side", () => {
    const local = { notes: { a: "X" } };
    const remote = { notes: { a: "X", b: "Y" } };

    expect(diffEntityHashes(local, remote)).toEqual([
      { entityName: "notes", sector: "b", local: undefined, remote: "Y" }
    ]);
  });

  it("reports a differering sector value", () => {
    const failures = diffEntityHashes({ blobs: { 1: "AAA" } }, { blobs: { 1: "BBB" } });

    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ entityName: "blobs", sector: "1", local: "AAA", remote: "BBB" });
  });

  it("reports an entity missing entirely from one side", () => {
    expect(diffEntityHashes({}, { attributes: { a: "X" } })).toEqual([
      { entityName: "attributes", sector: "a", local: undefined, remote: "X" }
    ]);
  });
});

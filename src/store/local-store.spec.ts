import { describe, expect, it, beforeEach } from "vitest";

import { generateEntityHash, toEntityRow } from "../entities/hashes.js";
import type { SqlDatabase, SqlValue } from "./database.js";
import { LocalStore } from "./local-store.js";
import { SCHEMA_SQL } from "./schema.js";

/**
 * `node:sqlite` is loaded through `process.getBuiltinModule()` rather than a static import: Vite
 * rewrites the `node:` prefix during transform and then cannot resolve the bare `sqlite` specifier,
 * so a plain `import { DatabaseSync } from "node:sqlite"` fails the suite before it runs.
 */
type DatabaseSyncLike = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
  close(): void;
};

const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as {
  DatabaseSync: new (path: string) => DatabaseSyncLike;
};

/**
 * The journal-application rules, pinned.
 *
 * Everything here was read out of `services/sync_update.ts` and then confirmed against a live
 * server. The one that matters most is the bounce-back: without it a local edit that loses the
 * timestamp comparison is discarded and never retransmitted — a silent, permanent data loss that
 * no error surfaces.
 */

/** In-memory adapter so these stay hermetic; integration coverage lives in tools/roundtrip.ts. */
class MemoryDatabase implements SqlDatabase {
  readonly raw = new DatabaseSync(":memory:");

  run(sql: string, params: SqlValue[] = []): void {
    this.raw.prepare(sql).run(...(params as never[]));
  }

  get<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []): T | undefined {
    return this.raw.prepare(sql).get(...(params as never[])) as T | undefined;
  }

  all<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []): T[] {
    return this.raw.prepare(sql).all(...(params as never[])) as T[];
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  transaction<T>(fn: () => T): T {
    this.raw.exec("BEGIN");
    try {
      const result = fn();
      this.raw.exec("COMMIT");
      return result;
    } catch (error) {
      this.raw.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.raw.close();
  }
}

const PEER = "PEERinstance";
const OTHER_PEER = "otherinstanc";

let db: MemoryDatabase;
let store: LocalStore;

function seedNote(overrides: Record<string, unknown> = {}) {
  return {
    noteId: "noteAAAAAAAA",
    title: "Original",
    isProtected: 0,
    type: "text",
    mime: "text/html",
    blobId: null,
    isDeleted: 0,
    deleteId: null,
    dateCreated: "2026-01-01 00:00:00.000+0000",
    dateModified: "2026-01-01 00:00:00.000+0000",
    utcDateCreated: "2026-01-01 00:00:00.000Z",
    utcDateModified: "2026-01-01 00:00:00.000Z",
    ...overrides
  };
}

function change(overrides: Record<string, unknown> = {}) {
  return {
    entityName: "notes",
    entityId: "noteAAAAAAAA",
    hash: "HASHremote0",
    isErased: 0,
    changeId: "changeRemote1",
    componentId: "NA",
    instanceId: PEER,
    isSynced: 1,
    utcDateChanged: "2026-06-01 00:00:00.000Z",
    ...overrides
  };
}

beforeEach(() => {
  db = new MemoryDatabase();
  db.exec(SCHEMA_SQL);
  store = new LocalStore(db, "LOCALinstanc");
});

describe("applying pulled changes", () => {
  it("writes the entity row and stamps the journal with the peer's instance id", () => {
    const row = seedNote();
    const result = store.applyEntityChanges(
      [{ entityChange: change({ hash: generateEntityHash("notes", row) }), entity: row }],
      PEER
    );

    expect(result.applied).toBe(1);
    expect(store.count("notes")).toBe(1);

    const stored = db.get<{ title: string }>("SELECT title FROM notes WHERE noteId = ?", ["noteAAAAAAAA"]);
    expect(stored?.title).toBe("Original");

    // Stamped with the peer's id so the next push skips it rather than echoing it back.
    const ec = db.get<{ instanceId: string; isSynced: number }>(
      "SELECT instanceId, isSynced FROM entity_changes WHERE entityId = ?",
      ["noteAAAAAAAA"]
    );
    expect(ec?.instanceId).toBe(PEER);
    expect(ec?.isSynced).toBe(1);
  });

  it("skips a change whose changeId was already applied", () => {
    const row = seedNote();
    const ec = change({ hash: generateEntityHash("notes", row) });

    store.applyEntityChanges([{ entityChange: ec, entity: row }], PEER);
    const second = store.applyEntityChanges([{ entityChange: ec, entity: row }], PEER);

    expect(second.skippedAlreadyApplied).toBe(1);
    expect(second.applied).toBe(0);
  });

  it("deletes the row for a tombstone and keeps the tombstone in the journal", () => {
    const row = seedNote();
    store.applyEntityChanges([{ entityChange: change({ hash: "H1" }), entity: row }], PEER);

    const result = store.applyEntityChanges(
      [{ entityChange: change({ hash: "H1", isErased: 1, changeId: "changeErase1" }) }],
      PEER
    );

    expect(result.erased).toBe(1);
    expect(store.count("notes")).toBe(0);

    // Tombstones are folded into the content hash, so the journal row must survive the delete.
    const ec = db.get<{ isErased: number }>(
      "SELECT isErased FROM entity_changes WHERE entityId = ?",
      ["noteAAAAAAAA"]
    );
    expect(ec?.isErased).toBe(1);
  });

  it("ignores an erase for a table upstream refuses to erase", () => {
    store.setOption("theme", "dark");

    store.applyEntityChanges(
      [
        {
          entityChange: change({
            entityName: "options",
            entityId: "theme",
            isErased: 1,
            changeId: "changeEraseOpt"
          })
        }
      ],
      PEER
    );

    expect(store.getOption("theme")).toBe("dark");
  });
});

describe("conflict resolution", () => {
  it("applies the remote row when both sides carry the same timestamp (ties go to remote)", () => {
    const local = seedNote({ title: "Local edit", isDeleted: 0 });
    const at = "2026-06-01 00:00:00.000Z";

    store.applyEntityChanges([{ entityChange: change({ hash: "HASHlocal", utcDateChanged: at }), entity: local }], PEER);

    const remote = seedNote({ title: "Remote edit" });
    const result = store.applyEntityChanges(
      [{ entityChange: change({ hash: "HASHremote", utcDateChanged: at, changeId: "changeTie" }), entity: remote }],
      PEER
    );

    expect(result.applied).toBe(1);
    expect(db.get<{ title: string }>("SELECT title FROM notes WHERE noteId = ?", ["noteAAAAAAAA"])?.title).toBe(
      "Remote edit"
    );
  });

  it("BOUNDS BACK a newer local edit instead of dropping it", () => {
    // Our copy is strictly newer and hashes differ: the remote row must NOT be applied, and our
    // change must be re-stamped so the next push retransmits it. Dropping it loses the edit forever.
    const localRow = seedNote({ title: "My newer edit" });
    const localHash = "HASHlocalnew";
    const localChangeId = "changeLocal1";

    store.applyEntityChanges(
      [
        {
          entityChange: change({
            hash: localHash,
            changeId: localChangeId,
            utcDateChanged: "2026-06-02 00:00:00.000Z"
          }),
          entity: localRow
        }
      ],
      OTHER_PEER
    );

    const before = db.get<{ changeId: string }>(
      "SELECT changeId FROM entity_changes WHERE entityId = ?",
      ["noteAAAAAAAA"]
    );

    const remoteRow = seedNote({ title: "Stale remote edit" });
    const result = store.applyEntityChanges(
      [
        {
          entityChange: change({
            hash: "HASHremote2",
            changeId: "changeRemote2",
            utcDateChanged: "2026-06-01 00:00:00.000Z"
          }),
          entity: remoteRow
        }
      ],
      PEER
    );

    expect(result.bouncedBack).toBe(1);
    expect(result.applied).toBe(0);

    // The local row is untouched...
    expect(db.get<{ title: string }>("SELECT title FROM notes WHERE noteId = ?", ["noteAAAAAAAA"])?.title).toBe(
      "My newer edit"
    );

    // ...and the journal entry was re-stamped: new changeId, and OUR instance id so push picks it up.
    const after = db.get<{ changeId: string; instanceId: string; hash: string }>(
      "SELECT changeId, instanceId, hash FROM entity_changes WHERE entityId = ?",
      ["noteAAAAAAAA"]
    );
    expect(after?.changeId).not.toBe(before?.changeId);
    expect(after?.changeId).not.toBe(localChangeId);
    expect(after?.instanceId).toBe("LOCALinstanc");
    expect(after?.hash).toBe(localHash);
  });

  it("does not bounce when the hashes agree", () => {
    const row = seedNote();
    const hash = generateEntityHash("notes", row);

    store.applyEntityChanges(
      [{ entityChange: change({ hash, utcDateChanged: "2026-06-02 00:00:00.000Z" }), entity: row }],
      OTHER_PEER
    );

    const result = store.applyEntityChanges(
      [
        {
          entityChange: change({
            hash,
            changeId: "changeLater",
            utcDateChanged: "2026-06-01 00:00:00.000Z"
          }),
          entity: row
        }
      ],
      PEER
    );

    expect(result.bouncedBack).toBe(0);
    expect(result.applied).toBe(0);
  });
});

describe("push selection", () => {
  it("excludes rows stamped with the peer's instance id", () => {
    const row = seedNote();
    store.applyEntityChanges([{ entityChange: change({ hash: "H" }), entity: row }], PEER);

    const pending = store.collectChangesToPush();
    const ours = pending.filter((ec) => !store.isOwnEcho(ec, PEER));

    expect(pending).toHaveLength(1);
    expect(ours).toHaveLength(0);
  });

  it("includes changes the client originated", () => {
    store.createTextNote({ parentNoteId: "root", title: "Captured", content: "<p>offline</p>" });

    const ours = store.collectChangesToPush().filter((ec) => !store.isOwnEcho(ec, PEER));

    // A note, its blob and its branch.
    expect(ours).toHaveLength(3);
    expect(new Set(ours.map((ec) => ec.entityName))).toEqual(new Set(["notes", "blobs", "branches"]));
    expect(ours.every((ec) => ec.isSynced === 1)).toBe(true);
  });
});

describe("createTextNote", () => {
  it("derives the blob id from the content and hashes every row it writes", () => {
    const { noteId, branchId, blobId } = store.createTextNote({
      parentNoteId: "root",
      title: "Hello",
      content: "<p>world</p>"
    });

    const note = db.get<Record<string, unknown>>("SELECT * FROM notes WHERE noteId = ?", [noteId]);
    const branch = db.get<Record<string, unknown>>("SELECT * FROM branches WHERE branchId = ?", [branchId]);
    const blob = db.get<Record<string, unknown>>("SELECT * FROM blobs WHERE blobId = ?", [blobId]);

    expect(note).toBeDefined();
    expect(branch).toBeDefined();
    expect(blob).toBeDefined();

    for (const [entityName, entityId, row] of [
      ["notes", noteId, note],
      ["branches", branchId, branch]
    ] as const) {
      const ec = db.get<{ hash: string }>(
        "SELECT hash FROM entity_changes WHERE entityName = ? AND entityId = ?",
        [entityName, entityId]
      );

      // The hash must match what a *peer* recomputes from the stored row, which is the whole point
      // of the content-hash check. Hashing the raw row instead of the normalised entity row is the
      // trap: `isProtected` is INTEGER 0 in SQLite but boolean false in the entity upstream hashes,
      // and "0" != "false" produces a hash no other replica agrees with.
      expect(ec?.hash).toBe(generateEntityHash(entityName, toEntityRow(entityName, row as Record<string, unknown>)));
    }
  });

  it("hashes booleans the way a peer recomputing from the stored row would", () => {
    const { noteId } = store.createTextNote({ parentNoteId: "root", title: "T", content: "c" });
    const row = db.get<Record<string, unknown>>("SELECT * FROM notes WHERE noteId = ?", [noteId]);
    const ec = db.get<{ hash: string }>("SELECT hash FROM entity_changes WHERE entityId = ?", [noteId]);

    // The normalised form is the correct one...
    expect(ec?.hash).toBe(generateEntityHash("notes", toEntityRow("notes", row as Record<string, unknown>)));

    // ...and it is emphatically not the raw-row form, which would silently disagree with every peer.
    expect(ec?.hash).not.toBe(generateEntityHash("notes", row as Record<string, unknown>));
  });

  it("assigns increasing note positions under the same parent", () => {
    const first = store.createTextNote({ parentNoteId: "root", title: "A", content: "a" });
    const second = store.createTextNote({ parentNoteId: "root", title: "B", content: "b" });

    const positions = db.all<{ branchId: string; notePosition: number }>(
      "SELECT branchId, notePosition FROM branches WHERE parentNoteId = 'root' ORDER BY notePosition"
    );

    expect(positions.map((p) => p.branchId)).toEqual([first.branchId, second.branchId]);
    expect(positions[0]!.notePosition).toBeLessThan(positions[1]!.notePosition);
  });
});

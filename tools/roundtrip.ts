/**
 * Full round-trip against a real Trilium server.
 *
 * Three phases, each of which can fail independently:
 *
 *   1. **Initial sync** — pull an entire server from scratch and prove our content-hash fold agrees
 *      with the server's, sector by sector.
 *   2. **Local capture** — create notes offline, exactly as the phone's quick-capture flow will.
 *   3. **Push and verify** — sync again, then read the *server's own database* to confirm the notes
 *      actually landed there rather than merely being accepted with a 2xx.
 *
 * Phase 3 is the point: a push that returns 204 proves nothing. Reading the server's file does.
 *
 * Usage:
 *   pnpm exec tsx tools/roundtrip.ts <serverHost> [serverDocumentDb]
 */

import { existsSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { LocalStore } from "../src/store/local-store.js";
import { NodeSqliteDatabase } from "../src/store/sqlite-node.js";
import { SyncEngine } from "../src/sync/engine.js";
import { DEFAULT_MAX_BLOB_CONTENT_SIZE, SyncTransport } from "../src/sync/transport.js";

const LOCAL_DB = "/tmp/trilium-roundtrip.db";

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function readServerSecret(serverDbPath: string): string {
  const db = new DatabaseSync(serverDbPath, { readOnly: true });
  const row = db.prepare("SELECT value FROM options WHERE name = 'documentSecret'").get() as
    | { value: string }
    | undefined;
  db.close();

  if (!row) throw new Error(`No documentSecret in ${serverDbPath}`);
  return row.value;
}

function serverNoteTitles(serverDbPath: string, noteIds: string[]): Map<string, string> {
  const db = new DatabaseSync(serverDbPath, { readOnly: true });
  const found = new Map<string, string>();

  for (const noteId of noteIds) {
    const row = db.prepare("SELECT title FROM notes WHERE noteId = ?").get(noteId) as
      | { title: string }
      | undefined;
    if (row) found.set(noteId, row.title);
  }

  db.close();
  return found;
}

async function main(): Promise<void> {
  const [serverHost, serverDbArg] = process.argv.slice(2);

  if (!serverHost) {
    console.error("usage: roundtrip.ts <serverHost> [serverDocumentDb]");
    process.exit(2);
  }

  const serverDb = serverDbArg ?? ".trilium-test-data/document.db";
  const documentSecret = readServerSecret(serverDb);

  // Start from nothing every time; a stale local replica would mask a broken initial sync.
  for (const suffix of ["", "-wal", "-shm"]) {
    if (existsSync(LOCAL_DB + suffix)) rmSync(LOCAL_DB + suffix);
  }

  const bootstrap = new SyncTransport({ serverHost, documentSecret, syncVersion: 0 });
  const status = await bootstrap.getSetupStatus();

  const transport = new SyncTransport({
    serverHost,
    documentSecret,
    syncVersion: status.syncVersion,
    maxBlobContentSize: DEFAULT_MAX_BLOB_CONTENT_SIZE
  });

  const db = new NodeSqliteDatabase(LOCAL_DB);
  const store = new LocalStore(db);
  store.initializeSchema();

  const engine = new SyncEngine({ store, transport });

  // ---------------------------------------------------------------- 1. initial sync

  console.log(`\n=== 1. Initial sync from ${serverHost} ===`);
  const first = await engine.sync();

  console.log(
    `    pulled ${fmt(first.pulled)} entities in ${fmt(first.pullPages)} pages ` +
      `(${(first.durationMs / 1000).toFixed(2)}s)`
  );
  console.log(
    `    local: notes=${fmt(store.count("notes"))} branches=${fmt(store.count("branches"))} ` +
      `attributes=${fmt(store.count("attributes"))} blobs=${fmt(store.count("blobs"))}`
  );
  console.log(
    `    journal=${fmt(store.maxJournalId())}  pull cursor=${store.lastSyncedPull}  ` +
      `push cursor=${store.lastSyncedPush}`
  );

  if (first.divergedSectors.length > 0) {
    console.error(`\n    FAIL: ${first.divergedSectors.length} sector(s) diverged after initial sync`);
    for (const s of first.divergedSectors.slice(0, 10)) {
      console.error(`      ${s.entityName}/${s.sector}  local=${s.local ?? "<absent>"} server=${s.remote ?? "<absent>"}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log("    content hash: every sector matches the server");

  // ---------------------------------------------------------------- 2. local capture

  console.log("\n=== 2. Local capture (offline) ===");
  const created = [
    store.createTextNote({
      parentNoteId: "root",
      title: "TriliumMobile round-trip probe",
      content: "<p>Created offline by the mobile client.</p>"
    }),
    store.createTextNote({
      parentNoteId: "root",
      title: "速记：架构决策",
      content: "<p>手机端只做速记、速查、查看。</p>"
    }),
    store.createTextNote({
      parentNoteId: "root",
      title: "Unicode sanity — café, 笔记, 🎉",
      content: "<p>Hashes must survive NFC normalisation.</p>"
    })
  ];

  for (const note of created) {
    console.log(`    + ${note.noteId}  branch=${note.branchId}  blob=${note.blobId}`);
  }

  const pending = store.collectChangesToPush().filter((ec) => !store.isOwnEcho(ec, transport.serverInstanceId));
  console.log(`    ${pending.length} journal rows pending push`);

  // ---------------------------------------------------------------- 3. push + verify

  console.log("\n=== 3. Push and verify against the server's database ===");
  const second = await engine.sync();

  console.log(`    push batches=${second.pushBatches}  pulled=${fmt(second.pulled)}  (${(second.durationMs / 1000).toFixed(2)}s)`);

  if (second.divergedSectors.length > 0) {
    console.error(`\n    FAIL: ${second.divergedSectors.length} sector(s) diverged after push`);
    for (const s of second.divergedSectors.slice(0, 10)) {
      console.error(`      ${s.entityName}/${s.sector}  local=${s.local ?? "<absent>"} server=${s.remote ?? "<absent>"}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log("    content hash: every sector still matches the server");

  const onServer = serverNoteTitles(
    serverDb,
    created.map((c) => c.noteId)
  );

  let missing = 0;
  for (const note of created) {
    const title = onServer.get(note.noteId);
    if (title === undefined) {
      console.error(`    MISSING on server: ${note.noteId}`);
      missing++;
    } else {
      console.log(`    on server: ${note.noteId}  "${title}"`);
    }
  }

  if (missing > 0) {
    console.error(`\n    FAIL: ${missing} of ${created.length} notes never reached the server`);
    process.exitCode = 1;
    return;
  }

  // ---------------------------------------------------------------- 4. fresh client

  console.log("\n=== 4. Independent client sees the notes ===");
  const FRESH_DB = "/tmp/trilium-roundtrip-fresh.db";
  for (const suffix of ["", "-wal", "-shm"]) {
    if (existsSync(FRESH_DB + suffix)) rmSync(FRESH_DB + suffix);
  }

  const freshDb = new NodeSqliteDatabase(FRESH_DB);
  const freshStore = new LocalStore(freshDb);
  freshStore.initializeSchema();
  const freshEngine = new SyncEngine({ store: freshStore, transport });

  const fresh = await freshEngine.sync();

  if (fresh.divergedSectors.length > 0) {
    console.error(`    FAIL: fresh client diverged on ${fresh.divergedSectors.length} sector(s)`);
    process.exitCode = 1;
    return;
  }

  let visible = 0;
  for (const note of created) {
    const row = freshStore.queryRaw("SELECT title FROM notes WHERE noteId = ?", [note.noteId]);
    if (row) {
      visible++;
      console.log(`    visible: ${note.noteId}  "${String(row.title)}"`);
    }
  }

  freshStore.close();

  if (visible !== created.length) {
    console.error(`\n    FAIL: a fresh client synced ${visible} of ${created.length} notes`);
    process.exitCode = 1;
    return;
  }

  store.close();

  console.log(
    `\nPASS — initial sync converged, ${created.length} offline notes are on the server, ` +
      `and a fresh client reproduces them.`
  );
}

main().catch((error) => {
  console.error("\nRound-trip failed:", error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});

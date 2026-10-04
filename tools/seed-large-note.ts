/**
 * Seed the test server with notes whose content exceeds the mobile blob cap.
 *
 * This exists so the on-demand download path has something real to fetch. It goes through the actual
 * sync protocol rather than writing the server's database directly, which means it also exercises
 * push paging for a multi-megabyte blob — a path nothing else in the suite covers.
 *
 * Usage:
 *   pnpm exec tsx tools/seed-large-note.ts [serverHost] [serverDocumentDb] [sizeMiB]
 */

import { existsSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { LocalStore } from "../src/store/local-store.js";
import { NodeSqliteDatabase } from "../src/store/sqlite-node.js";
import { SyncEngine } from "../src/sync/engine.js";
import { SyncTransport } from "../src/sync/transport.js";

const LOCAL_DB = "/tmp/trilium-seed.db";

/** Titles the E2E looks for; keep the marker stable. */
export const LARGE_NOTE_TITLE = "E2E 大附件笔记";
export const LARGE_ATTACHMENT_TITLE = "e2e-large.bin";

function readSecret(path: string): string {
  const db = new DatabaseSync(path, { readOnly: true });
  const row = db.prepare("SELECT value FROM options WHERE name = 'documentSecret'").get() as
    | { value: string }
    | undefined;
  db.close();
  if (!row) throw new Error(`No documentSecret in ${path}`);
  return row.value;
}

function serverAlreadyHas(title: string, serverDb: string): boolean {
  if (!existsSync(serverDb)) return false;

  const db = new DatabaseSync(serverDb, { readOnly: true });
  const row = db.prepare("SELECT noteId FROM notes WHERE title = ? AND isDeleted = 0").get(title);
  db.close();
  return Boolean(row);
}

async function main(): Promise<void> {
  const [serverHost = "http://127.0.0.1:18740", serverDb = ".trilium-test-data/document.db", sizeArg] =
    process.argv.slice(2);

  const sizeMiB = Number(sizeArg ?? 6);
  const documentSecret = readSecret(serverDb);

  if (serverAlreadyHas(LARGE_NOTE_TITLE, serverDb)) {
    console.log(`Already seeded ("${LARGE_NOTE_TITLE}" exists on the server). Nothing to do.`);
    return;
  }

  for (const suffix of ["", "-wal", "-shm"]) {
    if (existsSync(LOCAL_DB + suffix)) rmSync(LOCAL_DB + suffix);
  }

  const probe = new SyncTransport({ serverHost, documentSecret, syncVersion: 0 });
  const status = await probe.getSetupStatus();

  const transport = new SyncTransport({
    serverHost,
    documentSecret,
    // Seed with no cap: the point is to get the content *onto* the server, and the client under test
    // is the one that will refuse to pull it back.
    syncVersion: status.syncVersion,
    maxBlobContentSize: 0
  });

  const db = new NodeSqliteDatabase(LOCAL_DB);
  const store = new LocalStore(db);
  store.initializeSchema();

  const engine = new SyncEngine({ store, transport });

  console.log(`Pull before seeding...`);
  await engine.sync();

  const inbox = store.queryRaw<{ noteId: string }>(
    "SELECT noteId FROM notes WHERE title = ? AND isDeleted = 0 LIMIT 1",
    ["速记 Inbox"]
  );

  const parent = inbox?.noteId ?? "root";

  // One large text note and one large binary attachment: the two shapes the download path has to
  // handle, since the JSON blob endpoint carries strings and `/open` carries bytes.
  const body = `<p>${"大附件正文 ".repeat(Math.ceil((sizeMiB * 1024 * 1024) / 18))}</p>`;
  const note = store.createTextNote({ parentNoteId: parent, title: LARGE_NOTE_TITLE, content: body });

  const binary = new Uint8Array(sizeMiB * 1024 * 1024);
  for (let index = 0; index < binary.length; index += 4096) binary[index] = index % 251;

  const attachment = store.createAttachment({
    ownerId: note.noteId,
    role: "file",
    mime: "application/octet-stream",
    title: LARGE_ATTACHMENT_TITLE,
    // Binary rides through the journal as base64, exactly as a real upload would.
    content: Buffer.from(binary).toString("base64")
  });

  console.log(
    `Created "${LARGE_NOTE_TITLE}" (${(body.length / 1024 / 1024).toFixed(1)} MiB)` +
      ` + "${LARGE_ATTACHMENT_TITLE}" (${sizeMiB} MiB)`
  );

  const result = await engine.sync();

  console.log(
    `Pushed in ${result.pushBatches} batch(es); ` +
      `content hash ${result.divergedSectors.length === 0 ? "matches" : "DIVERGED"}`
  );

  store.close();

  if (result.divergedSectors.length > 0) {
    console.error(`FAILED: ${result.divergedSectors.length} sector(s) diverged`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nSeeded. Note id ${note.noteId}, attachment id ${attachment.attachmentId}.`);
}

main().catch((error) => {
  console.error("Seeding failed:", error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});

/**
 * Prove an image and an attachment survive the sync protocol.
 *
 * The wire format is the thing to check, and it is easy to get silently wrong: JSON has no bytes, so
 * Trilium carries blob content as base64 (`sync.ts` encodes on the way out, the receiver decodes in
 * `preProcessContent`). A client that pushes a `Uint8Array` instead gets `{"0":137,"1":80,...}` —
 * accepted with a 2xx and stored as garbage.
 *
 * So this reads the **server's own database** and compares the bytes, and it compares them against a
 * payload that is deliberately not valid UTF-8.
 *
 *   pnpm exec tsx tools/roundtrip-image.ts <serverHost> <serverDbPath>
 */

import { existsSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { LocalStore } from "../src/store/local-store.js";
import { NodeSqliteDatabase } from "../src/store/sqlite-node.js";
import { SyncEngine } from "../src/sync/engine.js";
import { SyncTransport } from "../src/sync/transport.js";

const HOST = process.argv[2] ?? "http://127.0.0.1:18740";
const SERVER_DB = process.argv[3] ?? ".trilium-test-data/document.db";
const LOCAL_DB = "/tmp/trilium-image-roundtrip.db";

/** A tiny PNG, plus bytes that are invalid UTF-8 so a text round trip would corrupt them. */
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82
]);

const ATTACHMENT = new Uint8Array([0xff, 0xfe, 0x00, 0x80, 0xc3, 0x28, 0xa0, 0xa1, 0x01, 0x02, 0xff]);

function secretOf(path: string): string {
  const db = new DatabaseSync(path, { readOnly: true });
  const row = db.prepare("SELECT value FROM options WHERE name = 'documentSecret'").get() as
    | { value: string }
    | undefined;
  db.close();
  if (!row) throw new Error(`no documentSecret in ${path}`);
  return row.value;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function main(): Promise<void> {
  if (existsSync(LOCAL_DB)) rmSync(LOCAL_DB);

  const store = new LocalStore(new NodeSqliteDatabase(LOCAL_DB));
  store.initializeSchema();
  const transport = new SyncTransport({
    serverHost: HOST,
    documentSecret: secretOf(SERVER_DB),
    syncVersion: 39
  });
  const engine = new SyncEngine({ store, transport });

  console.log("initial sync…");
  await engine.sync();

  const inbox = store.getOption("triliumMobile.inboxNoteId") ?? "root";
  const stamp = Date.now();

  console.log("creating an image note and a binary attachment locally…");
  const image = store.createImageNote({
    parentNoteId: inbox,
    title: `图片往返 ${stamp}`,
    mime: "image/png",
    bytes: PNG
  });

  const target = store.createTextNote({
    parentNoteId: inbox,
    title: `附件往返 ${stamp}`,
    content: "<p>host</p>"
  });

  store.createAttachment({
    ownerId: target.noteId,
    role: "file",
    mime: "application/octet-stream",
    title: `blob-${stamp}.bin`,
    content: ATTACHMENT
  });

  console.log("pushing…");
  const summary = await engine.sync();
  console.log(
    `  pushed ${summary.pushed}, pulled ${summary.pulled}, diverged sectors ${summary.divergedSectors.length}`
  );

  console.log("reading the SERVER's own database…");
  const server = new DatabaseSync(SERVER_DB, { readOnly: true });

  const imageRow = server
    .prepare("SELECT n.noteId, n.type, n.mime, b.content AS bytes FROM notes n JOIN blobs b ON b.blobId = n.blobId WHERE n.title = ?")
    .get(`图片往返 ${stamp}`) as { noteId: string; type: string; mime: string; bytes: Uint8Array } | undefined;

  const attachmentRow = server
    .prepare("SELECT a.role, a.mime, a.title, b.content AS bytes FROM attachments a JOIN blobs b ON b.blobId = a.blobId WHERE a.title = ?")
    .get(`blob-${stamp}.bin`) as { role: string; mime: string; title: string; bytes: Uint8Array } | undefined;

  server.close();

  const checks: Array<[string, boolean, string]> = [
    ["image note reached the server", Boolean(imageRow), imageRow?.noteId ?? "missing"],
    ["its type is `image`", imageRow?.type === "image", imageRow?.type ?? "-"],
    ["its mime survived", imageRow?.mime === "image/png", imageRow?.mime ?? "-"],
    [
      "its bytes are byte-identical",
      Boolean(imageRow) && sameBytes(PNG, new Uint8Array(imageRow!.bytes)),
      imageRow ? `${imageRow.bytes.byteLength} bytes back, ${PNG.byteLength} sent` : "-"
    ],
    ["the attachment reached the server", Boolean(attachmentRow), attachmentRow?.title ?? "missing"],
    ["its role is `file`", attachmentRow?.role === "file", attachmentRow?.role ?? "-"],
    [
      "its bytes are byte-identical",
      Boolean(attachmentRow) && sameBytes(ATTACHMENT, new Uint8Array(attachmentRow!.bytes)),
      attachmentRow ? `${attachmentRow.bytes.byteLength} bytes back, ${ATTACHMENT.byteLength} sent` : "-"
    ]
  ];

  let failed = 0;
  for (const [label, ok, detail] of checks) {
    if (!ok) failed++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}  (${detail})`);
  }

  store.close();
  console.log(
    failed === 0
      ? "\nPASS — an image note and a binary attachment round-tripped byte for byte."
      : `\nFAILED — ${failed} check(s).`
  );
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error("round-trip failed:", error);
  process.exitCode = 1;
});

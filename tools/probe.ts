/**
 * End-to-end protocol probe against a real Trilium server.
 *
 * It does the whole handshake and pull, then — the part that matters — folds everything it received
 * into per-sector content hashes and compares them against the server's own `/api/sync/check`.
 * Matching there means our hashing, ordering, cursor handling and tombstone folding all agree with
 * the reference implementation. That is the difference between "the HTTP calls returned 200" and
 * "the protocol is implemented correctly".
 *
 * Usage:
 *   pnpm exec tsx tools/probe.ts <serverHost> <documentSecret> [syncVersion]
 *
 * Nothing is written anywhere; the pull is held in memory.
 */

import { computeEntityHashes, diffEntityHashes, toHashable, type HashableChange } from "../src/sync/content-hash.js";
import { DEFAULT_MAX_BLOB_CONTENT_SIZE, SyncTransport } from "../src/sync/transport.js";
import type { EntityChangeRecord } from "../src/sync/types.js";

const MAX_PAGES = 5000;

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

async function main(): Promise<void> {
  const [serverHost, documentSecret, syncVersionArg] = process.argv.slice(2);

  if (!serverHost || !documentSecret) {
    console.error("usage: probe.ts <serverHost> <documentSecret> [syncVersion]");
    process.exit(2);
  }

  const started = Date.now();

  // `syncVersion` must be known *before* login, and `/api/app-info` requires a session once the
  // server is initialised. `/api/setup/status` is unauthenticated and reports it.
  const bootstrap = new SyncTransport({
    serverHost,
    documentSecret,
    syncVersion: syncVersionArg ? Number(syncVersionArg) : 0
  });

  const setupStatus = await bootstrap.getSetupStatus();
  const expectedSyncVersion = syncVersionArg ? Number(syncVersionArg) : setupStatus.syncVersion;

  console.log(`\nServer   ${serverHost}`);
  console.log(`Setup    initialized=${setupStatus.isInitialized} schema=${setupStatus.schemaExists} sync=${setupStatus.syncVersion}`);

  if (setupStatus.syncVersion !== expectedSyncVersion) {
    console.log(`\n  note: using syncVersion ${expectedSyncVersion} (server reports ${setupStatus.syncVersion})`);
  }

  const transport = new SyncTransport({
    serverHost,
    documentSecret,
    syncVersion: expectedSyncVersion,
    maxBlobContentSize: DEFAULT_MAX_BLOB_CONTENT_SIZE
  });

  // --- 1. login -------------------------------------------------------------------------------
  const login = await transport.login();
  console.log(`\nLogin OK  serverInstanceId=${login.instanceId}  maxEntityChangeId=${fmt(login.maxEntityChangeId)}`);

  const appInfo = await transport.getAppInfo();
  console.log(`Version  ${appInfo.appVersion}  db=${appInfo.dbVersion}  sync=${appInfo.syncVersion}`);

  // --- 2. pull everything ---------------------------------------------------------------------
  const clientInstanceId = "probeprobe01";
  const byKey = new Map<string, HashableChange>();
  const counts = new Map<string, number>();

  let cursor = 0;
  let pages = 0;
  let records = 0;
  let stubbedBlobs = 0;

  while (pages < MAX_PAGES) {
    const page = await transport.getChanged(cursor, clientInstanceId);
    pages++;

    for (const record of page.entityChanges) {
      records++;
      const ec = record.entityChange;
      counts.set(ec.entityName, (counts.get(ec.entityName) ?? 0) + 1);

      if (ec.entityName === "blobs" && (record as EntityChangeRecord<{ content?: string }>).entity?.content === "") {
        stubbedBlobs++;
      }

      // entity_changes is one row per (entityName, entityId); later ids win, mirroring REPLACE.
      byKey.set(`${ec.entityName}\u0000${ec.entityId}`, toHashable(record));
    }

    cursor = page.lastEntityChangeId;

    if (page.outstandingPullCount === 0 && page.entityChanges.length === 0) break;
    if (page.entityChanges.length === 0) break;
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(2);
  console.log(
    `\nPulled   ${fmt(records)} records in ${fmt(pages)} pages (${elapsed}s), ` +
      `${fmt(byKey.size)} distinct entities`
  );

  for (const [name, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${name.padEnd(18)} ${fmt(n).padStart(7)}`);
  }

  if (stubbedBlobs > 0) {
    console.log(`   (${fmt(stubbedBlobs)} blobs stubbed by maxBlobContentSize — fetched on demand)`);
  }

  // --- 3. content-hash cross-check ------------------------------------------------------------
  const localHashes = computeEntityHashes([...byKey.values()]);
  const remote = await transport.check();
  const failures = diffEntityHashes(localHashes, remote.entityHashes);

  const localSectors = Object.values(localHashes).reduce((n, s) => n + Object.keys(s).length, 0);
  const remoteSectors = Object.values(remote.entityHashes).reduce((n, s) => n + Object.keys(s).length, 0);

  console.log(
    `\nContent hash   local sectors=${fmt(localSectors)}  server sectors=${fmt(remoteSectors)}` +
      `  server maxEntityChangeId=${fmt(remote.maxEntityChangeId)}`
  );

  if (failures.length === 0) {
    console.log("\n  PASS — every sector matches the server. The sync protocol is implemented correctly.");
    await transport.finished();
  } else {
    console.log(`\n  FAIL — ${failures.length} sector(s) differ:`);
    for (const f of failures.slice(0, 15)) {
      console.log(`   ${f.entityName}/${f.sector}  local=${f.local ?? "<absent>"}  server=${f.remote ?? "<absent>"}`);
    }
    if (failures.length > 15) console.log(`   ... and ${failures.length - 15} more`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("\nProbe failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

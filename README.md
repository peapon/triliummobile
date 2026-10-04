# TriliumMobile

An offline-first Trilium Notes client for phone and tablet, HarmonyOS-first.

The design is settled and recorded in [docs/adr/0001-architecture.md](docs/adr/0001-architecture.md).
This README is the operator's view: what exists, how to run it, and what has actually been verified.

## Status

| Piece | State |
|---|---|
| Crypto primitives (SHA-1/256/512, HMAC-SHA-256, base64) | **Done and verified** — byte-identical to `node:crypto` |
| Entity hashes | **Done and verified** — 100% on a fresh server DB; 100% of notes/branches/attributes in a live 2.6 GB vault |
| Sync transport (login, pull, paged push, check) | **Done and verified** — 252/252 content-hash sectors match a real server |
| Local replica (schema, journal, conflict bounce-back, tombstones) | **Done and verified** — full round-trip against a real server |
| Offline capture (`createTextNote`) | **Done and verified** — notes created offline reach the server and a fresh client reproduces them |
| Content-hash verification loop | **Done** — folds the journal sector by sector, with re-queue retry |
| UI (phone: capture/search/view; pad: + light edit + ink) | **Not started** |
| HarmonyOS build toolchain | **Working, no Huawei account needed** — builds an unsigned `.hap` |
| HarmonyOS runtime behaviour (pen input, LAN fetch, storage quota) | **Awaiting a device** — probe written and building |

## What the round-trip proves

[tools/roundtrip.ts](tools/roundtrip.ts) runs the whole loop against a real Trilium server and
verifies each phase independently:

```
1. Initial sync     pulls the entire server; our content-hash fold matches every sector
2. Local capture    3 notes created offline (incl. Chinese, emoji, combining accents)
3. Push + verify    the notes are read back out of the *server's own database file*
4. Fresh client     an independent local replica syncs and reproduces all 3 notes
```

Phase 3 is the one that matters: a push returning `204` proves nothing, so the check reads the
server's SQLite file directly.

## Building the HarmonyOS probe

Fully public toolchain; no Huawei account required to build (signing and installing do need one).

```bash
cd apps/harmony-probe
./setup-toolchain.sh    # OpenHarmony SDK 7.0 (API 26) + hvigor, checksum verified
./build.sh              # -> entry/build/default/outputs/default/entry-default-unsigned.hap
```

The probe answers the three questions that decide the client's architecture — stylus
`pointerType === "pen"`, cleartext LAN `fetch`, and the real IndexedDB quota — plus it reports the
WebView's actual Chromium version. See [docs/harmonyos-setup.md](docs/harmonyos-setup.md) for what
still requires a Huawei account and a device.

## Running the verification

```bash
pnpm install
pnpm test          # crypto + content-hash unit tests
pnpm typecheck
```

Both harnesses below need a Trilium server to talk to.

### 1. A disposable test server

```bash
docker run -d --name trilium-test -p 18740:8080 \
  -v "$PWD/.trilium-test-data:/home/node/trilium-data" \
  triliumnext/trilium:latest

# initialise it (the response is 204)
curl -X POST http://127.0.0.1:18740/api/setup/new-document \
  -H 'Content-Type: application/json' -d '{}'
```

The sync secret lives in the server's own database:

```bash
sqlite3 -readonly "file:.trilium-test-data/document.db?mode=ro" \
  "select value from options where name='documentSecret';"
```

### 2. Prove the protocol end-to-end

```bash
SECRET=$(sqlite3 -readonly "file:.trilium-test-data/document.db?mode=ro" \
  "select value from options where name='documentSecret';")

pnpm exec tsx tools/probe.ts http://127.0.0.1:18740 "$SECRET"
```

This logs in, pulls everything, folds the result into per-sector content hashes, and compares them
with the server's own `GET /api/sync/check`. **A `PASS` on every sector is the bar** — anything less
means the implementation diverges from the reference, even if every HTTP call returned 200.

### 3. Run the full round-trip

```bash
pnpm exec tsx tools/roundtrip.ts http://127.0.0.1:18740
```

Pulls the whole server, creates notes offline, pushes them, then reads the server's own database
file to confirm they arrived — and finally syncs a second, independent replica to confirm they are
reproducible. Each run creates three new notes on the test server, which is disposable.

### 4. Check the hash implementation against a real vault

```bash
pnpm exec tsx tools/verify-hashes.ts                                  # your live vault
pnpm exec tsx tools/verify-hashes.ts .trilium-test-data/document.db   # the test server
```

Recomputes every entity hash and compares it against the hash Trilium recorded. Read-only.

To chase a single mismatch:

```bash
pnpm exec tsx tools/diagnose-hash.ts attachments <entityId>
```

## Layout

```
src/crypto/          pure-JS digests + Trilium's exact hash rules
src/entities/        hashedProperties, boolean coercion, blob hash override
src/store/           server schema, journal application, offline capture, cursors
src/sync/            wire types, HTTP transport, content-hash fold, sync engine
src/util/            random ids
tools/               verification harnesses (round-trip, hash comparison, protocol probe, diagnostics)
apps/harmony-probe/  ArkWeb capability probe + no-account .hap build toolchain
docs/research/       four source-cited research reports
docs/adr/            architecture decision records
docs/harmonyos-setup.md   what needs a Huawei account, and what does not
reference/           shallow clones of upstream Trilium and TriliumDroid, for reading source only
```

## Two things worth knowing before changing this code

**Never recompute a hash for an entity that already has an `entity_changes` row.** Hashes are carried,
not derived — see ADR D3. Upstream's own hashes are ambiguous for `attachments`, so recomputation is
both unnecessary and, for historical rows, impossible.

**`isErased` is a raw SQLite integer in the content-hash fold, not a boolean.** Upstream reads it via
`getRawRows()`, so the sector string is `hash + "1"`. Using a boolean mismatches *every* sector while
every HTTP call still succeeds. `src/sync/content-hash.spec.ts` pins this.

## License

AGPL-3.0-only. Trilium, TriliumDroid and pocket-trilium are all AGPL-3.0; this client ports protocol
logic from upstream and inherits the licence.

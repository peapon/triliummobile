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
| Sync engine (journal, cursors, conflict bounce-back, resumability) | **Not started** |
| Local store (IndexedDB adapter) | **Not started** |
| UI (phone: capture/search/view; pad: + light edit + ink) | **Not started** |
| Native shells (ArkTS / Capacitor) | **Not started** — no toolchain on this machine |

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

### 3. Check the hash implementation against a real vault

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
src/crypto/      pure-JS digests + Trilium's exact hash rules
src/entities/    hashedProperties, boolean coercion, blob hash override
src/sync/        wire types, HTTP transport, content-hash fold
tools/           verification harnesses (hash comparison, protocol probe, diagnostics)
docs/research/   four source-cited research reports
docs/adr/        architecture decision records
reference/       shallow clones of upstream Trilium and TriliumDroid, for reading source only
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

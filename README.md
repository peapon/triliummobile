# TriliumMobile

An offline-first Trilium Notes client for phone and tablet, HarmonyOS-first. It speaks
Trilium's own sync protocol and stores rows in Trilium's own schema, so it works against a
self-hosted Trilium server without a plugin or a proxy on the server side.

The architecture is recorded in [docs/adr/0001-architecture.md](docs/adr/0001-architecture.md).

## Status

| Piece | State |
|---|---|
| Crypto primitives (SHA-1/256/512, HMAC-SHA-256, base64) | **Done and verified** — byte-identical to `node:crypto` |
| Entity hashes | **Done and verified** — 100% on a fresh server DB; 100% of notes/branches/attributes in a live 2.6 GB vault |
| Sync transport (login, pull, paged push, check) | **Done and verified** — 404/404 sectors match a live vault |
| Local replica (schema, journal, conflict bounce-back, tombstones) | **Done and verified** — full round-trip against a real server |
| Offline capture | **Done and verified** — notes created offline reach the server and a fresh client reproduces them |
| Content-hash verification loop | **Done** — folds the journal sector by sector, with re-queue retry |
| Phone UI (capture / search / browse) | **Working** — editing is entered by long press |
| Pad UI (light editing + ink annotation/drawing) | **Working** — edit and ink both reach the server |
| Attachments | **Working** — on demand, with an LRU cache; pictures inline, files as references |
| Languages | **Nine**, switchable in settings; follows the vault's `locale` by default |
| Rename / delete notes | **Working and verified against the server's own database** |
| Automatic sync | **Working** — off, or 1 minute to 4 hours |
| HarmonyOS app (`.hap`) | **Running and syncing both ways on a real device** |
| Android app (`.apk`) | **Builds; the package is verified; not yet run on a device** |
| iOS / iPadOS | **Not built** — see [docs/known-issues.md](docs/known-issues.md) |
| Stylus `pointerType === "pen"` | **Unverified** — needs a physical device with a stylus |
| Sending an AI message | **Not possible** — a chat can be created; the server owns the model |
| Verification against a packaged build | **Partial** — the browser suites do not exercise the packaged app |

## Requirements

- Node.js 20 or newer, with pnpm.
- A Trilium server to talk to. A disposable one is enough for development and testing.
- Platform builds need the toolchains described in [docs/releasing.md](docs/releasing.md).

## Quick start

The UI runs the same protocol core as the Node tests, in a Web Worker.

```bash
pnpm install

# A disposable Trilium server (skip if you already have one).
docker run -d --name trilium-test -p 18740:8080 \
  -v "$PWD/.trilium-test-data:/home/node/trilium-data" triliumnext/trilium:latest
curl -X POST http://127.0.0.1:18740/api/setup/new-document -H 'Content-Type: application/json' -d '{}'
curl -X POST http://127.0.0.1:18740/set-password -H 'Content-Type: application/json' \
  -d '{"password1":"triliumtest123","password2":"triliumtest123"}'

cd apps/web && pnpm exec vite --port 5273 --strictPort --host 127.0.0.1
# open http://127.0.0.1:5273/ — leave the server field at the page's own origin
```

The server field must be **same-origin**. Trilium answers with
`Cross-Origin-Resource-Policy: same-origin` and no CORS headers, so a page on another origin
cannot read its API; the dev server proxies `/api` to the real server instead. The packaged
apps proxy API calls through their native shell.

## Building

The web bundle is the application; each platform package is a thin shell around it.

```bash
# Web bundle -> apps/web/dist
cd apps/web && pnpm build

# HarmonyOS (.hap); no Huawei account needed to build
cd apps/harmony-probe && ./package-app.sh

# Android (.apk) -> app/build/outputs/apk/debug/app-debug.apk
cd apps/android && ./build-apk.sh
```

Signing, installing and toolchain details are in [docs/releasing.md](docs/releasing.md).

## Verification

```bash
pnpm typecheck                                # tsc --noEmit
pnpm test                                     # 64 unit tests
node tools/check-contrast.mjs                 # palette, against the WCAG threshold
pnpm exec tsx tools/layout-audit.ts           # 3 viewports x every screen
pnpm exec tsx tools/i18n-audit.ts             # catalogues agree; nothing bypasses t()
pnpm exec tsx tools/feature-audit.ts          # 26 feature checks (needs a test server)
pnpm exec tsx tools/e2e-web.ts                # 31 browser checks (needs a test server)
pnpm exec tsx tools/roundtrip.ts <host>       # protocol round trip
pnpm exec tsx tools/verify-hashes.ts <db>     # hashes against a real vault
```

The last three read the server's own SQLite database, because an accepted HTTP request does
not prove the data is right. What each check can and cannot see is listed in
[docs/development.md](docs/development.md). How to run them before a pull request is in
[CONTRIBUTING.md](CONTRIBUTING.md).

## Layout

```
src/                      platform-neutral core
  crypto/                 SHA-1/256/512, HMAC-SHA-256, base64
  entities/               row shapes and Trilium's exact hash rules
  store/                  the replica: schema, sqlite adapters, journal, cursors
  sync/                   wire types, HTTP transport, content-hash fold, sync engine
apps/web/                 phone-first UI; owns the worker that holds the database
apps/harmony-probe/       ArkTS shell, capability probe, and no-account .hap packaging
apps/android/             Android WebView shell
tools/                    verification harnesses (browser E2E, round-trip, hash comparison, audits)
docs/adr/                 architecture decision records
docs/research/            source-cited research reports
reference/                shallow clones of upstream Trilium and TriliumDroid (gitignored, read-only)
```

## Documentation

| Document | Contents |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Components, boundaries, and the decisions behind them |
| [docs/development.md](docs/development.md) | Layout, building, running, testing, verification tooling |
| [docs/releasing.md](docs/releasing.md) | Packaging, signing and installing per platform |
| [docs/known-issues.md](docs/known-issues.md) | Open issues, verification gaps, and fixed issues |
| [docs/upstream.md](docs/upstream.md) | Relationship to Trilium: protocol, licence, contribution routes |
| [docs/harmonyos.md](docs/harmonyos.md) | HarmonyOS toolchain, device results, and packaging |
| [docs/adr/0001-architecture.md](docs/adr/0001-architecture.md) | The architecture decision record |
| [CHANGELOG.md](CHANGELOG.md) | Changes to date, by day |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to build, test and submit a change |

## Licence

AGPL-3.0-only. Trilium, TriliumDroid and pocket-trilium are all AGPL-3.0; this client ports
protocol logic from upstream and inherits the licence. The Trilium name and logo are used
with provenance recorded in [assets/branding/ATTRIBUTION.md](assets/branding/ATTRIBUTION.md);
AGPL-3.0 §5(e) grants no trademark rights.

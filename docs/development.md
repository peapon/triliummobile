# Development

Layout, building, running, and the verification tooling.

## Repository layout

```
src/                        platform-neutral core
  crypto/                   SHA-1/256/512, HMAC-SHA-256, base64
  entities/                 row shapes and Trilium's exact hash rules
  store/                    the replica: schema, local store, sqlite adapters
  sync/                     transport and the sync engine
apps/web/                   the application
  src/main.ts               UI, state, routing, rendering
  src/data.ts               queries over the replica
  src/worker.ts             RPC surface; owns the database
  src/rpc.ts                the client side of that RPC
  src/native-fetch.ts       adapts each shell's bridge to `fetch`
  src/i18n.ts               the `cn` and `en` catalogues and `t()`
  src/ink.ts                the ink model and canvas
  src/style.css             Trilium's palette and the layout system
  public/boxicons/          Trilium's own icon font, generated from the server's pack
apps/harmony-probe/         HarmonyOS shell (ArkTS), probe, and packaging
apps/android/               Android shell (Java)
tools/                      verification harnesses (see below)
docs/adr/                   architecture decision records
docs/research/              source-cited research reports
reference/                  shallow clones of upstream Trilium and TriliumDroid (gitignored)
```

Roughly 11,000 lines of TypeScript, ArkTS, Java and CSS; 64 unit tests; 31 browser checks;
26 feature checks.

## Prerequisites

- Node.js 20 or newer, with pnpm.
- A Trilium server. A disposable one is enough:

```bash
docker run -d --name trilium-test -p 18740:8080 \
  -v "$PWD/.trilium-test-data:/home/node/trilium-data" triliumnext/trilium:latest
curl -X POST http://127.0.0.1:18740/api/setup/new-document \
  -H 'Content-Type: application/json' -d '{}'
curl -X POST http://127.0.0.1:18740/set-password -H 'Content-Type: application/json' \
  -d '{"password1":"triliumtest123","password2":"triliumtest123"}'
```

The sync secret lives in the server's own database:

```bash
sqlite3 -readonly "file:.trilium-test-data/document.db?mode=ro" \
  "select value from options where name='documentSecret';"
```

- Chrome, for the browser harnesses. They use `playwright-core` with the installed Chrome, so
  no browser download is needed.

## Running the app

```bash
pnpm install
cd apps/web && pnpm exec vite --port 5273 --strictPort --host 127.0.0.1
```

Open `http://127.0.0.1:5273/` and leave the server field at the page's own origin. The dev
server proxies `/api` to the real server; a page on another origin cannot read Trilium's API
because the server sends `Cross-Origin-Resource-Policy: same-origin` and no CORS headers. See
[architecture.md](architecture.md) for what the packaged apps do instead.

## Building

```bash
# Web bundle -> apps/web/dist
cd apps/web && pnpm build

# HarmonyOS (.hap)
cd apps/harmony-probe && ./package-app.sh

# Android (.apk) -> app/build/outputs/apk/debug/app-debug.apk
cd apps/android && ./build-apk.sh
```

Per-platform toolchains, signing and installation are in [releasing.md](releasing.md).

## Unit tests and type checks

```bash
pnpm typecheck     # tsc --noEmit
pnpm test          # 64 unit tests
pnpm test:watch
```

The unit tests cover the crypto primitives, the content-hash fold, the sync transport and the
local store, and run against `node:sqlite`. They do not exercise a browser or a device.

## Verification tooling

```bash
node tools/check-contrast.mjs                    # palette, against the WCAG threshold
pnpm exec tsx tools/layout-audit.ts              # 3 viewports x every screen
pnpm exec tsx tools/i18n-audit.ts                # catalogues agree; nothing bypasses t()
pnpm exec tsx tools/feature-audit.ts             # 26 feature checks (dev server + test server)
pnpm exec tsx tools/e2e-web.ts                   # 31 browser checks (dev server + test server)
pnpm exec tsx tools/roundtrip.ts <host>          # protocol round trip
pnpm exec tsx tools/roundtrip-image.ts <host> <db>
pnpm exec tsx tools/verify-hashes.ts <db>        # hashes against a real vault
pnpm exec tsx tools/probe.ts <host> <secret>     # read-only protocol probe
pnpm exec tsx tools/diagnose-hash.ts <table> <entityId>
pnpm exec tsx tools/seed-large-note.ts           # large-blob fixture
```

The browser harnesses need the dev server above; `feature-audit.ts` and `e2e-web.ts`
additionally need the disposable Trilium server, and read its SQLite file directly.

### What each check can and cannot see

| Check | Sees | Cannot see |
|---|---|---|
| `typecheck` | types | anything at runtime |
| unit tests | pure functions, the sync engine against `node:sqlite` | the browser, the device |
| `check-contrast` | declared colours | anything rendered |
| `layout-audit` | overflow, clipped text, undersized targets, wrapped labels | anything not rendered while it looks |
| `feature-audit` | that each thing asked for is present and reachable | whether it behaves correctly |
| `e2e-web` | behaviour, against a real server, in Chromium | the packaged app, the device |
| `roundtrip` | bytes and rows, against a real server | the UI |
| `verify-hashes` | hash implementations, against a real vault | the app |

**None of these can see the packaged application.** A browser suite passing says nothing
about a device. The gap is closed only by running the package and reading the device's own
logs.

### The layout audit

Runs every screen at 320, 360, 390 and 1024 wide and reports four things:

1. an element that escapes the viewport;
2. text clipped by its container;
3. a tap target under 44px;
4. a label drawn on two lines.

The last is measured with `Range.getClientRects()`, which returns one rect per line box, so
图片 (one line) and 图 over 片 (two) are distinguishable. It is limited to pure-text buttons,
because a row is a button containing a title and a meta line and is multi-line by design. The
checks are complements: `white-space: nowrap` applied broadly satisfies the wrapped-label
check and breaks the overflow check on a 320px screen, so all four must run.

### Verification against real data

- The owner's live vault, 2.6 GB, read-only: 404/404 content-hash sectors match.
- Entity hashes: 100% on a fresh server database; 100% of notes, branches and attributes in
  the live vault.
- Byte-identical round trips: a 2.5 MB PDF, a 4 MiB image note, a 6 MiB attachment, including
  through paged pushes and the base64 wire format.
- The server's own database is read after every write path: a rename shows the new title, a
  delete shows `isDeleted = 1`.

## Reading the device

The device is the only place some things can be settled. The bundle stamps its build id into
the console, so a device can be asked which build it is running:

```bash
# HarmonyOS
hdc -t <device> shell hilog -x | grep -a "shell: build"    # which build is running
hdc -t <device> shell hilog -x | grep -a "page says"       # what the page reported
```

ArkWeb console output arrives under the `ARKWEB-CONSOLE` tag, not the application tag.

## Language and style

- Comments and documentation are in English.
- UI strings go through `t()` in `apps/web/src/i18n.ts`; `tools/i18n-audit.ts` checks that
  both catalogues agree and that no user-visible string bypasses `t()`. `t()` falls back to
  English, so a contributed catalogue may be incomplete.
- Adding a language means adding an entry to `CATALOGUES` and to `LANGUAGES` in
  `apps/web/src/i18n.ts`.

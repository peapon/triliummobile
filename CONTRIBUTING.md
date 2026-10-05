# Contributing

This repository is a documentation-and-code project about one thing: a mobile client that
speaks Trilium's protocol faithfully. Two rules follow from that and apply to every change.

**Trilium is the source of product truth.** Where this client and Trilium disagree about
behaviour, Trilium is right and this client is the bug. Do not invent features.

**A claim of "works" must say how it was checked.** "It compiles" is not a check. State the
command, the server version, and what was read to confirm it — a server's own database, a
device log, a measured value. If something was not verified, say so in the same sentence.

## Building and running

```bash
pnpm install
cd apps/web && pnpm exec vite --port 5273 --strictPort --host 127.0.0.1
```

Platform builds are described in [docs/releasing.md](docs/releasing.md). The layout of the
repository is in [docs/development.md](docs/development.md).

## Checks that must pass

```bash
pnpm typecheck                            # tsc --noEmit
pnpm test                                 # 64 unit tests
node tools/check-contrast.mjs             # palette, against the WCAG threshold
pnpm exec tsx tools/layout-audit.ts       # 3 viewports x every screen
pnpm exec tsx tools/i18n-audit.ts         # both catalogues agree; nothing bypasses t()
```

Both browser audits below need the dev server from the previous section **and** a disposable
Trilium server to talk to. Start one and point the dev server's proxy at it:

```bash
docker run -d --name trilium-test -p 18740:8080 \
  -v "$PWD/.trilium-test-data:/home/node/trilium-data" triliumnext/trilium:latest
curl -X POST http://127.0.0.1:18740/api/setup/new-document \
  -H 'Content-Type: application/json' -d '{}'
curl -X POST http://127.0.0.1:18740/set-password -H 'Content-Type: application/json' \
  -d '{"password1":"triliumtest123","password2":"triliumtest123"}'
```

```bash
pnpm exec tsx tools/feature-audit.ts      # 26 feature checks (test server required)
pnpm exec tsx tools/e2e-web.ts            # 31 browser checks (test server required)
```

`e2e-web.ts` and `feature-audit.ts` read the server's own SQLite file after each write path.
Use a disposable server: both create notes, and the harness expects the database and its
change journal to be in step.

Never edit a test server's database directly with SQL. Rows and the change journal then
disagree, the client correctly refuses to push, and the symptom looks like a client bug.
Drive the application's own paths.

## What a pull request is expected to contain

- **A focused change.** One concern per pull request, with the reasoning in the description
  when the change is not self-evident.
- **The checks above, passing.** Paste the commands you ran and their result.
- **How the change was verified**, in the terms of the honesty rule at the top. A UI change
  needs the layout audit and the E2E suite; a protocol change needs the round-trip or the
  content-hash check against a real server.
- **Updated documentation**, when behaviour, a command, a file path or a limitation changes.
  An unverified item that becomes verified must move out of
  [docs/known-issues.md](docs/known-issues.md), and a new limitation must move in.
- **An entry in [CHANGELOG.md](CHANGELOG.md)** under the current day, written as a
  user-visible outcome rather than a commit subject.

## House style

- **Comments and documentation are in English.** This is a published repository.
- **UI strings go through `t()`.** No hard-coded user-visible text in `apps/web/src/`; the
  `i18n-audit` tool enforces this. Comments are not UI strings and are not translated.
- **Plain, specific prose.** No marketing language, no filler, no diary. State the fact, the
  command, and the number.
- **Nothing under `src/` may use a Node-only global.** The core runs unchanged inside a
  WebView worker; use the portable helpers in `src/crypto/bytes.ts`.
- **Never recompute a hash for an entity that already has an `entity_changes` row.** Hashes
  are carried, not derived. See [docs/architecture.md](docs/architecture.md).
- **Never claim a device behaviour from a browser result.** They have been wrong before; run
  it on the device and read the device's own log.

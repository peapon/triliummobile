# ADR 0001 — Architecture for a Trilium mobile client

- **Status:** Accepted
- **Date:** 2026-10-04
- **Deciders:** project owner + agent
- **Supersedes:** none

---

## 1. Context

### 1.1 The premise, corrected

The starting assumption was that Trilium "lacks a usable mobile client". That is out of date. As of
2026-10:

| Client | Approach | State |
|---|---|---|
| **TriliumNext `apps/mobile`** (official) | Capacitor shell over the `standalone` PWA; the whole server runs as WASM in a worker; `document.db` in OPFS via `sqlite-wasm` | Active — many mobile PRs Aug–Oct 2026 |
| **[TriliumDroid](https://github.com/FliegendeWurst/TriliumDroid)** | Kotlin, copies Trilium's SQLite DDL verbatim, reimplements the sync protocol | 403★, last push 2026-10-01 |
| **[pocket-trilium](https://github.com/Nriver/pocket-trilium)** | Ships a **proot Linux rootfs** and runs the real Trilium server on `127.0.0.1:8080`; the Flutter app is a WebView | Works, but a poor architecture |

So the gap is not "no mobile client". It is **no mobile client that is offline-first, genuinely
touch-native, and available on HarmonyOS**.

### 1.2 Requirements from the owner

- **Offline-first with bidirectional sync** against a self-hosted server — the existing
  create-offline / sync-on-connect behaviour is the thing that works and must be preserved.
- **Cross-platform, phone and tablet**, with **HarmonyOS as the priority**.
- **Good UX** — this is the actual complaint about the existing options.
- **Phone:** quick capture, quick search, viewing. No heavy editing.
- **Pad:** the above plus light keyboard editing and stylus input.
- **Blobs:** fetch on demand with an LRU cache, not bulk-synced.

### 1.3 Hard constraints discovered

- **HarmonyOS NEXT / 5+ cannot run Android APKs.** OpenHarmony 7.0 Beta1 (2026-05, API 26)
  reportedly removed the APK compatibility layer entirely. There is no "ship the APK" shortcut.
- **This machine has no mobile toolchain at all**: no DevEco Studio / `ohpm` / `hvigor`, no Android
  SDK, no full Xcode (CommandLineTools only), and only JDK 25 (DevEco bundles JDK 17 and breaks with a
  foreign JDK on `PATH`). Android and iOS builds are equally impossible today.
- **Real-device HarmonyOS install requires a Huawei account with 实名认证 and a device-bound debug
  certificate, and the signing step is GUI-only** — it cannot be completed from the CLI.

---

## 2. Decisions

### D1 — A web core in thin, hand-written native shells. Not a cross-platform UI framework.

**Built, and running on a HarmonyOS emulator.** The ArkTS shell is ~180 lines: a `Web` component, a
request interceptor, and a JS bridge. Three mechanisms in it were each forced by a measurement:

1. **The page is served from `https://localhost`, not `resource://rawfile`.** A rawfile page reports
   origin `null`, and on the device both `new Worker(...)` and `navigator.storage.getDirectory()`
   throw `SecurityError` there — no workers, no OPFS. The client needs both: the OPFS SAH-Pool VFS is
   worker-only (D5) and the replica lives in OPFS. `onInterceptRequest` answers static requests from
   the package, which yields a real origin with no local server to run.
2. **The API goes through a `javaScriptProxy` bridge, not the interceptor.** `onInterceptRequest` is
   synchronous — its callback returns a `WebResourceResponse`, not a promise — so it cannot perform a
   network round trip. That also happens to be the only way past D9's same-origin problem.
3. **The worker relays its HTTP through the main frame.** The bridge is injected into the main frame;
   the sync engine must live in the worker that owns the database. `SyncTransport` already took a
   `fetchImpl`, so the relay cost the protocol nothing — not one line changed.

Packaged by `apps/harmony-probe/package-app.sh`, 1.47 MB. Verified end to end on the device: a full
pull of 2,909 entities, and a note captured offline on the emulator confirmed by reading the server's
own database.

The UI is HTML/CSS/JS running in a WebView; each platform gets a minimal shell.

- HarmonyOS: a hand-written **ArkTS shell** — one `Web` component plus a `javaScriptProxy` bridge
  (optionally an in-app local HTTP server so the WebView gets a real `http://localhost` origin).
- Android / iOS: **Capacitor** (mature there).
- The browser: the same bundle runs as a PWA, which is how everything is developed and tested on
  this machine.

**Why.** Every alternative ends at ArkWeb anyway for anything WebView-based, so a cross-platform UI
framework buys a second build system for no gain:

- **Flutter-ohos** is maintained by the OpenHarmony SIG (not Google), lags upstream ~4 months by
  design, and the SIG's own roadmap admits unresolved **memory and CPU-load gaps**.
- **RNOH** is well-resourced but public npm lags its announced lines (no 0.86.x public, `latest` →
  0.72.143), couples to ArkUI C-API internals, and its background thread is documented as not
  production-safe.
- **ArkUI-X 6.0.0** inverts sharing: the shared language becomes ArkTS, stranding every other target.
- **`capacitor-harmony`** is v0.1.2, published 2026-09-13, single maintainer, and its own README says
  it is "not a full replication of Capacitor capabilities". Deliberately not a dependency.
- **pocket-trilium's proot rootfs** is rejected outright: ~360 MB, `double free` crashes, needs
  `jemalloc` `LD_PRELOAD` and Android developer-options changes, and breaks on every server upgrade.

### D2 — Implement Trilium's native sync protocol in TypeScript. Do not wrap the WASM standalone build.

The official mobile app reuses the WASM server. We do not, because:

- ArkWeb + WASM + OPFS is an unverified triple on the priority platform, and **HarmonyOS's opt-in
  Secure Shield mode disables WebAssembly entirely**.
- The WASM build drags the full server into a WebView, which is the opposite of "good UX" on a phone.

Instead the protocol is ported to TypeScript. Critically, **the port copies upstream's exact
formulas rather than re-deriving them** — upstream `packages/trilium-core` is itself TypeScript, so
the parts that must match byte-for-byte are copied from the reference implementation.

### D3 — Hashes are *carried*, never recomputed.

An entity's hash is computed once by whoever created the change and then travels in
`entity_changes`. The content-hash check folds the *stored* hashes; it never re-derives them.

This is not a convenience — it is forced by an upstream inconsistency. The hash of an attachment
depends on whether it reached memory through the creation path (key absent → `"undefined"`) or the
reload path (key `null` → `"null"`). Measured: a fresh database uses `"undefined"` for all 19
attachments; a long-lived vault uses `"null"` for 1735 and `"undefined"` for 573.

Consequence: recompute a hash **only** when creating a change for an entity we ourselves created or
modified, and use the creation-path convention there.

### D4 — Eager text, lazy blobs.

Measured on the owner's real 2.6 GB vault:

| Content | Size |
|---|---|
| Note tree + branches + attributes + **all** text/code/doc content | **18.3 MB** |
| `file` / `image` attachments | **1396 MB** |

So the entire *knowledge* of the vault is 18 MB, and 99% of the bulk is a handful of large binaries
(the largest single blobs are a 164 MB MP4, a 140 MB MP3, a 135 MB PPTX).

The protocol supports exactly this: passing `maxBlobContentSize` on `GET /api/sync/changed` makes the
server return oversized blobs with empty `content` **while leaving `entityChange.hash` untouched**, so
content-hash checks still pass. Missing content is then fetched on demand via
`GET /api/notes/{noteId}/blob` and cached with an LRU. This is the mechanism upstream itself uses on
mobile, where the desktop default of `syncMaxBlobContentSize: 0` (unlimited) "blows the
WASM/native heap during sync".

### D5 — SQLite (WASM + OPFS) behind an interface, running **inside a Web Worker**.

**Revised during implementation**, on evidence. The original plan was IndexedDB, on the reasoning
that it needs no WASM and therefore survives HarmonyOS's Secure Shield mode. Two findings changed it:

1. **The store must be synchronous.** The journal application is a tight read-then-write loop, and
   the content-hash fold hashes every row in one pass. IndexedDB's transaction model cannot compose
   with an imperative async loop (`await` inside a transaction closes it), so an IndexedDB store
   would have forced either a rewrite of the protocol logic or thousands of promise hops.
2. **`sqlite-wasm` + OPFS SAH-Pool is synchronous** — and it is the same engine upstream's own
   standalone and Capacitor builds run on. Verified working here before committing to it.

The cost is a hard constraint that was **verified, not assumed**: the SAH-Pool VFS needs
`FileSystemFileHandle.createSyncAccessHandle()`, which browsers expose **only to workers**. On the
main thread the library fails with "Missing required OPFS APIs". So the database, the transport and
the engine all live in a `Worker`, and the UI reaches them over an RPC boundary. That matches
upstream exactly — its standalone build runs the whole core in a dedicated worker — and it has the
side benefit that no synchronous SQLite call can block a frame.

The Secure Shield caveat stands and is the reason this sits behind `SqlDatabase`: a native SQLite
bridge (ArkTS `relationalStore`, Android SQLite, iOS SQLite) can replace the adapter per platform
without touching anything above it.

### D6 — Replicate the server's schema; do not build a document model.

Sync is **row-level change-log replication**: `entity_changes` rows carry the entity inline, and the
receiver applies raw rows (`REPLACE INTO <entityName>`). A document-oriented local model fights the
protocol at every step. Every entity table, its columns, and the specific hash rules must match.

### D7 — Stylus: delegate where free, build ink once.

The owner wants all three meanings of "stylus input" — handwriting-to-text, ink annotation, and
freeform drawing. Platform support is sharply asymmetric:

| Platform | Handwriting → text in a WebView |
|---|---|
| iPadOS | **Free** — Scribble explicitly covers "editable fields in web content" |
| Android 14+ | **Free** — "EditText components and WebView text widgets" support stylus by default |
| HarmonyOS / ArkWeb | **Not available** — reportedly does not fire in `textarea`/`contenteditable`, and Pen Kit exposes **no stroke→text API** to third parties |

Therefore:

- **(a) handwriting → text**: use the system IME on iPadOS and Android. On HarmonyOS this requires a
  **native ArkTS handwriting input field** — the only mandatory native work for this feature.
- **(b) ink annotation and (c) freeform drawing**: **one platform-agnostic canvas ink layer in the web
  core**, with our own stroke model. Never adopt PencilKit / Pen Kit / `androidx.ink` as *storage* —
  Pen Kit's `save()` format is opaque, undocumented, and does not export strokes.
- Ink persists as a note **attachment** (`ink-main.json`, role `ink`) with points normalised to
  [0,1]; never inline base64 into note HTML. The note carries a
  `<div class="trilium-ink" data-ink-id="main">` placeholder so the reference travels with the note
  rather than being inferred from whichever attachments happen to exist.

**Built.** `apps/web/src/ink.ts` holds the model and the canvas; `InkCanvas` is the capture/rendering
path and `paintInk()` is the read-only path, so a phone renders ink a tablet drew without attaching
input handlers. Details that matter:

- Strokes carry a normalised width and the document records the **aspect ratio of the box it was
  drawn in**, so a sketch redraws correctly on a differently shaped screen instead of stretching.
- Pressure modulates per-segment width where the device reports it. Each segment is drawn separately
  because a Canvas2D path has one line width for its whole length.
- Coalesced pointer events are used when available; without them a fast stroke degrades into a
  polygon.
- **Palm rejection is a heuristic, not a feature.** No target exposes an app-level API — HarmonyOS's
  `setHandwritingFlag()` is a System API — so once a stylus has been seen, `touch` input is ignored
  for a short window. It is imperfect, and stated as such in the code.
- A damaged stroke file yields a note with no ink, never a screen that fails to open; the parser is
  covered by 16 unit tests.

Editing is deliberately narrow: a `contenteditable` over **sanitised** HTML, offered only for note
types this editor can round-trip (`text`, `code`). A `book`, `canvas` or `render` note has structure
a plain editor would destroy, so those stay read-only.

### D8 — License: AGPL-3.0-only.

Trilium itself, TriliumDroid, and pocket-trilium are all AGPL-3.0. Porting is permitted, so this
project is AGPL-3.0-only. Note AGPL §13: running a modified version as a network service triggers the
corresponding-source obligation. A clean-room implementation would be the only way to avoid this, and
it is not worth it here.

---

### D9 — The web core cannot call a Trilium server cross-origin. Requests must be same-origin or natively proxied.

**Verified by inspecting the server's headers**, not inferred:

```
$ curl -D - http://server/api/setup/status -H "Origin: http://app.example"
HTTP/1.1 200 OK
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
                         <- no Access-Control-Allow-Origin
```

`Cross-Origin-Resource-Policy: same-origin` blocks cross-origin reads outright — a plain
`mode: "no-cors"` request does not help, and the failure in a browser is an opaque
`net::ERR_FAILED`, which is exactly what the first browser run produced.

Consequences, in order of preference:

1. **Native shells proxy the API.** The shell intercepts the WebView's `/api/*` requests and performs
   them natively. This is upstream's own iOS approach (`WKURLSchemeHandler`); HarmonyOS's ArkWeb
   offers `javaScriptProxy` and the option of an in-app local HTTP server. The WebView then only ever
   talks to its own origin and never meets the header.
2. **Serve the app from the server's own origin** — same host, behind the same reverse proxy. Works
   in any plain browser with no native code.
3. **Development only:** a dev-server proxy (implemented in `apps/web/vite.config.ts`).

What does **not** work is pointing a browser-hosted app at an arbitrary remote Trilium URL, which the
setup screen now says explicitly instead of failing obscurely.

### D10 — The protocol core must stay platform-neutral.

A rule learned the hard way: the first browser run died on **`Buffer is not defined`**, because the
journal decode and the push encoder used Node's `Buffer` for base64. Every Node integration test
passed — Node has `Buffer`. The core therefore uses only the portable helpers in `src/crypto/bytes.ts`
plus `globalThis.crypto`, and `apps/web` runs it unchanged. Anything Node-only in `src/` is a bug,
not a convenience.

## 3. Verification performed

Claims in this project are checked against real systems, not against reading alone.

**Crypto primitives** — pure-JS SHA-1, SHA-256, SHA-512, HMAC-SHA-256 and base64 cross-checked
against `node:crypto` across padding boundaries (0, 55, 56, 63, 64, 65, 111, 112, 127, 128, 129, 1000
bytes) and published test vectors. 9 tests, all passing.

**Entity hashes** — recomputed every entity from a real `document.db` and compared against the hash
Trilium itself recorded in `entity_changes`:

| Database | Result |
|---|---|
| Fresh Trilium 0.106.0 server (Docker) | **2862 / 2862 (100%)** |
| Owner's live 2.6 GB vault, 8 months of history and heavy ETAPI automation | 14 829 / 15 111 (98.1%) |

In the live vault, notes / branches / attributes are **100%**. The residual 282 rows trace to
`componentId = ReactWrappedWidget-*` (269) — **the owner's own custom scripts**, which write entities
through a path outside the core protocol — plus 13 local `NA` option/token rows. None are core-path
discrepancies, and none matter at runtime because of D3.

**Sync protocol against the owner's production vault** — the objective names a specific self-hosted
server, so the read-only probe (`tools/probe.ts`, which never calls `transport.update()`) was run
against it:

```
Server   http://114.66.28.183:29050
Version  0.106.0   db=240   sync=39
Login OK serverInstanceId=E78AkKwZd5zq  maxEntityChangeId=58,413

Pulled   25,037 records in 70 pages (171.43s), 25,037 distinct entities
   blobs 6,942 · branches 4,692 · notes 4,365 · revisions 3,277
   attributes 2,884 · attachments 2,705 · options 90 · note_reordering 67 · etapi_tokens 15
   (73 blobs stubbed by maxBlobContentSize — fetched on demand)

Content hash   local sectors=404  server sectors=404
  PASS — every sector matches the server.
```

That is the whole journal of a live vault, folded independently and compared with the server's own
check: **404 of 404 sectors agree.** It also sizes the first-run experience — 171 seconds for 25,037
records over a WAN, which is the number a client's initial-sync UI has to be designed around, and it
confirms the blob policy (D4) empirically: only 73 blobs exceeded the cap, so the other ~6,900 came
down as content.

**Sync protocol, against a local Trilium 0.106.0 server** — the full handshake and pull were run and
the received records were independently folded into per-sector content hashes and compared with the
server's own `GET /api/sync/check`:

```
Login OK  serverInstanceId=ndC7YDFvZzes  maxEntityChangeId=3,633
Pulled   2,815 records in 2 pages, 2,815 distinct entities
         (1 blob stubbed by maxBlobContentSize -- fetched on demand)
Content hash   local sectors=252  server sectors=252
  PASS -- every sector matches the server.
```

Two correctness traps were found only by running it, not by reading:

1. **`isErased` is a raw SQLite integer, not a boolean.** Upstream reads it with `getRawRows()`, so
   the sector string is `hash + "1"`, not `hash + "true"`. Using booleans mismatches **every** sector
   while every HTTP call still returns 200. Now pinned by a regression test.
2. **Attachment hashes are ambiguous upstream** (see D3), discoverable only by recomputing hashes
   from a real vault.

**HarmonyOS toolchain** — a `.hap` is built from components that require **no Huawei account**:

```
OpenHarmony SDK 7.0-Release (API 26), SHA-256 verified   repo.huaweicloud.com
@ohos/hvigor 6.26.8 + @ohos/hvigor-ohos-plugin 6.26.8    repo.harmonyos.com

> hvigor Finished :entry:default@CompileArkTS... after 6 s 713 ms
> hvigor Finished :entry:default@PackageHap... after 691 ms
> hvigor BUILD SUCCESSFUL

Built entry-default-unsigned.hap (88,875 bytes)
  ets/modules.abc                compiled ArkTS, ark24.0.0.0 VM
  resources/rawfile/probe.html   the capability probe
```

Reproduce with `apps/harmony-probe/setup-toolchain.sh && apps/harmony-probe/build.sh`.

**The application, end to end, in a real browser** — `tools/e2e-web.ts` drives the actual UI in
headless Chrome (390×844, touch, `zh-CN`) against the real server and reads the server's own SQLite
file to confirm arrival:

```
[  ok  ] app boots and OPFS + sqlite-wasm initialise
[  ok  ] setup flow reads the sync seed and completes a first sync
[  ok  ] the first sync actually populated the local replica — 591 notes
[  ok  ] local search returns results offline — 17 rows
[  ok  ] capture writes locally and marks the note as pending — 3 项待同步
[  ok  ] sync reports success — 同步完成：拉取 0 项，用时 0.1s
[  ok  ] the captured note is in the server's own database
[  ok  ] server note count increased — 591 -> 592
[  ok  ] browse lists the tree from root — 14 children
[  ok  ] opening a note renders its content
[  ok  ] rendered content carries no script or event handlers
[  ok  ] no uncaught console errors
[  ok  ] tablet shows the editing toolbar
[  ok  ] an edit is visible locally before any sync
[  ok  ] the edit is still owed to the server
[  ok  ] drawing a stroke enables the ink save button
[  ok  ] the tablet edit reached the server on the next sync
[  ok  ] the ink layer reached the server as an attachment — ink-main.json
[  ok  ] ink is still present after a reload, loaded from the local replica
[  ok  ] the edit persisted across a reload
```

The tablet checks assert the offline-first contract directly: the edit and the ink are visible
**before** any sync, reported as owed to the server, and only then carried across by the next sync —
verified by reading the server's file, not by trusting a `204`.

Three defects were found only by running the UI, none of which any Node test could have caught:
an unbound `fetch` reference throwing `Illegal invocation` in a worker; `Buffer` being unavailable
there (D10); and the cross-origin block (D9).

**Confirmation of the ArkWeb API surface** — read from the SDK's own declarations rather than from
documentation:

- `WebviewController.enablePrivateNetworkAccess(enable: boolean): void` — **`@since 20`**, confirming
  it is the API-20 gate the architecture depends on.
- The `Web` component provides `javaScriptProxy`, `onControllerAttached`, `mixedMode`,
  `domStorageAccess`, `databaseAccess`, `fileAccess` — everything D1 needs for a shell.

---

## 4. Explicitly rejected

| Option | Why |
|---|---|
| Wrapping the WASM `standalone` build | WASM + OPFS unverified in ArkWeb; disabled by Secure Shield; heavy on phones |
| Flutter-ohos / RNOH / ArkUI-X / KMP-CMP | All end at ArkWeb for the editor; each adds a fork, a lag, or two IDEs |
| `capacitor-harmony@0.1.2` | Single maintainer, self-described as incomplete |
| pocket-trilium's proot rootfs | ~360 MB, crash-prone, breaks on server upgrades |
| `sqlite-wasm` + OPFS as the v1 store | Two unverified ArkWeb behaviours; killed by Secure Shield |
| The official `Synchronisation.md` dev doc | **It is unreliable.** It documents `POST /api/sync/pull` and `/api/sync/push`, which do not exist, cites a path that 404s, and gets `/api/sync/check`'s method and shape wrong. The accurate siblings are `Content hashing.md` and `Entity change tombstones.md`. |
| ETAPI as the sync mechanism | Node-server-only; it does not exist in the WASM build. Also CRUD, not sync. |

---

## 5. Open risks

**Blocking, needs a human**

1. **Can the owner complete Huawei 实名认证 and register a debug device?** Without it there is no
   on-device testing and no AppGallery publishing. Unverified for non-Chinese developers.
   Confirmed: the **HarmonyOS** SDK download itself is account-gated (its API chain runs through
   `getToolVersionDownloadUrl` + `signAgreement` + `querySign`), and automatic signing is GUI-only.
2. **Does the DevEco emulator work on this M4 / macOS 26.7.1?** Community reports conflict. If not,
   hardware must be procured.

Note that a `.hap` **build** no longer depends on either of these — see §3.

**Answered — measured on a HarmonyOS emulator**

Items 3–5 were the open questions this ADR listed. All three are now resolved by running the probe on
a real HarmonyOS API 26 device; full detail in `docs/harmonyos-verified.md`.

3. **`pointerType === "pen"` — still unproven, and the only thing left.** An emulator has no stylus.
   What *is* proven is that ArkWeb ships the complete pen-capable Pointer Events surface:
   `getCoalescedEvents`, `getPredictedEvents`, `onpointerrawupdate` and `maxTouchPoints: 10` all
   present. Likely to work; not yet evidence.
4. **LAN cleartext `fetch` — works.** `http://192.168.3.213:18899/` returned **200 in 6 ms** from the
   emulator, over plain HTTP, with no cleartext configuration of any kind. The research's claim that
   cleartext is blocked by default **does not hold**. `enablePrivateNetworkAccess(false)` is doing its
   job: a private-network address was reachable.
5. **IndexedDB quota — 3.42 GB.** The vault's 18.3 MB of text fits with three orders of magnitude to
   spare (D4).

The research also needs two corrections, both measured: **ArkWeb is Chromium 144**, not M132, and the
**File System Access API is supported**, contrary to the advice to assume otherwise. `navigator.share`
and `Notification` are the two genuine gaps, the former relevant to share-into-Trilium capture.

**The real obstacle is not the platform.** The same probe found that the WebView *cannot* reach a
self-hosted Trilium server directly — not because of anything HarmonyOS does, but because the server
sends `Cross-Origin-Resource-Policy: same-origin` and no CORS headers, exactly as measured in D9 on the
desktop. A control request to a CORS-permitting host on the same LAN and the same port scheme returned
200, so network, cleartext and the private-network gate are all fine. **D9's remedy is therefore the
HarmonyOS remedy too: the ArkTS shell must proxy API calls natively (option 1), or the app must be
served same-origin (option 2).** `enablePrivateNetworkAccess(false)` is necessary but nowhere near
sufficient.

**Blocking, needs a human**

6. **A physical HarmonyOS device with a stylus**, and a Huawei account to sign for it, to settle item 3.

**Design risks**

6. **Protocol version pinning.** `syncVersion` is a bare equality check with no negotiation —
   the server hard-rejects a mismatch with a 400 and there is no fallback. The released 0.106.0 image
   reports **39**; `main` reports 40. The client must read it and fail with a clear message.
7. **Tombstones are never garbage-collected** and are folded into the content hash, so a fresh client
   replays all history. For this vault that is 24 936 rows (11.6% tombstones), which is comfortably
   feasible — but first sync must still be resumable and chunked from day one.
8. **Clock skew > 5 minutes fails sync login** with a 401 that says nothing about credentials.

---

## 6. Consequences

- The sync engine, hashing, and storage are **testable on this Mac today**, in Node and in a browser,
  with no mobile toolchain. That is why D1/D2 were chosen.
- All platform-specific work is confined to thin shells and one ArkTS handwriting field.
- The project must ship under AGPL-3.0.
- The three "measure on real hardware" items in §5 should be resolved before any HarmonyOS polish;
  if item 4 fails, ink annotation and freeform drawing need a native overlay per platform, which is a
  materially larger plan.

## 7. References

- `docs/research/01-sync-protocol.md` — the protocol, ported from source
- `docs/research/02-harmonyos-toolchain.md` — toolchain, ArkWeb capability matrix, distribution
- `docs/research/03-prior-art.md` — the three existing clients, dissected
- `docs/research/04-stylus-handwriting.md` — stylus support per platform
- `src/crypto/`, `src/entities/`, `src/store/`, `src/sync/` — the verified implementation
- `apps/web/` — the phone-first UI, running the same core in a worker
- `tools/roundtrip.ts` — offline write → push → read the server's own database
- `tools/e2e-web.ts` — the same, driven through the real UI in a real browser
- `tools/verify-hashes.ts`, `tools/probe.ts`, `tools/diagnose-hash.ts` — verification harnesses

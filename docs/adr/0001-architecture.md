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

### D5 — Storage behind an interface; IndexedDB first, native SQLite later.

The sync engine requires the `entity_changes` journal and row-level entity tables (D6). It does not
require SQLite specifically.

- **v1: IndexedDB.** Available in every WebView including ArkWeb, needs no WASM (and so survives
  Secure Shield mode), and is verifiable in a browser on this machine today.
- **Later, if measurement demands it: a native SQLite adapter** (ArkTS `relationalStore`, Android
  SQLite, iOS SQLite) behind the same interface.

`sqlite-wasm` + OPFS is deliberately *not* the v1 default: it depends on two unverified ArkWeb
behaviours and is disabled wholesale by Secure Shield mode.

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
- Ink persists as a note **attachment** (`ink-<id>.json`) with points normalised to [0,1]; never
  inline base64 into note HTML.

### D8 — License: AGPL-3.0-only.

Trilium itself, TriliumDroid, and pocket-trilium are all AGPL-3.0. Porting is permitted, so this
project is AGPL-3.0-only. Note AGPL §13: running a modified version as a network service triggers the
corresponding-source obligation. A clean-room implementation would be the only way to avoid this, and
it is not worth it here.

---

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

**Sync protocol** — against a real Trilium 0.106.0 server, the full handshake and pull were run and
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
2. **Does the DevEco emulator work on this M4 / macOS 26.7.1?** Community reports conflict. If not,
   hardware must be procured.
3. **DevEco Studio is not installed**, so no `.hap` can be produced at all today.

**Blocking, needs a device**

4. **Does ArkWeb deliver `pointerType === "pen"`?** No Huawei doc guarantees it. Every ink feature
   (b) and (c) depends on this. **Measure first — one day of work.**
5. **Does `enablePrivateNetworkAccess(false)` (API 20+) plus a cleartext-HTTP opt-in actually allow
   LAN `fetch` to a self-hosted server?** Reported symptom without it is `-10 ERR_ACCESS_DENIED`.
6. **What is ArkWeb's real IndexedDB quota?** Unverified, and it determines whether the vault fits.

**Design risks**

7. **Protocol version pinning.** `syncVersion` is a bare equality check with no negotiation —
   the server hard-rejects a mismatch with a 400 and there is no fallback. The released 0.106.0 image
   reports **39**; `main` reports 40. The client must read it and fail with a clear message.
8. **Tombstones are never garbage-collected** and are folded into the content hash, so a fresh client
   replays all history. For this vault that is 24 936 rows (11.6% tombstones), which is comfortably
   feasible — but first sync must still be resumable and chunked from day one.
9. **Clock skew > 5 minutes fails sync login** with a 401 that says nothing about credentials.

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
- `src/crypto/`, `src/entities/`, `src/sync/` — the verified implementation
- `tools/verify-hashes.ts`, `tools/probe.ts` — the verification harnesses

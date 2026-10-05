# Architecture

Reference description of the system. The decisions and their full rationale are in
[adr/0001-architecture.md](adr/0001-architecture.md); this document states the shape and the
constraints that follow from it.

## Components

```
                    ┌─────────────────────────────────────────┐
                    │  web core  (apps/web/src)               │
                    │  UI, state, routing, rendering          │
                    └───────────────┬─────────────────────────┘
                                    │ postMessage (one RPC surface)
                    ┌───────────────▼─────────────────────────┐
                    │  worker (apps/web/src/worker.ts)        │
                    │  owns the database — OPFS + sqlite-wasm │
                    └───────────────┬─────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
┌───────▼────────┐        ┌─────────▼─────────┐       ┌─────────▼────────┐
│ src/store      │        │ src/sync          │       │ src/entities     │
│ the replica    │        │ protocol + engine │       │ hashes, rows     │
└────────────────┘        └─────────┬─────────┘       └──────────────────┘
                                    │
                          ┌─────────▼─────────┐
                          │ src/crypto        │
                          │ pure, no platform │
                          └───────────────────┘
```

The database, the sync engine and the transport all live in a worker. The UI reaches them
over a small, explicit RPC surface (`apps/web/src/rpc.ts`), not a generic proxy, so the set
of things the UI can ask for is a list that can be read in full.

## The platform boundary

Everything above `src/store` is identical on every target. A platform shell supplies exactly
one thing:

```ts
interface NativeBridge {
  request(method: string, url: string, headersJson: string, bodyBase64: string): Promise<string>;
}
```

That is the whole contract. `apps/web/src/native-fetch.ts` adapts a shell's bridge to
`fetch`, and `SyncTransport` accepts a `fetchImpl`. This is why each shell is small — a
WebView, a bridge and a file chooser — and why porting does not touch the protocol, the
storage or the UI.

## The database runs in a Worker

`createSyncAccessHandle`, the synchronous OPFS handle the SQLite VFS needs, is exposed only
inside a Worker. `navigator.storage.getDirectory()` on the main thread has no OPFS APIs; the
same call inside a Worker works. The worker boundary is therefore a hard requirement, not a
preference:

- the database and the sync engine live in a Worker;
- the UI talks to them over `postMessage`;
- no synchronous SQLite call can block a frame.

## Origins

Trilium sends `Cross-Origin-Resource-Policy: same-origin` and no CORS headers, so a page on
another origin cannot read its API. A control request to a CORS-permitting host on the same
LAN and port scheme returned 200, so the block is CORS and nothing else.

Both shells serve the bundle from a real https origin:

| Shell | Origin | How |
|---|---|---|
| HarmonyOS | `https://localhost` | `onInterceptRequest` answers from the package |
| Android | `https://appassets.androidplatform.net` | `WebViewAssetLoader` |

`file://` and `resource://` both fail for the same reason: with no origin there is no Worker
and no OPFS.

Three ways to satisfy the same-origin requirement, in order of preference:

1. The native shell proxies `/api/*` calls and performs them natively.
2. The app is served from the server's own origin, behind the same reverse proxy.
3. Development only: the dev-server proxy in `apps/web/vite.config.ts`.

Pointing a browser-hosted app at an arbitrary remote Trilium URL does not work; the setup
screen says so explicitly instead of failing obscurely.

## Wire format

Two rules are Trilium's design and are followed exactly:

1. **Blob content is base64 on the wire.** The sender encodes and the receiver decodes; a
   client that does only one of the two corrupts every attachment.
2. **Hashes are carried, never recomputed.** An entity's hash is computed once by whoever
   created the change and travels in `entity_changes`. The content-hash check folds the
   stored hashes; it never re-derives them. Recomputing produces values the server never
   agreed to.

`isErased` is a raw SQLite integer in the content-hash fold, not a boolean: the sector string
is `hash + "1"`. `src/sync/content-hash.spec.ts` pins this.

## SQL adapters

`SqlDatabase` is a narrow interface with three implementations, because they run in
genuinely different places:

| Adapter | Runs in | Used by |
|---|---|---|
| `sqlite-wasm.ts` | a Worker, over OPFS | the application |
| `sqlite-node.ts` | Node, over `node:sqlite` | tests and tools |
| (the interface) | — | the sync engine, which is unaware of either |

The two adapters do not behave identically. `createFunction` derives a function's argument
count from `Function.length` when `arity` is not passed, and does so differently between them:
a `strip_tags` implementation with a rest parameter worked in Node and threw
`wrong number of arguments to function strip_tags()` in the browser. SQL functions passed to
the adapters must state their `arity` explicitly.

The store sits behind `SqlDatabase` so a native SQLite bridge (ArkTS `relationalStore`,
Android SQLite, iOS SQLite) can replace the adapter per platform without touching anything
above it. This is also the fallback for HarmonyOS Secure Shield mode, which disables
WebAssembly.

## Data model

Sync is **row-level change-log replication**. `entity_changes` rows carry the entity inline,
and the receiver applies raw rows (`REPLACE INTO <entityName>`). Every entity table, its
columns and its hash rules must match Trilium's.

Blobs are fetched eagerly only where they are small. On the owner's vault, all text, code and
document content is 18.3 MB while `file`/`image` attachments are 1396 MB. Passing
`maxBlobContentSize` on `GET /api/sync/changed` makes the server return oversized blobs with
empty `content` while leaving `entityChange.hash` untouched, so content-hash checks still
pass. Missing content is fetched on demand via `GET /api/notes/{noteId}/blob` and cached with
an LRU.

Entity hashes are ambiguous upstream for attachments: the hash depends on whether the
attachment reached memory through the creation path (key absent → `"undefined"`) or the
reload path (key `null` → `"null"`). A fresh database uses `"undefined"` for all
attachments; a long-lived vault mixes the two. Recompute a hash only when creating a change
for an entity this client created or modified, using the creation-path convention.
`toEntityRow()` exists so the entity object, not the raw SQLite row, is hashed: upstream
hashes `isProtected` as a boolean, and hashing the raw row emits `"0"` where Trilium emits
`"false"`.

## Editing

Only `text` and `code` notes are editable. A `book`, `canvas` or `render` note has structure
a plain editor would destroy, so those stay read-only. The editor is a `contenteditable` over
sanitised HTML.

Whether a note has children is decided by `childCount > 0`, not by `type === "book"`. Only 23
of 152 parents in the owner's vault are books.

## Attachment references

There are two forms and they are not interchangeable:

| Content | Form |
|---|---|
| picture | `<img src="api/attachments/<id>/image/<name>">` |
| anything else | `<a class="reference-link" href="#root/<owner>?viewMode=attachments&attachmentId=<id>">` |

Two endpoint facts drive this:

- `/image/` accepts only `role === 'image'`; a PDF sent there is refused with
  *"has role 'file', but a picture was expected"*. Files take `/download`.
- A stored relative URL can be absolutised by another client against an empty base and
  becomes `https://api/attachments/…` inside the note. The reference is therefore a
  **fragment**, which cannot be absolutised into anything else.

## Ink

`apps/web/src/ink.ts` holds the stroke model and the canvas. `InkCanvas` is the capture and
rendering path; `paintInk()` is the read-only path, so a phone renders ink a tablet drew
without attaching input handlers.

- Strokes carry a normalised width, and the document records the aspect ratio of the box it
  was drawn in, so a sketch redraws correctly on a differently shaped screen.
- Pressure modulates per-segment width where the device reports it.
- Coalesced pointer events are used where available.
- Palm rejection is a heuristic: once a stylus has been seen, `touch` input is ignored for a
  short window. No target exposes an app-level API for this (`setHandwritingFlag()` on
  HarmonyOS is a System API).
- A damaged stroke file yields a note with no ink, never a screen that fails to open.

Ink persists as a note attachment (`ink-main.json`, role `ink`) with points normalised to
`[0,1]`. The note carries a `<div class="trilium-ink" data-ink-id="main">` placeholder so the
reference travels with the note. Ink is never inlined as base64 HTML.

## Shells

### HarmonyOS (`apps/harmony-probe`, ArkTS)

| Concern | Mechanism |
|---|---|
| Serve the bundle | `onInterceptRequest` answers from the package, at `https://localhost` |
| HTTP | a `javaScriptProxy` object, `triliumNative.request(...)`, async |
| File picker | `onShowFileSelector` → `picker.DocumentViewPicker` |
| Back gesture | `onBackPress()` on the page, not the ability |

`onInterceptRequest` is synchronous — it returns a `WebResourceResponse`, not a promise — so
it cannot perform a network round trip. Static assets go through it; the API goes through the
bridge. The bridge is injected into the main frame while the engine is in the Worker, so the
Worker relays every request through the main thread.

### Android (`apps/android`, Java)

| Concern | Mechanism |
|---|---|
| Serve the bundle | `WebViewAssetLoader` at `https://appassets.androidplatform.net` |
| HTTP | `@JavascriptInterface`, plus a promise assembled in the page |
| File picker | `WebChromeClient.onShowFileChooser` |
| Back | the page is asked, as on HarmonyOS |

`@JavascriptInterface` methods cannot be asynchronous from JavaScript's side, so the call
hands over an id and the shell calls `__triliumAndroidResolve` when the answer arrives. Both
shells deliberately use one request contract rather than two code paths through the protocol.

`usesCleartextTraffic` is enabled because a self-hosted Trilium is commonly served over plain
HTTP on a home network.

## Implementation notes

- `escapeAttr` and `escapeHtml` are separate because an attribute and a text node need
  different escaping; using one for both fails on a quote in a title.
- A toast owns its own element, so re-rendering the view does not destroy what the user was
  doing.
- `state.busy` guards the save path; without it a second tap creates a second note with the
  same title and without the attachments.
- Attachments are written in two steps, because an attachment needs the note's id, which
  exists only once the note does.
- Nothing under `src/` may use a Node-only global. The core runs unchanged inside a WebView
  worker; `Buffer` is unavailable there. Use `src/crypto/bytes.ts`.

## References

- `docs/research/01-sync-protocol.md` — the protocol, ported from source
- `docs/research/02-harmonyos-toolchain.md` — toolchain, ArkWeb capability matrix, distribution
- `docs/research/03-prior-art.md` — the existing clients, dissected
- `docs/research/04-stylus-handwriting.md` — stylus support per platform
- `docs/research/05-yuque-interaction.md` — the reference interaction
- `docs/research/06-trilium-palette.md` — palette values
- `src/crypto/`, `src/entities/`, `src/store/`, `src/sync/` — the implementation
- `tools/roundtrip.ts`, `tools/e2e-web.ts`, `tools/verify-hashes.ts` — the verification harnesses

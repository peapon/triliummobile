# 2. Design

The decisions themselves are in [adr/0001-architecture.md](adr/0001-architecture.md). This
document is the map: what the pieces are, and why the boundaries fall where they do.

## 2.1 The shape

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

**The platform boundary is one method wide.** Everything above `src/store` is identical on
every target; a shell must supply exactly one thing:

```ts
interface NativeBridge {
  request(method: string, url: string, headersJson: string, bodyBase64: string): Promise<string>;
}
```

That is the whole contract. It is why the Android shell is a WebView, a bridge and a file
chooser, and why porting did not touch the protocol, the storage or the UI.

## 2.2 Why the database is in a worker

`createSyncAccessHandle` — the synchronous OPFS handle this client's SQLite VFS needs — is
only exposed inside a Worker. Finding that out cost a day; it is recorded because it is not
obvious from the API surface:

- `navigator.storage.getDirectory()` on the main thread: **no OPFS APIs**
- the same call inside a Worker: works

So the database is in a worker and the UI talks to it over `postMessage`. The RPC surface
is deliberately small and explicit rather than a generic proxy, so that the set of things
the UI can ask for is a list you can read.

## 2.3 Why the page must have an origin

Trilium sends `Cross-Origin-Resource-Policy: same-origin` and no CORS headers. A page on any
other origin cannot read its API — verified by a control request to a CORS-permitting host
on the same LAN and port scheme, which returned 200. So the block is CORS and nothing else.

Both shells therefore serve the bundle from a real https origin:

| Shell | Origin | How |
|---|---|---|
| HarmonyOS | `https://localhost` | `onInterceptRequest` answers from the package |
| Android | `https://appassets.androidplatform.net` | `WebViewAssetLoader` |

`file://` and `resource://` were both tried and both fail, for the same reason: no origin
means no Worker and no OPFS.

## 2.4 The wire format, and the two things that are easy to get wrong

1. **Blob content is base64.** The sender encodes and the receiver decodes; a client that
   does only one of those corrupts every attachment.
2. **Hashes are carried, never recomputed.** A client that computes its own will disagree
   with the server about records it did not touch.

Both are Trilium's design, not this client's, and both are followed exactly.

## 2.5 Editing: what this client will and will not touch

Only `text` and `code` notes are editable. A `book`, `canvas` or `render` note has structure
this editor would destroy, and destroying a user's note to offer a feature is not a trade
worth making.

Note a bug from this area, since it shows the rule doing its job: the library originally
tested `type === "book"` to decide whether a note had children. Only 23 of 152 parents in
the owner's vault are books. The test is now `childCount > 0`, which is what "has children"
actually means.

## 2.6 Attachment references

There are two forms and they are not interchangeable:

| Content | Form |
|---|---|
| picture | `<img src="api/attachments/<id>/image/<name>">` |
| anything else | `<a class="reference-link" href="#root/<owner>?viewMode=attachments&attachmentId=<id>">` |

Two endpoint facts drive this, both established the hard way:

- `/image/` accepts only `role === 'image'`. A PDF sent there is refused with
  *"has role 'file', but a picture was expected"*. Files take `/download`.
- A stored **relative URL** can be absolutised by another client against an empty base and
  becomes `https://api/attachments/…` *inside the note* — broken on every client, forever.

The second is why the reference is a **fragment**. A fragment cannot be absolutised into
anything else, so this form is structurally immune to the failure rather than merely
currently correct.

## 2.7 Where the reference interaction is recorded

The owner supplied reference images for the capture and options screens. What was taken from
them, and what was deliberately not, is in
[research/05-yuque-interaction.md](research/05-yuque-interaction.md).

# 3. Implementation

## 3.1 Layout

```
src/                        platform-neutral core
  crypto/                   SHA-1/256/512, HMAC-SHA-256, base64
  entities/                 row shapes and hashing
  store/                    the replica: schema, local store, sqlite adapters
  sync/                     transport and the sync engine
apps/web/                   the application
  src/main.ts               UI, state, routing, rendering
  src/data.ts               queries over the replica
  src/worker.ts             RPC surface; owns the database
  src/rpc.ts                the client side of that RPC
  src/native-fetch.ts       adapts each shell's bridge to `fetch`
  src/style.css             Trilium's palette and the layout system
  public/boxicons/          Trilium's own icon font, generated from the server's pack
apps/harmony-probe/         HarmonyOS shell (ArkTS)
apps/android/               Android shell (Java)
tools/                      verification, listed in 04-verification.md
docs/                       this
```

Roughly 11,000 lines of TypeScript, ArkTS, Java and CSS; 64 unit tests; 31 browser checks;
26 feature checks.

## 3.2 Why there are three SQL adapters

`SqlDatabase` is a narrow interface. It has three implementations because they run in
genuinely different places and the differences are not cosmetic:

| Adapter | Runs in | Used by |
|---|---|---|
| `sqlite-wasm.ts` | a Worker, over OPFS | the application |
| `sqlite-node.ts` | Node, over `node:sqlite` | tests and tools |
| (the interface) | — | the sync engine, which is unaware of either |

**They do not behave identically, and the difference has bitten.** `createFunction` derives
the argument count from the function's `length` when `arity` is not given, and it does so
differently between the two. A `strip_tags` implementation with a rest parameter therefore
worked in Node, where tests ran, and threw `wrong number of arguments to function
strip_tags()` in the browser, where the user was. Search was broken on the device while the
suite was green.

The fix is one line — pass `arity` explicitly — and the lesson is in
[06-known-issues.md](06-known-issues.md#lessons-that-changed-how-this-is-tested).

## 3.3 What each shell does

### HarmonyOS (`apps/harmony-probe`, ArkTS)

| Concern | Mechanism |
|---|---|
| Serve the bundle | `onInterceptRequest` answers from the package, at `https://localhost` |
| HTTP | a `javaScriptProxy` object, `triliumNative.request(...)`, async |
| File picker | `onShowFileSelector` → `picker.DocumentViewPicker` |
| Back gesture | `onBackPress()` **on the page**, not the ability |

Three things here were found by measurement rather than reading, and each cost a round trip:

1. **The page has to be served from `https://localhost`.** A rawfile origin is `null`, which
   has no Worker and no OPFS.
2. **`onInterceptRequest` is synchronous**, so it cannot do a network round trip; static
   assets go through it and the API does not.
3. **The edge swipe is answered by `onBackPress()` on the `@Entry` component.**
   `UIAbility.onBackPressed()` was implemented first and the device log showed it was never
   called — not once — while the page reported there was somewhere to go.

### Android (`apps/android`, Java)

| Concern | Mechanism |
|---|---|
| Serve the bundle | `WebViewAssetLoader` at `https://appassets.androidplatform.net` |
| HTTP | `@JavascriptInterface`, plus a promise assembled in the page |
| File picker | `WebChromeClient.onShowFileChooser` |
| Back | the page is asked, as on HarmonyOS |

`@JavascriptInterface` methods cannot be asynchronous from JavaScript's side, so the call
hands over an id and the shell calls `__triliumAndroidResolve` when the answer arrives. The
alternative — a second code path through the protocol — was rejected: one contract for both
shells is worth a few lines of shim.

The toolchain is worth recording: the machine has only JDK 25, and Gradle 8.11 refuses it
outright (`Unsupported class file major version 69`). Gradle 9.5.1 with AGP 9.1.1 builds
against it, so no JDK install was needed.

## 3.4 Things the code does that look odd and are not

- **`escapeAttr` versus `escapeHtml`.** Two functions because an attribute and a text node
  need different escaping, and using one for both is a bug that only shows with a quote in
  a title.
- **Toast owns its own element.** A toast that re-renders the view destroys whatever the
  user was in the middle of.
- **`state.busy` guards the save path.** Without it a second tap while the first is still
  awaiting creates a second note — with the same title, and without the attachments, because
  the first run has already emptied the queue.
- **Attachments are written twice, in two steps.** An attachment needs the note's id, which
  only exists once the note does.

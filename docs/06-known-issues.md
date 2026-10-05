# 6. Known issues

This list is part of the result, not a footnote. Where something is unverified it is stated
in the same voice as the things that work.

## 6.1 Open

| # | Issue | Impact | State |
|---|---|---|---|
| K1 | **iOS / iPadOS is not built** | No Apple build exists | Requirements known, see below |
| K2 | **The Android APK has not been run on the tablet** | It compiles and the package is verified; the device is not | Built, unverified |
| K3 | **Stylus input is unverified on hardware** | `pointerType === "pen"` is handled, but never seen | No device with a pen was available |
| K4 | **An AI message cannot be sent** | A chat can be created; it cannot be used | The server owns the model |
| K5 | **Handwriting recognition is deferred** | Ink only, no text | By decision, not omission |
| K6 | **A test server's database must not be edited directly** | Doing so desynchronises the client and looks like a client bug | Process, see §6.4 |
| K7 | **The device's WebView version on the HarmonyOS-4.x tablet is unknown** | If it is below Chromium 102, OPFS is unavailable and the app cannot run | To check on the device |
| K8 | **Two languages ship: Chinese and English.** Trilium ships forty | Speakers of the other thirty-eight get English | Deliberate, see below |

### K1: iOS/iPadOS

The requirements are recorded, and none of them is small:

- **Xcode.** Not installed; the machine has Command Line Tools only, and 44 GB free against
  roughly 40 GB needed.
- **Signing.** A free Apple ID produces a development build that **expires after 7 days**;
  a year-long profile needs a paid account.
- **The origin problem, which is the real work.** This client keeps its entire database in a
  Worker's OPFS, which requires a secure context. On iOS:
  - `WKWebView` has no equivalent of `WebViewAssetLoader`;
  - a custom scheme registered with `WKURLSchemeHandler` is **not** a secure context;
  - `file://` is not one either.

  The workable route is a small HTTP server inside the app on `http://localhost:<port>`,
  which is a secure context. That is more Swift than the Android shell by a wide margin.

### K8: languages

Trilium ships forty — `ar az bg ca cn cs de el en en-GB es fa fi fr ga hi hr hu id it ja ko md mr
nb-NO nl pl pt_br pt ro ru sl sr sv tr tw ug uk ur vi` — and this client ships two.

The gap is deliberate. Machine-translating a hundred and fifty-four strings into thirty-eight
languages would put text in the interface that nobody has reviewed, in languages the author cannot
read, in an application whose whole premise is that it renders a user's own notes faithfully. Trilium
does not do it that way either: it uses Weblate, with people translating.

What has been done instead is to make a language **addable gradually**, which is the property that
matters:

- `t()` falls back to **English**, not to Chinese. A contributor who translates eighty of the
  hundred and fifty-four keys gets a UI that is eighty per cent theirs and readable in the rest. The
  fallback used to be Chinese, which made a partial translation worse than useless for anybody who
  does not read Chinese — and is why only two languages existed.

Adding one is a matter of adding an entry to `CATALOGUES` in `apps/web/src/i18n.ts` and to
`LANGUAGES`, with whatever subset of keys is ready. `tools/i18n-audit.ts` checks the two maintained
catalogues for agreement; a contributed one that is incomplete is expected and fine.

### K7: the WebView version

The HarmonyOS 4.x tablet is Android-compatible, so an APK can be installed. But the device's
WebView is a component updated separately from the browser, and the application needs
**Chromium 102** for `createSyncAccessHandle`. Huawei Browser 17.0.x reports Chromium 114 or
132 depending on the device — suggestive, and not the same component.

Check on the device: `Settings → Apps → App management → show system processes → WebView`.

## 6.2 Fixed, and worth remembering

Each of these was found on a device, after a browser suite had passed.

| Issue | Root cause |
|---|---|
| Delete and rename did nothing | `window.prompt` / `window.confirm` have no handler in ArkWeb — both silently returned `null`/`false` |
| The edge swipe exited the app | The gesture is answered by `onBackPress()` on the page, not `UIAbility.onBackPressed()` |
| A note with attachments arrived twice | An unguarded save ran once per tap; the second had an empty queue, hence one copy with files and one without |
| A PDF could not be opened anywhere | The reference stored a relative URL that another client absolutised into `https://api/…` **inside the note** |
| Buttons wrapped their own labels | A squeezed button wrapped its own text: 图片 (*picture*) drew as 图 over 片 |
| Search was broken on device only | `sqlite-wasm` derives a SQL function's arity from `Function.length`; a rest parameter gave 0 |
| Attachments uploaded from Android | Not an issue — the data was correct on both sides; the faults were the two above |
| The library would not descend | The test was `type === "book"`; only 23 of 152 parents in the owner's vault are books |

## 6.3 Verification gaps, stated

Things that are true as far as they were checked, and how far that is:

| Claim | Checked how | Not checked |
|---|---|---|
| Sync is correct | 404/404 sectors against a live 2.6 GB vault; byte-identical round trips | long-running conflict scenarios |
| The reference fix works | note content read from a real server; browser click path | **on the packaged device** |
| The duplicate-note fix works | reproduced, then guarded; 64 unit tests + 31 E2E | **on the packaged device** |
| The label-wrap fix works | layout audit, `Range.getClientRects()` | rendering engines other than Chromium/ArkWeb |
| The Android shell works | it builds; the APK's contents are verified | **it has never been run** |
| The back gesture works | device log + owner confirmation | — |

## 6.4 Lessons that changed how this is tested

**A SQL function's arity is not the same in both adapters.** Verified under Node, broken in
the browser. The suite was green and search did not work on the device. Anything the two
adapters implement differently is now a suspect by default.

**Bugs cluster in the gap between the harness and the device.** Three of the fixed issues
above were invisible to a passing browser suite. The device is asked directly — it stamps
its build id into the console, and both shells log what the page reported.

**Read the DOM, do not reason about it.** The attachment reference was chased for several
rounds by reasoning about URL forms. Reading the rendered `href` out of the running page
found it in one step: `data:application/pdf;base64,…#download`.

**Count the data before reading the code.** The "note appeared twice" and "attachments are
missing" reports were one bug. The evidence was in the server's own rows — three attachment
rows sharing one blob — and would have been visible immediately.

**Assume a green check can be satisfied by the wrong thing.** `nowrap` on every button
satisfied the wrapped-label check and broke the overflow check. Complementary checks are
only complementary if both run.

**Never edit a test server's database directly.** Rows and the change journal then disagree,
the client correctly refuses to push, and the symptom looks like a client bug. Drive the
application's own paths.

**Never claim a device behaviour from a browser result.** It has been wrong three times.

## 6.5 A note on what this repository is

It is a client for a server the owner runs, built against Trilium's own protocol, storage
model and visual language. Where this client and Trilium disagree, Trilium is right. Several
of the fixes above are exactly that judgement being applied — the reference form changed to
Trilium's, the input method changed to the one the platform actually delivers, the copy of
an attachment stopped being written into the note because Trilium does not write one.

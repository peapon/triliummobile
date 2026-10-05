# Known issues

What is broken, unfinished or unverified. The unverified items are listed beside the working
ones deliberately: they are part of the status, not a footnote.

## Open

| # | Issue | Impact | State |
|---|---|---|---|
| K1 | **iOS / iPadOS is not built** | No Apple build exists | Requirements known, see below |
| K2 | ~~The Android APK has not been run on a device~~ | — | **Resolved** — runs on a HarmonyOS 4.2 tablet |
| K3 | **Stylus input is unverified on hardware** | `pointerType === "pen"` is handled, but never observed | No device with a pen has been available |
| K4 | **An AI message cannot be sent** | A chat can be created; it cannot be used | The server owns the model |
| K5 | **Handwriting recognition is deferred** | Ink only, no text | By decision, not omission |
| K6 | **The WebView version on the HarmonyOS-4.x tablet is unknown** | Below Chromium 102, OPFS is unavailable and the app cannot run | To check on the device |
| K7 | **Two languages ship: Chinese and English.** Trilium ships forty | Speakers of the other thirty-eight get English | Deliberate |
| K8 | **Nine languages ship of Trilium's forty** | The other thirty-one get English | See below |

### K1: iOS/iPadOS

- **Xcode.** Not installed; the machine has Command Line Tools only, and 44 GB free against
  roughly 40 GB needed.
- **Signing.** A free Apple ID produces a development build that expires after 7 days; a
  year-long profile needs a paid account.
- **The origin problem.** This client keeps its database in a Worker's OPFS, which requires a
  secure context. On iOS, `WKWebView` has no equivalent of `WebViewAssetLoader`; a custom
  scheme registered with `WKURLSchemeHandler` is not a secure context; `file://` is not one
  either. The workable route is a small HTTP server inside the app on
  `http://localhost:<port>`, which is a secure context.

### K6: the WebView version

**Answered in practice.** An APK was installed and used on a HarmonyOS 4.2 tablet, which means
that device's WebView is recent enough for OPFS — the local database depends on it, and nothing
would have run without it. The paragraph below is kept because the reasoning still applies to any
other device.

The HarmonyOS 4.x tablet is Android-compatible, so an APK can be installed. The device's
WebView is updated separately from the browser, and the application needs **Chromium 102** for
`createSyncAccessHandle`. Huawei Browser 17.0.x reports Chromium 114 or 132 depending on the
device, which is a different component. Check on the device:
`Settings → Apps → App management → show system processes → WebView`.

### K7: languages

Trilium ships forty — `ar az bg ca cn cs de el en en-GB es fa fi fr ga hi hr hu id it ja ko md
mr nb-NO nl pl pt_br pt ro ru sl sr sv tr tw ug uk ur vi` — and this client ships two. The gap
is deliberate: unreviewed machine translation in an application whose premise is rendering a
user's own notes faithfully is not acceptable. Trilium uses Weblate with human translators.

Languages are addable gradually. `t()` falls back to English, so a partial translation is
readable in the rest. Adding one means adding an entry to `CATALOGUES` and `LANGUAGES` in
`apps/web/src/i18n.ts` with whatever subset of the 154 keys is ready;
`tools/i18n-audit.ts` checks that the two maintained catalogues agree and treats an incomplete
contributed one as expected.

## Verification status

| Claim | Checked how | Not checked |
|---|---|---|
| Sync is correct | 404/404 content-hash sectors against a live 2.6 GB vault; byte-identical round trips | long-running conflict scenarios |
| The attachment-reference fix works | note content read from a real server; browser click path | on the packaged device |
| The duplicate-note fix works | reproduced, then guarded; 64 unit tests + 31 E2E | on the packaged device |
| The label-wrap fix works | layout audit, `Range.getClientRects()` | rendering engines other than Chromium/ArkWeb |
| The Android shell works | **installed and used on a HarmonyOS 4.2 tablet** | which features were exercised, beyond installing and running |
| The back gesture works | device log and owner confirmation | — |
| `pointerType === "pen"` | not measured; ArkWeb's pointer-event surface is complete | **hardware with a stylus** |

## Fixed

- Delete and rename did nothing on device.
- The edge swipe exited the app.
- A note with attachments arrived twice.
- A PDF could not be opened anywhere; a file attachment was sent to the picture endpoint.
- Buttons wrapped their own labels.
- Search was broken on device only; a SQL function's arity differed between adapters.
- The library would not descend; a note was treated as childless unless it was a `book`.
- A rewritten attachment reference kept the tail of its URL.
- Inserting a picture could consume the draft being edited.
- A server address was rejected unless typed exactly as a URL.
- Sync login failed when the server clock was more than five minutes out of step.
- Pending-work counts were over-reported, and the vault was identified by the wrong value.

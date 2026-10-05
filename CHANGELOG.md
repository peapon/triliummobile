# Changelog

Notable changes to this project, newest first. This project has **no tagged releases**; the
whole history is the initial line of work, so it is grouped by the day each batch landed
rather than by version. Entries describe user-visible outcomes, not commits.

## [Unreleased]

## [2026-10-06]

### Added

- Chinese and English interfaces, switchable in settings, following the vault's `locale` by default.
- The `速记` inbox note is named by the interface language and can be renamed.

### Changed

- `t()` falls back to **English** rather than Chinese, so a partial translation is readable.
- Documentation rewritten in English, redacted, and reorganised; the relationship to upstream is stated.

## [2026-10-05]

### Added

- A HarmonyOS package that runs the real web client and syncs both ways on a device, built without a Huawei account.
- An Android WebView shell and an installable debug APK.
- Automatic sync, off or on an interval from 1 minute to 4 hours.
- Rename and delete for notes, with prompts drawn in the app.
- Any file can be attached from the editor, several at once; AI is moved into settings.
- Picture and file capture; both are proven to cross the wire.
- Attachments display in the note, with an LRU-cached on-demand fetch.
- Search over note text by word, ranked by where the match occurred.
- Trilium's own palette, icons and per-note colours, with a floating action layout.
- The `速记` list is the inbox: newest first, at most 50 items.
- A durable feature audit, run before porting to a platform.
- Read-only verification against the owner's live production vault (404/404 content-hash sectors).

### Changed

- The UI is rebuilt around the reference interaction model.
- The library shows the tree in the server's own `notePosition` order.
- Trilium's hidden system notes are hidden, as upstream does.
- A build from an uncommitted tree stamps itself as such.
- The back gesture is handled by the page rather than the ability.

### Fixed

- Sync login measures server clock skew instead of failing with a 401.
- A server address is accepted as a person would type it.
- The vault is identified by its secret, and pending-work counts are no longer over-reported.
- SQL functions state their arity, so `sqlite-wasm` does not call them with none.
- Attachment references are written in a form that cannot be broken by another client.
- Pictures use `/image/` and other files use `/download`; a file attachment is no longer treated as a picture.
- Attaching a file no longer writes a link into the note.
- Inserting a picture no longer loses the draft being edited.
- One tap creates one note, with its attachments.
- Buttons no longer wrap their own labels, and `nowrap` is limited to labels.
- Rename and delete prompts work in ArkWeb, where `window.prompt` and `window.confirm` have no handler.
- A note descends when it has children, not when it is a `book`.

## [2026-10-04]

### Added

- Architecture decision record, README, and source-cited stylus research.
- A no-account `.hap` toolchain and an ArkWeb capability probe.
- Light keyboard editing and ink annotation for the pad UI.
- A phone-first UI running the sync engine in a browser.
- An offline-first sync engine with a verified round-trip.
- Sync protocol transport with a content-hash check, verified end to end.
- Pure-JS SHA-1, SHA-256, SHA-512, HMAC-SHA-256 and base64, plus Trilium's entity hashes.

### Fixed

- Entity rows are hashed as entities, not as raw SQLite rows.

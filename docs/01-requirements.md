# 1. Requirements

## 1.1 The request

> TriliumNext/Trilium has a good standalone and desktop client, and is even good to host on
> a NAS, but it lacks a usable mobile client.

The work is therefore a mobile client for a Trilium server the owner already runs, not a
new note application. Stated constraint, in the owner's words:

> Take Trilium as the source of product truth; do not invent features. The interaction may
> follow the reference.

"Trilium as the source of product truth" is load-bearing and is applied literally
throughout: where this client and Trilium disagree about behaviour, Trilium is right and
this client is the bug. Several fixes in the history are exactly that — see
[06-known-issues.md](06-known-issues.md).

## 1.2 Scope, as clarified

| Area | Phone | Tablet |
|---|---|---|
| Capture (速记, *quick note*) | yes — the primary act | yes |
| Search (速查, *quick lookup*) | yes | yes |
| Browse (查看, *reading*) | yes | yes |
| Editing | **entered deliberately, by long press** | light keyboard editing, toolbar always present |
| Stylus | — | ink annotation and free drawing (v1) |

The phone-first framing came from the owner and shaped the design more than any other
single input: the phone is for capture and lookup, and heavy editing is not what a phone is
for. Editing on the phone was added later, on request, and is deliberately a deliberate
gesture rather than a default mode.

## 1.3 Deliverables

1. Runnable application code.
2. Explicit architecture decisions, written down.
3. Every requirement verified against **a real server and a real database**.

The third one is the one that governs the rest of this repository. It is why there is a
disposable Docker server, why the E2E suite talks to it, and why the owner's own 2.6 GB
vault was read (never written) to check the hash implementation.

## 1.4 What "done" means, per requirement

Each row is a thing that was asked for. "Evidence" is the command or artefact that shows it,
all of which are in [04-verification.md](04-verification.md).

| # | Requirement | Done when | Evidence |
|---|---|---|---|
| R1 | Offline-first: capture works with no network | A note written offline reaches the server later, and a second client sees it | `tools/roundtrip.ts` |
| R2 | Bidirectional sync against the owner's server | Byte-identical to the server's own rows, and the content-hash check passes sector by sector | `tools/verify-hashes.ts`, live vault 404/404 |
| R3 | Phone: capture / search / browse | All three reachable in one tap | `tools/feature-audit.ts` |
| R4 | Tablet: light editing | Edit reaches the server | `tools/e2e-web.ts` |
| R5 | Stylus: ink annotation and free drawing | Ink is stored as an attachment and survives a round trip | `tools/roundtrip-image.ts` |
| R6 | Attachments: on demand, with an LRU cache | Large blobs are stubbed, fetched when opened, evicted by a cap the user sets | `tools/seed-large-note.ts` + E2E |
| R7 | Visual language follows Trilium | Palette, icons and colours are Trilium's own, not approximations | `docs/research/06-trilium-palette.md`, `tools/check-contrast.mjs` |
| R8 | Interaction may follow the Yuque reference | Reviewed against the reference images | `docs/research/05-yuque-interaction.md` |
| R9 | Search is precise | Words, not substrings; titles weigh more; HTML tags are not content | `tools/feature-audit.ts` |
| R10 | Trilium's hidden system notes are hidden | `_hidden`, `_llmChat`, … do not appear | `tools/feature-audit.ts` |
| R11 | The library shows the server's own order | UI order equals `branches.notePosition` | `tools/feature-audit.ts` |
| R12 | The 速记 list is the inbox, newest first, at most 50 | Same list as a recursive query over the server's own rows | `tools/feature-audit.ts` |
| R13 | Rename and delete notes | Both reach the server's database | E2E + server DB |
| R14 | The editor takes files, not only pictures | Any MIME type, several at once | `tools/feature-audit.ts` |
| R15 | AI chats can be created | A valid `llmChat` note, written locally, syncs like anything else | ADR 0001 |
| R16 | Automatic sync on a user-chosen interval | 1 minute to 4 hours, chosen from fixed steps | `tools/feature-audit.ts` |
| R17 | An Android build for the HarmonyOS-4.x tablet | An installable APK | `apps/android/build-apk.sh` |

## 1.5 Explicit non-goals

- **Reimplementing Trilium.** The server is the source of truth; this client renders and
  edits what the server holds.
- **A new sync protocol.** Trilium's row-level change-log replication is used as-is.
- **Handwriting recognition in v1.** Deferred by decision, not by omission; the research is
  in [research/04-stylus-handwriting.md](research/04-stylus-handwriting.md).
- **Sending an AI message.** The server owns the model; see
  [06-known-issues.md](06-known-issues.md).

## 1.6 Requirements that arrived during development

Recorded because they changed the design, and because several of them were corrections of
this client rather than additions to it:

- A PDF message leaked an endpoint distinction: pictures and files take different routes.
- Delete and rename did nothing on device — `window.prompt` and `window.confirm` have no
  handler in ArkWeb.
- The edge-swipe back gesture exited the app — it is answered by the page, not the ability.
- A note with attachments arrived twice — an unguarded save ran once per tap.
- Buttons wrapped their own labels.
- Attachments could not be seen in the note at all.

# 7. Relationship to upstream Trilium

## 7.1 What this is

A **client** for a Trilium server, not a fork of Trilium.

That distinction decides everything below. This repository contains no Trilium server code and no
copy of the Trilium application. It speaks Trilium's sync protocol, stores rows in Trilium's schema,
and draws with Trilium's palette and icons — which is what any client must do — and it does so from
the outside.

The owner's constraint was explicit and is applied literally:

> Take Trilium as the source of product truth; do not invent features.

So where this client and Trilium disagree about behaviour, Trilium is right and this client is the
bug. Several entries in [06-known-issues.md](06-known-issues.md) are exactly that judgement being
applied — the attachment reference was changed to Trilium's own form, the picture endpoint was
corrected to the file endpoint, and writing a link into a note was removed because Trilium does not
write one.

## 7.2 The two connections that already exist

### The protocol

`src/sync/` implements Trilium's row-level change-log replication as the server defines it:
`POST /api/login/sync`, `GET /api/sync/changed`, `PUT /api/sync/update`, `POST /api/sync/finished`,
`GET /api/sync/check`. `src/entities/hashes.ts` implements Trilium's hashing rules, including the
two that are easy to get wrong: hashes are **carried, never recomputed**, and blob content is
base64 on the wire.

This was not written from documentation. It was written by reading upstream's source
(`packages/trilium-core/src/services/sync.ts` and the entity services) and then **checked against
real data** — 404/404 content-hash sectors against a live 2.6 GB vault, read-only.

The factual record of that protocol work is in
[research/01-sync-protocol.md](research/01-sync-protocol.md).

### The licence

Upstream is **AGPL-3.0-only**. This repository is AGPL-3.0-only, and the full text is in
[../LICENSE](../LICENSE).

AGPL-3.0 is not a formality here, and it is worth being precise about why this project is
compatible rather than merely adjacent:

- The protocol logic is a **port** of upstream code — read, understood, reimplemented. That is a
  derivative work, and it inherits the licence.
- Running a modified version as a network service triggers **§13**: users interacting with it over
  a network must be offered the source. A self-hosted client pointed at a self-hosted server is
  already in that position, so the obligation is satisfied by the source being public, which it is.
- **§5(e)** withholds any grant of rights in trade names or trademarks. The licence does not
  license the name "Trilium", and a redistributor should not ship a build under it in a way that
  implies endorsement.

## 7.3 What is reused, and under what terms

| Reused | Origin | Terms |
|---|---|---|
| Protocol and hashing logic | `packages/trilium-core/src/services/` | AGPL-3.0-only, ported, attributed |
| Application icon | `apps/website/src/assets/icon-color.svg`, `apps/desktop/electron-forge/app-icon/` | AGPL-3.0-only; trademark noted separately |
| Icon font and glyph map | `packages/trilium-core/src/services/icon_pack_boxicons-v2.json` + `apps/client/src/fonts/boxicons.woff2` | Boxicons Free License; the generated CSS is derived from Trilium's glyph map |
| Visual language | `apps/client/src/stylesheets/theme-next-{light,dark}.css` | Read for values; not copied |

Full attribution, including the trademark caveat, is in
[../assets/branding/ATTRIBUTION.md](../assets/branding/ATTRIBUTION.md).

`reference/` holds shallow clones of upstream repositories for reading source. It is **gitignored
and not published**, so no upstream code is redistributed from this repository.

## 7.4 Routes to a closer relationship

Four options, ordered by the effort each actually costs — not by how appealing they sound.

### A. Stay a third-party client, and get listed

**Effort: low. Realistic: yes.**

This is the current state and it is a legitimate one. Comparable projects exist — TriliumDroid,
pocket-trilium, the web clipper.

The listing to aim for is [`awesome-trilium`](https://github.com/Nriver/awesome-trilium), which
upstream's own README points at for third-party resources. That is a pull request to a community
repository, not to Trilium.

Prerequisites, which are the real work and are listed in §7.5.

### B. Have the Trilium README link to it

**Effort: low. Realistic: only once it is maintained.**

Upstream's README has a third-party resources section. A PR could add a line there. Expect the
question "will this be maintained?", which is fair and should be answered with a release history
rather than a promise.

### C. Contribute back

**Effort: medium. Realistic: partly.**

Genuinely shareable, in rough order of how welcome they are likely to be:

1. **Protocol findings as documentation.** The two easy-to-get-wrong rules — hashes are carried,
   blob content is base64 — are understated in the public docs and cost real time to rediscover.
   A documentation PR is small and useful.
2. **Bug reports from a second implementation.** A client is an independent check on a protocol.
   Anything this client found that upstream would call a bug is worth an issue.
3. **UI work in `apps/mobile/`.** Upstream already has a Capacitor mobile application with real
   Android and iOS projects. This client's UI is vanilla TypeScript; theirs is a different stack
   entirely, so there is no code to hand over — only findings.

### D. Merge into `apps/mobile/` as a HarmonyOS target

**Effort: high. Realistic: no, in this form.**

Upstream's mobile app targets Android and iOS through Capacitor, which has no HarmonyOS target.
HarmonyOS needs an ArkTS shell, which is what `apps/harmony-probe/` is — a fundamentally different
build system, language and packaging format.

What could be contributed is the *knowledge*: that `resource://rawfile` has no origin and therefore
no Worker or OPFS, that `onInterceptRequest` is synchronous, that the edge-swipe back gesture is
answered by the page rather than the ability. All three are written down in
[03-implementation.md](03-implementation.md) and [research/02-harmonyos-toolchain.md](research/02-harmonyos-toolchain.md).

## 7.5 What would need to exist first

Stated plainly, because these are the things a reviewer would ask and answering them late is worse
than answering them now:

| | State |
|---|---|
| A LICENSE file | **Added** — this document's commit adds AGPL-3.0 |
| Attribution for reused assets | **Present** — [../assets/branding/ATTRIBUTION.md](../assets/branding/ATTRIBUTION.md) |
| A build that a stranger can run | **Present** — README documents it for web, HarmonyOS and Android |
| A version number and tagged releases | **Missing** — there are no tags and no releases |
| An issue tracker somebody reads | **Missing** |
| Evidence it runs on real hardware | **Partial** — HarmonyOS verified on a device; the Android APK has never been run; iOS does not exist |
| A stated support policy | **Missing** — which Trilium server versions are supported is currently unstated, and the sync version is checked against `39` |

That last row is the one that matters most for anyone else's use: a client that speaks a versioned
protocol has to say which versions it speaks.

## 7.6 The honest summary

The connection that exists today is **the protocol and the licence**, and both are real. The
connection that does not exist is any formal one — no listing, no upstream link, no contribution,
and no one but the owner has ever run this.

For a personal client against a personal server that is a complete and defensible position. For
anything more, §7.5 is the list.

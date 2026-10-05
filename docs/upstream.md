# Relationship to upstream Trilium

## What this is

A **client** for a Trilium server, not a fork of Trilium. This repository contains no Trilium
server code and no copy of the Trilium application. It speaks Trilium's sync protocol, stores
rows in Trilium's schema, and draws with Trilium's palette and icons, from the outside.

The governing constraint: take Trilium as the source of product truth; do not invent features.
Where this client and Trilium disagree about behaviour, Trilium is right and this client is the
bug.

## The protocol connection

`src/sync/` implements Trilium's row-level change-log replication as the server defines it:

| Endpoint | Use |
|---|---|
| `POST /api/login/sync` | authenticate, read `serverInstanceId` and `maxEntityChangeId` |
| `GET /api/sync/changed` | pull changes, paged by `lastEntityChangeId` |
| `PUT /api/sync/update` | push changes |
| `POST /api/sync/finished` | close a sync session |
| `GET /api/sync/check` | content-hash sector check |

`src/entities/hashes.ts` implements Trilium's hashing rules, including the two that are easy
to get wrong: hashes are **carried, never recomputed**, and blob content is base64 on the
wire.

The implementation was written by reading upstream's source
(`packages/trilium-core/src/services/sync.ts` and the entity services), then checked against
real data: 404/404 content-hash sectors against a live 2.6 GB vault, read-only. The protocol
record is in [research/01-sync-protocol.md](research/01-sync-protocol.md).

The server hard-checks `syncVersion` by equality and rejects a mismatch with a 400. Trilium
0.106.0 reports **39**; `main` reports **40**. This client reads the version and is built
against 39.

## The licence connection

Upstream is **AGPL-3.0-only**. This repository is AGPL-3.0-only, and the full text is in
[LICENSE](../LICENSE).

- The protocol logic is a **port** of upstream code — read, understood, reimplemented. That is
  a derivative work and it inherits the licence.
- Running a modified version as a network service triggers **AGPL §13**: users interacting
  with it over a network must be offered the source. This repository is public, so the
  obligation is satisfied.
- **AGPL §5(e)** withholds any grant of rights in trade names or trademarks. The licence does
  not license the name "Trilium", and a redistributor should not ship a build under it in a way
  that implies endorsement.

## What is reused, and under what terms

| Reused | Origin | Terms |
|---|---|---|
| Protocol and hashing logic | `packages/trilium-core/src/services/` | AGPL-3.0-only, ported, attributed |
| Application icon | `apps/website/src/assets/icon-color.svg`, `apps/desktop/electron-forge/app-icon/` | AGPL-3.0-only; trademark noted separately |
| Icon font and glyph map | `packages/trilium-core/src/services/icon_pack_boxicons-v2.json` + `apps/client/src/fonts/boxicons.woff2` | Boxicons Free License; the generated CSS is derived from Trilium's glyph map |
| Visual language | `apps/client/src/stylesheets/theme-next-{light,dark}.css` | Read for values; not copied |

Full attribution, including the trademark caveat, is in
[assets/branding/ATTRIBUTION.md](../assets/branding/ATTRIBUTION.md).

`reference/` holds shallow clones of upstream repositories for reading source. It is
gitignored and not published, so no upstream code is redistributed from this repository.

## Contribution routes

Four options, ordered by the effort each costs.

### A. Stay a third-party client, and get listed

**Effort: low. Realistic: yes.**

This is the current state, and comparable projects exist: TriliumDroid, pocket-trilium, the
web clipper. The listing to aim for is
[`awesome-trilium`](https://github.com/Nriver/awesome-trilium), which upstream's own README
points at for third-party resources. That is a pull request to a community repository, not to
Trilium. The prerequisites are in "What would need to exist first".

### B. Have the Trilium README link to it

**Effort: low. Realistic: only once it is maintained.**

Upstream's README has a third-party resources section. A PR could add a line there. The
question to expect is whether the project will be maintained.

### C. Contribute back

**Effort: medium. Realistic: partly.**

Shareable work, in rough order of how welcome it is likely to be:

1. **Protocol findings as documentation.** Hashes are carried and blob content is base64; both
   are understated in the public docs. A small documentation PR.
2. **Bug reports from a second implementation.** A client is an independent check on a
   protocol.
3. **UI work in `apps/mobile/`.** Upstream has a Capacitor mobile application with real
   Android and iOS projects. Its UI stack is different, so there is no code to hand over, only
   findings.

### D. Merge into `apps/mobile/` as a HarmonyOS target

**Effort: high. Realistic: no, in this form.**

Upstream's mobile app targets Android and iOS through Capacitor, which has no HarmonyOS
target. HarmonyOS needs an ArkTS shell — a different build system, language and packaging
format.

What could be contributed is the knowledge: that `resource://rawfile` has no origin and
therefore no Worker or OPFS, that `onInterceptRequest` is synchronous, that the edge-swipe back
gesture is answered by the page rather than the ability. All three are in
[architecture.md](architecture.md) and
[research/02-harmonyos-toolchain.md](research/02-harmonyos-toolchain.md).

## What would need to exist first

| | State |
|---|---|
| A LICENSE file | **Present** — AGPL-3.0 |
| Attribution for reused assets | **Present** — [assets/branding/ATTRIBUTION.md](../assets/branding/ATTRIBUTION.md) |
| A build that a stranger can run | **Present** — README documents web, HarmonyOS and Android |
| A version number and tagged releases | **Missing** — there are no tags and no releases |
| An issue tracker somebody reads | **Missing** |
| Evidence it runs on real hardware | **Partial** — HarmonyOS verified on a device; the Android APK has never been run; iOS does not exist |
| A stated support policy | **Missing** — supported Trilium server versions are unstated; the client is built against `syncVersion` 39 |

## Summary

The connections that exist today are the **protocol** and the **licence**, and both are real.
There is no formal connection: no listing, no upstream link, no accepted contribution. No one
other than the owner has run this.

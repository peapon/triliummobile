# Documentation

Organised by the phase of work each document belongs to. The research notes and the
architecture decision record predate this index and are kept where they are, because
code and commits refer to them by path.

| Phase | Document | What it settles |
|---|---|---|
| — | [README](../README.md) | What this is, how to run it, how to verify it |
| 1. Requirements | [01-requirements.md](01-requirements.md) | What was asked for, what was clarified, and what "done" means for each |
| 2. Design | [02-design.md](02-design.md) · [adr/](adr/) | The shape of the system and the decisions behind it |
| 2. Design (research) | [research/](research/) | The ground the design stands on: the sync protocol, the toolchain, prior art, the reference interaction |
| 3. Implementation | [03-implementation.md](03-implementation.md) | How the code is laid out, and what each platform shell does |
| 4. Verification | [04-verification.md](04-verification.md) | How each claim is checked, and what the checks cannot see |
| 5. Release | [05-release.md](05-release.md) | Building, signing and installing for each target |
| 6. Maintenance | [06-known-issues.md](06-known-issues.md) | What is broken, unfinished or unverified, stated plainly |
| 7. Upstream | [07-upstream.md](07-upstream.md) | What this is to Trilium: protocol, licence, and the routes to a closer relationship |

## Reading order for a newcomer

1. [../README.md](../README.md) — five minutes, and it says what works.
2. [01-requirements.md](01-requirements.md) — what this is meant to do.
3. [02-design.md](02-design.md), then [adr/0001-architecture.md](adr/0001-architecture.md) — why it is shaped this way.
4. [06-known-issues.md](06-known-issues.md) — **before** trusting anything, read what is known not to work.
5. [07-upstream.md](07-upstream.md) — if you are wondering why this is not a fork.

## A note on these documents

They are written to be checkable. Where a claim is made, either there is a command that
demonstrates it or the document says how it was measured. Where something is not verified,
it says so in the same voice as the things that are — the [06-known-issues.md](06-known-issues.md)
list is not a footnote, it is part of the result.

That convention exists because this project got it wrong in a way worth recording: a SQL
function was verified under Node and was broken in the browser, because `sqlite-wasm`
derives a function's arity differently from `node:sqlite`. The E2E suite passed and search
did not work on the device. See [06-known-issues.md](06-known-issues.md#lessons-that-changed-how-this-is-tested).

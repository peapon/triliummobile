# 4. Verification

## 4.1 The rule

**A claim is worth what its evidence is worth.** Every check below either talks to a real
server, reads a real database, or measures the rendered page. Nothing is asserted from the
code alone, and where a check cannot see something, that is written down rather than left
to be assumed.

Two distinctions matter throughout:

- **A 2xx is not evidence.** The server accepting a request says nothing about whether the
  data is right. Every sync claim below is checked against the server's *own database*.
- **A green browser suite is not evidence about a device.** The E2E suite runs against a
  dev server in Chromium. It does not exercise the packaged application, and three separate
  bugs lived in exactly that gap.

## 4.2 What runs

```bash
pnpm typecheck                                   # tsc --noEmit
pnpm test                                        # 64 unit tests
node tools/check-contrast.mjs                    # palette, against the WCAG threshold
pnpm exec tsx tools/layout-audit.ts              # 3 viewports × every screen
pnpm exec tsx tools/feature-audit.ts             # 26 feature checks
pnpm exec tsx tools/e2e-web.ts                   # 31 browser checks against a real server
pnpm exec tsx tools/roundtrip.ts <host>          # protocol round trip
pnpm exec tsx tools/roundtrip-image.ts <host> <db>
pnpm exec tsx tools/verify-hashes.ts <db>        # hashes against a real vault
pnpm exec tsx tools/i18n-audit.ts                # both catalogues agree, and nothing bypasses `t()`
```

## 4.3 What each check can and cannot see

| Check | Sees | **Cannot see** |
|---|---|---|
| `typecheck` | types | anything at runtime |
| unit tests | pure functions, the sync engine against `node:sqlite` | the browser, the device |
| `check-contrast` | declared colours | anything rendered |
| `layout-audit` | overflow, clipped text, undersized targets, wrapped labels | anything not rendered while it looks |
| `feature-audit` | that each thing asked for is present and reachable | whether it *behaves* correctly |
| `e2e-web` | behaviour, against a real server, in Chromium | the packaged app, the device |
| `roundtrip` | bytes and rows, against a real server | the UI |
| `verify-hashes` | hash implementations, against a real vault | the app |

**None of these can see the packaged application.** That gap is where the
`strip_tags` arity bug lived: green suite, broken search on the device. It is closed only by
reading the device's own logs (see 4.6).

## 4.4 The layout audit

Runs every screen at 320, 360, 390 and 1024 wide and reports four things: an element that
escapes the viewport, text clipped by its container, a tap target under 44px, and a label
drawn on two lines.

The last one is measured with `Range.getClientRects()`, which returns one rect per line box
— so 图片 (*picture*, one line) and 图 over 片 (two) are distinguishable. It is limited to pure-text buttons,
because a row is a button containing a title and a meta line and is multi-line by design;
without that restriction it reported 100 findings, all of them false.

**The four checks are complements, and this was demonstrated the hard way.** Applying
`white-space: nowrap` to every button fixed the wrapped labels and immediately broke the
overflow check on a 320px screen, because a row is a button too:

```
[escapes viewport] search/phone-narrow-320
    span.note-text spans 182..340 (viewport 0..320)
```

Running only one of the two checks would have shipped it.

## 4.5 Verification against real data

- **The owner's live vault, 2.6 GB, read-only.** 404/404 content-hash sectors match. The
  vault is never written to.
- **Entity hashes:** 100% on a fresh server database; 100% of notes, branches and attributes
  in the live vault.
- **Byte-identical round trips:** a 2.5 MB PDF, a 4 MiB image note, a 6 MiB attachment,
  including through paged pushes and the base64 wire format.
- **The server's own database** is read after every write path — a rename shows the new
  title, a delete shows `isDeleted = 1`.

## 4.6 Reading the device

The device is the only place some things can be settled, and it says so itself:

```bash
# HarmonyOS
hdc -t <device> shell hilog -x | grep -a "shell: build"      # which build is running
hdc -t <device> shell hilog -x | grep -a "page says"          # what the page reported
```

The bundle stamps its build id into the console, so a device can be asked which build it is
running rather than assumed. This is also how the back-gesture bug was found: the log showed
the page reporting `backEnabled=true` and `onBackPressed` never being called at all.

**Grep the right tag.** ArkWeb console output arrives under `ARKWEB-CONSOLE`, not the
application tag, and looking in the wrong place shows nothing and proves nothing.

## 4.7 A verification that would have been misleading

The test server's database was edited directly with SQL to tidy up test notes. That put the
server's rows out of step with its own change journal, and the client — correctly — refused
to push. Subsequent runs then showed "the note saved but never arrived", which looks exactly
like a bug in the client.

It was not. It was the harness. The lesson is in
[06-known-issues.md](06-known-issues.md#lessons-that-changed-how-this-is-tested): **drive the
application's own paths, not the database's.**

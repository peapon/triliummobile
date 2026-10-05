# Adopting Trilium's palette

This client used a palette of its own: warm near-black, blue-grey text, an amber accent. Trilium has
one already, and a client for Trilium should look like Trilium.

Source: `apps/client/src/stylesheets/theme-next-light.css` and `theme-next-dark.css` in
[TriliumNext/Trilium](https://github.com/TriliumNext/Trilium). The two are bound to
`prefers-color-scheme`, so the app follows the system with one light and one dark, which is what
Trilium's own users see when they leave the theme on auto.

## The mapping

| This client | Trilium's variable |
|---|---|
| `--bg` | `--left-pane-background-color` (`#1f1f1f` dark, `#f2f2f2` light) |
| `--surface` | `--main-background-color` (`#242424` / `white`) |
| `--surface-2` | `--accented-background-color` (`#555` is too light for a card; `#2e2e2e` used instead) |
| `--border` | `--main-border-color` (`#454545` / `#dbdbdb`) |
| `--text` | `--main-text-color` (`#ccc` / `black`) |
| `--muted` | `--muted-text-color` (`#bbb` / `#666`) |
| `--accent` | `--link-color` (`#95c3d9` / `#0076af`) |
| `--danger` | `--dropdown-item-icon-destructive-color` |
| `--ok` | `--log-status-success-color` |
| `--warn` | `--log-slow-color` |

The dark background is the reason this was worth doing. Trilium's is `#242424`; this client's was
`#121110`, which is very nearly black.

## Where the values had to move, and by how much

Trilium's themes are not tuned to WCAG, and `tools/check-contrast.mjs` is a gate, so a few values are
adjusted. Each adjustment is the **smallest** that clears the threshold — solved for by lowering
lightness in HSL until the ratio is met, so the hue is untouched and the colour stays recognisably
Trilium's.

The dark theme passes **unchanged**. Every deviation is in the light theme:

| Token | Trilium | Used | Why |
|---|---|---|---|
| `--border` | `#dbdbdb` | `#c6c6c6` | 1.38:1 on a card. A 1px rule below 1.5:1 is present in the markup and invisible on screen. |
| `--accent` | `#0076af` | `#0075ae` | 4.46:1 on the page background. One unit. |
| `--danger` | `#de4027` | `#db3b22` | 4.31:1 on white. |
| `--warn` | `#db9345` | `#a96721` | 2.54:1 on white. Trilium uses this for slow-log timestamps, not for text on a card. |
| `--ok` | `#32b323` | `#26881b` | 2.76:1 on white, same reason. |
| `--faint` | — | `#6b6b6b` | Trilium has no third text level; this one is derived from `--muted`. |

The two large moves (`--warn`, `--ok`) are the interesting ones. Trilium can afford them because it
uses them for a timestamp inside a log line and a status icon; this client uses them for short status
words on a card, where 2.5:1 is not readable.

## Regenerating

```bash
node tools/check-contrast.mjs   # reads the tokens out of the stylesheet and re-measures
```

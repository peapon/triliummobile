# Yuque interaction reference (from nine screenshots)

`reference/yuque/*.jpg` are nine screenshots of Yuque's mobile app, given as an interaction
reference. The agent working in this repository cannot see images, so the structure below was
recovered with `tools/ocr.swift`, which OCRs them through the system Vision framework and prints each
text block with its position. Positions matter as much as words: a label in a top bar is a title, the
same label in a left rail is navigation.

Coordinates below are normalised, top-left origin.

## The shell is identical in all nine

```
y=0.065   x=0.197..0.56   "小记  知识库"      <- centred two-segment control
```

There is **no bottom tab bar**. The only persistent chrome is a centred segmented control at the top
of the screen. Everything else is content.

## Screen by screen

| # | Screen | Structure |
|---|---|---|
| 1 | 主页 (Home) | Recent-notes list. Each row: title, then a metadata line (people, date). |
| 2 | 搜索 (Search) | Top search field with `取消` (Cancel) at the right; below it a `搜索历史` (search history) section of past queries. |
| 3 | 创建新速记 (Create new quick note) | **Bottom sheet** titled `新建小记 [Beta]` (new quick note [Beta]): a row of creation kinds (`空白小记 拍摄 图片 OCR识图 待办` — blank quick note, capture, image, OCR image recognition, to-do), then `新建文档知识库` (`空白文档 知识库` — new document / knowledge base: blank document, knowledge base), then `从模板新建文档` (new document from template) with template cards, then `取消` (Cancel). |
| 4 | 编辑新速记 (Edit new quick note) | Full-screen editor: `×` close at the left, `完成` (Done) at the right, placeholder `记你想记…` (write whatever you want…), `。。。` overflow. |
| 5 | AI创作 (AI creation) | Yuque's own AI assistant. **Not adopted** — it is a Yuque feature, not a Trilium one. |
| 6 | 知识库 (Knowledge base) | List of knowledge bases. Each row: leading icon, name, then `共 N 篇文档 · <date>` (N documents). A `+` sits at the lower right. |
| 7 | 笔记视图 (Note view) | `<` back, `<title> ·语雀`, avatar, `……`. Then the document title, author, and a `目录` (contents) list of documents. |
| 8 | 系统设置 (System settings) | **Bottom sheet**: `布局` (layout: `列表` list / `书架` bookshelf), `筛选` (filter: `我个人的` mine / `邀请协作的` shared with me), `排序方式（常用置顶）` (sort order, most-used pinned: `按知识库名称` by knowledge-base name / `按更新时间` by update time / `按创建时间` by creation time), then `取消` (Cancel). Each group is a labelled row with its current value and a `>`. |
| 9 | 书架视图 (Bookshelf view) | Two-column **grid** of cards: cover image, title, and a count. Section header `最近文档 >` (recent documents). |

## Patterns worth borrowing

1. **Top segmented control, no bottom bar.** The single biggest structural difference from this
   app, which uses a bottom tab bar.
2. **Bottom sheets** for creation and for view options, dismissed by `取消`. Options are grouped and
   each row shows its current value inline.
3. **Rows are leading-icon + title + metadata subtitle**, never a bare string.
4. **List and grid are two views of the same collection**, switched from the options sheet.
5. **Drill-down navigation**: a collection is a list of its children; tapping a child either opens it
   or descends into it.
6. **Search is a full screen** with the field at the top and `取消` to leave.

## Mapping onto Trilium

Functionality stays Trilium's; only the interaction is borrowed. Nothing below is a new capability.

| Yuque | Trilium equivalent (existing) |
|---|---|
| `小记` tab | Quick capture plus recent notes (`dateModified`) |
| `知识库` tab | The note tree, walked one level at a time |
| `共 N 篇文档` | Child-note count of a `book` note |
| `布局: 列表 / 书架` | List and grid rendering of the same child list |
| `排序方式` | Trilium's existing sort keys: modified, created, title |
| `新建小记` sheet | Note types Trilium already has: text, code, canvas, book |
| `笔记视图` | The note detail, which already exists |
| `目录` | A book's children, which the drill-down already shows |

Deliberately **not** adopted, because Trilium has no such feature and inventing one is out of scope:
`拍摄` (capture), `OCR 识图` (OCR image recognition), `模板` (templates), `AI 创作` (AI creation),
collaborative filtering (`邀请协作的`, shared with me), and search history.

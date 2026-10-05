/**
 * Read queries the UI needs, over the local replica.
 *
 * Kept separate from `LocalStore` on purpose: that class mirrors the *protocol* (journal, cursors,
 * conflict rules) and should stay recognisable next to upstream's `sync_update.ts`. Everything here
 * is presentation-shaped — child lists, search, content decoding.
 */

import { isStubContent } from "../../../src/store/local-store.js";
import { EMPTY_BLOB_ID } from "../../../src/store/schema.js";
import type { SqlDatabase, SqlValue } from "../../../src/store/database.js";

export const ROOT_NOTE_ID = "root";

export interface NoteSummary {
  noteId: string;
  title: string;
  type: string;
  mime: string;
  isDeleted: number;
  utcDateModified: string;
  /** When the note was made. The quick-note list is ordered by this, not by last touch. */
  utcDateCreated: string;
  parentNoteId: string | null;
  /**
   * How many notes sit under this one.
   *
   * This, not the note's `type`, decides whether tapping it descends. Trilium lets a `text`, `doc`,
   * `code` or `render` note hold children just as a `book` does — in a real vault only 23 of 152
   * parents were books — so a type check strands every level below the second.
   */
  childCount: number;
  /**
   * Trilium's own `iconClass` label — a boxicons class such as `bx bx-bot`.
   *
   * A real vault uses hundreds of them (222 distinct in the test vault), which is why the icon font
   * is bundled rather than hand-mapped to a small inline set.
   */
  iconClass: string | null;
  /** Trilium's `color` label: a hue, 1–9. */
  color: string | null;
}

export interface NoteDetail extends NoteSummary {
  content: string;
  /** True when sync stubbed the blob because it exceeded the size cap. */
  contentStubbed: boolean;
  labels: Array<{ name: string; value: string }>;
  /**
   * A `data:` URL for a binary note, so an image can be shown without a second round trip.
   *
   * Data URLs rather than object URLs because the value crosses the worker boundary as JSON, and
   * object URLs are per-realm. The images this client deals with are photographs, not archives.
   */
  dataUrl: string | null;
}

export class NoteQueries {
  constructor(private readonly db: SqlDatabase) {}

  /**
   * The `childCount` a summary carries, as SQL.
   *
   * A correlated subquery rather than a join: the join would multiply rows for a note that appears
   * under several parents, and this list is ordered and paginated by the caller.
   */
  private static readonly CHILD_COUNT =
    "(SELECT COUNT(*) FROM branches cb WHERE cb.parentNoteId = n.noteId AND cb.isDeleted = 0)";

  /**
   * Trilium keeps its system notes under ids beginning with `_` — `_hidden`, `_llmChat`, `_search`,
   * `_sqlConsole` and the rest — and excludes them from the tree it shows. They are not the user's
   * notes; `_hidden` is where the user's own hidden ones live.
   *
   * Written once so every list agrees: leaving it out put "Hidden Notes" at the top of the library
   * and let system notes surface in search.
   */
  private static readonly NOT_HIDDEN = "n.noteId NOT LIKE '\\_%' ESCAPE '\\'";

  /** The note's own icon and colour, as Trilium stores them: labels called `iconClass` and `color`. */
  private static readonly LABEL = (name: string) =>
    `(SELECT a.value FROM attributes a WHERE a.noteId = n.noteId AND a.type = 'label'` +
    ` AND a.name = '${name}' AND a.isDeleted = 0 LIMIT 1)`;

  childrenOf(parentNoteId: string): NoteSummary[] {
    return this.db.all<NoteSummary>(
      `SELECT n.noteId, n.title, n.type, n.mime, n.isDeleted, n.utcDateModified, n.utcDateCreated,
              b.parentNoteId AS parentNoteId,
              ${NoteQueries.CHILD_COUNT} AS childCount,
              ${NoteQueries.LABEL("iconClass")} AS iconClass,
              ${NoteQueries.LABEL("color")} AS color
         FROM branches b
         JOIN notes n ON n.noteId = b.noteId
        WHERE b.parentNoteId = ? AND b.isDeleted = 0 AND n.isDeleted = 0 AND ${NoteQueries.NOT_HIDDEN}
        ORDER BY b.notePosition`,
      [parentNoteId]
    );
  }

  childCount(parentNoteId: string): number {
    const row = this.db.get<{ c: number }>(
      `SELECT COUNT(*) AS c
         FROM branches b JOIN notes n ON n.noteId = b.noteId
        WHERE b.parentNoteId = ? AND b.isDeleted = 0 AND n.isDeleted = 0 AND ${NoteQueries.NOT_HIDDEN}`,
      [parentNoteId]
    );
    return row?.c ?? 0;
  }

  /** Parents of a note; a note can be cloned into several places in the tree. */
  parentsOf(noteId: string): string[] {
    const rows = this.db.all<{ parentNoteId: string }>(
      "SELECT parentNoteId FROM branches WHERE noteId = ? AND isDeleted = 0",
      [noteId]
    );
    return rows.map((r) => r.parentNoteId);
  }

  breadcrumb(noteId: string): Array<{ noteId: string; title: string }> {
    const trail: Array<{ noteId: string; title: string }> = [];
    const seen = new Set<string>();

    let current = noteId;
    while (current && !seen.has(current)) {
      seen.add(current);
      const row = this.db.get<{ title: string }>("SELECT title FROM notes WHERE noteId = ?", [current]);
      trail.unshift({ noteId: current, title: row?.title ?? "?" });

      const parent = this.db.get<{ parentNoteId: string }>(
        "SELECT parentNoteId FROM branches WHERE noteId = ? AND isDeleted = 0 ORDER BY notePosition LIMIT 1",
        [current]
      );
      if (!parent) break;
      current = parent.parentNoteId;
    }

    return trail;
  }

  getNote(noteId: string): NoteDetail | null {
    const note = this.db.get<{
      noteId: string;
      title: string;
      type: string;
      mime: string;
      blobId: string | null;
      isDeleted: number;
      utcDateModified: string;
      utcDateCreated: string;
      parentNoteId: string | null;
      childCount: number;
      iconClass: string | null;
      color: string | null;
    }>(`SELECT n.noteId, n.title, n.type, n.mime, n.blobId, n.isDeleted, n.utcDateModified, n.utcDateCreated,
                      (SELECT parentNoteId FROM branches WHERE noteId = n.noteId AND isDeleted = 0 LIMIT 1) AS parentNoteId,
                      ${NoteQueries.CHILD_COUNT} AS childCount,
              ${NoteQueries.LABEL("iconClass")} AS iconClass,
              ${NoteQueries.LABEL("color")} AS color
                 FROM notes n WHERE n.noteId = ?`, [
      noteId
    ]);

    if (!note) return null;

    const parentRow = this.db.get<{ parentNoteId: string }>(
      "SELECT parentNoteId FROM branches WHERE noteId = ? AND isDeleted = 0 ORDER BY notePosition LIMIT 1",
      [noteId]
    );

    const blob = note.blobId
      ? this.db.get<{ content: unknown }>("SELECT content FROM blobs WHERE blobId = ?", [note.blobId])
      : undefined;

    const labels = this.db.all<{ name: string; value: string }>(
      "SELECT name, value FROM attributes WHERE noteId = ? AND type = 'label' AND isDeleted = 0",
      [noteId]
    );

    // A binary note keeps its bytes; decoding them as UTF-8 would produce mojibake, which is what
    // the placeholder used to stand in for.
    const isBinary = note.type === "image" || note.type === "file";
    const text = isBinary ? "" : decodeContent(blob?.content);
    const dataUrl = isBinary ? toDataUrl(blob?.content, note.mime) : null;

    // The same test the server uses: empty content under a blobId that is not the hash of empty
    // content. Checking "is the content empty" alone would label every genuinely empty note as an
    // undownloaded one, and offer the user a download that never arrives.
    const stubbed =
      note.blobId !== null && note.blobId !== EMPTY_BLOB_ID && isStubContent(blob?.content);

    return {
      ...note,
      parentNoteId: parentRow?.parentNoteId ?? null,
      content: text,
      contentStubbed: stubbed,
      dataUrl,
      labels
    };
  }

  /**
   * Search across titles and, when the query is long enough to be worth the scan, note content.
   * Content lives in `blobs` as either TEXT or BLOB depending on how it was written, so the
   * comparison casts explicitly rather than relying on either storage class.
   */
  /**
   * Search the replica.
   *
   * Trilium's own semantics, which this gets wrong in four ways if done naively:
   *
   * 1. **Words, not one string.** `rings tolkien` means notes containing *both*. Only a quoted
   *    `"exact phrase"` is matched as a phrase. Matching the whole query as one substring finds
   *    almost nothing.
   * 2. **A title hit is worth far more than a body hit.** It used to order by last modified, so a
   *    note that merely *mentions* the word outranked a note *named* it: searching "Trilium" put
   *    "AI Chat History" and "Trilium Demo" below eight notes whose text happened to contain the
   *    word.
   * 3. **Recency only breaks ties.**
   * 4. Content is HTML, so a match inside a tag is not a match in the note's text. Tags are stripped
   *    for the content test; see `stripTags`.
   *
   * The term must appear in the title or in the text — `LIKE` on the stripped text, not on the raw
   * mark-up.
   */
  search(query: string, limit = 40): NoteSummary[] {
    const trimmed = query.trim();
    if (trimmed === "") return this.recent(limit);

    // A quoted run is one exact term; everything else is split on whitespace.
    const phrases = [...trimmed.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    const bare = trimmed.replace(/"[^"]*"/g, " ").trim();
    const terms = [...phrases, ...(bare ? bare.split(/\s+/).filter(Boolean) : [])];

    if (terms.length === 0) return this.recent(limit);

    const like = (term: string) => `%${escapeLike(term)}%`;

    // Every term has to be present, in either the title or the text.
    const where = terms
      .map(() => `(n.title LIKE ? ESCAPE '\\' OR strip_tags(CAST(b.content AS TEXT)) LIKE ? ESCAPE '\\')`)
      .join("\n          AND ");

    // A term found in the title counts for much more than one found only in the body.
    const score = terms
      .map(() => `(CASE WHEN n.title LIKE ? ESCAPE '\\' THEN 10 ELSE 0 END)`)
      .join(" + ");

    const params: SqlValue[] = [];
    for (const term of terms) params.push(like(term), like(term));
    for (const term of terms) params.push(like(term));
    params.push(limit);

    return this.db.all<NoteSummary>(
      `SELECT DISTINCT n.noteId, n.title, n.type, n.mime, n.isDeleted, n.utcDateModified, n.utcDateCreated,
              (SELECT parentNoteId FROM branches WHERE noteId = n.noteId AND isDeleted = 0 LIMIT 1) AS parentNoteId,
              ${NoteQueries.CHILD_COUNT} AS childCount,
              ${NoteQueries.LABEL("iconClass")} AS iconClass,
              ${NoteQueries.LABEL("color")} AS color
         FROM notes n
         LEFT JOIN blobs b ON b.blobId = n.blobId
        WHERE n.isDeleted = 0
          AND ${NoteQueries.NOT_HIDDEN}
          AND ${where}
        ORDER BY (${score}) DESC, n.utcDateModified DESC
        LIMIT ?`,
      params
    );
  }

  /**
   * The quick-note list: what this device made, newest first.
   *
   * Scoped to the inbox's own subtree rather than the whole vault, and capped. "速记" is one place,
   * not "everything you touched lately" — the library tab is where the vault is browsed.
   *
   * Ordered by `utcDateCreated`: a quick note is written once and rarely reopened, so the order it
   * was written in is the order it is wanted in. Ordering by last-modified would reshuffle the list
   * whenever an old note was opened.
   */
  recentQuickNotes(inboxNoteId: string, limit = 50): NoteSummary[] {
    return this.db.all<NoteSummary>(
      `WITH RECURSIVE subtree(noteId) AS (
         SELECT ?
         UNION
         SELECT b.noteId FROM branches b JOIN subtree s ON b.parentNoteId = s.noteId WHERE b.isDeleted = 0
       )
       SELECT n.noteId, n.title, n.type, n.mime, n.isDeleted, n.utcDateModified, n.utcDateCreated,
              (SELECT parentNoteId FROM branches WHERE noteId = n.noteId AND isDeleted = 0 LIMIT 1) AS parentNoteId,
              (SELECT COUNT(*) FROM branches cb WHERE cb.parentNoteId = n.noteId AND cb.isDeleted = 0) AS childCount,
              ${NoteQueries.LABEL("iconClass")} AS iconClass,
              ${NoteQueries.LABEL("color")} AS color
         FROM notes n
        WHERE n.isDeleted = 0 AND n.noteId IN (SELECT noteId FROM subtree) AND n.noteId != ?
          AND ${NoteQueries.NOT_HIDDEN}
        ORDER BY n.utcDateCreated DESC
        LIMIT ?`,
      [inboxNoteId, inboxNoteId, limit]
    );
  }

  /**
   * Notes of one Trilium type, most recently modified first.
   *
   * Used to find `llmChat` notes. Reads only what sync already stored — the AI chats are ordinary
   * notes in the tree, under a special `_llmChat` ancestor the server manages.
   */
  notesOfType(type: string, limit = 40): NoteSummary[] {
    return this.db.all<NoteSummary>(
      `SELECT DISTINCT n.noteId, n.title, n.type, n.mime, n.isDeleted, n.utcDateModified, n.utcDateCreated,
              (SELECT parentNoteId FROM branches WHERE noteId = n.noteId AND isDeleted = 0 LIMIT 1) AS parentNoteId,
              ${NoteQueries.CHILD_COUNT} AS childCount,
              ${NoteQueries.LABEL("iconClass")} AS iconClass,
              ${NoteQueries.LABEL("color")} AS color
         FROM notes n
        WHERE n.isDeleted = 0 AND n.type = ? AND ${NoteQueries.NOT_HIDDEN}
        ORDER BY n.utcDateModified DESC
        LIMIT ?`,
      [type, limit]
    );
  }

  recent(limit = 40): NoteSummary[] {
    return this.db.all<NoteSummary>(
      `SELECT n.noteId, n.title, n.type, n.mime, n.isDeleted, n.utcDateModified, n.utcDateCreated,
              (SELECT parentNoteId FROM branches WHERE noteId = n.noteId AND isDeleted = 0 LIMIT 1) AS parentNoteId,
              ${NoteQueries.CHILD_COUNT} AS childCount,
              ${NoteQueries.LABEL("iconClass")} AS iconClass,
              ${NoteQueries.LABEL("color")} AS color
         FROM notes n
        WHERE n.isDeleted = 0 AND n.noteId != ? AND ${NoteQueries.NOT_HIDDEN}
        ORDER BY n.utcDateModified DESC
        LIMIT ?`,
      [ROOT_NOTE_ID, limit]
    );
  }

  counts(): { notes: number; branches: number; attributes: number; blobs: number } {
    const one = (sql: string) => this.db.get<{ c: number }>(sql)?.c ?? 0;

    return {
      notes: one("SELECT COUNT(*) AS c FROM notes WHERE isDeleted = 0"),
      branches: one("SELECT COUNT(*) AS c FROM branches WHERE isDeleted = 0"),
      attributes: one("SELECT COUNT(*) AS c FROM attributes WHERE isDeleted = 0"),
      blobs: one("SELECT COUNT(*) AS c FROM blobs")
    };
  }
}

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * Blob content reaches the store as a string, or as a `Uint8Array` when it was decoded from base64
 * during a sync. Decoding is all this does — whether the result is a *stub* is a question about the
 * blob id, not about the content, and is answered where the id is known.
 */
/** Wrap a blob's bytes as a `data:` URL, so the renderer can show them directly. */
export function toDataUrl(content: unknown, mime: string): string | null {
  if (!(content instanceof Uint8Array) || content.byteLength === 0) return null;

  let binary = "";
  // Chunked: `String.fromCharCode(...bytes)` blows the argument limit on anything photograph-sized.
  const CHUNK = 0x8000;
  for (let at = 0; at < content.length; at += CHUNK) {
    binary += String.fromCharCode(...content.subarray(at, at + CHUNK));
  }

  return `data:${mime || "application/octet-stream"};base64,${btoa(binary)}`;
}

export function decodeContent(content: unknown): string {
  if (content === null || content === undefined) return "";
  if (typeof content === "string") return content;
  if (content instanceof Uint8Array) return new TextDecoder().decode(content);
  return String(content);
}

/** Strip markup down to readable text for list snippets. */
export function toSnippet(html: string, length = 120): string {
  const text = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

  return text.length > length ? `${text.slice(0, length)}…` : text;
}

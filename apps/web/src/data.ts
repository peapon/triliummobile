/**
 * Read queries the UI needs, over the local replica.
 *
 * Kept separate from `LocalStore` on purpose: that class mirrors the *protocol* (journal, cursors,
 * conflict rules) and should stay recognisable next to upstream's `sync_update.ts`. Everything here
 * is presentation-shaped — child lists, search, content decoding.
 */

import type { SqlDatabase } from "../../../src/store/database.js";

export const ROOT_NOTE_ID = "root";

export interface NoteSummary {
  noteId: string;
  title: string;
  type: string;
  mime: string;
  isDeleted: number;
  utcDateModified: string;
  parentNoteId: string | null;
}

export interface NoteDetail extends NoteSummary {
  content: string;
  /** True when sync stubbed the blob because it exceeded the size cap. */
  contentStubbed: boolean;
  labels: Array<{ name: string; value: string }>;
}

export class NoteQueries {
  constructor(private readonly db: SqlDatabase) {}

  childrenOf(parentNoteId: string): NoteSummary[] {
    return this.db.all<NoteSummary>(
      `SELECT n.noteId, n.title, n.type, n.mime, n.isDeleted, n.utcDateModified,
              b.parentNoteId AS parentNoteId
         FROM branches b
         JOIN notes n ON n.noteId = b.noteId
        WHERE b.parentNoteId = ? AND b.isDeleted = 0 AND n.isDeleted = 0
        ORDER BY b.notePosition`,
      [parentNoteId]
    );
  }

  childCount(parentNoteId: string): number {
    const row = this.db.get<{ c: number }>(
      `SELECT COUNT(*) AS c
         FROM branches b JOIN notes n ON n.noteId = b.noteId
        WHERE b.parentNoteId = ? AND b.isDeleted = 0 AND n.isDeleted = 0`,
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
    }>("SELECT noteId, title, type, mime, blobId, isDeleted, utcDateModified FROM notes WHERE noteId = ?", [
      noteId
    ]);

    if (!note) return null;

    const parentRow = this.db.get<{ parentNoteId: string }>(
      "SELECT parentNoteId FROM branches WHERE noteId = ? AND isDeleted = 0 ORDER BY notePosition LIMIT 1",
      [noteId]
    );

    const blob = note.blobId
      ? this.db.get<{ content: unknown; contentLength?: number }>(
          "SELECT content FROM blobs WHERE blobId = ?",
          [note.blobId]
        )
      : undefined;

    const labels = this.db.all<{ name: string; value: string }>(
      "SELECT name, value FROM attributes WHERE noteId = ? AND type = 'label' AND isDeleted = 0",
      [noteId]
    );

    const { text, stubbed } = decodeContent(blob?.content);

    return {
      ...note,
      parentNoteId: parentRow?.parentNoteId ?? null,
      content: text,
      contentStubbed: stubbed,
      labels
    };
  }

  /**
   * Search across titles and, when the query is long enough to be worth the scan, note content.
   * Content lives in `blobs` as either TEXT or BLOB depending on how it was written, so the
   * comparison casts explicitly rather than relying on either storage class.
   */
  search(query: string, limit = 40): NoteSummary[] {
    // Trilium's search syntax is a language of its own; this is deliberately the plain-substring
    // subset the phone needs, and it is applied locally so it works offline.
    const needle = query.trim();
    if (needle === "") return this.recent(limit);

    const like = `%${escapeLike(needle)}%`;

    return this.db.all<NoteSummary>(
      `SELECT DISTINCT n.noteId, n.title, n.type, n.mime, n.isDeleted, n.utcDateModified,
              (SELECT parentNoteId FROM branches WHERE noteId = n.noteId AND isDeleted = 0 LIMIT 1) AS parentNoteId
         FROM notes n
         LEFT JOIN blobs b ON b.blobId = n.blobId
        WHERE n.isDeleted = 0
          AND (n.title LIKE ? ESCAPE '\\'
               OR CAST(b.content AS TEXT) LIKE ? ESCAPE '\\')
        ORDER BY n.utcDateModified DESC
        LIMIT ?`,
      [like, like, limit]
    );
  }

  recent(limit = 40): NoteSummary[] {
    return this.db.all<NoteSummary>(
      `SELECT n.noteId, n.title, n.type, n.mime, n.isDeleted, n.utcDateModified,
              (SELECT parentNoteId FROM branches WHERE noteId = n.noteId AND isDeleted = 0 LIMIT 1) AS parentNoteId
         FROM notes n
        WHERE n.isDeleted = 0 AND n.noteId != ?
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
 * Blob content reaches the store as a string, a `Uint8Array` (after a sync decode), or `""` when the
 * server stubbed it for exceeding the size cap. Only the last case is worth telling the user about.
 */
export function decodeContent(content: unknown): { text: string; stubbed: boolean } {
  if (content === null || content === undefined) return { text: "", stubbed: false };

  if (typeof content === "string") {
    // An empty string from the server means "too large to send", never "empty note" — an actually
    // empty note still carries markup. Only report it as stubbed when a blob row exists at all.
    return { text: content, stubbed: false };
  }

  if (content instanceof Uint8Array) {
    if (content.byteLength === 0) return { text: "", stubbed: true };
    return { text: new TextDecoder().decode(content), stubbed: false };
  }

  return { text: String(content), stubbed: false };
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

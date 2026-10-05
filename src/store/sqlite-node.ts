/**
 * `node:sqlite` adapter.
 *
 * This is the driver used for integration testing on this machine, where the whole point is to run
 * the real protocol against a real Trilium server. The mobile targets will get their own adapters
 * (a native SQLite bridge in the ArkTS shell, IndexedDB in a browser); nothing above this file
 * knows which one is in use.
 */

import { DatabaseSync } from "node:sqlite";

import type { SqlDatabase, SqlValue } from "./database.js";

export class NodeSqliteDatabase implements SqlDatabase {
  private readonly db: DatabaseSync;
  private depth = 0;

  constructor(filename: string, options: { readOnly?: boolean } = {}) {
    this.db = new DatabaseSync(filename, { readOnly: options.readOnly ?? false });
    // WAL keeps the local replica usable while the UI reads, and matches how Trilium itself runs.
    if (!options.readOnly) {
      this.db.exec("PRAGMA journal_mode = WAL");
      this.db.exec("PRAGMA foreign_keys = OFF");
    }
  }

  run(sql: string, params: SqlValue[] = []): void {
    this.db.prepare(sql).run(...(params as never[]));
  }

  get<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []): T | undefined {
    return this.db.prepare(sql).get(...(params as never[])) as T | undefined;
  }

  all<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []): T[] {
    return this.db.prepare(sql).all(...(params as never[])) as T[];
  }

  registerFunction(name: string, fn: (...args: unknown[]) => unknown): void {
    this.db.function(name, fn as never);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  /**
   * Nested calls are absorbed into the outermost transaction: SQLite has no nested BEGIN, and the
   * engine composes operations that each want atomicity.
   */
  transaction<T>(fn: () => T): T {
    if (this.depth > 0) {
      return fn();
    }

    this.db.exec("BEGIN");
    this.depth++;

    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    } finally {
      this.depth--;
    }
  }

  close(): void {
    this.db.close();
  }
}

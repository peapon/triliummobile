/**
 * `@sqlite.org/sqlite-wasm` adapter — the browser and WebView driver.
 *
 * Chosen over IndexedDB because it satisfies the synchronous `SqlDatabase` contract, and because it
 * is the same engine upstream's own standalone/Capacitor build runs on (OPFS SAH-Pool VFS). The
 * protocol's journal application is a tight read-then-write loop; an async store would force it
 * into either an IndexedDB transaction that cannot await, or thousands of promise hops.
 *
 * The trade-off is stated plainly in the ADR: **HarmonyOS's opt-in Secure Shield mode disables
 * WebAssembly**, which takes this adapter with it. That is why the store sits behind an interface —
 * a native SQLite bridge replaces this file on that platform, and nothing above it changes.
 *
 * Verified in Node as well as the browser: the package ships a Node build, so the adapter's
 * behaviour can be exercised without a browser in the loop.
 */

import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
// Resolved by the bundler to the emitted, content-hashed asset. A fixed path cannot work: the
// filename changes with the content, so the loader has to be told where it actually landed.
import sqliteWasmUrl from "@sqlite.org/sqlite-wasm/sqlite3.wasm?url";

import type { SqlDatabase, SqlValue } from "./database.js";

/** The subset of sqlite3's oo1 API this adapter uses. */
interface Oo1Database {
  createFunction(name: string, fn: (...args: never[]) => unknown): unknown;
  exec(sql: string): unknown;
  exec(options: {
    sql: string;
    bind?: SqlValue[];
    rowMode?: "object";
    returnValue?: "resultRows";
  }): Record<string, unknown>[];
  close(): void;
}

export interface SqliteWasmOptions {
  /** Database filename inside the VFS. Ignored when `vfs` is `"memory"`. */
  filename?: string;
  /**
   * `"opfs-sahpool"` persists across reloads and is what the mobile app uses.
   * `"memory"` is for tests and for environments without OPFS (including Node).
   */
  vfs?: "opfs-sahpool" | "memory";
  /** Raise the pool capacity, for databases with many attached files. */
  capacity?: number;
}

export class SqliteWasmDatabase implements SqlDatabase {
  private depth = 0;

  constructor(private readonly db: Oo1Database) {}

  run(sql: string, params: SqlValue[] = []): void {
    this.db.exec({ sql, bind: params });
  }

  get<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []): T | undefined {
    const rows = this.db.exec({ sql, bind: params, rowMode: "object", returnValue: "resultRows" });
    return rows[0] as T | undefined;
  }

  all<T = Record<string, unknown>>(sql: string, params: SqlValue[] = []): T[] {
    return this.db.exec({
      sql,
      bind: params,
      rowMode: "object",
      returnValue: "resultRows"
    }) as T[];
  }

  registerFunction(name: string, fn: (...args: unknown[]) => unknown): void {
    // sqlite-wasm hands the function a context pointer first, then the arguments.
    this.db.createFunction(name, (_ctx: number, ...args: unknown[]) => fn(...args) as never);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  transaction<T>(fn: () => T): T {
    if (this.depth > 0) return fn();

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

/**
 * Open a database. Async only because loading the WASM module is; every query after this is
 * synchronous.
 */
export async function openSqliteWasmDatabase(
  options: SqliteWasmOptions = {}
): Promise<SqlDatabase> {
  const { filename = "document.db", vfs = detectDefaultVfs(), capacity } = options;

  // `locateFile` because the bundled JavaScript cannot resolve the package's own directory at
  // runtime; the shell serves the .wasm next to the app and tells the loader where to find it.
  //
  // The published types declare `init()` with no parameters, but the Emscripten module it returns
  // accepts the usual configuration object. The cast records that gap rather than hiding it.
  const init = sqlite3InitModule as unknown as (config?: {
    locateFile?: (file: string) => string;
  }) => Promise<Awaited<ReturnType<typeof sqlite3InitModule>>>;

  const sqlite3 = await init({
    locateFile: (file) => (file.endsWith(".wasm") ? sqliteWasmUrl : `/${file}`)
  });

  if (vfs === "opfs-sahpool") {
    // The SAH-Pool VFS is deliberately not the default VFS: it must be installed explicitly, and it
    // requires a dedicated worker's synchronous access to OPFS, which is exactly what makes it
    // usable from synchronous code.
    const pool = await sqlite3.installOpfsSAHPoolVfs({
      name: "triliummobile",
      ...(capacity ? { initialCapacity: capacity } : {})
    });

    return new SqliteWasmDatabase(new pool.OpfsSAHPoolDb(`/${filename}`) as unknown as Oo1Database);
  }

  return new SqliteWasmDatabase(new sqlite3.oo1.DB(":memory:", "c") as unknown as Oo1Database);
}

/**
 * OPFS is absent under Node and under a `file://` page, and the SAH-Pool VFS throws rather than
 * degrading. Probing here keeps the caller from having to branch.
 */
function detectDefaultVfs(): "opfs-sahpool" | "memory" {
  const hasOpfs =
    typeof navigator !== "undefined" &&
    typeof navigator.storage?.getDirectory === "function";

  return hasOpfs ? "opfs-sahpool" : "memory";
}

/**
 * The storage contract the sync engine and the UI depend on.
 *
 * Kept deliberately tiny and synchronous. Every target — `node:sqlite` on this machine, a native
 * SQLite bridge in the ArkTS shell, IndexedDB in a browser — can satisfy it; the engine never sees
 * a driver.
 *
 * Synchronous is a real constraint, not an accident: the content-hash fold hashes every journal row
 * in one pass, and an async driver would turn that into thousands of promise hops. IndexedDB cannot
 * satisfy this directly, so its adapter must batch reads across a transaction rather than expose
 * per-row awaits.
 */

export type SqlValue = string | number | bigint | null | Uint8Array;

export interface SqlDatabase {
  /** Run a statement that returns nothing. */
  run(sql: string, params?: SqlValue[]): void;

  /** Run a query expected to yield at most one row. */
  get<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): T | undefined;

  /** Run a query yielding any number of rows. */
  all<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): T[];

  /** Run one or more statements, discarding results. Used for schema creation. */
  exec(sql: string): void;

  /**
   * Register a scalar SQL function.
   *
   * Both engines expose this under a different name (`node:sqlite` takes `function`, sqlite-wasm
   * takes `createFunction`), which is what the adapter is for.
   */
  registerFunction(name: string, fn: (...args: unknown[]) => unknown): void;

  /** Run `fn` inside a transaction, rolling back if it throws. */
  transaction<T>(fn: () => T): T;

  close(): void;
}

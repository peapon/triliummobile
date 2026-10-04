/**
 * Wire types for Trilium's sync protocol.
 *
 * Field names match the server's JSON exactly. Sources:
 * - `packages/trilium-core/src/routes/api/sync.ts`
 * - `packages/trilium-core/src/services/sync.ts`
 * - `packages/trilium-core/src/services/sync_update.ts`
 */

/** A row of the `entity_changes` journal, as it travels over the wire. */
export interface EntityChange {
  id?: number;
  entityName: string;
  entityId: string;
  hash: string;
  isErased: boolean | number;
  changeId: string;
  componentId: string;
  instanceId: string;
  isSynced: boolean | number;
  utcDateChanged: string;
}

/**
 * One pull unit: the journal row plus the entity it refers to.
 * `entity` is absent when `isErased` is set — that means "delete this row locally".
 */
export interface EntityChangeRecord<T = Record<string, unknown>> {
  entityChange: EntityChange;
  entity?: T;
}

export interface ChangedResponse {
  entityChanges: EntityChangeRecord[];
  /**
   * The cursor to store as `lastSyncedPull`. Deliberately NOT the max id: the server withholds
   * advancement past rows it did not serve, so anything else re-fetches or skips changes.
   */
  lastEntityChangeId: number;
  outstandingPullCount: number;
}

export interface LoginResponse {
  /** The *server's* instance id. Used to skip echoing its own changes back on push. */
  instanceId: string;
  maxEntityChangeId: number;
}

export interface AppInfo {
  appVersion: string;
  dbVersion: number;
  syncVersion: number;
  buildDate?: string;
  buildRevision?: string;
  dataDirectory?: string;
  utcDateTime?: string;
}

export interface CheckResponse {
  entityHashes: Record<string, Record<string, string>>;
  maxEntityChangeId: number;
}

export interface SyncSeedResponse {
  options: Array<{ name: string; value: string }>;
  syncVersion: number;
}

export interface SyncStatsResponse {
  initialized: boolean;
  outstandingPullCount: number;
  totalPullCount: number;
  lastSyncError?: string;
}

export class SyncError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "SyncError";
  }
}

/**
 * HTTP transport for Trilium's sync protocol.
 *
 * Deliberately dumb: it knows how to authenticate, page a push, and shape a pull request. It holds
 * no state about *what* has been synced — cursors and the local journal belong to the engine.
 *
 * Three details here are load-bearing and easy to get wrong:
 *
 * 1. **Auth is a replayed session cookie, not a token.** `/api/login/sync` verifies an HMAC and then
 *    sets `trilium.sid`; every later call must send it back. There is no Bearer scheme.
 * 2. **The HMAC key is latin1, the message is UTF-8.** Upstream builds the key with
 *    `Buffer.from(secret, "ascii")`. See `../crypto/index.ts`.
 * 3. **Multiple `Set-Cookie` headers must be preserved.** Upstream shipped bug #10548 where a reverse
 *    proxy's affinity cookie caused the client to comma-join the headers and destroy the session.
 *    Self-hosted-behind-a-proxy is exactly our target deployment, so cookies are parsed properly
 *    rather than by taking header[0].
 */

import { hmacSha256Base64 } from "../crypto/index.js";
import {
  SyncError,
  type AppInfo,
  type ChangedResponse,
  type CheckResponse,
  type EntityChangeRecord,
  type LoginResponse,
  type SyncSeedResponse,
  type SyncStatsResponse
} from "./types.js";

/** `/api/sync/changed` refuses to exceed ~8 MiB per response; the client asks for a smaller page. */
export const DEFAULT_MAX_BLOB_CONTENT_SIZE = 4 * 1024 * 1024;

/** Upstream splits a push body into 1 MiB pages. */
export const DEFAULT_PUSH_PAGE_SIZE = 1024 * 1024;

export interface TransportOptions {
  /** Base URL of the Trilium server, e.g. `http://192.168.1.10:8080`. */
  serverHost: string;
  /** The sync password, extracted from `GET /api/setup/sync-seed`. */
  documentSecret: string;
  /** Must equal the server's `syncVersion`; the server hard-rejects any mismatch. */
  syncVersion: number;
  /** Blobs above this are returned with empty content and fetched on demand. */
  maxBlobContentSize?: number;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

/** `dateUtils.utcDateTimeStr()` — ISO-8601 with a space instead of `T`, keeping the trailing `Z`. */
export function utcDateTimeStr(date: Date = new Date()): string {
  return date.toISOString().replace("T", " ");
}

export function randomString(length: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

function normaliseHost(host: string): string {
  return host.replace(/\/+$/, "");
}

export class SyncTransport {
  private readonly serverHost: string;
  private readonly documentSecret: string;
  private readonly fetchImpl: typeof fetch;

  /** Cookie name=value pairs, keyed by name so a later Set-Cookie replaces an earlier one. */
  private readonly cookies = new Map<string, string>();

  private _serverInstanceId: string | null = null;

  syncVersion: number;
  maxBlobContentSize: number;

  constructor(options: TransportOptions) {
    this.serverHost = normaliseHost(options.serverHost);
    this.documentSecret = options.documentSecret;
    this.syncVersion = options.syncVersion;
    this.maxBlobContentSize = options.maxBlobContentSize ?? DEFAULT_MAX_BLOB_CONTENT_SIZE;
    // Bound, not taken as a bare reference: inside a Worker (which the OPFS-backed store
    // requires) an unbound `fetch` throws "Illegal invocation" because it is called with the
    // wrong receiver.
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  /** The server's instance id, learned at login. */
  get serverInstanceId(): string | null {
    return this._serverInstanceId;
  }

  private cookieHeader(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  /**
   * Read every `Set-Cookie` header rather than only the first. `Headers.getSetCookie()` is the only
   * way to see them all; falling back to `get("set-cookie")` would comma-join them, which is the bug
   * that breaks sessions behind a reverse proxy.
   */
  private captureCookies(response: Response): void {
    const raw: string[] =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : (response.headers.get("set-cookie") ?? "").split(/,(?=[^;=]+=)/);

    for (const cookie of raw) {
      const pair = cookie.split(";")[0]?.trim();
      if (!pair) continue;

      const eq = pair.indexOf("=");
      if (eq <= 0) continue;

      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();

      // A deletion is expressed as an empty value with an expiry; honour it.
      if (value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    const cookie = this.cookieHeader();
    if (cookie) headers.set("Cookie", cookie);

    const response = await this.fetchImpl(`${this.serverHost}${path}`, { ...init, headers });
    this.captureCookies(response);
    return response;
  }

  /** Throw a `SyncError` carrying the server's message and status. */
  private async fail(response: Response, what: string): Promise<never> {
    const body = await response.text().catch(() => "");
    throw new SyncError(`${what} failed (HTTP ${response.status}): ${body.slice(0, 400)}`, response.status);
  }

  async getAppInfo(): Promise<AppInfo> {
    const response = await this.request("/api/app-info");
    if (!response.ok) await this.fail(response, "GET /api/app-info");
    return (await response.json()) as AppInfo;
  }

  /**
   * `GET /api/setup/sync-seed` — the first-time bootstrap. Returns `documentId` and `documentSecret`,
   * which are what the HMAC login is built from. Uses a custom `trilium-cred` header where the
   * username is ignored and the *password* is the account password.
   */
  async fetchSyncSeed(password: string, username = "trilium"): Promise<SyncSeedResponse> {
    const credential = btoa(`${username}:${password}`);
    const response = await this.request("/api/setup/sync-seed", {
      headers: { "trilium-cred": credential }
    });
    if (!response.ok) await this.fail(response, "GET /api/setup/sync-seed");
    return (await response.json()) as SyncSeedResponse;
  }

  /** `GET /api/setup/status` — unauthenticated; tells us whether the server even has a schema. */
  async getSetupStatus(): Promise<{ isInitialized: boolean; schemaExists: boolean; syncVersion: number }> {
    const response = await this.request("/api/setup/status");
    if (!response.ok) await this.fail(response, "GET /api/setup/status");
    return (await response.json()) as { isInitialized: boolean; schemaExists: boolean; syncVersion: number };
  }

  /**
   * `POST /api/login/sync` — HMAC handshake.
   *
   * The server enforces a 5-minute clock window, so a device with a skewed clock fails here with a
   * 401 that says nothing about the password.
   */
  async login(): Promise<LoginResponse> {
    const timestamp = utcDateTimeStr();
    const hash = hmacSha256Base64(this.documentSecret, timestamp);

    const response = await this.request("/api/login/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timestamp, syncVersion: this.syncVersion, hash })
    });

    if (!response.ok) await this.fail(response, "POST /api/login/sync");

    const body = (await response.json()) as LoginResponse;
    if (!body?.instanceId) {
      throw new SyncError("Login succeeded but the server returned no instanceId");
    }

    this._serverInstanceId = body.instanceId;
    return body;
  }

  /**
   * `GET /api/sync/changed` — pull one page.
   *
   * `maxBlobContentSize` makes the server stub oversized blobs (empty `content`, hash untouched) so a
   * memory-capped client can sync the whole note tree without dragging 1.4 GB of attachments through
   * the WebView. This is the mechanism upstream itself uses on mobile.
   */
  async getChanged(
    lastEntityChangeId: number,
    clientInstanceId: string,
    options: { maxBlobContentSize?: number } = {}
  ): Promise<ChangedResponse> {
    const params = new URLSearchParams({
      instanceId: clientInstanceId,
      lastEntityChangeId: String(lastEntityChangeId),
      logMarkerId: randomString(10)
    });

    const cap = options.maxBlobContentSize ?? this.maxBlobContentSize;
    if (cap > 0) params.set("maxBlobContentSize", String(cap));

    const response = await this.request(`/api/sync/changed?${params.toString()}`);
    if (!response.ok) await this.fail(response, "GET /api/sync/changed");
    return (await response.json()) as ChangedResponse;
  }

  /**
   * `PUT /api/sync/update` — push a batch.
   *
   * Bodies are split into pages because a first push can comfortably exceed reverse-proxy body
   * limits. A single page still sends `pageCount: 1`; the server treats that as the non-paged case.
   */
  async update(
    entities: EntityChangeRecord[],
    clientInstanceId: string,
    pageSize = DEFAULT_PUSH_PAGE_SIZE
  ): Promise<void> {
    const payload = JSON.stringify({ entities, instanceId: clientInstanceId });
    const body = new TextEncoder().encode(payload);

    const pageCount = Math.max(1, Math.ceil(body.length / pageSize));
    const requestId = pageCount > 1 ? randomString(12) : undefined;

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      const chunk = body.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        pageCount: String(pageCount),
        pageIndex: String(pageIndex)
      };
      if (requestId) headers.requestId = requestId;

      const params = new URLSearchParams({ logMarkerId: randomString(10) });
      const response = await this.request(`/api/sync/update?${params.toString()}`, {
        method: "PUT",
        headers,
        body: chunk
      });

      if (!response.ok) await this.fail(response, `PUT /api/sync/update (page ${pageIndex + 1}/${pageCount})`);
    }
  }

  /** `POST /api/sync/finished` — tells the server the round completed. */
  async finished(): Promise<void> {
    const response = await this.request("/api/sync/finished", { method: "POST" });
    if (!response.ok) await this.fail(response, "POST /api/sync/finished");
  }

  /** `GET /api/sync/check` — per-sector content hashes used to detect silent divergence. */
  async check(): Promise<CheckResponse> {
    const response = await this.request("/api/sync/check");
    if (!response.ok) await this.fail(response, "GET /api/sync/check");
    return (await response.json()) as CheckResponse;
  }

  /** `POST /api/sync/check-entity-changes` — asks the server to re-verify its own journal. */
  async checkEntityChanges(): Promise<void> {
    const response = await this.request("/api/sync/check-entity-changes", { method: "POST" });
    if (!response.ok) await this.fail(response, "POST /api/sync/check-entity-changes");
  }

  /** `POST /api/sync/queue-sector/:entityName/:sector` — marks a sector for re-sync. */
  async queueSector(entityName: string, sector: string): Promise<void> {
    const response = await this.request(
      `/api/sync/queue-sector/${encodeURIComponent(entityName)}/${encodeURIComponent(sector)}`,
      { method: "POST" }
    );
    if (!response.ok) await this.fail(response, "POST /api/sync/queue-sector");
  }

  /** `GET /api/sync/stats` — unauthenticated progress information. */
  async stats(): Promise<SyncStatsResponse> {
    const response = await this.request("/api/sync/stats");
    if (!response.ok) await this.fail(response, "GET /api/sync/stats");
    return (await response.json()) as SyncStatsResponse;
  }
}

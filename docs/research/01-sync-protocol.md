# Trilium Notes — Native Sync Protocol (implementation spec)

**Repo:** [`TriliumNext/Trilium`](https://github.com/TriliumNext/Trilium), branch `main`, read 2026-10-04.
`zadam/trilium` now **redirects** to `TriliumNext/Trilium` (same repo) — there is no separate legacy codebase to consult.
All source paths below were read directly from `raw.githubusercontent.com`.

> ⚠️ **Read this first.** The official developer doc
> [`docs/Developer Guide/Developer Guide/Concepts/Synchronisation.md`](https://github.com/TriliumNext/Trilium/blob/main/docs/Developer%20Guide/Developer%20Guide/Concepts/Synchronisation.md)
> is **partly fabricated and materially wrong**. It documents `POST /api/sync/check`, `POST /api/sync/pull`,
> `POST /api/sync/push`, a `sync_status.ts` widget, request bodies with `sourceId`/`maxChangeId`, and a
> `resolveConflict()` function. **None of those exist.** It also cites `apps/server/src/services/entity_changes.ts`
> (now `packages/trilium-core/src/services/entity_changes.ts`) and claims hashes are SHA-256 (they are SHA-1
> for entities). It is a plausible-looking paraphrase, not a spec. Do not build from it. The two sibling
> docs (`Content hashing.md`, `Entity change tombstones.md`) *are* accurate.

---

## 0. Architecture in one paragraph

Sync is **row-level, change-log replication over 8 HTTP endpoints**, not a document/CRUD API. A "sync server" is
just another Trilium instance; there is no dedicated server mode. Every peer holds a **full SQLite clone of the
same schema** (`notes`, `branches`, `attributes`, `revisions`, `attachments`, `blobs`, `options`, `etapi_tokens`)
plus a local `entity_changes` journal. Each write to any entity appends an `entity_changes` row; peers exchange
those rows (with the referenced entity row inline) and apply them **last-write-wins by `utcDateChanged`**.
Authentication is an HMAC handshake that yields a plain session cookie.

Consequence for a mobile client: **you must embed SQLite and replicate the server schema**, not build a
document-oriented model and map onto it. This is the single biggest architectural decision.

---

## 1. Endpoint inventory

Route registration (authoritative, all in one function):
[`packages/trilium-core/src/routes/index.ts#L88-L233`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/routes/index.ts#L88-L233)

| # | Method | Path | Auth | Request | Response |
|---|--------|------|------|---------|----------|
| 1 | `POST` | `/api/login/sync` | none (HMAC body) | `{timestamp, syncVersion, hash}` | `{instanceId, maxEntityChangeId}` + `Set-Cookie: trilium.sid=…` |
| 2 | `GET` | `/api/sync/changed` | session | query `instanceId`, `lastEntityChangeId`, `logMarkerId`, optional `maxBlobContentSize` | `{entityChanges: [{entityChange, entity?}], lastEntityChangeId, outstandingPullCount}` |
| 3 | `PUT` | `/api/sync/update` | session | body `{entities:[{entityChange, entity?}], instanceId}`; headers `pageCount`, `pageIndex`, `requestId` | `204` (empty) |
| 4 | `POST` | `/api/sync/finished` | session | — | `204` |
| 5 | `GET` | `/api/sync/check` | session | — | `{entityHashes: {entityName: {sector: hash}}, maxEntityChangeId}` |
| 6 | `POST` | `/api/sync/check-entity-changes` | session | — | `204` |
| 7 | `POST` | `/api/sync/queue-sector/{entityName}/{sector}` | session | — | `204` |
| 8 | `GET` | `/api/sync/stats` | **none** | — | `{initialized, outstandingPullCount, totalPullCount, lastSyncError?}` |
| 9 | `GET` | `/api/app-info` | session | — | `{appVersion, dbVersion, syncVersion, …}` |
| 10 | `GET` | `/api/setup/sync-seed` | password (`trilium-cred`) | — | `{options:[{name,value}], syncVersion}` |
| 11 | `POST` | `/api/setup/sync-seed` | none (refused if data present) | `{options, syncVersion}` | `204` / `400 {error}` |
| 12 | `GET` | `/api/setup/status` | none | — | `{isInitialized, schemaExists, syncVersion, hasExistingData, …}` |

Admin triggers, all session-authenticated: `POST /api/sync/now` and `/api/sync/test` →
`{success, message?, errorCode?}`; `POST /api/sync/force-full-sync` and `/api/sync/fill-entity-changes` → `204`.

**1–7 are the protocol.** 8–12 plus the triggers are admin/setup conveniences — a client may implement 1–5 only.

### Auth scheme (non-obvious)
- **Not** HTTP Basic, **not** Bearer. `/api/login/sync` verifies an HMAC then sets `req.session.loggedIn = true`
  after `req.session.regenerate()`
  ([`login.ts#L78-L129`](https://github.com/TriliumNext/Trilium/blob/main/apps/server/src/routes/api/login.ts#L78-L129)).
  Every later `/api/sync/*` call is authorized by **replaying the raw `Set-Cookie` value** as a `Cookie` header —
  see the desktop jar in [`request.ts`](https://github.com/TriliumNext/Trilium/blob/main/apps/server/src/services/request.ts)
  (`interface CookieJar { header?: string }`).
- Auth gate `checkApiAuth` → `401` with **plain-text body `Logged in session not found`** (not JSON)
  ([`auth.ts#L155-L176`](https://github.com/TriliumNext/Trilium/blob/main/apps/server/src/services/auth.ts#L155-L176)).
- `GET /api/setup/sync-seed` uses a **custom `trilium-cred` header**: base64 of `user:password`, username
  ignored ([`auth.ts#L248-L277`](https://github.com/TriliumNext/Trilium/blob/main/apps/server/src/services/auth.ts#L248-L277)).
- ⚠️ **Cookie hazard (bug #10548):** sync responses must carry **exactly one** `Set-Cookie`. A reverse-proxy
  affinity cookie makes Electron comma-join the array and destroys `trilium.sid`; regression-tested at
  [`sync-protocol.spec.ts#L124-L142`](https://github.com/TriliumNext/Trilium/blob/main/apps/server/spec/sync/sync-protocol.spec.ts#L124-L142).
  A mobile HTTP stack must handle multiple cookies correctly — this is a *client* fix.

### HTTP-level paging (easy to miss)
`syncRequest()` splits **request bodies** into 1 MB pages and sends `pageCount`/`pageIndex`/`requestId` headers;
the server buffers pages by `requestId` and only parses on the last (20-min GC)
([`sync.ts#L607-L642`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/services/sync.ts#L607-L642),
[`routes/api/sync.ts#L321-L358`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/routes/api/sync.ts#L321-L358)).
A client may always send `pageCount: 1, pageIndex: 0` and omit `requestId` — the Swagger says exactly that —
**but large initial pushes must paginate** or the body exceeds reverse-proxy limits.
`logMarkerId` is a pure log-correlation token; it carries no semantics.

---

## 2. Change-tracking model

### 2.1 The table
[`packages/trilium-core/src/assets/schema.sql#L1-L13`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/assets/schema.sql#L1-L13):

```sql
CREATE TABLE IF NOT EXISTS "entity_changes" (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    entityName TEXT NOT NULL,
    entityId   TEXT NOT NULL,
    hash       TEXT NOT NULL,
    isErased   INT  NOT NULL,
    changeId   TEXT NOT NULL,
    componentId TEXT NOT NULL,
    instanceId TEXT NOT NULL,
    isSynced   INTEGER NOT NULL,
    utcDateChanged TEXT NOT NULL
);
CREATE UNIQUE INDEX IDX_entityChanges_entityName_entityId ON entity_changes(entityName, entityId);
CREATE INDEX IDX_entity_changes_changeId ON entity_changes(changeId);
CREATE INDEX IDX_entity_changes_isSynced_id ON entity_changes(isSynced, id);
```

`id` is `AUTOINCREMENT` — ids are **never reused** (this is relied upon by tombstone cleanup advice).
There is **at most one row per `(entityName, entityId)`** — enforced by the unique index. A change is an
*upsert*, not an append. `id` moves forward on every rewrite (`REPLACE`).

### 2.2 `entityName` values in practice
`notes`, `branches`, `attributes`, `revisions`, `attachments`, `blobs`, `options`, `etapi_tokens`,
and the pseudo-entity `note_reordering`. `note_reordering` is **excluded from content hashes**
([`content_hash.ts#L63`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/services/content_hash.ts#L63)).

### 2.3 Recording a change
`putEntityChange()` — [`entity_changes.ts#L50-L70`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/services/entity_changes.ts#L50-L70):
strips `id`, generates `changeId = randomString(12)` if absent, defaults `componentId` to `"NA"`,
`instanceId` to the process id, coerces `isSynced`/`isErased` to 0/1, then `REPLACE`s.

- `changeId` — random 12-char id, the **global idempotency key** for a change.
- `instanceId` — `randomString(12)`, generated **once per process**
  ([`instance_id.ts`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/services/instance_id.ts)) and lost on restart.
  It is the *echo-suppression* key: see §2.5.
- `isSynced` — `1` on the peer that originated it (it must be pushed), flipped to `0` on the receiver after
  applying (it must **not** be re-pushed). Note the inverted-looking semantics; verify against
  [`sync_update.ts#L104`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/services/sync_update.ts#L104).

### 2.4 "What changed since X" — pull
Server side: [`routes/api/sync.ts#L153-L257`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/routes/api/sync.ts#L153-L257).

```sql
SELECT * FROM entity_changes
WHERE isSynced = 1 AND id > ? ORDER BY id LIMIT 1000
```

Then, per row:
- rows whose `instanceId` equals the **requesting client's** `instanceId` are **filtered out** (`#L202`) —
  the server does not echo your own changes back to you;
- if `isErased` → emit `{entityChange}` with **no** `entity`;
- else read the entity row by primary key and emit `{entityChange, entity}`.

Response accumulates until ~`MAX_PULL_RESPONSE_BYTES = 8 MiB`
([`sync.ts#L697`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/services/sync.ts#L697)).

**Cursor semantics matter.** Two cursors exist:
- `fetchCursor` — advances over *every* row fetched.
- `lastEntityChangeId` (returned to client) — advances only over rows the client can safely skip: records
  actually included, plus batches consisting *entirely* of the client's own changes (`#L204-L207`, `#L218-L227`).
  If the byte budget is hit mid-batch the server **stops without advancing**, so the leftovers are re-served.
  **The client must treat `lastEntityChangeId` as its new `lastSyncedPull` cursor, never the raw max id.**

`outstandingPullCount` is a deliberately index-friendly **estimate** (it drops the `instanceId` filter to keep
the query on `IDX_entity_changes_isSynced_id`, `#L234-L250`). It may over-count mid-sync and converges to 0.

### 2.5 "How a client pushes"
Client side: `pushChanges()` — [`sync.ts#L481-L533`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/services/sync.ts#L481-L533).

```sql
SELECT * FROM entity_changes WHERE isSynced = 1 AND id > :lastSyncedPush LIMIT 1000
```

Rows whose `instanceId` equals the *server's* instance id (learned at login) are skipped and
`lastSyncedPush` is advanced past them. Everything else is sent as `{entities, instanceId}` to
`PUT /api/sync/update`. On success `lastSyncedPush = <last sent entityChange.id>`.

⚠️ The **client** sets `lastSyncedPush` only after a successful HTTP 2xx; the comment at `#L495-L497`
warns it "may set lastSyncedPush beyond what's actually sent (because of size limit)… applied to the database
only if there's no actual update". Preserve that ordering or you will silently drop changes.

Server side: `updateEntities()` — [`sync_update.ts#L17-L50`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/services/sync_update.ts#L17-L50) —
wraps the whole batch in one SQL transaction (`routes/api/sync.ts#L357`), and **dedupes on `changeId`**
(`sync_update.ts#L31`): if a row with that `changeId` already exists locally, the record is skipped. This is
what makes push at-least-once safe.

---

## 3. Handshake / negotiation

### 3.1 Versions
[`packages/trilium-core/src/services/app_info.ts`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/services/app_info.ts):

```ts
const SYNC_VERSION = 40;
const appInfo = { appVersion, dbVersion: getMaxMigrationVersion(), syncVersion: SYNC_VERSION, … };
```

`dbVersion` = highest migration version = `MIGRATIONS[0].version` = **240** today
([`migrations.ts#L6-L16`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/migrations/migrations.ts#L6-L16)).

**`dbVersion` is *not* part of the wire protocol.** It is only advertised via `/api/app-info`; grep finds no
comparison of it anywhere in `trilium-core`. TriliumDroid compares it *client-side* against its own supported
schema list. **Sync-version equality is the only server-enforced negotiation.**

### 3.2 The HMAC login
`doLogin()` — [`sync.ts#L262-L298`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/services/sync.ts#L262-L298):

```
timestamp = UTC "YYYY-MM-DD HH:MM:SS.mmm"   (dateUtils.utcNowDateTime())
hash      = base64( HMAC-SHA256( key = documentSecret ASCII bytes, msg = timestamp ) )
POST /api/login/sync  { timestamp, syncVersion: 40, hash }
```

Server checks, in order ([`login.ts#L78-L128`](https://github.com/TriliumNext/Trilium/blob/main/apps/server/src/routes/api/login.ts#L78-L128)):
1. `|now - timestamp| <= 5 min` → else **401** `"Auth request time is out of sync…"` (clock skew tolerance);
2. `syncVersion === 40` → else **400** `"Non-matching sync versions, local is version 40, remote is N…"`;
3. `constantTimeCompare(hmac(documentSecret, timestamp), hash)` → else **400**
   `"Sync login credentials are incorrect. It looks like you're trying to sync two different initialized documents…"`.

Then it **regenerates the session** (anti-fixation) and returns `{instanceId, maxEntityChangeId}` where
`maxEntityChangeId = SELECT COALESCE(MAX(id),0) FROM entity_changes WHERE isSynced = 1`.

`hash` is base64 HMAC-SHA256 and the key is the **ASCII** (not UTF-8) bytes of `documentSecret` —
[`apps/server/src/crypto_provider.ts#L30-L34`](https://github.com/TriliumNext/Trilium/blob/main/apps/server/src/crypto_provider.ts#L30-L34).

**After login the client also self-heals its cursor** (`#L287-L295`): if `lastSyncedPull > resp.maxEntityChangeId`
it lowers it. This is the "user copied the document directory to a new device" path.

### 3.3 Bootstrapping a brand-new client (first sync)
Before login, `login()` checks whether the server even has a schema:
`GET /api/setup/status` → `{schemaExists, syncVersion}`; mismatch throws the same version error
([`services/setup.ts#L14-L24`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/services/setup.ts#L14-L24)).

If the server is fresh (no schema), the **client pushes its seed**:
`POST /api/setup/sync-seed { options: [documentId, documentSecret], syncVersion }`, then resets
`lastSyncedPush = lastSyncedPull = 0` ([`setup.ts#L41-L53`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/services/setup.ts#L41-L53)).

If the *client* is fresh (the normal mobile case), it pulls the seed instead:
`GET /api/setup/sync-seed` with the `trilium-cred` password header → `{options, syncVersion}`, checks
`syncVersion`, then builds its schema from `resp.options` and runs a full pull
([`setup.ts#L70-L121`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/services/setup.ts#L70-L121)).

### 3.4 Mismatch behaviour, summarised
| Mismatch | Where caught | Result |
|---|---|---|
| `syncVersion` | `/api/login/sync`, `/api/setup/status`, `POST /api/setup/sync-seed` | hard `400`; sync refuses. No negotiation, no capability flags. |
| `dbVersion` | **nowhere on the server** | not enforced; a client that cares must check `/api/app-info` itself. |
| `documentSecret` | HMAC compare | `400` "…two different initialized documents…" |
| clock skew > 5 min | timestamp window | `401` |
| same instance id both sides | client-side check `#L279-L283` | throws "misconfigured to sync with itself" |

---

## 4. What a client MUST persist locally

1. **The full server SQLite schema** (`schema.sql`). Sync writes raw rows (`REPLACE INTO <entityName>`), so the
   tables must exist with matching columns. Minimum set for a correct client:
   `notes, branches, attributes, revisions, attachments, blobs, options, etapi_tokens, entity_changes`,
   plus the indexes on `entity_changes`.
2. **`entity_changes` journal**, including rows *you* create locally with `isSynced = 1` and your own
   `instanceId`, `changeId`, `hash`, `utcDateChanged`.
3. **Options** (the `options` table is itself a synced entity, but a handful are local-only):
   | option | meaning |
   |---|---|
   | `documentId`, `documentSecret` | identity + HMAC key; from the sync seed |
   | `lastSyncedPull` | pull cursor = last `lastEntityChangeId` from the server |
   | `lastSyncedPush` | push cursor = last successfully pushed local `entity_changes.id` |
   | `syncServerHost`, `syncProxy`, `syncServerTimeout` | transport config (seconds in DB, ms in `config.ini`) |
   | `syncMaxBlobContentSize` | bytes; blob content above this is pulled as an empty stub (mobile only) |
   | `instanceId` | **your** 12-char per-install (ideally per-process) id |
   | `initialized`, `syncIncomplete` | lifecycle flags |
4. **A hash implementation that matches byte-for-byte.** See §4.1.
5. **A local blob store** and the `blobs` table.

### 4.1 Entity hashes — the exact recipe
`AbstractBeccaEntity.generateHash()` — [`abstract_becca_entity.ts#L63-L76`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/becca/entities/abstract_becca_entity.ts#L63-L76):

```ts
let contentToHash = "";
for (const propertyName of hashedProperties) contentToHash += `|${this[propertyName]}`;
if (isDeleted) contentToHash += "|deleted";
return hash(contentToHash).substr(0, 10);
```

`hash()` = **SHA-1 → base64** (`utils/index.ts#L27-L29`), *not* SHA-256, and **truncated to 10 chars**.
`undefined`/`null` properties stringify to `"undefined"`/`"null"` — you must reproduce that, not emit `""`.

`hashedProperties` per entity (exact, in order):

| entity | properties |
|---|---|
| `notes` | `noteId, title, isProtected, type, mime, blobId` |
| `branches` | `branchId, noteId, parentNoteId, prefix` |
| `attributes` | `attributeId, noteId, type, name, value, isInheritable` |
| `revisions` | `revisionId, noteId, title, description, source, isProtected, dateLastEdited, dateCreated, utcDateLastEdited, utcDateCreated, utcDateModified, blobId` |
| `attachments` | `attachmentId, ownerId, role, mime, title, blobId, utcDateScheduledForErasureSince` |
| `blobs` | `blobId, content` — **but overridden**, see below |
| `options` | `name, value` |

`blobs` does **not** use `generateHash`. It uses
[`blob.ts#L176-L179`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/services/blob.ts#L176-L179):

```ts
hash(`${blobId}|${content.toString()}${textRepresentation ? "|" + textRepresentation : ""}`)
```

— un-prefixed, **not** truncated, computed over the **stored (encrypted) `content`**, and including
`textRepresentation` (OCR text) only when non-empty.

`note_reordering` rows carry `hash: "N/A"` (`entity_changes.ts#L104`).

### 4.2 Conflict resolution — the real rule
`updateNormalEntity()` — [`sync_update.ts#L77-L116`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/services/sync_update.ts#L77-L116).
This is *the* conflict algorithm and it is **not** plain last-write-wins:

```ts
localECIsOlderOrSameAsRemote =
    localEC.utcDateChanged <= remoteEC.utcDateChanged;   // string compare of UTC datetimes

if (!localEC || localECIsOlderOrSameAsRemote) {
    if (remoteEC.isErased) eraseEntity(remoteEC);
    else getSql().replace(remoteEC.entityName, remoteEntityRow);
    if (!localEC || localECIsOlderOrSameAsRemote || localEC.hash !== remoteEC.hash || localEC.isErased !== remoteEC.isErased)
        putEntityChangeWithInstanceId(remoteEC, instanceId);   // record, stamped with the *server's* instanceId
    return true;
} else if (localEC.hash !== remoteEC.hash && !localECIsOlderOrSameAsRemote) {
    putEntityChangeForOtherInstances(localEC);                  // we are newer → bounce our version back
    return false;
}
```

Key points:
- **Ties go to the remote** (`<=`). With millisecond UTC timestamps this is the documented tie-break.
- The comparison is on **`entity_changes.utcDateChanged`**, i.e. *the time the change was recorded*, not
  `notes.utcDateModified`. They usually agree but are separate columns.
- If local is **newer** but hashes differ, the record is **not** applied and the local change is re-stamped for
  other instances (`putEntityChangeForOtherInstances`, `entity_changes.ts#L118-L124`) so it gets pushed back.
  **A client that simply discards "loser" remote rows without this bounce will diverge permanently.**
- `note_reordering` bypasses all of this: it is applied unconditionally
  (`sync_update.ts#L178-L190`) as a `UPDATE branches SET notePosition = ? WHERE branchId = ?` per map entry.

### 4.3 Erase / tombstones
- Deletion is a tombstone: `erase#setEntityChangesAsErased` sets `isErased = 1`, refreshes `utcDateChanged`
  and re-pushes via `putEntityChangeWithForcedChange` (`changeId: null` → new id).
- Erased rows are carried in the pull stream with **no `entity`**; the receiver does `DELETE FROM <table>`.
- `eraseEntity` hard-deletes only these tables: `notes, branches, attributes, revisions, attachments, blobs`
  (`sync_update.ts#L196`); anything else logs "Cannot erase".
- **Tombstones are never garbage-collected.** They are folded into the content hash
  (`hash + isErased`), so deleting them locally desynchronises you from every peer. A fresh client replays
  *all history*, tombstones included. Blobs are the sole exception: they are purged outright, never tombstoned.
  Full analysis: [`Entity change tombstones.md`](https://github.com/TriliumNext/Trilium/blob/main/docs/Developer%20Guide/Developer%20Guide/Concepts/Synchronisation/Entity%20change%20tombstones.md).

### 4.4 The content-hash cross-check (and why you must implement it)
`checkContentHash()` — [`sync.ts#L548-L605`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/services/sync.ts#L548-L605).
At the *end* of every sync round the client does `GET /api/sync/check` and compares per-sector hashes.

Server computation — [`content_hash.ts#L35-L95`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/services/content_hash.ts#L35-L95):
```sql
SELECT entityName, entityId, hash, isErased FROM entity_changes
WHERE isSynced = 1 AND entityName != 'note_reordering'
```
→ sort by `entityId` alphabetically → group by `entityName`, then by `sector = entityId[0]`
(the first character of the entity id) → concatenate `hash + isErased` per sector (no separator) →
`utils.hash()` (SHA-1 base64) per sector.

On mismatch the client re-queues the sector on both sides and loops, up to
`MAX_SECTOR_RESYNC_ATTEMPTS = 3`, then gives up with `CONTENT_HASH_MISMATCH`
([`sync.ts#L45`, `#L223-L241`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/services/sync.ts#L45)).
**If your hash formula is off by one byte, sync will "work" and then loop forever.** This is the #1
implementation risk.

---

## 5. Blob / content transfer

**Content is not fetched out-of-band during sync — `blobs` is just another synced entity.** A blob travels
inside the pull response as `{entityChange: {entityName:"blobs", entityId: <blobId>}, entity: {blobId, content, textRepresentation, dateModified, utcDateModified}}`
with `content` **base64-encoded** (server encodes: `getEntityChangeRow()` → `binary_utils.encodeBase64`,
[`sync.ts#L663-L681`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/services/sync.ts#L663-L681));
the receiver base64-decodes (`preProcessContent`, `sync_update.ts#L118-L133`). The client is responsible for
fetching blobs referenced by pulled notes **that it did not receive** (e.g. because of the size cap).

### 5.1 Content addressing
`blobId = hashedBlobId(content)` — [`utils/index.ts#L61-L74`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/services/utils/index.ts#L61-L74):
`base64(SHA-512(content))`, then `+`→`X`, `/`→`Y`, then `substr(0, 20)`.

For **protected** entities, the hash input is *not* the raw content: `getUnencryptedContentForHashCalculation`
prepends the sentinel `t$[nvQg7q)&_ENCRYPTED_?M:Bf&j3jr_`
([`abstract_becca_entity.ts#L216-L228`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/becca/entities/abstract_becca_entity.ts#L216-L228)),
while the stored/transmitted `content` is AES-128-CBC ciphertext. Net effect: `blobId` is derived from the
**plaintext+prefix** but the **entity hash** (§4.1) is derived from the **ciphertext**. Blobs are therefore
never shared between a protected and an unprotected entity. Protected content syncs as ciphertext; the server
never needs the password.

### 5.2 Size limits
- Per-blob hard cap `MAX_BLOB_CONTENT_LENGTH` ≈ **391,643,136 bytes (~373 MiB)**, derived from V8's max string
  length vs the 500 MB HTTP body limit
  ([`abstract_becca_entity.ts#L360-L380`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/becca/entities/abstract_becca_entity.ts#L360-L380)).
  Content above it cannot be synced at all and is rejected at write time.
- **Mobile opt-in stub:** sending `maxBlobContentSize` on `/api/sync/changed` makes the server replace
  oversized blob `content` with `""` — **but leaves `entityChange.hash` untouched**, so content-hash checks
  still pass. This is the intended mobile behaviour; the client then shows an "open on server" placeholder
  and detects it via `contentLength === 0 && blobId !== EMPTY_BLOB_ID`
  ([`blob.ts#L22-L32`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/services/blob.ts#L22-L32)).
  The bundled web/Capacitor client pairs this with a 4 MiB pull batch instead of the desktop 32 MiB
  ([`sync.ts#L451-L460`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/services/sync.ts#L451-L460)).
  **A HarmonyOS client should adopt the same `syncMaxBlobContentSize` pattern** — it is explicitly designed
  for memory-capped runtimes.

### 5.3 On-demand / out-of-band endpoints (not sync, but useful)
For lazily fetching content the sync stream withheld, all returning the blob POJO
`{blobId, content, contentLength, dateModified, utcDateModified, textRepresentation, isStubbed}`:
`GET /api/notes/{noteId}/blob`, `GET /api/attachments/{attachmentId}/blob`,
`GET /api/revisions/{revisionId}/blob`, `GET /api/deleted-notes/{noteId}/blob` (soft-deleted notes), and
`GET /api/notes/{noteId}/open` | `/download` | `/open-partial` (raw bytes, byte-range capable).
Registration: [`routes/index.ts#L102`, `#L127`, `#L144`, `#L331`, `#L334-L346`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/routes/index.ts#L102).
`/api/notes/{noteId}/blob` returns **decrypted** content only if a protected session is available; otherwise
`content: ""` (`blob.ts#L90-L111`).

---

## 6. Effort estimate

Assumes: one strong mobile engineer, an embedded SQLite (HarmonyOS RDB / SQLite, Android Room+SQLCipher,
iOS SQLite.swift), existing HTTP + JSON + base64 + SHA primitives, **no UI work**, and a real Trilium server
to test against.

| Phase | Work | Estimate |
|---|---|---|
| A | Schema replication, entity models, hash functions (SHA-1/512/SHA-256-HMAC), blob store | 1–1.5 wk |
| B | Login handshake, cookie handling, paging, `/api/sync/changed` + `/api/sync/update` loops, cursors | 1.5–2 wk |
| C | Conflict/LWW/bounce-back, erase + tombstones, `note_reordering`, `options` filtering | 1.5–2 wk |
| D | Content-hash sector check + re-queue/retry loop, error taxonomy, backoff | 1 wk |
| E | Initial full sync against a large real database; incremental correctness; crash/restart resume | 2–3 wk |
| F | Hardening: proxy quirks, partial failures, timeouts, protected notes, memory caps | 2–3 wk |
| **Total** | engine only | **≈ 9–12 weeks** |
| | production-correct incl. test matrix | **≈ 3–4 months** |

Do **not** budget "a couple of weeks". The protocol surface is small (~8 endpoints) but the *equivalence
surface* is large: your hashes, blob ids, timestamps and erase semantics must match a running server exactly,
and failures present as silent divergence or infinite retry loops rather than errors.

### Top 5 things most likely to be gotten wrong

1. **Entity hash formula.** `"|"`-joined `hashedProperties` in the **exact declared order**, `null`/`undefined`
   rendered as JS `String()`, SHA-1 → base64 → **first 10 chars**; and `blobs` overriding this entirely with
   `hash(blobId + "|" + storedContent [+ "|" + textRepresentation])`. Off by anything ⇒ the
   `/api/sync/check` loop never converges (`CONTENT_HASH_MISMATCH` after 3 rounds).
2. **Echo suppression via `instanceId`.** The server drops changes stamped with *your* `instanceId`; the client
   drops changes stamped with the *server's*. Persist your `instanceId`; if you regenerate it per request you
   will receive your own changes back and ping-pong forever. Conversely, if you forget to skip the server's
   changes on push, you re-upload the whole database every cycle.
3. **`lastSyncedPush` / `lastSyncedPull` cursor discipline.** Advance `lastSyncedPush` only after a 2xx and
   only to the last *record actually sent* (the reference implementation's comment at
   [`sync.ts#L495-L497`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/services/sync.ts#L495-L497)
   flags exactly this trap). For pulls, use the returned `lastEntityChangeId`, **not** your requested id and
   **not** `maxEntityChangeId` — the server deliberately withholds advancement past unserved rows.
4. **The bounce-back half of conflict resolution.** "Remote newer wins" is only half the algorithm. When your
   local change is *newer* and the hashes differ, you must re-stamp it for other instances
   (`putEntityChangeForOtherInstances`) and let it push, or your edit is silently and permanently lost.
   Also: ties (`<=`) go to the **remote**, and the compared field is `entity_changes.utcDateChanged`, not
   `notes.utcDateModified`.
5. **Erase semantics and the tombstone/hash coupling.** `isErased` rows arrive with **no `entity`** and mean
   hard `DELETE` on a fixed table list; soft-deleted rows (`isDeleted = 1`) instead arrive as ordinary rows.
   `isErased` is folded into the content hash, so pruning tombstones locally desynchronises you from every
   peer. Treat `blobs` as the documented exception (purged, never tombstoned).

*(Runners-up: `note_reordering`'s `entityId = parentNoteId` / `entity = {branchId: notePosition}` shape and
`"N/A"` hash; `options` rows with `isSynced = 0` that must never be pushed; the 5-minute login clock window;
blob `content` being base64 in one direction and raw bytes in the other.)*

---

## 7. Documentation status and prior art

### Official documentation
There is **no normative protocol spec.** The best available "official" description is the Swagger/JSDoc block
above `getChanged`/`update` in
[`packages/trilium-core/src/routes/api/sync.ts#L95-L320`](https://github.com/TriliumNext/Trilium/blob/main/packages/trilium-core/src/routes/api/sync.ts#L95-L320),
which is accurate but incomplete (it documents only `/changed` and `/update`). The Sphinx developer docs are
at [`docs/Developer Guide/Developer Guide/Concepts/Synchronisation/`](https://github.com/TriliumNext/Trilium/tree/main/docs/Developer%20Guide/Developer%20Guide/Concepts/Synchronisation)
— two of the three files are good, the index file is unreliable (see the warning at the top).

### Third-party clients

| Project | Lang | Verdict |
|---|---|---|
| [`FliegendeWurst/TriliumDroid`](https://github.com/FliegendeWurst/TriliumDroid) | Kotlin | ⭐ **The reference to port.** 403★, pushed 2026-10-01. |
| [`Nriver/pocket-trilium`](https://github.com/Nriver/pocket-trilium) | Dart | ❌ Not usable. It is a **WebView/terminal wrapper** (`lib/fullScreenWebPage.dart`, `lib/terminalPage.dart`), not a native protocol implementation. |
| `zadam/trilium` | — | Redirects to `TriliumNext/Trilium`. |

**TriliumDroid files that implement sync** (base: `app/src/main/kotlin/eu/fliegendewurst/triliumdroid/`):
- `sync/Sync.kt` (351 lines) — the whole engine. `syncPush()` (L29–108), `fetchEntity()` (L113–171),
  `syncStart()` (L173–198), `sync()` pull loop (L200–332), `primaryKeyForTable()` (L334–350).
  Directly shows the `{entityChange, entity}` envelope, the base64 `content` handling in both directions, the
  `entity == null ⇒ DELETE` tombstone rule, `note_reordering` handling, the `changeId` dedupe check, and
  recursion on `outstandingPullCount > 0`.
- `sync/ConnectionUtil.kt` (≈15 KB) — transport. `calculateHMAC()` (L327–334) is the base64 HMAC-SHA256 login;
  `fetch("/api/setup/sync-seed")` (L91) is the first-time bootstrap; the `trilium-cred` header at L287–288;
  `/api/app-info` version check at L483–496. Defines `CookieJar`.
- `sync/MismatchedDatabaseException.kt`, `sync/IncorrectPasswordException.kt`,
  `sync/SyncResponseTooBigException.kt` — the error taxonomy worth copying.
- `app/src/androidTest/kotlin/.../InitialSyncTest.kt` — an initial-sync integration test.
- `database/Cache.kt` → `Versions.SUPPORTED_SYNC_VERSIONS` / `SUPPORTED_DATABASE_VERSIONS` — the
  client-side dbVersion gate the server does not do.

Notable TriliumDroid quirks: it hardcodes the `lastSyncedPush`/`lastSyncedPull` options rows, uses a fixed
`logMarkerId = "trilium-droid"`, **skips `/api/sync/check` verification entirely**, and reads `lastSyncedPull`
as a float defensively (L213–216, "the user may have imported a TriliumNext database where this is a float") —
a genuine cross-implementation hazard worth preserving.

**Recommended approach:** port `Sync.kt` + `ConnectionUtil.kt` as a *starting point*, but add the
`/api/sync/check` verification loop (§4.4) and the bounce-back conflict path (§4.2) that TriliumDroid omits —
without them a client can diverge silently.

---

*Every claim above is taken from the `main`-branch sources at the cited paths. The only explicitly inferred
items are: (a) that `syncVersion` equality with no negotiation means a client is pinned to one server release
line — inferred from the absence of any capability/version-range handling anywhere in the code; and (b) the
phase-by-phase effort table, which is an engineering estimate, not a repo fact.*

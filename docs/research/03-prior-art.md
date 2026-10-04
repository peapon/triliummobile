# Prior Art: Existing Third-Party Trilium Mobile Clients

Research date 2026-10-04. Everything below was verified against live source via `raw.githubusercontent.com`
and metadata/issues via the GitHub API. Unverifiable claims are marked **not verified**.

Repos dissected: `FliegendeWurst/TriliumDroid` (Kotlin, 403★, `master`),
`Nriver/pocket-trilium` (Dart/Flutter, 142★, `main`),
`TriliumNext/Trilium` → `apps/mobile` (TypeScript/Capacitor, 38,196★, `main`).

---

## Comparison table

| | **TriliumDroid** | **Pocket Trilium** | **TriliumNext `apps/mobile`** |
|---|---|---|---|
| **Platform** | Android native (Kotlin) | Android only (Flutter + proot Linux container) | Android + iOS (Capacitor) |
| **Local storage** | **Trilium's own SQLite schema verbatim** — `Document.db` with `notes`/`branches`/`attributes`/`blobs`/`entity_changes`/`options`, DDL copied from Trilium | **Real Trilium `document.db`** inside a proot rootfs, written by the actual Trilium Node process; Flutter stores nothing note-related | **Real `document.db` bytes in OPFS** via `@sqlite.org/sqlite-wasm` SAHPool VFS, in a worker |
| **Reuses Trilium DB format?** | Yes — same `syncVersion`/`dbVersion` gates | Yes — it *is* Trilium | Yes — it *is* Trilium's engine |
| **Sync mechanism** | **Reimplements Trilium sync in Kotlin**: `GET /api/sync/changed`, `PUT /api/sync/update`, `POST /api/login/sync`. **No** content-hash check | **None of its own** — the bundled Trilium server does the real sync; app hosts it and shows the WebView | Runs the real sync client (`packages/trilium-core/src/services/sync.ts`) in WASM; HTTP egress via a native bridge |
| **Conflict resolution** | None bespoke: server-ordered `entity_changes` + `CONFLICT_REPLACE`; deletion = drop the row when `entity == null` | Trilium's own (last-write-wins + tombstones + content-hash verify) | Trilium's own |
| **Attachments/blobs** | Yes — `blobs` is a synced entity, `content` base64-decoded to a BLOB. Notes/attachments >10 MB can't sync and must be side-loaded | Yes — handled by real Trilium | Yes, but **capped on mobile** via `MOBILE_SYNC_MAX_BLOB_CONTENT_SIZE` so large blobs don't blow the WASM heap |
| **Editor** | **Trilium's real web frontend in a WebView** (`web.zip` + `ckeditor.js`), bridged to Kotlin via `@JavascriptInterface` | Real Trilium web UI in `flutter_inappwebview` at `http://127.0.0.1:<port>` | Real Trilium client incl. **CKEditor 5 / CodeMirror** (`@triliumnext/ckeditor5`, `@triliumnext/codemirror`) |
| **Login/setup UX** | Native form: server URL + Trilium password (+ optional HTTP Basic, mTLS cert, SSID lock). Uses the **sync password**, not an ETAPI token | **No server login in the app.** First run = pick a Trilium version + install a rootfs (5–10 min), then do Trilium's own login/sync inside the WebView | Wizard: "Connect to an existing server" → server address + password + optional proxy |
| **TOTP / 2FA** | **Not supported** (issues #97, #63) | Inherits Trilium's — which also ignores TOTP for sync logins | Same limitation; upstream #10014 / #8920 / #8272 |
| **License** | **AGPL-3.0** | **AGPL-3.0** (+ redistributes AGPL Trilium binaries) | **AGPL-3.0** |
| **Maturity** | Most mature native client; active (last push 2026-10-01); 48 open issues; chronic OOM on large DBs | Works but fragile: proot stack, documented `double free or corruption`, Android 12+ child-process limits | Official, but newest; a shell over `@triliumnext/standalone` |

---

## 1. FliegendeWurst/TriliumDroid

Kotlin, **AGPL-3.0**, 403★ / 29 forks, 48 open issues, created 2024-01-09.

### 1.1 Architecture — it clones Trilium's database format outright

It does **not** invent a schema. It ships a copy of Trilium's SQLite DDL at
`app/src/main/res/raw/schema.sql`, including tables that only make sense for the real engine:

```sql
CREATE TABLE IF NOT EXISTS "entity_changes" (
    `id` INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    `entityName` TEXT NOT NULL, `entityId` TEXT NOT NULL, `hash` TEXT NOT NULL,
    `isErased` INT NOT NULL, `changeId` TEXT NOT NULL, `componentId` TEXT NOT NULL,
    `instanceId` TEXT NOT NULL, `isSynced` INTEGER NOT NULL, `utcDateChanged` TEXT NOT NULL );
CREATE TABLE IF NOT EXISTS "blobs" ( `blobId` TEXT NOT NULL, `content` TEXT NULL DEFAULT NULL, …
```

It also carries `etapi_tokens`, `sessions`, `user_data`, `recent_notes`, `revisions` and Trilium's own
indexes (`IDX_entity_changes_isSynced_id`, `IDX_branches_parentNoteId_isDeleted_notePosition`, …).
Access is raw Android SQLite from `database/DB.kt` — **no Room, no ORM**. The DB lives at
`databases/Document.db` (capital `D` — Trilium's filename) and is exported verbatim:

```kotlin
// activity/SetupActivity.kt
val db = File(filesDir.parent, "databases/Document.db")
db.inputStream().copyTo(out)
```

Version compatibility is gated before any sync (`sync/Sync.kt`):

```kotlin
if (Versions.SUPPORTED_SYNC_VERSIONS.contains(it.syncVersion) &&
    Versions.SUPPORTED_DATABASE_VERSIONS.contains(it.dbVersion)) { … }
else { callbackError(Exception("mismatched sync / database version")) }
```

### 1.2 Sync — a genuine reimplementation of Trilium's protocol

`sync/Sync.kt` (351 lines) implements the same push/pull loop against the same endpoints. **This is
the most reusable artifact in the survey.**

**Push** (`syncPush()`), keyed off the shared `options` table exactly like upstream:

```kotlin
// Sync.kt:41
val changesUri = "/api/sync/update?logMarkerId=$logMarkerId"
// :48 — only rows this device marked for push, after the last pushed id
"SELECT * FROM entity_changes WHERE isSynced = 1 AND id > ?"
// :~57 — skip other instances' rows
val instanceIdSaved = it.getString(7); if (instanceIdSaved != instanceId) { continue }
// advance the watermark, same option keys as Trilium
"INSERT OR REPLACE INTO options (name, value, isSynced, utcDateModified) VALUES (?, ?, 0, ?)",
    arrayOf("lastSyncedPush", largestId.toString(), utc)
```

**Pull** (`sync()`), reading the same `lastSyncedPull` option:

```kotlin
// Sync.kt:220
"/api/sync/changed?instanceId=${Preferences.instanceId()}&lastEntityChangeId=${lastSyncedPull}&logMarkerId=$logMarkerId"
```

Details a new client must copy:

- **Deletion** = "server says it's gone, drop the row" (no tombstone bookkeeping of its own):
  ```kotlin
  if (entity == null) {
      val primaryKey = primaryKeyForTable(entityName)
      DB.delete(entityName, "$primaryKey = ?", arrayOf(entityChange.getString("entityId")))  // ~:246
      continue
  }
  ```
- **Idempotency by `changeId`**: `SELECT 1 FROM entity_changes WHERE changeId = ?` → skip if present.
- **Conflicts = blind replace** (`Sync.kt:~270`):
  `insertWithOnConflict(entityName, null, cv, SQLiteDatabase.CONFLICT_REPLACE)`. No merge UI, no
  per-entity reconciliation — it relies on server-side ordering.
- **`note_reordering`** pseudo-entity handled specially → writes `branches.notePosition`.
- **Blobs inline**: `content` arrives base64; decoded into `ByteArray` before insert.
- **Pagination** driven by `outstandingPullCount`, recursing until zero.
- Failures are typed: `sync/SyncResponseTooBigException.kt`, `MismatchedDatabaseException.kt`,
  `IncorrectPasswordException.kt`, surfaced by `fragment/SyncErrorFragment.kt`.
- **Read-only mode is sync-compatible** — both push and pull use `DB.internalGetDatabase()` with
  comments *"read-only mode: sync must still work"*.

> It does **not** implement the content-hash verification loop (`/api/sync/check`,
> `/api/sync/queue-sector`). Push/pull is the older `isSynced`-flag protocol. That divergence plus
> blind replace is the likely root of issue #106. See §5.3.

### 1.3 Editing — Trilium's real frontend, bridged to Kotlin

- `app/src/main/assets/ckeditor.js` — a full CKEditor 5 bundle (opens
  `!function(t){const e=t.en=t.en||{};e.dictionary=Object.assign(…` with Trilium's Admonition plugin).
- `app/src/main/assets/web.zip` — the rest of the frontend, harvested from `esm.sh` CDN requests by
  hand: `app/src/web/setup.sh` says to grep `intercept: esm.sh` lines out of logcat, `curl` each into a
  file, then `7zz a -mm=Deflate … web.zip https*` — after temporarily removing the esm.sh request
  blocker in `NoteFragment` so Excalidraw notes can fetch their CDN modules.
- `fragment/note/NoteWebViewClient.kt` intercepts requests and resolves internal links by parsing the
  WebView URL and navigating natively.
- `FrontendBackendApi.kt` (717 lines) is the `@JavascriptInterface` bridge emulating Trilium's script
  API. Its own header admits the gaps (`TODO: - create fake objects for CKEditor / CodeMirror
  instances`) and it returns `null /* no CKEditor here */` (line 438). **Scripting-API compatibility is
  partial** — hence open issue #70 "Scripting API + documentation".

So note content is Trilium HTML edited by real CKEditor in a WebView; the host is native Kotlin.
Non-text note types (canvas, mermaid, geomap) are where this struggles (#112, #90, #167).

### 1.4 Login/setup UX — server URL + Trilium password, no token

`app/src/main/res/values/strings.xml`:

```xml
<string name="server_label">Server instance address (host + port)</string>
<string name="password_placeholder">Trilium password</string>
<string name="text_first_time_user">If this is your first time using Trilium Notes, you must first use the desktop app and set up a sync server. (This requirement will be lifted in a future update.)</string>
<string name="text_existing_database">… if your database contains very large notes or attachments (>10 megabytes), you must copy and import the database manually, due to technical constraints.</string>
<string name="status_login_fail">Login failed (check password)</string>
```

`dialog/ConfigureSyncDialog.kt` shows four fields plus three optional mechanisms — the richest
"point at my server" UX of the three:

```kotlin
.setTitle(R.string.settings_sync_server_header).setView(R.layout.dialog_configure_sync)
done(server!!.text.toString(), password!!.text.toString(),
     basicAuthUser!!.text.toString(), basicAuthPassword!!.text.toString())
```

plus **mTLS client certs** via Android `KeyChain.choosePrivateKeyAlias(…)` and a **"Limit
synchronization to network" SSID lock** (`Preferences.setSyncSSID`, `GetSSID`). Credentials go out as
a Base64 Basic-style header, **not** an ETAPI token:

```kotlin
// ConnectionUtil.kt:288
reqBuilder.addHeader("trilium-cred", Base64.encode("user:$password".encodeToByteArray()))
```

Sync login uses the document-secret HMAC:

```kotlin
// ConnectionUtil.kt:327
private fun calculateHMAC(documentSecret: String, timestamp: String): String {
    val hMacSHA256 = Mac.getInstance("HmacSHA256")
    … Base64.encode(hMacSHA256.doFinal(timestamp.toByteArray()))
}
// ~:355
val hash = calculateHMAC(Preferences.documentSecret()!!, utc)
val jsonObject = JSONObject().put("timestamp", utc).put("hash", hash).put("syncVersion", syncVersion)
// :366
.url("$server/api/login/sync")
```

There is **no TOTP field anywhere** — matching two open enhancement requests.

### 1.5 What they got wrong / open issues (48 open)

**Memory / large-database failures (dominant theme):** **#3 "Sync fails with OutOfMemory error for
large database"** (6 comments, `bug`, `help wanted`, open since 2024-12-08, unresolved);
**#29 "Crash when trying to add note after initial sync failed due to OOM"**;
**#104 "Better error message for OOM in sync"** (common enough to deserve its own error type);
**#55 "Crash due to null instanceId"**; **#9 "Investigate leak warning"**;
**#87 "Empty notes show as having old data"** (15 comments — the most-discussed issue).

**Sync correctness:** **#119 "Stuck in 'outstanding…' while synchronizing with the server and causing a
large number of requests to the server"** (the `outstandingPullCount` recursion can fail to converge);
**#106 "Sync overwirte notes in TriliumDroid"** (the concrete cost of no conflict resolution);
**#52 "Empty Trilium Password sync setup"**.

**Missing features:** **#12 "Hidden notes: hide by default"** (6 comments),
**#18 "Undeleting notes + erasing deleted notes"**, **#13 "Full-text search"**, **#27 "Note
versioning"**, **#20 "Tablet layout"**, **#71 "Included notes"**, **#80 "View book notes properly"**,
**#112 "Mermaid rendering"** (`good first issue`), **#90 "GPX tracks in geomaps"**, **#33/#34**
relation & mind maps, **#102 "Folders dont work really"**, **#101 "Suggestions for the note tree"**.
**#126 "App design – final look or draft version?"** — the UI is explicitly not finished.

**Auth & platform:** **#97 "MFA authentication (OpenID / TOTP)"**, **#63 "TOTP authentication
support"**; **#74 "Encrypted local database"** (`help wanted` — the DB is plaintext SQLite);
**#75 "Standalone operation without sync server"** (cannot be used without a server today);
**#72 "Android 6.0 support"**, **#73 "Inclusion in F-Droid"**, **#123 "accept certificates signed by a
root CA trusted by system"**; **#129 "After switching the phone screen orientation, the previously
opened content closes and resets to the home screen."**; **#98 "Crash when protected? note title is
empty"** and **#53 "Note title does not decrypt successfully"** (protected notes are shaky).

---

## 2. Nriver/pocket-trilium

Dart/Flutter + Java/Kotlin, **AGPL-3.0**, 142★ / 6 forks, 8 open + 21 closed issues, created
2026-01-08. On Google Play as `nriver.pocket.trilium`.

### 2.1 Architecture — it ships a Linux distro and runs real Trilium in it

This is a **proot container**, not a Trilium client. README: *"Run full-featured Trilium on Android"*,
*"inspired by and heavily modified from the Cateners/tiny_computer project"*. From
`lib/constants/defaults.dart:287`:

```
$DATA_DIR/bin/proot -H --change-id=1000:1000 --pwd=/home/pocket --rootfs=$CONTAINER_DIR \
  --mount=/system --mount=/apex --mount=/sys --mount=/data --kill-on-exit --mount=/storage \
  --sysvipc -L --link2symlink --mount=/proc --mount=/dev … /bin/bash -l
```

The startup command (`defaults.dart:134`) runs the *actual* Trilium server:

```sh
export TRILIUM_PORT=8080
rm -f /home/pocket/.trilium_port
cd /home/pocket/trilium
if [ -d "/home/pocket/trilium-data" ] && [ -w "/home/pocket/trilium-data" ]; then
    export TRILIUM_DATA_DIR="/home/pocket/trilium-data"
else
    export TRILIUM_DATA_DIR="/home/pocket/.local/share/trilium-data"
fi
echo "$TRILIUM_PORT" > /home/pocket/.trilium_port
export LD_PRELOAD=/usr/lib/aarch64-linux-gnu/libjemalloc.so.2
```

**Local storage is literally `trilium-data`** under `/home/pocket/` inside the container. The README
tells users to copy `trilium-data` from a desktop into `/0/home/pocket/` via the system file manager.
There is no SQLite/Room/Hive in the Flutter layer; only `shared_preferences` and the container dir.
It reuses Trilium by *executing* it, shipping prebuilt tarballs per version (`defaults.dart:11`)
rather than source: 0.105.0, 0.104.1, 0.104.0, 0.103.0, 0.102.2, 0.102.1, 0.102.0, 0.101.3, plus a
recompiled 0.63.7.

### 2.2 Sync — delegated entirely to the bundled Trilium

There is **no sync code in the Dart layer**. Sync is configured inside the WebView, as on desktop.
README: *"[x] Sync data with Trilium Server"*, *"You can setup the sync like other Trilium client
do."* Consequences, confirmed by closed issues:

- **#20 "Issue: Sync Protocol Mismatch (Local 36 vs. Remote 39) with Trilium 0.103.0"** — the bundled
  binary's sync version must match the server's, hence the version picker and hard walls on upgrade.
- **#3 "Unable to sync from server"**, **#6 "Show sync status"** (a whole feature request because the
  app surfaces nothing), **#5 "…expired & self signed certificate"**, **#24 "…needs support for
  version 0.104.0"**, **#16 "Needs support for new 0.102.2 version"**.
- **#23 "Pocket Trilium refuse to use intranet DNS offered when I connected to my intranet WIFI"**,
  **#27 "How to use local root CA?"** — container DNS/CA trust is a persistent tax. README's
  workaround: `echo "nameserver 10.20.30.40" > /etc/resolv.conf`.

Conflict resolution and blob handling are simply Trilium's, since it *is* Trilium.

### 2.3 Editing — real Trilium web UI in a WebView

`lib/fullScreenWebPage.dart:164` takes a URL and builds a `flutter_inappwebview`:

```dart
child: InAppWebView(
  initialUrlRequest: URLRequest(url: WebUri(widget.url)),
  initialSettings: InAppWebViewSettings(…),
```

The URL is resolved by `Workflow.resolveWebUrl()` (`lib/workflow.dart:1160`), default
`static const String webUrl = "http://127.0.0.1:8080"` (`defaults.dart:251`), with auto port fixup from
`/home/pocket/.trilium_port` (written by the startup script) because 8080 can be taken — hence the
"Auto Port Switching" template. The editor is therefore **real CKEditor inside real Trilium** over
loopback, and the app also re-exposes that loopback over LAN (README: *"access pocket trilium with
http://your-phone-ip:8080 on your computer in the same wifi"*) with a share-link button
(`copyShareLink`, `lanAccess`). `lib/terminalPage.dart` + `xterm`/`flutter_pty` provide a raw terminal
— the only way to see what went wrong, and open issue **#28 "[Feature Request] User friendly start
screen instead of the terminal window."**

### 2.4 Login/setup UX — there is no login in the app

First-run strings (`lib/l10n/intl_en.arb`) are all about *installation*, never credentials:
`firstLoadInstructions` (*"First load may take about 5 to 10 minutes, please be patient :) … By default,
Pocket Trilium stores its data inside the app container. If you uninstall the app, the data will be
deleted as well."*), `installingBootPackage`, `copyingContainerSystem`, `installationComplete`,
`reinstallBootPackage`, `reinstallTrilium` ("Upgrade Trilium"), `triliumStartupCommand`,
`webRedirectUrl` ("URL to Open on Launch"), `autoDetectPort` ("Auto-pick Launch URL"),
`enableTerminal`, `keepScreenOn`, `ignoreBatteryOptimization`, `requestAllFilesAccess`, and
`shareUsageHint` ("You can use Trilium on all devices in the same network …").

Flow: install → pick a Trilium version → wait 5–10 min for the rootfs → land in Trilium's own
login/sync setup inside the WebView. **The app never asks for a server URL or password.** Settings live
in `lib/settingPage.dart` (`webUrl` at :202, `triliumStartupCommand` at :636).

### 2.5 What they got wrong / open issues

Only 8 open, but the README's own "Known issues" is more damning. *"❌ App Fails to Start
Occasionally"* — errors such as **`double free or corruption`**; the app ships a retry loop that
starts Trilium **10 times** automatically. Since v1.4.0 it uses `jemalloc` via `LD_PRELOAD` *"instead
of the default `malloc`"*, which *"significantly reduces the occurrence"* — an unfixed native memory
bug. Also: *"Child process limitation: If you're using an Android 12+ device, you may need to disable
the 'Stop restricting child processes' option in the `Developer Options` menu"* — asking users to
weaken OS process management. APK **~360 MB** with 1 GB of data; first start 5–10 minutes.

**Open:** **#29 "recent updates not listed, nor any way to manually update Trilium"**; **#28**
(terminal start screen); **#25** HarmonyOS unsupported, service won't start; **#22 "F-Droid
support?"**; **#17 "Run Pocket Trilium as a background service"** (6 comments); **#19 "Custom backup
directory"**; **#1 "All pages are empty"** (6 comments); **#13 "install failes on Samsung Galaxy
Tab"**.

**Closed, showing recurring classes:** version treadmill (**#24**, **#16**, **#20**, **#12
"Documentation: How to upgrade to new Trillium release?"**); networking/TLS (**#27**, **#23**, **#5**,
**#15 "Closing external port 8080"**); storage bloat (**#14 "Why is Pocket Trilium user data 22x more
than on server?"**); UX (**#10 "How do you close a Note in 1.3.8?"**, **#18 "Arrow keys are captured
by the GUI and not the text window"**, **#4 "Links not opening in browser on Android"**, **#2 "User
Manual 404's"**).

### 2.6 License

**AGPL-3.0** — `LICENSE.txt` begins *"GNU AFFERO GENERAL PUBLIC LICENSE / Version 3, 19 November
2007"*; README states it explicitly. It also redistributes AGPL Trilium binaries and a rootfs built
from termux-packages (`docs/rootfs.md`, `docs/jniLibs.md`); `lib/constants/licenses.dart` carries the
third-party notices (Flutter BSD, xterm MIT, flutter_pty MIT).

---

## 3. TriliumNext/Trilium — the official `apps/mobile`

TypeScript monorepo, **AGPL-3.0**, 38,196★, 648 open issues. `apps/mobile` is a **Capacitor shell
around the standalone/WASM build**.

### 3.1 Architecture — the entire server runs in a Web Worker, DB in OPFS

`apps/mobile/README.md`:

> *"Capacitor shell that wraps the `@triliumnext/standalone` PWA build as a native mobile app. This
> package does not ship its own web assets — `webDir` in [capacitor.config.json] points directly at
> `../standalone/dist`."*
>
> *"There is **no network backend** — the whole server runs in-process as WASM in a web worker. …
> Most of the client's API/sync calls (`/api`, `/sync`, `/bootstrap`, `/search`) therefore never leave
> the page, on either platform."*

Local storage is the real `document.db` through **SQLite WASM's OPFS SAHPool VFS**:

```ts
// apps/standalone/src/lightweight/sql_provider.ts:1
import { type BindableValue, type SAHPoolUtil, default as sqlite3InitModule } from "@sqlite.org/sqlite-wasm";
// :318
this.sahPoolUtil = await this.sqlite3!.installOpfsSAHPoolVfs({ … });
```

```jsonc
// apps/standalone/package.json
"@sqlite.org/sqlite-wasm": "3.51.1-build2",
"@triliumnext/ckeditor5": "workspace:*",
"@triliumnext/codemirror": "workspace:*",
```

`apps/standalone/src/opfs-sync-access.d.ts` documents the OPFS `FileSystemSyncAccessHandle` shim used
by the worker's log service and backup writer. There is an in-memory fallback
(`sqlite3_deserialize`, ~lines 451–496) commented *"For persistent storage, use loadFromSahPool()
instead."* The cost is real: the standalone skill records a 1.8 GB backup taking ~16 s, split evenly
between SQLite page reads and WASM SHA-256 (`hash-wasm`).

### 3.2 Sync — the real Trilium sync client, routed through a native bridge

Because it is a full Trilium instance, it runs the **official sync client**,
`packages/trilium-core/src/services/sync.ts` (826 lines). Its network calls are what a new client must
reproduce:

```ts
// :269  login
await syncRequest<SyncResponse>(syncContext, "POST", "/api/login/sync", { … });
// :433  pull (paginated by cursor)
const changesUri = `/api/sync/changed?instanceId=${getInstanceId()}&lastEntityChangeId=${cursor}&logMarkerId=${logMarkerId}`
// :518  push
await syncRequest(syncContext, "PUT", `/api/sync/update?logMarkerId=${logMarkerId}`, { … });
// :536  done
await syncRequest(syncContext, "POST", "/api/sync/finished");
// :549  content-hash verification
const resp = await syncRequest<CheckResponse>(syncContext, "GET", "/api/sync/check");
// :593 / :599  divergence repair
await syncRequest(syncContext, "POST", `/api/sync/check-entity-changes`);
await syncRequest(syncContext, "POST", `/api/sync/queue-sector/${entityName}/${sector}`);
```

Loop is push → pull → push → check → (re-queue sectors), with `MAX_SYNC_ROUNDS = 50` and
`MAX_SECTOR_RESYNC_ATTEMPTS = 3`. Pull responses are chunked (`MAX_PULL_RESPONSE_BYTES = 8 * 1024 *
1024`) and batches are applied in one transaction.

Outbound HTTP from the WASM worker is cross-origin, so mobile registers a native transport. Per
`.claude/skills/developing-capacitor-mobile/SKILL.md`:

> *"when a handler is registered (only inside Capacitor — `main.ts` checks `"Capacitor" in window`),
> the worker's `BridgedRequestProvider` posts `HTTP_REQUEST` messages to the page and the handler does
> the real HTTP call."*

Android probes `GET /_trilium_native_http/ping` and, if `TriliumWebViewClient` answers, uses a
**streaming same-origin proxy** (`/_trilium_native_http/fetch?url=…`); iOS has no
`shouldInterceptRequest` equivalent and falls back to the stock `CapacitorHttp` plugin. Key files:
`apps/standalone/src/local-bridge.ts`, `apps/standalone/src/services/capacitor_http_handler.ts`,
`apps/mobile/android/app/src/main/java/org/triliumnotes/trilium/TriliumWebViewClient.java`.

**Mobile deliberately refuses large blobs during sync** — a direct answer to the heap problem
TriliumDroid hit:

```tsx
// apps/client/src/setup.tsx:667
const resp = await server.post<SetupSyncFromServerResponse>("setup/sync-from-server", {
    syncServerHost: syncServerHost.trim().replace(/\/+$/, ""),
    syncProxy: syncProxy.trim(),
    password,
    // On mobile (Capacitor), don't pull blobs above the default limit — they blow the
    // WASM/native heap during sync. The server sends stubs instead; other platforms send 0.
    syncMaxBlobContentSize: isMobileApp() ? MOBILE_SYNC_MAX_BLOB_CONTENT_SIZE : 0
});
```

Deletions/conflicts use upstream mechanisms: `entity_changes` tombstones (`isErased`),
last-write-wins, per-sector content-hash verification. The `lastSyncedPull`/`lastSyncedPush` option
watermarks are the same two keys TriliumDroid writes.

### 3.3 Editing

Real CKEditor 5 (`@triliumnext/ckeditor5`) and CodeMirror (`@triliumnext/codemirror`). Production
Trilium client; note HTML round-trips exactly as on desktop. No reimplementation.

### 3.4 Login/setup UX — a real wizard, shared with desktop

`apps/client/src/setup.tsx` drives all platforms (`State` union at line 51 includes `"syncFromServer"`,
`"syncFromServerInProgress"`, `"syncFailed"`). The first screen offers four cards
(`apps/client/src/translations/en/entry.json`):

- `sync-from-server` = **"Connect to an existing server"** — *"You have a Trilium server running elsewhere (either self-hosted or in the cloud). This device will sync its data from that server."*
- `sync-from-desktop` = **"Connect a desktop app"** (disabled when `glob.isStandalone`, i.e. on mobile)
- `restore-from-backup`, `new-document` (with or without demo content)

The server form (`setup.tsx:699–760`): `setup.server-host` = **"Trilium server address"** (placeholder
`https://<hostname>:<port>`); `setup.server-password` = **"Password"** (`type="password"`,
`autocomplete="trilium-sync-server-password"`); `setup.advanced-options` → `setup.proxy-server`;
`setup.button-finish-setup` = **"Finish setup"**; `setup.wrong-password` = *"Incorrect password. Please
try again."* Progress shows `sync-step-connecting` / `sync-step-syncing` / `sync-step-finalizing`, with
a mobile-only banner (`isMobileApp()` gate at line 459): *"This may take a while … Please do not switch
to another application until the sync is complete."* On failure, `syncFailed` renders
`setup.sync-failed` with `button-retry`. Safety design: `setup_existing.tsx` forces the user to **back
up the existing knowledge base before replacing it** (`existing-data-back-up` /
`existing-data-skip-warning`). Backing endpoints (`packages/trilium-core/src/routes/index.ts:192–197`):
`POST /api/setup/{new-document,sync-from-server,sync-seed,auth}`, `GET /api/setup/status`. Note **no
TOTP field** — see §4.4.

### 3.5 What they got wrong / open issues

`apps/mobile` is new, so most mobile complaints are filed against the general client.

**Mobile UX gaps:** **#9906 "[Feature] Insert Child Note option for the Launchbar in the mobile view"**;
**#8974 "Table of Content visibility toggle for smartphone/mobile screens"**;
**#7116 "Mobile Webapp: Text Notes Bullet List Issue"**; **#5713 "…`#launcher-container` is not
scrollable on mobile devices."**; **#4392 "…toggling checkboxes opens the keyboard"**;
**#4394 "…editing notes offline covers the screen in errors"**;
**#3389 "…Images upload sequence on mobile"**; **#2833 "Cannot select relation note to edit on
mobile"**; **#1170 "How to disable note editing in mobile front end?"**;
**#2351 "…documentation/example for mobile frontend plugin buttons"**.

**The mobile app's own:** **#11568 "Trilium Apk Sync: interruptible sync"** (4 comments, 2026-09-18) —
sync cannot be resumed cleanly; the WASM worker must finish. **#10439 "feat(mobile): route iOS local
API requests through a native WKURLSchemeHandler"** — an open PR acknowledging the iOS routing is not
the final design.

**Sync problems that hit WASM hardest (single-threaded, synchronous SQLite):**
**#10014 "Multi-Factor TOTP ignored when logging in via. Sync"**, **#8920 "Enforce TOTP verification
during desktop sync setup"**, **#8272 "Desktop Sync has no 2FA"**;
**#5315 "desktop app initial sync never stop"** (14 comments);
**#7225 "Trilium Sync Blocks UI During Content Hashing for Large Knowledge Graphs"**;
**#5380 "Make Initial Sync timeout value configurable"**; **#6962 "Prioritize Running Sync When Coming
Back Online (Like laptop wakeup)"**; **#5122 "(Try to) sync app on shutdown"**;
**#2060 "trilium-server will not sync with trilium-desktop over TLS; ERROR:
ERR_CERT_AUTHORITY_INVALID"** (16 comments — self-signed certs remain chronic);
**#5251 "Always error connecting to sync server after wrong DNS configuration once"**;
**#8215 "Sync icon does not change when editing notes"**; **#5470 "Expose In UI which Settings are
Auto-Synced"**; **#2622 "Disable sync for certain notes"**.

**Documented architectural debt that endangers WASM/mobile** — from
`docs/Developer Guide/Developer Guide/Concepts/Synchronisation/Entity change tombstones.md`:

> *"There is no garbage collection for them [tombstones]. … A real database observed in 2026 held
> ~165 000 entity changes against only ~12 000 live entities … roughly **85 % tombstones**."*
>
> *"The cost is invisible on native clients — better-sqlite3 handles a few hundred thousand rows
> without complaint. **It is only fatal on the WASM targets** … where SQLite runs synchronously and a
> long transaction blocks the thread."*

A fresh client must pull the *entire* change history on first sync — there is no snapshot path. That is
a first-class design constraint for us.

---

## 4. Does TriliumNext document the sync protocol or a client guide?

**Yes — but the most prominent document is unreliable and must not be used as a spec.**

### 4.1 The good documentation

| Document | Path | Value |
|---|---|---|
| Content hashing | `docs/Developer Guide/Developer Guide/Concepts/Synchronisation/Content hashing.md` | **Accurate, important.** `content_hash#getEntityHashes`; sector = first char of `entityId`; SHA-1 Base64; `isErased` folded into the per-sector hash; `note_reordering` ignored |
| Tombstones | `…/Synchronisation/Entity change tombstones.md` | **Accurate, important.** Never collected; ~85 % observed; fatal on WASM |
| `hashedProperties` hazard | `.claude/skills/evolving-the-data-model/references/sync-hash-hazard.md` | **Accurate.** Exact per-entity hash-property lists with file:line (`bnote.ts`, `battribute.ts`, `bbranch.ts`, `bblob.ts`, …). Adding or *reordering* is a breaking cluster-wide hash change |
| DB structure | `docs/Developer Guide/…/Architecture/Database/Database structure/*.md` | Per-table docs: notes, branches, attributes, blobs, attachments, entity_changes, revisions, options, etapi_tokens |
| ETAPI | `docs/User Guide/…/Advanced Usage/ETAPI (REST API).md` + `apps/server/src/assets/etapi.openapi.yaml` | Token-based REST alternative; implementation in `apps/server/src/etapi/` |

### 4.2 The bad documentation — `Concepts/Synchronisation.md` is not a spec

`docs/Developer Guide/Developer Guide/Concepts/Synchronisation.md` (483 lines) reads as AI-generated
and **does not match the shipped code**:

| Claim in `Synchronisation.md` | Reality (verified in source) |
|---|---|
| "Sync API Endpoints Located at: `apps/server/src/routes/api/sync.ts`" | That path **404s**. The module is `packages/trilium-core/src/routes/api/sync.ts` |
| `POST /api/sync/check` with `{sourceId, maxChangeId}` → `{entityChanges, maxChangeId, outstandingPushCount}` | `/api/sync/check` is a **`GET`** returning `{ entityHashes, maxEntityChangeId }` — `routes/index.ts:227`, handler `checkSync()` |
| `POST /api/sync/pull` | **Does not exist.** Pull is `GET /api/sync/changed?instanceId=…&lastEntityChangeId=…` |
| `POST /api/sync/push` | **Does not exist.** Push is `PUT /api/sync/update?logMarkerId=…` |
| "Change Tracking: `apps/server/src/services/entity_changes.ts`" | The service is `packages/trilium-core/src/services/entity_changes.ts` |
| "Conflict Detection: `if (serverLastModified > clientSyncVersion)`" | Not present in `sync.ts`; verification is hash-based (`checkContentHash`) |

**Do not implement from that page.** Implement from `packages/trilium-core/src/services/sync.ts` — the
executable spec — plus the three accurate documents in §4.1.

### 4.3 Authoritative endpoint list (verified)

From `packages/trilium-core/src/routes/index.ts:223–233`, handlers in
`packages/trilium-core/src/routes/api/sync.ts`, client in
`packages/trilium-core/src/services/sync.ts`:

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/login/sync` | HMAC(documentSecret, timestamp) | Sync login; returns `maxEntityChangeId`. Handler `loginSync`, `apps/server/src/routes/api/login.ts:78` |
| GET | `/api/sync/changed?instanceId=&lastEntityChangeId=&logMarkerId=` | `checkApiAuth` | Pull changes since cursor |
| PUT | `/api/sync/update?logMarkerId=` | `checkApiAuth` | Push entity + entityChange records |
| POST | `/api/sync/finished` | `checkApiAuth` | End of a sync round |
| GET | `/api/sync/check` | `checkApiAuth` | `{ entityHashes, maxEntityChangeId }` for divergence detection |
| POST | `/api/sync/check-entity-changes` | `checkApiAuth` | Run consistency checks |
| POST | `/api/sync/queue-sector/:entityName/:sector` | `checkApiAuth` | Re-queue a divergent sector |
| POST | `/api/sync/now` | `checkApiAuth` | Trigger sync |
| POST | `/api/sync/force-full-sync` | — | Reset `lastSyncedPull`/`lastSyncedPush` to 0 |
| POST | `/api/sync/fill-entity-changes` | — | `DELETE FROM entity_changes WHERE isErased = 0`, rebuild |
| GET | `/api/sync/stats` | **none** | `{ initialized, outstandingPullCount, totalPullCount, lastSyncError? }` |
| POST | `/api/sync/test` | `checkApiAuth` | The "Test sync" button |

`/api/sync/stats` is unauthenticated by design (setup progress screen) but exposes `lastSyncError`
**only pre-initialization** (`routes/api/sync.ts`, `getStats()`).

### 4.4 Authentication reality — no TOTP on the sync path

`apps/server/src/routes/api/login.ts:78` (`loginSync`) is definitive:

```ts
if (Math.abs(timestamp.getTime() - now.getTime()) > 5 * 60 * 1000) return [401, { message: "Auth request time is out of sync … smaller than 5 minutes." }];
if (syncVersion !== appInfo.syncVersion) return [400, { message: `Non-matching sync versions, local is version ${appInfo.syncVersion}, remote is ${syncVersion}.` }];
const documentSecret = options.getOption("documentSecret");
const expectedHash = utils.hmac(documentSecret, timestampStr);
if (givenHash !== expectedHash) return [400, { message: "Sync login credentials are incorrect. It looks like you're trying to sync two different initialized documents which is not possible." }];
```

TOTP is handled by a **separate** `token()` function in the same file (line 131, reading
`req.body.totpToken`) which the sync path never calls. Hence #10014 / #8920 / #8272, and hence
TriliumDroid's #97/#63 being unfixable without upstream change. Consequences: the sync credential is a
**document-secret HMAC**, not a user/password or ETAPI token; it is bound to a `syncVersion` integer
that must match the server exactly; both clocks must agree within 5 minutes.

### 4.5 Is ETAPI an alternative?

Partly. ETAPI is real, documented and token-authenticated (`apps/server/src/assets/etapi.openapi.yaml`;
implementation in `apps/server/src/etapi/`). But it is **Node-server-only** — the Capacitor app has no
`apps/server` code at runtime (*"There is no Node, no server process and no `apps/server` code at
runtime"*). It therefore cannot back an offline-first local database; you would be doing per-note REST
calls against a remote and still need your own store and conflict story. It **is** a good fit for
one-shot operations (bulk import/export, automation) and for a "remote mode" alongside real sync.

There is **no separate client-implementation guide** for third parties beyond the DB-structure pages and
the three accurate sync docs in §4.1. Nothing in `docs/`, `.github/` or `apps/website/` targets "writing
your own Trilium client."

---

## 5. Recommendations for a new offline-first cross-platform client

### 5.1 Port / copy (all sources are AGPL-3.0 — see 5.4)

| What | Exact source | Why |
|---|---|---|
| **The SQLite schema** | `FliegendeWurst/TriliumDroid@master:app/src/main/res/raw/schema.sql` | Trilium's own DDL, proven compatible, with every index you need (`IDX_entity_changes_isSynced_id`, `IDX_branches_parentNoteId_isDeleted_notePosition`, `IDX_attributes_name_value`). Cheaper and safer than re-deriving from the TypeScript entity classes |
| **The push loop, in full** | `…/sync/Sync.kt` lines 30–170 | `SELECT * FROM entity_changes WHERE isSynced = 1 AND id > lastSyncedPush` → filter by own `instanceId` → `PUT /api/sync/update?logMarkerId=` → write `lastSyncedPush` back into `options` |
| **The pull loop + cursor** | `…/sync/Sync.kt` lines 173–330 | `GET /api/sync/changed?…`, idempotency via `changeId`, `outstandingPullCount` recursion, and the **float-tolerant** `lastSyncedPull` read (`it.getFloat(0).roundToInt()` — TriliumNext may store it as a float; the code comments on exactly this) |
| **Deletion + blob handling** | `…/sync/Sync.kt` ~235–280 | `entity == null` ⇒ `DELETE` the row (how tombstones manifest to a puller); base64-decode `content` to a BLOB; special-case `note_reordering` → `branches.notePosition` |
| **Login HMAC** | `…/sync/ConnectionUtil.kt` 327–334, 348–370 | `HMAC-SHA256(documentSecret, ISODateTime(utc))` → `{timestamp, hash, syncVersion}` POSTed to `/api/login/sync` |
| **Sync-version negotiation** | `…/sync/ConnectionUtil.kt` ~385–392 | On `"Non-matching sync versions, local is version X, remote is"`, parse the remote version and retry. The most common setup failure — handle it explicitly |
| **Error taxonomy** | `…/sync/{MismatchedDatabaseException,IncorrectPasswordException,SyncResponseTooBigException}.kt` | Three distinct, user-actionable failure modes the server actually emits |
| **Mobile setup UX copy + flow** | `TriliumNext/Trilium:apps/client/src/setup.tsx` (~257–345, 660–765) + `setup.*` keys in `apps/client/src/translations/en/entry.json` | Four entry cards, a two-field server form, a forced back-up-before-replace step (`setup_existing.tsx`), and a progress/failure screen with retry. Copy the design, reimplement the code |
| **Content-hash verification** | `packages/trilium-core/src/services/sync.ts` (`checkContentHash`, `/api/sync/check`, `/api/sync/queue-sector/…`) + `…/Content hashing.md` | **Do not skip.** A pull-only client diverges silently. Sector = first char of `entityId`; SHA-1 Base64; `isErased` folded in |
| **Blob size cap on mobile** | `apps/client/src/setup.tsx:674` (`MOBILE_SYNC_MAX_BLOB_CONTENT_SIZE`) | Copy the policy: don't pull large blobs on first sync; let the server send stubs. This is the fix for TriliumDroid #3/#29 |

### 5.2 Reimplement (do not port)

- **The editor.** Every client surveyed reached the same conclusion: embed Trilium's real frontend
  (`ckeditor.js` + `web.zip`) or run the real engine. TriliumDroid's `FrontendBackendApi.kt` is a
  717-line bridge with acknowledged TODOs and partial scripting-API coverage (#70). Build a native
  editor for the note types you support and **render Trilium HTML faithfully** — don't emulate
  Trilium's plugin API.
- **The storage layer.** Don't port `DB.kt` (raw Android SQLite) or pocket-trilium's proot. Use a
  cross-platform SQLite (SQLCipher for #74-style encrypted local DB) with the §5.1 schema.
- **Conflict UI.** TriliumDroid's blind `CONFLICT_REPLACE` produced **#106 "Sync overwirte notes in
  TriliumDroid"**. Upstream's policy is last-write-wins *without telling the user* — accept that, but
  at minimum keep the losing revision locally so nothing is unrecoverable (the `revisions` table and
  `utcDateModified` already exist in the schema).
- **Sync resumability.** **#11568 "Trilium Apk Sync: interruptible sync"** plus the durable
  `lastSyncedPull` option means resumability is *possible* — but the `instanceId`-filtered
  `entity_changes` push means a crashed run must not lose the watermark. Write progress
  transactionally.
- **TOTP.** Cannot be inherited: `/api/login/sync` never checks TOTP (§4.4). Either document the
  limitation or add your own second factor in front of the stored `documentSecret`.

### 5.3 What to avoid

1. **The proot/rootfs approach (pocket-trilium).** 360 MB APK, 5–10 minute install, needs `Developer
   Options` changes, `double free or corruption` bad enough to ship a 10× retry loop and a `jemalloc`
   workaround, and an upgrade treadmill tied to the exact bundled server version (#24/#16/#20). A great
   *hack*, a terrible product architecture.
2. **Treating `docs/…/Concepts/Synchronisation.md` as a spec.** Its endpoints (`/api/sync/pull`,
   `/api/sync/push`, `POST /api/sync/check`) do not exist (§4.2). Read
   `packages/trilium-core/src/services/sync.ts`.
3. **Shipping without the content-hash check.** `/api/sync/check` + `queue-sector` is how divergence is
   detected and repaired. TriliumDroid omits it; that plus blind replace is the likely root of its #106
   data-loss report and #87 (15 comments).
4. **A first sync that pulls the entire change history on a constrained heap.** Verified: ~85 % of
   `entity_changes` rows can be tombstones, there is **no snapshot/bootstrap path**, and *"it is only
   fatal on the WASM targets … where SQLite runs synchronously."* Budget for a **resumable, chunked**
   initial sync from day one — upstream already chunks (`MAX_PULL_RESPONSE_BYTES = 8 * 1024 * 1024`) and
   batches applies into one transaction.
5. **Modifying `hashedProperties`** (`.claude/skills/evolving-the-data-model/references/sync-hash-hazard.md`).
   A new column still syncs in the row; leaving it out of the hash is the sync-safe default. Adding or
   **reordering** the list is a breaking cluster-wide change causing permanent hash mismatch and
   ping-pong updates.
6. **Assuming attachments are cheap.** All three hit this: TriliumDroid documents a >10 MB side-load
   requirement; upstream caps mobile blob pulls; **#104 "Better error message for OOM in sync."** Stream
   blobs to disk, never through a JSON/base64 bridge — the official skill measured the base64 Capacitor
   bridge at ~13 MB/s and notes *"the extra string copy OOM-ed the iOS worker on large blobs"*, which is
   why `TriliumFileSink` (raw `ArrayBuffer` over a `WebMessageListener`) exists.
7. **Discovering self-signed-cert and DNS pain late.** A top complaint class everywhere (TriliumDroid
   #123; upstream #2060 with 16 comments, #5251; pocket-trilium #23/#27/#5). Plan for custom CA trust
   and per-network config from the start — TriliumDroid's mTLS + SSID-lock design in
   `ConfigureSyncDialog.kt` is the best prior art.
8. **An unreachable/opaque sync status.** Upstream added a setup progress screen after **#10548**
   ("Sync hangs when using built-in OIDC auth"), and TriliumDroid shows `snackbar_sync_progress`
   (`"Sync: %1$d outstanding…"`). Users need outstanding counts and the last error surfaced —
   pocket-trilium's **#6 "Show sync status"** was filed precisely because it didn't.

### 5.4 License implications — read before porting a single line

**All three projects are AGPL-3.0, and so is TriliumNext/Trilium itself:**

- `FliegendeWurst/TriliumDroid` → `AGPL-3.0` (API `license.spdx_id`; `LICENSE` = "GNU AFFERO GENERAL PUBLIC LICENSE Version 3, 19 November 2007")
- `Nriver/pocket-trilium` → `AGPL-3.0` (`LICENSE.txt`; README states it explicitly)
- `TriliumNext/Trilium` → `AGPL-3.0`

1. **You may copy, modify and redistribute** — AGPL-3.0 is copyleft, not a prohibition. Porting
   `Sync.kt` or `schema.sql` is permitted.
2. **Your client must itself be AGPL-3.0** (or compatible copyleft) if you distribute it, as it is a
   derivative work. You cannot ship a ported Trilium client as closed source or as proprietary App
   Store software.
3. **AGPL §13 is the sting: network use counts as distribution.** If your client — or any server, relay
   or proxy you operate — lets users interact with it over a network, you must offer those users the
   Corresponding Source. For a purely on-device app this is mostly satisfied by publishing your source;
   any sync/relay service you run is squarely covered.
4. **Attribution is mandatory**: retain copyright notices, state changes, ship the license text, and
   carry the bundled third-party notices (CKEditor — GPL/LGPL/commercial; the termux rootfs; jemalloc;
   Trilium binaries).
5. **To avoid AGPL entirely**, talk to the *protocol* without copying *code*: a clean-room client
   against the documented DB schema and endpoints in §4.3. The schema and on-disk format are arguably
   not copyrightable subject matter, but the safest posture is the ecosystem's own — accept AGPL and
   publish your source.

---

## Appendix — how to re-verify

All raw fetches used in this report are reproducible with:

```bash
R=FliegendeWurst/TriliumDroid B=master   # also: Nriver/pocket-trilium B=main
curl -sS "https://raw.githubusercontent.com/$R/$B/<path>"
curl -sS "https://api.github.com/repos/$R/issues?state=open&per_page=50"
curl -sS "https://api.github.com/repos/$R/git/trees/$B?recursive=1"
```

For TriliumNext/Trilium (`main`), doc paths contain spaces — URL-encode them as `%20`. The two
load-bearing files to read first are `packages/trilium-core/src/services/sync.ts` (the executable
protocol spec) and `app/src/main/res/raw/schema.sql` in TriliumDroid (the storage format).

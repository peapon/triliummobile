/**
 * English messages.
 *
 * The fallback. `t()` uses it for any key a language has not translated yet, which is
 * what lets a language be added a few keys at a time.
 */

export const en: Record<string, string> = {
  "app.notes": "Notes",
  "app.library": "Library",
  "app.search": "Search",
  "app.settings": "Settings",
  "app.back": "Back",
  "app.more": "More",
  "app.showOptions": "Show options",
  "app.close": "Close",
  "app.all": "All",

  "editor.new": "New note",
  "editor.title": "Title",
  "editor.titlePlaceholder": "Title (optional)",
  "editor.bodyPlaceholder": "Write what you want to remember…",
  "editor.save": "Done",
  "editor.saved": "Saved, waiting to sync",
  "editor.empty": "Nothing written",

  "note.rename": "Rename",
  "note.delete": "Delete",
  "note.deleteTitle": "Delete note",
  "note.renamed": "Renamed, waiting to sync",
  "note.deleted": "Deleted, waiting to sync",
  "note.untitled": "Untitled",
  "note.untitledLower": "(untitled)",
  "note.this": "this note",
  "note.deleteBody": "\u201c{title}\u201d and all of its child notes will be deleted and this will sync to your other devices.",

  "search.placeholder": "Search titles and text…",

  "layout.list": "List",
  "layout.grid": "Grid",
  "sort.server": "Server order",
  "sort.modified": "Updated",
  "sort.created": "Created",
  "sort.title": "Title",
  "time.justNow": "just now",
  "time.updated": "Updated {date}",

  "setup.prompt": "Enter the server address and password",
  "setup.connect": "Connect and sync",
  "setup.connecting": "Connecting…",
  "setup.notConfigured": "Not configured",
  "setup.notConfiguredParen": "(not configured)",
  "setup.notSetParen": "(not set)",
  "setup.notInitialised": "This server has not been initialised.",
  "setup.notInitialisedLong": "This server has not been initialised. Complete Trilium's setup in a browser first.",
  "setup.noSecret": "The server did not return a documentId / documentSecret; the password may be wrong.",
  "setup.noServer": "No server configured",
  "setup.differentVault": "A different vault was detected — clearing the local copy…",
  "setup.connectingServer": "Connecting to the server…",
  "setup.pulling": "Pulling…",
  "setup.pushing": "Pushing local changes…",
  "setup.waitForFirstSync": "The first sync has not finished yet; try again shortly",
  "setup.cleared": "Local copy cleared; the next sync will pull it again",

  "sync.syncing": "Syncing…",
  "sync.failed": "Sync failed",
  "sync.done": "Synced",
  "sync.complete": "Sync complete",
  "sync.completeDetail": "Sync complete: pulled {pulled} in {seconds}s",
  "sync.pending": "{count} to sync",

  "attachment.downloading": "Downloading…",
  "attachment.downloadFailed": "Download failed",
  "attachment.notLocal": "This attachment has not been downloaded to this device yet",

  "ink.label": "Ink",
  "ink.labelDirty": "Ink •",
  "ink.hint": "Write with a pen or a finger",
  "ink.penDetected": "Stylus detected",
  "ink.saved": "Ink saved; it will sync with the note",
  "ink.red": "Red",
  "ink.green": "Green",
  "ink.blue": "Blue",
  "ink.white": "White",

  "ai.untitledChat": "Untitled chat",
  "ai.created": "Chat created, waiting to sync",

  "interval.off": "Off (manual only)",
  "interval.1m": "1 minute",
  "interval.5m": "5 minutes",
  "interval.15m": "15 minutes",
  "interval.30m": "30 minutes",
  "interval.1h": "1 hour",
  "interval.2h": "2 hours",
  "interval.4h": "4 hours",

  "cache.5m": "5 minutes",
  "cache.30m": "30 minutes",

  // Labels shared by more than one screen
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.saved": "Saved",

  // Boot
  "boot.openingDb": "Opening the local database…",
  "boot.dbFailed": "Could not open the local database",

  // Quick notes list
  "notes.emptyAfterSync": "Your quick notes will show up here once the first sync finishes.",
  "notes.empty": "No notes yet.",
  "notes.emptyHint": "Tap the field above to write the first one.",
  "notes.recent": "Recent",
  "notes.count": "{count} notes",

  // Library
  "library.empty": "This folder is empty.",
  "library.emptyHint": "Write a quick note, or open a different folder.",

  // Note detail
  "note.childCount": "{count} items",
  "note.edit": "Edit",
  "note.emptyContent": "(empty note)",
  "note.imageRemote": "The image is still on the server. Tap \u201cDownload text\u201d above to fetch it.",
  "note.attachmentRemote": "Attachment note ({mime}) \u2014 download it first.",
  "note.contentStubbed": "The note text is over the sync limit and has not been downloaded to this device yet.",
  "note.downloadContent": "Download text",
  "note.downloadFile": "Download {title}",
  "note.addAttachment": "Add attachment",
  "note.cacheNote": "{count} items have not been downloaded to this device",
  "note.attachedOne": "Attached {name}",
  "note.attachedMany": "Attached {count} files",

  // Options sheet
  "sheet.layout": "Layout",
  "sheet.sort": "Sort by",
  "sheet.syncNow": "Sync now",

  // Editor
  "editor.cancel": "Discard",
  "editor.image": "Image",
  "editor.attachment": "Attachment",
  "editor.pendingAttachments": "{count} files will be inserted into the note",

  // Search screen
  "search.empty": "No matching notes.",
  "search.emptyHint": "Search runs locally and matches both titles and text.",

  // Attachments
  "attachment.download": "Download",
  "attachment.cached": "Cached",
  "attachment.downloadedKb": "Downloaded {kb} KB",

  // Ink
  "ink.undo": "Undo",
  "ink.clear": "Clear",
  "ink.save": "Save ink",

  // AI
  "ai.empty": "There are no AI chats in this device's copy yet.",
  "ai.emptyHint": "Trilium's AI chats need a model provider configured on the server; once one is, existing chats appear here as they sync.",
  "ai.title": "AI notes",
  "ai.chats": "Chats",
  "ai.chatCount": "{count} chats",
  "ai.newChat": "New chat",
  "ai.open": "AI chats",
  "ai.chatTitle": "AI chat {stamp}",

  // Relative times
  "time.minutesAgo": "{count} minutes ago",
  "time.hoursAgo": "{count} hours ago",
  "time.daysAgo": "{count} days ago",

  // Setup screen
  "setup.title": "Connect to a Trilium server",
  "setup.intro": "Enter the address and password of your own server. The password is used only to read the sync secret; after that, sync is authenticated with an HMAC built from the documentSecret, and the password is never sent again.",
  "setup.serverLabel": "Server address",
  "setup.passwordLabel": "Password",
  "setup.firstSync": "The first sync pulls the whole note tree. Binary attachments above 4 MiB are not downloaded; they are fetched on demand when you open them.",
  "setup.originWarning": "⚠️ The address must be <b>same-origin</b> with this page. Trilium sends <code>Cross-Origin-Resource-Policy: same-origin</code> and no CORS headers, so a browser refuses a cross-origin read outright. In development, Vite proxies <code>/api</code> to the real server; in production, serve this app from the same origin as the server (or let the native shell forward the requests).",

  // Settings screen
  "settings.server": "Server: {host}",
  "settings.vaultId": "Vault ID: ",
  "settings.localCounts": "Local: {notes} notes \u00b7 {branches} branches \u00b7 {attributes} attributes \u00b7 {blobs} blobs",
  "settings.vaultSwitch": "Switching to <b>another vault</b> clears the local copy automatically \u2014 entities from two vaults cannot be untangled afterwards. The button below is only for clearing it by hand.",
  "settings.language": "Language",
  "settings.syncInterval": "Automatic sync interval",
  "settings.blobCap": "Attachment sync limit (bytes, 0 = unlimited)",
  "settings.reconfigure": "Reconfigure server",
  "settings.clearData": "Clear local data (keep connection settings)",

  // Failures reported from the worker
  "error.cors": "The browser cannot reach {origin}: Trilium sends `Cross-Origin-Resource-Policy: same-origin` and no CORS headers, so the browser refuses the request rather than failing to connect. Use the HarmonyOS app, which forwards requests natively, or serve this app from the same origin as the server. (Original error: {message})",
  "error.hashMismatch": "Content hash check failed: {count} sectors differ",
  "error.dbInit": "Could not initialise the local database: {message}",

  // Device self-test hooks
  "e2e.captureBody": "Created offline by the HarmonyOS device: {marker}",
  "e2e.editBody": "{marker} edited",

  "inbox.title": "Quick notes Inbox",
  "inbox.body": "<p>Created automatically by TriliumMobile. Quick notes from the phone all land here.</p>",
  "settings.inboxTitle": "Inbox note title",
  "settings.inboxTitleHint": "Quick notes are kept under this note. Renaming it loses nothing."
}

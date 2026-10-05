/**
 * Messages, and the language to show them in.
 *
 * Trilium ships about thirty languages and treats `locale` as a **synced** option — it belongs to the
 * vault rather than to a device. So this client does the same: it reads the server's `locale` and
 * follows it, and a device may override it locally, because a phone and a desktop are not always
 * wanted in the same language.
 *
 * Keys are semantic rather than the Chinese string itself. Using the text as the key is less code up
 * front and impossible to get out of step, but it makes an English sentence the identity of a
 * message, and this repository is published.
 *
 * A missing translation falls back to the key, which makes an omission loud in the UI rather than
 * silent — and `tools/i18n-audit.ts` fails if the two catalogues ever disagree about a key.
 */

export type Language = "cn" | "en";

export const LANGUAGES: ReadonlyArray<{ code: Language; label: string }> = [
  { code: "cn", label: "简体中文" },
  { code: "en", label: "English" }
];

const CN: Record<string, string> = {
  // Screens
  "app.notes": "速记",
  "app.library": "知识库",
  "app.search": "搜索",
  "app.settings": "设置",
  "app.back": "返回",
  "app.more": "更多",
  "app.showOptions": "显示选项",
  "app.close": "关闭",
  "app.all": "全部",

  // Editor
  "editor.new": "新建速记",
  "editor.title": "标题",
  "editor.titlePlaceholder": "标题（可留空）",
  "editor.bodyPlaceholder": "记你想记…",
  "editor.save": "完成",
  "editor.saved": "已保存，等待同步",
  "editor.empty": "什么都没写",

  // Note actions
  "note.rename": "重命名",
  "note.delete": "删除",
  "note.deleteTitle": "删除笔记",
  "note.renamed": "已重命名，等待同步",
  "note.deleted": "已删除，等待同步",
  "note.untitled": "无标题",
  "note.untitledLower": "(无标题)",
  "note.this": "这条笔记",
  "note.deleteBody": "「{title}」及其全部子笔记都会被删除，并同步到其他设备。",

  // Search
  "search.placeholder": "搜索标题与正文…",

  // Layout and sorting
  "layout.list": "列表",
  "layout.grid": "网格",
  "sort.server": "服务器顺序",
  "sort.modified": "更新时间",
  "sort.created": "创建时间",
  "sort.title": "标题",
  "time.justNow": "刚刚",
  "time.updated": "更新 {date}",

  // Setup
  "setup.prompt": "请填写服务端地址和密码",
  "setup.connect": "连接并首次同步",
  "setup.connecting": "连接中…",
  "setup.notConfigured": "未配置",
  "setup.notConfiguredParen": "(未配置)",
  "setup.notSetParen": "(未绑定)",
  "setup.notInitialised": "该服务端尚未初始化。",
  "setup.notInitialisedLong": "该服务端尚未初始化，请先在浏览器里完成一遍 Trilium 初始化。",
  "setup.noSecret": "服务端没有返回 documentId / documentSecret，密码可能不正确。",
  "setup.noServer": "尚未配置服务端",
  "setup.differentVault": "检测到不同的知识库，正在清除本地副本…",
  "setup.connectingServer": "正在连接服务端…",
  "setup.pulling": "正在拉取…",
  "setup.pushing": "正在推送本地改动…",
  "setup.waitForFirstSync": "首次同步尚未完成，稍后再试",
  "setup.cleared": "本地副本已清除，下次同步会重新拉取",

  // Sync
  "sync.syncing": "同步中…",
  "sync.failed": "同步失败",
  "sync.done": "已同步",
  "sync.complete": "同步完成",
  "sync.completeDetail": "同步完成：拉取 {pulled} 项，用时 {seconds}s",
  "sync.pending": "{count} 项待同步",

  // Attachments
  "attachment.downloading": "下载中…",
  "attachment.downloadFailed": "下载失败",
  "attachment.notLocal": "这个附件还没有下载到本机",

  // Ink
  "ink.label": "笔迹",
  "ink.labelDirty": "笔迹 •",
  "ink.hint": "用笔或手指书写",
  "ink.penDetected": "已识别到手写笔",
  "ink.saved": "笔迹已保存，将随笔记同步",
  "ink.red": "红色",
  "ink.green": "绿色",
  "ink.blue": "蓝色",
  "ink.white": "白色",

  // AI
  "ai.untitledChat": "无标题对话",
  "ai.created": "已新建对话，等待同步",

  // Automatic sync intervals
  "interval.off": "关闭（仅手动）",
  "interval.1m": "1 分钟",
  "interval.5m": "5 分钟",
  "interval.15m": "15 分钟",
  "interval.30m": "30 分钟",
  "interval.1h": "1 小时",
  "interval.2h": "2 小时",
  "interval.4h": "4 小时",

  // Cache sizes
  "cache.5m": "五分钟",
  "cache.30m": "半小时",

  // Labels shared by more than one screen
  "common.cancel": "取消",
  "common.save": "保存",
  "common.saved": "已保存",

  // Boot
  "boot.openingDb": "正在打开本地数据库…",
  "boot.dbFailed": "无法打开本地数据库",

  // Quick notes list
  "notes.emptyAfterSync": "首次同步完成后，速记会显示在这里。",
  "notes.empty": "还没有笔记。",
  "notes.emptyHint": "点上面的输入框记第一条。",
  "notes.recent": "最近",
  "notes.count": "{count} 条",

  // Library
  "library.empty": "这个目录是空的。",
  "library.emptyHint": "在速记里新建一条，或换个目录。",

  // Note detail
  "note.childCount": "{count} 项",
  "note.edit": "编辑",
  "note.emptyContent": "（空笔记）",
  "note.imageRemote": "图片还在服务端，点上面的「下载正文」取回。",
  "note.attachmentRemote": "附件笔记（{mime}）——需先下载。",
  "note.contentStubbed": "正文超过同步上限，尚未下载到本机。",
  "note.downloadContent": "下载正文",
  "note.downloadFile": "下载 {title}",
  "note.addAttachment": "添加附件",
  "note.cacheNote": "本机还有 {count} 项内容未下载",
  "note.attachedOne": "已附加 {name}",
  "note.attachedMany": "已附加 {count} 个文件",

  // Options sheet
  "sheet.layout": "布局",
  "sheet.sort": "排序方式",
  "sheet.syncNow": "立即同步",

  // Editor
  "editor.cancel": "放弃",
  "editor.image": "图片",
  "editor.attachment": "附件",
  "editor.pendingAttachments": "{count} 个文件将插入正文",

  // Search screen
  "search.empty": "没有匹配的笔记。",
  "search.emptyHint": "搜索在本地进行，标题和正文都会命中。",

  // Attachments
  "attachment.download": "下载",
  "attachment.cached": "已缓存",
  "attachment.downloadedKb": "已下载 {kb} KB",

  // Ink
  "ink.undo": "撤销",
  "ink.clear": "清空",
  "ink.save": "保存笔迹",

  // AI
  "ai.empty": "这台设备的副本里还没有 AI 对话。",
  "ai.emptyHint": "Trilium 的 AI 对话需要服务端配置好模型提供方；配置后已有的对话会随同步出现在这里。",
  "ai.title": "AI 笔记",
  "ai.chats": "对话",
  "ai.chatCount": "{count} 个",
  "ai.newChat": "新建对话",
  "ai.open": "AI 对话",
  "ai.chatTitle": "AI 对话 {stamp}",

  // Relative times
  "time.minutesAgo": "{count} 分钟前",
  "time.hoursAgo": "{count} 小时前",
  "time.daysAgo": "{count} 天前",

  // Setup screen
  "setup.title": "连接 Trilium 服务端",
  "setup.intro": "填入你自建服务端的地址与密码。密码只用于读取同步密钥，之后同步走的是 documentSecret 的 HMAC，不会再发送密码。",
  "setup.serverLabel": "服务端地址",
  "setup.passwordLabel": "密码",
  "setup.firstSync": "首次同步会拉取整个笔记树。二进制附件超过 4 MiB 的部分不会下载，点开时再按需获取。",
  "setup.originWarning": "⚠️ 地址必须与当前页面<b>同源</b>。Trilium 服务端返回 <code>Cross-Origin-Resource-Policy: same-origin</code> 且不带 CORS 头，浏览器会直接拒绝跨源读取。开发时由 Vite 代理 <code>/api</code> 转发到真实服务端；正式环境请把本应用部署在服务端同源之下（或由原生外壳代为转发请求）。",

  // Settings screen
  "settings.server": "服务端：{host}",
  "settings.vaultId": "知识库 ID：",
  "settings.localCounts": "本地：{notes} 条笔记 · {branches} 个分支 · {attributes} 个属性 · {blobs} 个内容块",
  "settings.vaultSwitch": "换到<b>另一个知识库</b>时本地副本会自动清除——两个库的实体混在一起是无法复原的。下面的按钮只在你想手动清空时用。",
  "settings.language": "语言 / Language",
  "settings.syncInterval": "自动同步间隔",
  "settings.blobCap": "附件同步上限（字节，0 = 不限制）",
  "settings.reconfigure": "重新配置服务端",
  "settings.clearData": "清除本地数据（保留连接设置）",

  // Failures reported from the worker
  "error.cors": "浏览器无法跨源连接 {origin}：Trilium 返回 Cross-Origin-Resource-Policy: same-origin 且不带 CORS 头，浏览器会直接拒绝，而不是连不上。请用鸿蒙 App（原生转发请求），或把本应用部署到与服务端同源的位置。（原始错误：{message}）",
  "error.hashMismatch": "内容哈希校验未通过：{count} 个分区不一致",
  "error.dbInit": "本地数据库初始化失败：{message}",

  // Device self-test hooks
  "e2e.captureBody": "由鸿蒙设备离线创建：{marker}",
  "e2e.editBody": "{marker} 已编辑",

  // Inbox
  "inbox.body": "<p>由 TriliumMobile 自动创建，手机端的速记都会落在这里。</p>"
};

const EN: Record<string, string> = {
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

  "inbox.body": "<p>Created automatically by TriliumMobile. Quick notes from the phone all land here.</p>"
};

const CATALOGUES: Record<Language, Record<string, string>> = { cn: CN, en: EN };

/**
 * Trilium's `locale` values are language codes, sometimes with a region: `en`, `en-GB`, `cn`, `pt-BR`.
 * Only the leading part matters here, and anything unrecognised falls back to the default rather than
 * showing keys.
 */
export function languageFromLocale(locale: string | null | undefined, fallback: Language = "cn"): Language {
  if (!locale) return fallback;

  const base = locale.trim().toLowerCase().split(/[-_]/)[0];
  return base === "en" ? "en" : base === "cn" || base === "zh" ? "cn" : fallback;
}

let current: Language = "cn";

export function getLanguage(): Language {
  return current;
}

export function setLanguage(language: Language): void {
  current = language;
  // The document language drives font selection and hyphenation, so it is worth keeping honest.
  // The same catalogue is loaded in the worker, which has no document — hence the guard.
  if (typeof document !== "undefined") {
    document.documentElement?.setAttribute("lang", language === "cn" ? "zh-CN" : "en");
  }
}

/** Substitute `{name}` placeholders. Values are escaped by the caller when they reach markup. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const template = CATALOGUES[current][key] ?? CATALOGUES.cn[key] ?? key;
  if (!vars) return template;

  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole
  );
}

/** Every key, for the audit that checks the two catalogues agree. */
export function allKeys(): string[] {
  return [...new Set([...Object.keys(CN), ...Object.keys(EN)])].sort();
}

/** The catalogue itself, so the audit can look for empty or missing entries. */
export function catalogue(language: Language): Record<string, string> {
  return CATALOGUES[language];
}

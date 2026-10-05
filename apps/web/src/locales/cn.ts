/**
 * Simplified Chinese messages.
 *
 * The original catalogue: every other language is a translation of this one.
 */

export const cn: Record<string, string> = {
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
  "inbox.title": "速记 Inbox",
  "inbox.body": "<p>由 TriliumMobile 自动创建，手机端的速记都会落在这里。</p>",
  "settings.inboxTitle": "收件箱名称",
  "settings.inboxTitleHint": "速记都保存在这条笔记下。改名不会丢失任何东西。"
}

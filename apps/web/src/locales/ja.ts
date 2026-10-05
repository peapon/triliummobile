/**
 * Japanese messages.
 *
 * Terminology follows Trilium's own `ja` translation wherever the concept exists there, so that this
 * client and the user's desktop show the same words for the same thing. The remainder is translated
 * here and has not been reviewed by a native speaker.
 */

export const ja: Record<string, string> = {
  // Screens
  "app.notes": "ノート",
  "app.library": "ライブラリ",
  "app.search": "検索",
  "app.settings": "設定",
  "app.back": "戻る",
  "app.more": "その他",
  "app.showOptions": "オプションを表示",
  "app.close": "閉じる",
  "app.all": "すべて",

  // Editor
  "editor.new": "新規ノート",
  "editor.title": "タイトル",
  "editor.titlePlaceholder": "タイトル（任意）",
  "editor.bodyPlaceholder": "覚えたいことを書く…",
  "editor.save": "完了",
  "editor.saved": "保存しました（同期待ち）",
  "editor.empty": "何も書かれていません",

  // Note actions
  "note.rename": "名前を変更",
  "note.delete": "削除",
  "note.deleteTitle": "ノートを削除",
  "note.renamed": "名前を変更しました（同期待ち）",
  "note.deleted": "削除しました（同期待ち）",
  "note.untitled": "無題",
  "note.untitledLower": "（無題）",
  "note.this": "このノート",
  "note.deleteBody": "「{title}」とそのすべての子ノートが削除され、他のデバイスにも同期されます。",

  // Search
  "search.placeholder": "タイトルと本文を検索…",

  // Layout and sorting
  "layout.list": "リスト",
  "layout.grid": "グリッド",
  "sort.server": "サーバー順",
  "sort.modified": "更新日",
  "sort.created": "作成日",
  "sort.title": "タイトル",
  "time.justNow": "たった今",
  "time.updated": "更新 {date}",

  // Setup
  "setup.prompt": "サーバーアドレスとパスワードを入力してください",
  "setup.connect": "接続して同期",
  "setup.connecting": "接続中…",
  "setup.notConfigured": "未設定",
  "setup.notConfiguredParen": "（未設定）",
  "setup.notSetParen": "（未設定）",
  "setup.notInitialised": "このサーバーはまだ初期化されていません。",
  "setup.notInitialisedLong": "このサーバーはまだ初期化されていません。ブラウザで先に Trilium の初期設定を完了してください。",
  "setup.noSecret": "サーバーが documentId / documentSecret を返しませんでした。パスワードが正しくない可能性があります。",
  "setup.noServer": "サーバーが設定されていません",
  "setup.differentVault": "別のライブラリを検出しました。ローカルコピーを消去しています…",
  "setup.connectingServer": "サーバーに接続しています…",
  "setup.pulling": "取得中…",
  "setup.pushing": "ローカルの変更を送信中…",
  "setup.waitForFirstSync": "初回の同期がまだ完了していません。しばらくしてからもう一度お試しください",
  "setup.cleared": "ローカルコピーを消去しました。次回の同期で再度取得されます",

  // Sync
  "sync.syncing": "同期中…",
  "sync.failed": "同期に失敗しました",
  "sync.done": "同期済み",
  "sync.complete": "同期が完了しました",
  "sync.completeDetail": "同期が完了しました：{pulled} 件を取得、{seconds} 秒",
  "sync.pending": "{count} 件が同期待ち",

  // Attachments
  "attachment.downloading": "ダウンロード中…",
  "attachment.downloadFailed": "ダウンロードに失敗しました",
  "attachment.notLocal": "この添付ファイルはまだこの端末にダウンロードされていません",

  // Ink
  "ink.label": "手書き",
  "ink.labelDirty": "手書き •",
  "ink.hint": "ペンまたは指で書いてください",
  "ink.penDetected": "ペンを検出しました",
  "ink.saved": "手書きを保存しました。ノートと一緒に同期されます",
  "ink.red": "赤",
  "ink.green": "緑",
  "ink.blue": "青",
  "ink.white": "白",

  // AI
  "ai.untitledChat": "無題のチャット",
  "ai.created": "チャットを作成しました（同期待ち）",

  // Automatic sync intervals
  "interval.off": "オフ（手動のみ）",
  "interval.1m": "1分",
  "interval.5m": "5分",
  "interval.15m": "15分",
  "interval.30m": "30分",
  "interval.1h": "1時間",
  "interval.2h": "2時間",
  "interval.4h": "4時間",

  // Cache sizes
  "cache.5m": "5分",
  "cache.30m": "30分",

  // Labels shared by more than one screen
  "common.cancel": "キャンセル",
  "common.save": "保存",
  "common.saved": "保存しました",

  // Boot
  "boot.openingDb": "ローカルデータベースを開いています…",
  "boot.dbFailed": "ローカルデータベースを開けませんでした",

  // Quick notes list
  "notes.emptyAfterSync": "初回の同期が完了すると、クイックノートがここに表示されます。",
  "notes.empty": "まだノートがありません。",
  "notes.emptyHint": "上の入力欄をタップして、最初のノートを書いてみましょう。",
  "notes.recent": "最近",
  "notes.count": "{count} 件",

  // Library
  "library.empty": "このフォルダーは空です。",
  "library.emptyHint": "クイックノートを作成するか、別のフォルダーを開いてください。",

  // Note detail
  "note.childCount": "{count} 件",
  "note.edit": "編集",
  "note.emptyContent": "（空のノート）",
  "note.imageRemote": "画像はまだサーバー上にあります。上の「本文をダウンロード」をタップして取得してください。",
  "note.attachmentRemote": "添付ファイルノート（{mime}）— 先にダウンロードしてください。",
  "note.contentStubbed": "本文が同期の上限を超えているため、このデバイスにまだダウンロードされていません。",
  "note.downloadContent": "本文をダウンロード",
  "note.downloadFile": "{title} をダウンロード",
  "note.addAttachment": "添付ファイルを追加",
  "note.cacheNote": "この端末に未ダウンロードの内容が {count} 件あります",
  "note.attachedOne": "{name} を添付しました",
  "note.attachedMany": "{count} 個のファイルを添付しました",

  // Options sheet
  "sheet.layout": "レイアウト",
  "sheet.sort": "並べ替え",
  "sheet.syncNow": "今すぐ同期",

  // Editor
  "editor.cancel": "破棄",
  "editor.image": "画像",
  "editor.attachment": "添付ファイル",
  "editor.pendingAttachments": "{count} 個のファイルが本文に挿入されます",

  // Search screen
  "search.empty": "一致するノートがありません。",
  "search.emptyHint": "検索はローカルで実行され、タイトルと本文の両方に一致します。",

  // Attachments
  "attachment.download": "ダウンロード",
  "attachment.cached": "キャッシュ済み",
  "attachment.downloadedKb": "{kb} KB をダウンロードしました",

  // Ink
  "ink.undo": "元に戻す",
  "ink.clear": "クリア",
  "ink.save": "手書きを保存",

  // AI
  "ai.empty": "このデバイスのコピーには、まだ AI チャットがありません。",
  "ai.emptyHint": "Trilium の AI チャットには、サーバー側でモデルプロバイダーの設定が必要です。設定すると、既存のチャットが同期とともにここに表示されます。",
  "ai.title": "AI ノート",
  "ai.chats": "チャット",
  "ai.chatCount": "{count} 件",
  "ai.newChat": "新しいチャット",
  "ai.open": "AI チャット",
  "ai.chatTitle": "AI チャット {stamp}",

  // Relative times
  "time.minutesAgo": "{count} 分前",
  "time.hoursAgo": "{count} 時間前",
  "time.daysAgo": "{count} 日前",

  // Setup screen
  "setup.title": "Trilium サーバーに接続",
  "setup.intro": "ご自身のサーバーのアドレスとパスワードを入力してください。パスワードは同期用シークレットの読み取りにのみ使用され、その後の同期は documentSecret から生成される HMAC で認証されるため、パスワードが再送されることはありません。",
  "setup.serverLabel": "サーバーアドレス",
  "setup.passwordLabel": "パスワード",
  "setup.firstSync": "初回の同期ではノートツリー全体を取得します。4 MiB を超えるバイナリ添付ファイルはダウンロードされず、開いたときにオンデマンドで取得されます。",
  "setup.originWarning": "⚠️ アドレスはこのページと<b>同一オリジン</b>である必要があります。Trilium サーバーは <code>Cross-Origin-Resource-Policy: same-origin</code> を返し CORS ヘッダーを付けないため、ブラウザはクロスオリジンの読み取りをそのまま拒否します。開発時は Vite が <code>/api</code> を実際のサーバーにプロキシします。本番環境では、このアプリをサーバーと同一オリジンで配信するか（またはネイティブシェルにリクエストを転送させてください）。",

  // Settings screen
  "settings.server": "サーバー：{host}",
  "settings.vaultId": "ライブラリ ID：",
  "settings.localCounts": "ローカル：{notes} ノート · {branches} ブランチ · {attributes} 属性 · {blobs} ブロブ",
  "settings.vaultSwitch": "別の<b>ライブラリ</b>に切り替えると、ローカルコピーは自動的に消去されます。2 つのライブラリのエンティティが混ざると、後から分離することはできません。下のボタンは手動で消去するときだけに使います。",
  "settings.language": "言語 / Language",
  "settings.syncInterval": "自動同期の間隔",
  "settings.blobCap": "添付ファイルの同期上限（バイト、0 = 無制限）",
  "settings.reconfigure": "サーバーを再設定",
  "settings.clearData": "ローカルデータを消去（接続設定は保持）",

  // Failures reported from the worker
  "error.cors": "ブラウザは {origin} にクロスオリジンで接続できません。Trilium は Cross-Origin-Resource-Policy: same-origin を返し CORS ヘッダーを付けないため、接続できないのではなくブラウザがリクエストを拒否します。HarmonyOS アプリ（ネイティブでリクエストを転送）を使うか、このアプリをサーバーと同一オリジンで配信してください。（元のエラー：{message}）",
  "error.hashMismatch": "コンテンツハッシュの検証に失敗しました：{count} 個のセクターが一致しません",
  "error.dbInit": "ローカルデータベースを初期化できませんでした：{message}",

  // Device self-test hooks
  "e2e.captureBody": "HarmonyOS デバイスがオフラインで作成：{marker}",
  "e2e.editBody": "{marker} を編集しました",

  // Inbox
  "inbox.title": "クイックノートのインボックス",
  "inbox.body": "<p>TriliumMobile が自動的に作成しました。スマートフォンで書いたクイックノートは、すべてここに保存されます。</p>",
  "settings.inboxTitle": "インボックスのノートタイトル",
  "settings.inboxTitleHint": "クイックノートはこのノートの下に保存されます。名前を変更しても失われるものはありません。"
}

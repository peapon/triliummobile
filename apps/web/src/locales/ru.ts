/**
 * Russian messages.
 *
 * Terminology follows Trilium's own `ru` translation wherever the concept exists there, so that this
 * client and the user's desktop show the same words for the same thing. The remainder is translated
 * here and has not been reviewed by a native speaker.
 *
 * This catalogue has no plural forms, so every `{count}` followed by a noun uses the genitive plural
 * (the form Trilium's `_many` entries use), which is the usual fallback when only one form fits.
 */

export const ru: Record<string, string> = {
  // Screens
  "app.notes": "Заметки",
  "app.library": "Библиотека",
  "app.search": "Поиск",
  "app.settings": "Настройки",
  "app.back": "Назад",
  "app.more": "Ещё",
  "app.showOptions": "Показать параметры",
  "app.close": "Закрыть",
  "app.all": "Все",

  // Editor
  "editor.new": "Новая заметка",
  "editor.title": "Название",
  "editor.titlePlaceholder": "Название (необязательно)",
  "editor.bodyPlaceholder": "Запишите то, что хотите запомнить…",
  "editor.save": "Готово",
  "editor.saved": "Сохранено, ожидает синхронизации",
  "editor.empty": "Ничего не написано",

  // Note actions
  "note.rename": "Переименовать",
  "note.delete": "Удалить",
  "note.deleteTitle": "Удалить заметку",
  "note.renamed": "Переименовано, ожидает синхронизации",
  "note.deleted": "Удалено, ожидает синхронизации",
  "note.untitled": "Без названия",
  "note.untitledLower": "(без названия)",
  "note.this": "эта заметка",
  "note.deleteBody": "«{title}» и все её дочерние заметки будут удалены, и это синхронизируется с другими устройствами.",

  // Search
  "search.placeholder": "Поиск по названиям и тексту…",

  // Layout and sorting
  "layout.list": "Список",
  "layout.grid": "Сетка",
  "sort.server": "Порядок сервера",
  "sort.modified": "Изменено",
  "sort.created": "Создано",
  "sort.title": "Название",
  "time.justNow": "только что",
  "time.updated": "Изменено {date}",

  // Setup
  "setup.prompt": "Укажите адрес сервера и пароль",
  "setup.connect": "Подключиться и синхронизировать",
  "setup.connecting": "Подключение…",
  "setup.notConfigured": "Не настроено",
  "setup.notConfiguredParen": "(не настроено)",
  "setup.notSetParen": "(не установлено)",
  "setup.notInitialised": "Этот сервер ещё не инициализирован.",
  "setup.notInitialisedLong": "Этот сервер ещё не инициализирован. Сначала завершите настройку Trilium в браузере.",
  "setup.noSecret": "Сервер не вернул documentId / documentSecret; возможно, пароль неверен.",
  "setup.noServer": "Сервер не настроен",
  "setup.differentVault": "Обнаружена другая база знаний — локальная копия очищается…",
  "setup.connectingServer": "Подключение к серверу…",
  "setup.pulling": "Получение…",
  "setup.pushing": "Отправка локальных изменений…",
  "setup.waitForFirstSync": "Первая синхронизация ещё не завершена; повторите попытку позже",
  "setup.cleared": "Локальная копия очищена; при следующей синхронизации она загрузится снова",

  // Sync
  "sync.syncing": "Синхронизация…",
  "sync.failed": "Синхронизация не удалась",
  "sync.done": "Синхронизировано",
  "sync.complete": "Синхронизация завершена",
  "sync.completeDetail": "Синхронизация завершена: получено {pulled}, за {seconds} с",
  "sync.pending": "{count} записей ожидает синхронизации",

  // Attachments
  "attachment.downloading": "Скачивание…",
  "attachment.downloadFailed": "Ошибка скачивания",
  "attachment.notLocal": "Это вложение ещё не скачано на это устройство",

  // Ink
  "ink.label": "Чернила",
  "ink.labelDirty": "Чернила •",
  "ink.hint": "Пишите пером или пальцем",
  "ink.penDetected": "Стилус обнаружен",
  "ink.saved": "Чернила сохранены; они синхронизируются с заметкой",
  "ink.red": "Красный",
  "ink.green": "Зелёный",
  "ink.blue": "Синий",
  "ink.white": "Белый",

  // AI
  "ai.untitledChat": "Чат без названия",
  "ai.created": "Чат создан, ожидает синхронизации",

  // Automatic sync intervals
  "interval.off": "Выключено (только вручную)",
  "interval.1m": "1 минута",
  "interval.5m": "5 минут",
  "interval.15m": "15 минут",
  "interval.30m": "30 минут",
  "interval.1h": "1 час",
  "interval.2h": "2 часа",
  "interval.4h": "4 часа",

  // Cache sizes
  "cache.5m": "5 минут",
  "cache.30m": "30 минут",

  // Labels shared by more than one screen
  "common.cancel": "Отмена",
  "common.save": "Сохранить",
  "common.saved": "Сохранено",

  // Boot
  "boot.openingDb": "Открытие локальной базы данных…",
  "boot.dbFailed": "Не удалось открыть локальную базу данных",

  // Quick notes list
  "notes.emptyAfterSync": "Ваши заметки появятся здесь после завершения первой синхронизации.",
  "notes.empty": "Заметок пока нет.",
  "notes.emptyHint": "Нажмите на поле выше, чтобы создать первую.",
  "notes.recent": "Недавние",
  "notes.count": "{count} заметок",

  // Library
  "library.empty": "Эта папка пуста.",
  "library.emptyHint": "Создайте заметку или откройте другую папку.",

  // Note detail
  "note.childCount": "{count} элементов",
  "note.edit": "Редактировать",
  "note.emptyContent": "(пустая заметка)",
  "note.imageRemote": "Изображение ещё на сервере. Нажмите «Скачать текст» выше, чтобы получить его.",
  "note.attachmentRemote": "Заметка-вложение ({mime}) — сначала скачайте её.",
  "note.contentStubbed": "Текст заметки превышает лимит синхронизации и ещё не скачан на это устройство.",
  "note.downloadContent": "Скачать текст",
  "note.downloadFile": "Скачать {title}",
  "note.addAttachment": "Добавить вложение",
  "note.cacheNote": "{count} элементов не скачано на это устройство",
  "note.attachedOne": "Прикреплено: {name}",
  "note.attachedMany": "Прикреплено {count} файлов",

  // Options sheet
  "sheet.layout": "Макет",
  "sheet.sort": "Сортировка",
  "sheet.syncNow": "Синхронизировать сейчас",

  // Editor
  "editor.cancel": "Отменить",
  "editor.image": "Изображение",
  "editor.attachment": "Вложение",
  "editor.pendingAttachments": "{count} файлов будет вставлено в заметку",

  // Search screen
  "search.empty": "Нет подходящих заметок.",
  "search.emptyHint": "Поиск выполняется локально по названиям и тексту.",

  // Attachments
  "attachment.download": "Скачать",
  "attachment.cached": "В кэше",
  "attachment.downloadedKb": "Скачано {kb} КБ",

  // Ink
  "ink.undo": "Отменить",
  "ink.clear": "Очистить",
  "ink.save": "Сохранить чернила",

  // AI
  "ai.empty": "В копии на этом устройстве ещё нет чатов с ИИ.",
  "ai.emptyHint": "Для чатов с ИИ в Trilium нужен настроенный на сервере поставщик моделей; после этого существующие чаты появятся здесь по мере синхронизации.",
  "ai.title": "Заметки с ИИ",
  "ai.chats": "Чаты",
  "ai.chatCount": "{count} чатов",
  "ai.newChat": "Новый чат",
  "ai.open": "Чаты с ИИ",
  "ai.chatTitle": "Чат с ИИ {stamp}",

  // Relative times
  "time.minutesAgo": "{count} минут назад",
  "time.hoursAgo": "{count} часов назад",
  "time.daysAgo": "{count} дней назад",

  // Setup screen
  "setup.title": "Подключение к серверу Trilium",
  "setup.intro": "Введите адрес и пароль вашего собственного сервера. Пароль используется только для чтения ключа синхронизации; далее синхронизация аутентифицируется с помощью HMAC на основе documentSecret, и пароль больше не отправляется.",
  "setup.serverLabel": "Адрес сервера",
  "setup.passwordLabel": "Пароль",
  "setup.firstSync": "Первая синхронизация загружает всё дерево заметок. Двоичные вложения размером более 4 МиБ не скачиваются; они загружаются по мере открытия.",
  "setup.originWarning": "⚠️ Адрес должен быть <b>того же источника</b>, что и эта страница. Trilium отправляет <code>Cross-Origin-Resource-Policy: same-origin</code> и не отправляет заголовки CORS, поэтому браузер сразу отклоняет межсайтовое чтение. В режиме разработки Vite проксирует <code>/api</code> на настоящий сервер; в продакшене размещайте это приложение на том же источнике, что и сервер (или позвольте нативной оболочке пересылать запросы).",

  // Settings screen
  "settings.server": "Сервер: {host}",
  "settings.vaultId": "ID базы знаний: ",
  "settings.localCounts": "Локально: {notes} заметок · {branches} веток · {attributes} атрибутов · {blobs} блобов",
  "settings.vaultSwitch": "Переключение на <b>другую базу знаний</b> автоматически очищает локальную копию — сущности из двух баз знаний потом невозможно разделить. Кнопка ниже нужна только для ручной очистки.",
  "settings.language": "Язык",
  "settings.syncInterval": "Интервал автоматической синхронизации",
  "settings.blobCap": "Лимит синхронизации вложений (в байтах, 0 = без ограничений)",
  "settings.reconfigure": "Перенастроить сервер",
  "settings.clearData": "Очистить локальные данные (сохранить настройки подключения)",

  // Failures reported from the worker
  "error.cors": "Браузер не может обратиться к {origin}: Trilium отправляет `Cross-Origin-Resource-Policy: same-origin` и не отправляет заголовки CORS, поэтому браузер отклоняет запрос, а не сообщает об ошибке подключения. Используйте приложение для HarmonyOS, которое пересылает запросы нативно, или разместите это приложение на том же источнике, что и сервер. (Исходная ошибка: {message})",
  "error.hashMismatch": "Проверка хеша содержимого не удалась: {count} секторов не совпадают",
  "error.dbInit": "Не удалось инициализировать локальную базу данных: {message}",

  // Device self-test hooks
  "e2e.captureBody": "Создано офлайн на устройстве HarmonyOS: {marker}",
  "e2e.editBody": "{marker} изменено",

  // Inbox
  "inbox.title": "Входящие заметки",
  "inbox.body": "<p>Создано автоматически приложением TriliumMobile. Сюда попадают все заметки с телефона.</p>",
  "settings.inboxTitle": "Название заметки входящих",
  "settings.inboxTitleHint": "Заметки хранятся под этой заметкой. Переименование ничего не потеряет."
}

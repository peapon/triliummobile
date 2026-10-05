/**
 * Spanish messages.
 *
 * Terminology follows Trilium's own `es` translation wherever the concept exists there, so that this
 * client and the user's desktop show the same words for the same thing. The remainder is translated
 * here and has not been reviewed by a native speaker.
 */

export const es: Record<string, string> = {
  // Screens
  "app.notes": "Notas",
  "app.library": "Biblioteca",
  "app.search": "Buscar",
  "app.settings": "Opciones",
  "app.back": "Atrás",
  "app.more": "Más",
  "app.showOptions": "Mostrar opciones",
  "app.close": "Cerrar",
  "app.all": "Todo",

  // Editor
  "editor.new": "Nueva nota",
  "editor.title": "Título",
  "editor.titlePlaceholder": "Título (opcional)",
  "editor.bodyPlaceholder": "Escribe lo que quieras recordar…",
  "editor.save": "Listo",
  "editor.saved": "Guardado, pendiente de sincronizar",
  "editor.empty": "Nada escrito",

  // Note actions
  "note.rename": "Renombrar",
  "note.delete": "Eliminar",
  "note.deleteTitle": "Eliminar nota",
  "note.renamed": "Renombrado, pendiente de sincronizar",
  "note.deleted": "Eliminado, pendiente de sincronizar",
  "note.untitled": "Sin título",
  "note.untitledLower": "(sin título)",
  "note.this": "esta nota",
  "note.deleteBody": "«{title}» y todas sus notas hijas se eliminarán, y esto se sincronizará con tus otros dispositivos.",

  // Search
  "search.placeholder": "Buscar títulos y texto…",

  // Layout and sorting
  "layout.list": "Lista",
  "layout.grid": "Cuadrícula",
  "sort.server": "Orden del servidor",
  "sort.modified": "Modificado",
  "sort.created": "Creado",
  "sort.title": "Título",
  "time.justNow": "ahora mismo",
  "time.updated": "Modificado {date}",

  // Setup
  "setup.prompt": "Introduce la dirección y la contraseña del servidor",
  "setup.connect": "Conectar y sincronizar",
  "setup.connecting": "Conectando…",
  "setup.notConfigured": "Sin configurar",
  "setup.notConfiguredParen": "(sin configurar)",
  "setup.notSetParen": "(sin establecer)",
  "setup.notInitialised": "Este servidor aún no se ha inicializado.",
  "setup.notInitialisedLong": "Este servidor aún no se ha inicializado. Completa primero la configuración de Trilium en un navegador.",
  "setup.noSecret": "El servidor no devolvió documentId / documentSecret; puede que la contraseña sea incorrecta.",
  "setup.noServer": "No hay servidor configurado",
  "setup.differentVault": "Se ha detectado otra base de conocimiento; se está borrando la copia local…",
  "setup.connectingServer": "Conectando con el servidor…",
  "setup.pulling": "Recibiendo…",
  "setup.pushing": "Enviando los cambios locales…",
  "setup.waitForFirstSync": "La primera sincronización aún no ha terminado; inténtalo de nuevo en un momento",
  "setup.cleared": "Copia local borrada; la próxima sincronización la descargará de nuevo",

  // Sync
  "sync.syncing": "Sincronizando…",
  "sync.failed": "La sincronización falló",
  "sync.done": "Sincronizado",
  "sync.complete": "Sincronización completada",
  "sync.completeDetail": "Sincronización completada: {pulled} recibidos en {seconds} s",
  "sync.pending": "{count} por sincronizar",

  // Attachments
  "attachment.downloading": "Descargando…",
  "attachment.downloadFailed": "Error de descarga",
  "attachment.notLocal": "Este adjunto aún no se ha descargado en este dispositivo",

  // Ink
  "ink.label": "Tinta",
  "ink.labelDirty": "Tinta •",
  "ink.hint": "Escribe con un lápiz o con el dedo",
  "ink.penDetected": "Lápiz detectado",
  "ink.saved": "Tinta guardada; se sincronizará con la nota",
  "ink.red": "Rojo",
  "ink.green": "Verde",
  "ink.blue": "Azul",
  "ink.white": "Blanco",

  // AI
  "ai.untitledChat": "Chat sin título",
  "ai.created": "Chat creado, pendiente de sincronizar",

  // Automatic sync intervals
  "interval.off": "Desactivado (solo manual)",
  "interval.1m": "1 minuto",
  "interval.5m": "5 minutos",
  "interval.15m": "15 minutos",
  "interval.30m": "30 minutos",
  "interval.1h": "1 hora",
  "interval.2h": "2 horas",
  "interval.4h": "4 horas",

  // Cache sizes
  "cache.5m": "5 minutos",
  "cache.30m": "30 minutos",

  // Labels shared by more than one screen
  "common.cancel": "Cancelar",
  "common.save": "Guardar",
  "common.saved": "Guardado",

  // Boot
  "boot.openingDb": "Abriendo la base de datos local…",
  "boot.dbFailed": "No se pudo abrir la base de datos local",

  // Quick notes list
  "notes.emptyAfterSync": "Tus notas rápidas aparecerán aquí cuando termine la primera sincronización.",
  "notes.empty": "Aún no hay notas.",
  "notes.emptyHint": "Toca el campo de arriba para escribir la primera.",
  "notes.recent": "Recientes",
  "notes.count": "{count} notas",

  // Library
  "library.empty": "Esta carpeta está vacía.",
  "library.emptyHint": "Escribe una nota o abre otra carpeta.",

  // Note detail
  "note.childCount": "{count} elementos",
  "note.edit": "Editar",
  "note.emptyContent": "(nota vacía)",
  "note.imageRemote": "La imagen sigue en el servidor. Toca «Descargar texto» arriba para obtenerla.",
  "note.attachmentRemote": "Nota adjunta ({mime}) — descárgala primero.",
  "note.contentStubbed": "El texto de la nota supera el límite de sincronización y aún no se ha descargado en este dispositivo.",
  "note.downloadContent": "Descargar texto",
  "note.downloadFile": "Descargar {title}",
  "note.addAttachment": "Añadir adjunto",
  "note.cacheNote": "{count} elementos no se han descargado en este dispositivo",
  "note.attachedOne": "Se adjuntó {name}",
  "note.attachedMany": "Se adjuntaron {count} archivos",

  // Options sheet
  "sheet.layout": "Disposición",
  "sheet.sort": "Ordenar por",
  "sheet.syncNow": "Sincronizar ahora",

  // Editor
  "editor.cancel": "Descartar",
  "editor.image": "Imagen",
  "editor.attachment": "Adjunto",
  "editor.pendingAttachments": "Se insertarán {count} archivos en la nota",

  // Search screen
  "search.empty": "No hay notas coincidentes.",
  "search.emptyHint": "La búsqueda es local y coincide con títulos y texto.",

  // Attachments
  "attachment.download": "Descargar",
  "attachment.cached": "En caché",
  "attachment.downloadedKb": "Descargados {kb} KB",

  // Ink
  "ink.undo": "Deshacer",
  "ink.clear": "Borrar",
  "ink.save": "Guardar tinta",

  // AI
  "ai.empty": "Todavía no hay chats de IA en la copia de este dispositivo.",
  "ai.emptyHint": "Los chats de IA de Trilium necesitan un proveedor de modelos configurado en el servidor; cuando lo haya, los chats existentes aparecerán aquí a medida que se sincronicen.",
  "ai.title": "Notas de IA",
  "ai.chats": "Chats",
  "ai.chatCount": "{count} chats",
  "ai.newChat": "Nuevo chat",
  "ai.open": "Chats de IA",
  "ai.chatTitle": "Chat de IA {stamp}",

  // Relative times
  "time.minutesAgo": "hace {count} minutos",
  "time.hoursAgo": "hace {count} horas",
  "time.daysAgo": "hace {count} días",

  // Setup screen
  "setup.title": "Conectar con un servidor Trilium",
  "setup.intro": "Introduce la dirección y la contraseña de tu propio servidor. La contraseña solo se usa para leer la clave de sincronización; después, la sincronización se autentica con un HMAC derivado del documentSecret y la contraseña no se vuelve a enviar.",
  "setup.serverLabel": "Dirección del servidor",
  "setup.passwordLabel": "Contraseña",
  "setup.firstSync": "La primera sincronización descarga todo el árbol de notas. Los adjuntos binarios de más de 4 MiB no se descargan; se obtienen al abrirlos.",
  "setup.originWarning": "⚠️ La dirección debe ser <b>del mismo origen</b> que esta página. Trilium envía <code>Cross-Origin-Resource-Policy: same-origin</code> y ninguna cabecera CORS, así que el navegador rechaza directamente una lectura entre orígenes. En desarrollo, Vite redirige <code>/api</code> al servidor real; en producción, sirve esta aplicación desde el mismo origen que el servidor (o deja que el contenedor nativo reenvíe las peticiones).",

  // Settings screen
  "settings.server": "Servidor: {host}",
  "settings.vaultId": "ID de la base de conocimiento: ",
  "settings.localCounts": "Local: {notes} notas · {branches} ramas · {attributes} atributos · {blobs} blobs",
  "settings.vaultSwitch": "Cambiar a <b>otra base de conocimiento</b> borra la copia local automáticamente: las entidades de dos bases de conocimiento ya no se pueden separar después. El botón de abajo solo sirve para borrarla a mano.",
  "settings.language": "Idioma",
  "settings.syncInterval": "Intervalo de sincronización automática",
  "settings.blobCap": "Límite de sincronización de adjuntos (bytes, 0 = sin límite)",
  "settings.reconfigure": "Reconfigurar servidor",
  "settings.clearData": "Borrar los datos locales (conservar la configuración de conexión)",

  // Failures reported from the worker
  "error.cors": "El navegador no puede acceder a {origin}: Trilium envía `Cross-Origin-Resource-Policy: same-origin` y ninguna cabecera CORS, así que el navegador rechaza la petición en lugar de no poder conectarse. Usa la aplicación para HarmonyOS, que reenvía las peticiones de forma nativa, o sirve esta aplicación desde el mismo origen que el servidor. (Error original: {message})",
  "error.hashMismatch": "La verificación del hash del contenido falló: {count} sectores no coinciden",
  "error.dbInit": "No se pudo inicializar la base de datos local: {message}",

  // Device self-test hooks
  "e2e.captureBody": "Creado sin conexión por el dispositivo HarmonyOS: {marker}",
  "e2e.editBody": "{marker} editado",

  // Inbox
  "inbox.title": "Bandeja de notas rápidas",
  "inbox.body": "<p>Creada automáticamente por TriliumMobile. Aquí llegan todas las notas rápidas del teléfono.</p>",
  "settings.inboxTitle": "Título de la nota de la bandeja de entrada",
  "settings.inboxTitleHint": "Las notas rápidas se guardan bajo esta nota. Cambiarle el nombre no pierde nada."
}

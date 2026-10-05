/**
 * German messages.
 *
 * Terminology follows Trilium's own `de` translation wherever the concept exists there, so that this
 * client and the user's desktop show the same words for the same thing. The remainder is translated
 * here and has not been reviewed by a native speaker.
 */

export const de: Record<string, string> = {
  // Screens
  "app.notes": "Notizen",
  "app.library": "Bibliothek",
  "app.search": "Suche",
  "app.settings": "Einstellungen",
  "app.back": "Zurück",
  "app.more": "Mehr",
  "app.showOptions": "Optionen anzeigen",
  "app.close": "Schließen",
  "app.all": "Alle",

  // Editor
  "editor.new": "Neue Notiz",
  "editor.title": "Titel",
  "editor.titlePlaceholder": "Titel (optional)",
  "editor.bodyPlaceholder": "Schreib auf, was du dir merken willst…",
  "editor.save": "Fertig",
  "editor.saved": "Gespeichert, wartet auf Sync",
  "editor.empty": "Nichts geschrieben",

  // Note actions
  "note.rename": "Umbenennen",
  "note.delete": "Löschen",
  "note.deleteTitle": "Notiz löschen",
  "note.renamed": "Umbenannt, wartet auf Sync",
  "note.deleted": "Gelöscht, wartet auf Sync",
  "note.untitled": "Ohne Titel",
  "note.untitledLower": "(ohne Titel)",
  "note.this": "diese Notiz",
  "note.deleteBody": "„{title}“ und alle untergeordneten Notizen werden gelöscht und mit deinen anderen Geräten synchronisiert.",

  // Search
  "search.placeholder": "Titel und Text durchsuchen…",

  // Layout and sorting
  "layout.list": "Liste",
  "layout.grid": "Raster",
  "sort.server": "Server-Reihenfolge",
  "sort.modified": "Geändert",
  "sort.created": "Erstellt",
  "sort.title": "Titel",
  "time.justNow": "gerade eben",
  "time.updated": "Geändert {date}",

  // Setup
  "setup.prompt": "Serveradresse und Passwort eingeben",
  "setup.connect": "Verbinden und synchronisieren",
  "setup.connecting": "Verbinden…",
  "setup.notConfigured": "Nicht konfiguriert",
  "setup.notConfiguredParen": "(nicht konfiguriert)",
  "setup.notSetParen": "(nicht gesetzt)",
  "setup.notInitialised": "Dieser Server wurde noch nicht initialisiert.",
  "setup.notInitialisedLong": "Dieser Server wurde noch nicht initialisiert. Führe die Trilium-Einrichtung zuerst im Browser durch.",
  "setup.noSecret": "Der Server hat keine documentId / kein documentSecret zurückgegeben; das Passwort ist möglicherweise falsch.",
  "setup.noServer": "Kein Server konfiguriert",
  "setup.differentVault": "Anderer Vault erkannt – lokale Kopie wird gelöscht…",
  "setup.connectingServer": "Verbindung zum Server wird hergestellt…",
  "setup.pulling": "Wird abgerufen…",
  "setup.pushing": "Lokale Änderungen werden hochgeladen…",
  "setup.waitForFirstSync": "Die erste Synchronisierung ist noch nicht fertig; versuche es gleich noch einmal",
  "setup.cleared": "Lokale Kopie gelöscht; die nächste Synchronisierung lädt sie erneut",

  // Sync
  "sync.syncing": "Synchronisiere…",
  "sync.failed": "Synchronisierung fehlgeschlagen",
  "sync.done": "Synchronisiert",
  "sync.complete": "Synchronisierung abgeschlossen",
  "sync.completeDetail": "Synchronisierung abgeschlossen: {pulled} abgerufen in {seconds}s",
  "sync.pending": "{count} ausstehend",

  // Attachments
  "attachment.downloading": "Wird heruntergeladen…",
  "attachment.downloadFailed": "Download fehlgeschlagen",
  "attachment.notLocal": "Dieser Anhang wurde noch nicht auf dieses Gerät heruntergeladen",

  // Ink
  "ink.label": "Handschrift",
  "ink.labelDirty": "Handschrift •",
  "ink.hint": "Mit Stift oder Finger schreiben",
  "ink.penDetected": "Stift erkannt",
  "ink.saved": "Handschrift gespeichert; sie wird mit der Notiz synchronisiert",
  "ink.red": "Rot",
  "ink.green": "Grün",
  "ink.blue": "Blau",
  "ink.white": "Weiß",

  // AI
  "ai.untitledChat": "Unbenannter Chat",
  "ai.created": "Chat erstellt, wartet auf Sync",

  // Automatic sync intervals
  "interval.off": "Aus (nur manuell)",
  "interval.1m": "1 Minute",
  "interval.5m": "5 Minuten",
  "interval.15m": "15 Minuten",
  "interval.30m": "30 Minuten",
  "interval.1h": "1 Stunde",
  "interval.2h": "2 Stunden",
  "interval.4h": "4 Stunden",

  // Cache sizes
  "cache.5m": "5 Minuten",
  "cache.30m": "30 Minuten",

  // Labels shared by more than one screen
  "common.cancel": "Abbrechen",
  "common.save": "Speichern",
  "common.saved": "Gespeichert",

  // Boot
  "boot.openingDb": "Lokale Datenbank wird geöffnet…",
  "boot.dbFailed": "Lokale Datenbank konnte nicht geöffnet werden",

  // Quick notes list
  "notes.emptyAfterSync": "Nach der ersten Synchronisierung erscheinen deine Notizen hier.",
  "notes.empty": "Noch keine Notizen.",
  "notes.emptyHint": "Tippe oben ins Feld, um die erste zu schreiben.",
  "notes.recent": "Zuletzt",
  "notes.count": "{count} Notizen",

  // Library
  "library.empty": "Dieser Ordner ist leer.",
  "library.emptyHint": "Schreibe eine Notiz oder öffne einen anderen Ordner.",

  // Note detail
  "note.childCount": "{count} Einträge",
  "note.edit": "Bearbeiten",
  "note.emptyContent": "(leere Notiz)",
  "note.imageRemote": "Das Bild liegt noch auf dem Server. Tippe oben auf „Text herunterladen“, um es zu holen.",
  "note.attachmentRemote": "Anhang-Notiz ({mime}) – zuerst herunterladen.",
  "note.contentStubbed": "Der Notiztext überschreitet das Synchronisierungslimit und wurde noch nicht auf dieses Gerät heruntergeladen.",
  "note.downloadContent": "Text herunterladen",
  "note.downloadFile": "{title} herunterladen",
  "note.addAttachment": "Anhang hinzufügen",
  "note.cacheNote": "{count} Einträge wurden noch nicht auf dieses Gerät heruntergeladen",
  "note.attachedOne": "{name} angehängt",
  "note.attachedMany": "{count} Dateien angehängt",

  // Options sheet
  "sheet.layout": "Layout",
  "sheet.sort": "Sortieren nach",
  "sheet.syncNow": "Jetzt synchronisieren",

  // Editor
  "editor.cancel": "Verwerfen",
  "editor.image": "Bild",
  "editor.attachment": "Anhang",
  "editor.pendingAttachments": "{count} Dateien werden in die Notiz eingefügt",

  // Search screen
  "search.empty": "Keine passenden Notizen.",
  "search.emptyHint": "Die Suche läuft lokal und findet sowohl Titel als auch Text.",

  // Attachments
  "attachment.download": "Herunterladen",
  "attachment.cached": "Im Cache",
  "attachment.downloadedKb": "Heruntergeladen: {kb} KB",

  // Ink
  "ink.undo": "Rückgängig",
  "ink.clear": "Leeren",
  "ink.save": "Handschrift speichern",

  // AI
  "ai.empty": "In der Kopie auf diesem Gerät gibt es noch keine KI-Chats.",
  "ai.emptyHint": "Trilium-KI-Chats benötigen einen auf dem Server konfigurierten Modellanbieter; sobald einer eingerichtet ist, erscheinen vorhandene Chats beim Synchronisieren hier.",
  "ai.title": "KI-Notizen",
  "ai.chats": "Chats",
  "ai.chatCount": "{count} Chats",
  "ai.newChat": "Neuer Chat",
  "ai.open": "KI-Chats",
  "ai.chatTitle": "KI-Chat {stamp}",

  // Relative times
  "time.minutesAgo": "vor {count} Minuten",
  "time.hoursAgo": "vor {count} Stunden",
  "time.daysAgo": "vor {count} Tagen",

  // Setup screen
  "setup.title": "Mit einem Trilium-Server verbinden",
  "setup.intro": "Gib Adresse und Passwort deines eigenen Servers ein. Das Passwort wird nur verwendet, um das Synchronisierungsgeheimnis zu lesen; danach wird die Synchronisierung mit einem HMAC aus dem documentSecret authentifiziert und das Passwort nie wieder gesendet.",
  "setup.serverLabel": "Serveradresse",
  "setup.passwordLabel": "Passwort",
  "setup.firstSync": "Die erste Synchronisierung lädt den gesamten Notizbaum. Binäre Anhänge über 4 MiB werden nicht heruntergeladen, sondern erst beim Öffnen bei Bedarf geholt.",
  "setup.originWarning": "⚠️ Die Adresse muss <b>gleicher Herkunft</b> (same-origin) wie diese Seite sein. Trilium sendet <code>Cross-Origin-Resource-Policy: same-origin</code> und keine CORS-Header, daher lehnt der Browser einen Cross-Origin-Zugriff direkt ab. In der Entwicklung leitet Vite <code>/api</code> an den echten Server weiter; im Produktivbetrieb sollte diese App unter derselben Herkunft wie der Server laufen (oder die native Hülle die Anfragen weiterleiten lassen).",

  // Settings screen
  "settings.server": "Server: {host}",
  "settings.vaultId": "Vault-ID: ",
  "settings.localCounts": "Lokal: {notes} Notizen · {branches} Zweige · {attributes} Attribute · {blobs} Blobs",
  "settings.vaultSwitch": "Beim Wechsel zu <b>einem anderen Vault</b> wird die lokale Kopie automatisch gelöscht – Entitäten aus zwei Vaults lassen sich danach nicht mehr trennen. Die Schaltfläche unten ist nur zum manuellen Leeren.",
  "settings.language": "Sprache",
  "settings.syncInterval": "Automatisches Synchronisierungsintervall",
  "settings.blobCap": "Synchronisierungslimit für Anhänge (Bytes, 0 = unbegrenzt)",
  "settings.reconfigure": "Server neu konfigurieren",
  "settings.clearData": "Lokale Daten löschen (Verbindungseinstellungen behalten)",

  // Failures reported from the worker
  "error.cors": "Der Browser kann {origin} nicht erreichen: Trilium sendet `Cross-Origin-Resource-Policy: same-origin` und keine CORS-Header, daher lehnt der Browser die Anfrage ab, statt keine Verbindung herstellen zu können. Verwende die HarmonyOS-App, die Anfragen nativ weiterleitet, oder liefere diese App unter derselben Herkunft wie der Server aus. (Ursprünglicher Fehler: {message})",
  "error.hashMismatch": "Inhalts-Hash-Prüfung fehlgeschlagen: {count} Sektoren weichen ab",
  "error.dbInit": "Die lokale Datenbank konnte nicht initialisiert werden: {message}",

  // Device self-test hooks
  "e2e.captureBody": "Offline vom HarmonyOS-Gerät erstellt: {marker}",
  "e2e.editBody": "{marker} bearbeitet",

  // Inbox
  "inbox.title": "Notizen-Posteingang",
  "inbox.body": "<p>Wird automatisch von TriliumMobile erstellt. Alle Notizen vom Handy landen hier.</p>",
  "settings.inboxTitle": "Titel der Posteingangsnotiz",
  "settings.inboxTitleHint": "Notizen werden unter dieser Notiz gespeichert. Umbenennen verliert nichts."
}

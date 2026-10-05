/**
 * Dutch messages.
 *
 * Terminology follows Trilium's own `nl` translation wherever the concept exists there, so that this
 * client and the user's desktop show the same words for the same thing. The remainder is translated
 * here and has not been reviewed by a native speaker.
 */

export const nl: Record<string, string> = {
  // Screens
  "app.notes": "Notities",
  "app.library": "Bibliotheek",
  "app.search": "Zoeken",
  "app.settings": "Instellingen",
  "app.back": "Terug",
  "app.more": "Meer",
  "app.showOptions": "Opties tonen",
  "app.close": "Sluiten",
  "app.all": "Alle",

  // Editor
  "editor.new": "Nieuwe notitie",
  "editor.title": "Titel",
  "editor.titlePlaceholder": "Titel (optioneel)",
  "editor.bodyPlaceholder": "Schrijf op wat je wilt onthouden…",
  "editor.save": "Klaar",
  "editor.saved": "Opgeslagen, wacht op sync",
  "editor.empty": "Niets geschreven",

  // Note actions
  "note.rename": "Hernoemen",
  "note.delete": "Verwijderen",
  "note.deleteTitle": "Notitie verwijderen",
  "note.renamed": "Hernoemd, wacht op sync",
  "note.deleted": "Verwijderd, wacht op sync",
  "note.untitled": "Zonder titel",
  "note.untitledLower": "(zonder titel)",
  "note.this": "deze notitie",
  "note.deleteBody": "“{title}” en alle onderliggende notities worden verwijderd en dit wordt naar je andere apparaten gesynchroniseerd.",

  // Search
  "search.placeholder": "Titel en tekst doorzoeken…",

  // Layout and sorting
  "layout.list": "Lijst",
  "layout.grid": "Raster",
  "sort.server": "Servervolgorde",
  "sort.modified": "Gewijzigd",
  "sort.created": "Aangemaakt",
  "sort.title": "Titel",
  "time.justNow": "zojuist",
  "time.updated": "Gewijzigd {date}",

  // Setup
  "setup.prompt": "Voer het serveradres en wachtwoord in",
  "setup.connect": "Verbinden en synchroniseren",
  "setup.connecting": "Verbinden…",
  "setup.notConfigured": "Niet geconfigureerd",
  "setup.notConfiguredParen": "(niet geconfigureerd)",
  "setup.notSetParen": "(niet ingesteld)",
  "setup.notInitialised": "Deze server is nog niet geïnitialiseerd.",
  "setup.notInitialisedLong": "Deze server is nog niet geïnitialiseerd. Doorloop eerst de Trilium-installatie in een browser.",
  "setup.noSecret": "De server heeft geen documentId / documentSecret teruggegeven; het wachtwoord is mogelijk onjuist.",
  "setup.noServer": "Geen server geconfigureerd",
  "setup.differentVault": "Andere kluis gedetecteerd – lokale kopie wordt gewist…",
  "setup.connectingServer": "Verbinden met de server…",
  "setup.pulling": "Ophalen…",
  "setup.pushing": "Lokale wijzigingen worden geüpload…",
  "setup.waitForFirstSync": "De eerste synchronisatie is nog niet klaar; probeer het zo opnieuw",
  "setup.cleared": "Lokale kopie gewist; de volgende synchronisatie haalt deze opnieuw op",

  // Sync
  "sync.syncing": "Synchroniseren…",
  "sync.failed": "Synchronisatie mislukt",
  "sync.done": "Gesynchroniseerd",
  "sync.complete": "Synchronisatie voltooid",
  "sync.completeDetail": "Synchronisatie voltooid: {pulled} opgehaald in {seconds}s",
  "sync.pending": "{count} te synchroniseren",

  // Attachments
  "attachment.downloading": "Downloaden…",
  "attachment.downloadFailed": "Download mislukt",
  "attachment.notLocal": "Deze bijlage is nog niet naar dit apparaat gedownload",

  // Ink
  "ink.label": "Inkt",
  "ink.labelDirty": "Inkt •",
  "ink.hint": "Schrijf met een pen of je vinger",
  "ink.penDetected": "Stylus gedetecteerd",
  "ink.saved": "Inkt opgeslagen; deze wordt met de notitie gesynchroniseerd",
  "ink.red": "Rood",
  "ink.green": "Groen",
  "ink.blue": "Blauw",
  "ink.white": "Wit",

  // AI
  "ai.untitledChat": "Chat zonder titel",
  "ai.created": "Chat aangemaakt, wacht op sync",

  // Automatic sync intervals
  "interval.off": "Uit (alleen handmatig)",
  "interval.1m": "1 minuut",
  "interval.5m": "5 minuten",
  "interval.15m": "15 minuten",
  "interval.30m": "30 minuten",
  "interval.1h": "1 uur",
  "interval.2h": "2 uur",
  "interval.4h": "4 uur",

  // Cache sizes
  "cache.5m": "5 minuten",
  "cache.30m": "30 minuten",

  // Labels shared by more than one screen
  "common.cancel": "Annuleren",
  "common.save": "Opslaan",
  "common.saved": "Opgeslagen",

  // Boot
  "boot.openingDb": "Lokale database wordt geopend…",
  "boot.dbFailed": "Lokale database kon niet worden geopend",

  // Quick notes list
  "notes.emptyAfterSync": "Je notities verschijnen hier zodra de eerste synchronisatie klaar is.",
  "notes.empty": "Nog geen notities.",
  "notes.emptyHint": "Tik in het veld hierboven om de eerste te schrijven.",
  "notes.recent": "Recent",
  "notes.count": "{count} notities",

  // Library
  "library.empty": "Deze map is leeg.",
  "library.emptyHint": "Schrijf een notitie of open een andere map.",

  // Note detail
  "note.childCount": "{count} items",
  "note.edit": "Bewerken",
  "note.emptyContent": "(lege notitie)",
  "note.imageRemote": "De afbeelding staat nog op de server. Tik hierboven op “Tekst downloaden” om deze op te halen.",
  "note.attachmentRemote": "Bijlagenotitie ({mime}) – eerst downloaden.",
  "note.contentStubbed": "De notitietekst overschrijdt de synchronisatielimiet en is nog niet naar dit apparaat gedownload.",
  "note.downloadContent": "Tekst downloaden",
  "note.downloadFile": "{title} downloaden",
  "note.addAttachment": "Bijlage toevoegen",
  "note.cacheNote": "{count} items zijn nog niet naar dit apparaat gedownload",
  "note.attachedOne": "{name} toegevoegd",
  "note.attachedMany": "{count} bestanden toegevoegd",

  // Options sheet
  "sheet.layout": "Weergave",
  "sheet.sort": "Sorteren op",
  "sheet.syncNow": "Nu synchroniseren",

  // Editor
  "editor.cancel": "Verwerpen",
  "editor.image": "Afbeelding",
  "editor.attachment": "Bijlage",
  "editor.pendingAttachments": "{count} bestanden worden in de notitie ingevoegd",

  // Search screen
  "search.empty": "Geen overeenkomende notities.",
  "search.emptyHint": "Zoeken gebeurt lokaal en doorzoekt zowel titels als tekst.",

  // Attachments
  "attachment.download": "Downloaden",
  "attachment.cached": "In cache",
  "attachment.downloadedKb": "Gedownload: {kb} KB",

  // Ink
  "ink.undo": "Ongedaan maken",
  "ink.clear": "Wissen",
  "ink.save": "Inkt opslaan",

  // AI
  "ai.empty": "Er zijn nog geen AI-chats in de kopie op dit apparaat.",
  "ai.emptyHint": "AI-chats van Trilium vereisen een op de server geconfigureerde modelaanbieder; zodra die er is, verschijnen bestaande chats hier naarmate ze synchroniseren.",
  "ai.title": "AI-notities",
  "ai.chats": "Chats",
  "ai.chatCount": "{count} chats",
  "ai.newChat": "Nieuwe chat",
  "ai.open": "AI-chats",
  "ai.chatTitle": "AI-chat {stamp}",

  // Relative times
  "time.minutesAgo": "{count} minuten geleden",
  "time.hoursAgo": "{count} uur geleden",
  "time.daysAgo": "{count} dagen geleden",

  // Setup screen
  "setup.title": "Verbinden met een Trilium-server",
  "setup.intro": "Voer het adres en wachtwoord van je eigen server in. Het wachtwoord wordt alleen gebruikt om het synchronisatiegeheim te lezen; daarna wordt de synchronisatie geverifieerd met een HMAC op basis van het documentSecret en wordt het wachtwoord nooit meer verzonden.",
  "setup.serverLabel": "Serveradres",
  "setup.passwordLabel": "Wachtwoord",
  "setup.firstSync": "De eerste synchronisatie haalt de volledige notitieboom op. Binaire bijlagen groter dan 4 MiB worden niet gedownload; ze worden op verzoek opgehaald wanneer je ze opent.",
  "setup.originWarning": "⚠️ Het adres moet <b>same-origin</b> zijn met deze pagina. Trilium stuurt <code>Cross-Origin-Resource-Policy: same-origin</code> en geen CORS-headers, dus een browser weigert een cross-origin verzoek direct. Tijdens ontwikkeling proxyt Vite <code>/api</code> naar de echte server; in productie moet deze app vanaf dezelfde origin als de server worden geserveerd (of de native shell de verzoeken laten doorsturen).",

  // Settings screen
  "settings.server": "Server: {host}",
  "settings.vaultId": "Kluis-ID: ",
  "settings.localCounts": "Lokaal: {notes} notities · {branches} vertakkingen · {attributes} attributen · {blobs} blobs",
  "settings.vaultSwitch": "Bij het overschakelen naar <b>een andere kluis</b> wordt de lokale kopie automatisch gewist – entiteiten uit twee kluizen zijn daarna niet meer te ontwarren. De knop hieronder is alleen om handmatig te wissen.",
  "settings.language": "Taal",
  "settings.syncInterval": "Automatisch synchronisatie-interval",
  "settings.blobCap": "Synchronisatielimiet voor bijlagen (bytes, 0 = onbeperkt)",
  "settings.reconfigure": "Server opnieuw configureren",
  "settings.clearData": "Lokale gegevens wissen (verbindingsinstellingen behouden)",

  // Failures reported from the worker
  "error.cors": "De browser kan {origin} niet bereiken: Trilium stuurt `Cross-Origin-Resource-Policy: same-origin` en geen CORS-headers, dus de browser weigert het verzoek in plaats van geen verbinding te kunnen maken. Gebruik de HarmonyOS-app, die verzoeken native doorstuurt, of serveer deze app vanaf dezelfde origin als de server. (Oorspronkelijke fout: {message})",
  "error.hashMismatch": "Controle van de inhoudshash mislukt: {count} sectoren verschillen",
  "error.dbInit": "De lokale database kon niet worden geïnitialiseerd: {message}",

  // Device self-test hooks
  "e2e.captureBody": "Offline aangemaakt door het HarmonyOS-apparaat: {marker}",
  "e2e.editBody": "{marker} bewerkt",

  // Inbox
  "inbox.title": "Notities-inbox",
  "inbox.body": "<p>Automatisch aangemaakt door TriliumMobile. Alle notities vanaf de telefoon komen hier terecht.</p>",
  "settings.inboxTitle": "Titel van de inboxnotitie",
  "settings.inboxTitleHint": "Notities worden onder deze notitie bewaard. De naam wijzigen verliest niets."
}

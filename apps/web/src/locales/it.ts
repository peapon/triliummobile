/**
 * Italian messages.
 *
 * Terminology follows Trilium's own `it` translation wherever the concept exists there, so that this
 * client and the user's desktop show the same words for the same thing. The remainder is translated
 * here and has not been reviewed by a native speaker.
 */

export const it: Record<string, string> = {
  // Screens
  "app.notes": "Note",
  "app.library": "Biblioteca",
  "app.search": "Cerca",
  "app.settings": "Impostazioni",
  "app.back": "Indietro",
  "app.more": "Altro",
  "app.showOptions": "Mostra opzioni",
  "app.close": "Chiudi",
  "app.all": "Tutti",

  // Editor
  "editor.new": "Nuova nota",
  "editor.title": "Titolo",
  "editor.titlePlaceholder": "Titolo (facoltativo)",
  "editor.bodyPlaceholder": "Scrivi quello che vuoi ricordare…",
  "editor.save": "Fatto",
  "editor.saved": "Salvato, in attesa di sincronizzazione",
  "editor.empty": "Niente di scritto",

  // Note actions
  "note.rename": "Rinomina",
  "note.delete": "Elimina",
  "note.deleteTitle": "Elimina nota",
  "note.renamed": "Rinominato, in attesa di sincronizzazione",
  "note.deleted": "Eliminato, in attesa di sincronizzazione",
  "note.untitled": "Senza titolo",
  "note.untitledLower": "(senza titolo)",
  "note.this": "questa nota",
  "note.deleteBody": "«{title}» e tutte le sue note secondarie verranno eliminate; la modifica sarà sincronizzata sugli altri dispositivi.",

  // Search
  "search.placeholder": "Cerca nei titoli e nel testo…",

  // Layout and sorting
  "layout.list": "Lista",
  "layout.grid": "Griglia",
  "sort.server": "Server",
  "sort.modified": "Modificato",
  "sort.created": "Creato",
  "sort.title": "Titolo",
  "time.justNow": "proprio ora",
  "time.updated": "Modificato {date}",

  // Setup
  "setup.prompt": "Inserisci l'indirizzo del server e la password",
  "setup.connect": "Connetti e sincronizza",
  "setup.connecting": "Connessione…",
  "setup.notConfigured": "Non configurato",
  "setup.notConfiguredParen": "(non configurato)",
  "setup.notSetParen": "(non impostato)",
  "setup.notInitialised": "Questo server non è ancora stato inizializzato.",
  "setup.notInitialisedLong": "Questo server non è ancora stato inizializzato. Completa prima la configurazione di Trilium in un browser.",
  "setup.noSecret": "Il server non ha restituito documentId / documentSecret; la password potrebbe essere errata.",
  "setup.noServer": "Nessun server configurato",
  "setup.differentVault": "Rilevata un'altra biblioteca — cancellazione della copia locale…",
  "setup.connectingServer": "Connessione al server…",
  "setup.pulling": "Ricezione…",
  "setup.pushing": "Invio delle modifiche locali…",
  "setup.waitForFirstSync": "La prima sincronizzazione non è ancora terminata; riprova tra poco",
  "setup.cleared": "Copia locale cancellata; la prossima sincronizzazione la scaricherà di nuovo",

  // Sync
  "sync.syncing": "Sincronizzazione…",
  "sync.failed": "Sincronizzazione fallita",
  "sync.done": "Sincronizzato",
  "sync.complete": "Sincronizzazione completata",
  "sync.completeDetail": "Sincronizzazione completata: {pulled} elementi ricevuti in {seconds} s",
  "sync.pending": "{count} elementi da sincronizzare",

  // Attachments
  "attachment.downloading": "Scaricamento…",
  "attachment.downloadFailed": "Scaricamento non riuscito",
  "attachment.notLocal": "Questo allegato non è ancora stato scaricato su questo dispositivo",

  // Ink
  "ink.label": "Inchiostro",
  "ink.labelDirty": "Inchiostro •",
  "ink.hint": "Scrivi con una penna o con il dito",
  "ink.penDetected": "Stilo rilevato",
  "ink.saved": "Inchiostro salvato; sarà sincronizzato con la nota",
  "ink.red": "Rosso",
  "ink.green": "Verde",
  "ink.blue": "Blu",
  "ink.white": "Bianco",

  // AI
  "ai.untitledChat": "Chat senza titolo",
  "ai.created": "Chat creata, in attesa di sincronizzazione",

  // Automatic sync intervals
  "interval.off": "Disattivato (solo manuale)",
  "interval.1m": "1 minuto",
  "interval.5m": "5 minuti",
  "interval.15m": "15 minuti",
  "interval.30m": "30 minuti",
  "interval.1h": "1 ora",
  "interval.2h": "2 ore",
  "interval.4h": "4 ore",

  // Cache sizes
  "cache.5m": "5 minuti",
  "cache.30m": "30 minuti",

  // Labels shared by more than one screen
  "common.cancel": "Annulla",
  "common.save": "Salva",
  "common.saved": "Salvato",

  // Boot
  "boot.openingDb": "Apertura del database locale…",
  "boot.dbFailed": "Impossibile aprire il database locale",

  // Quick notes list
  "notes.emptyAfterSync": "Le tue note rapide appariranno qui al termine della prima sincronizzazione.",
  "notes.empty": "Nessuna nota per ora.",
  "notes.emptyHint": "Tocca il campo qui sopra per scrivere la prima.",
  "notes.recent": "Recenti",
  "notes.count": "{count} note",

  // Library
  "library.empty": "Questa cartella è vuota.",
  "library.emptyHint": "Scrivi una nota rapida oppure apri un'altra cartella.",

  // Note detail
  "note.childCount": "{count} elementi",
  "note.edit": "Modifica",
  "note.emptyContent": "(nota vuota)",
  "note.imageRemote": "L'immagine è ancora sul server. Tocca «Scarica testo» qui sopra per recuperarla.",
  "note.attachmentRemote": "Nota allegato ({mime}) — scaricala prima.",
  "note.contentStubbed": "Il testo supera il limite di sincronizzazione e non è ancora stato scaricato su questo dispositivo.",
  "note.downloadContent": "Scarica testo",
  "note.downloadFile": "Scarica {title}",
  "note.addAttachment": "Aggiungi allegato",
  "note.cacheNote": "{count} elementi non sono stati scaricati su questo dispositivo",
  "note.attachedOne": "Allegato aggiunto: {name}",
  "note.attachedMany": "{count} file allegati",

  // Options sheet
  "sheet.layout": "Visualizzazione",
  "sheet.sort": "Ordina per",
  "sheet.syncNow": "Sincronizza ora",

  // Editor
  "editor.cancel": "Scarta",
  "editor.image": "Immagine",
  "editor.attachment": "Allegato",
  "editor.pendingAttachments": "{count} file verranno inseriti nella nota",

  // Search screen
  "search.empty": "Nessuna nota corrispondente.",
  "search.emptyHint": "La ricerca è locale e considera sia i titoli sia il testo.",

  // Attachments
  "attachment.download": "Scarica",
  "attachment.cached": "In cache",
  "attachment.downloadedKb": "{kb} KB scaricati",

  // Ink
  "ink.undo": "Annulla",
  "ink.clear": "Cancella",
  "ink.save": "Salva inchiostro",

  // AI
  "ai.empty": "Non ci sono ancora chat IA nella copia di questo dispositivo.",
  "ai.emptyHint": "Le chat IA di Trilium richiedono un provider di modelli configurato sul server; una volta configurato, le chat esistenti compariranno qui man mano che vengono sincronizzate.",
  "ai.title": "Note IA",
  "ai.chats": "Chat",
  "ai.chatCount": "{count} chat",
  "ai.newChat": "Nuova chat",
  "ai.open": "Chat IA",
  "ai.chatTitle": "Chat IA {stamp}",

  // Relative times
  "time.minutesAgo": "{count} minuti fa",
  "time.hoursAgo": "{count} ore fa",
  "time.daysAgo": "{count} giorni fa",

  // Setup screen
  "setup.title": "Connetti a un server Trilium",
  "setup.intro": "Inserisci l'indirizzo e la password del tuo server. La password serve solo a leggere la chiave di sincronizzazione; in seguito la sincronizzazione viene autenticata con un HMAC calcolato dal documentSecret e la password non viene più inviata.",
  "setup.serverLabel": "Indirizzo del server",
  "setup.passwordLabel": "Password",
  "setup.firstSync": "La prima sincronizzazione scarica l'intero albero delle note. Gli allegati binari superiori a 4 MiB non vengono scaricati; vengono recuperati su richiesta al momento dell'apertura.",
  "setup.originWarning": "⚠️ L'indirizzo deve avere la <b>stessa origine</b> di questa pagina. Trilium invia <code>Cross-Origin-Resource-Policy: same-origin</code> e nessun header CORS, quindi il browser rifiuta direttamente la lettura cross-origin. In sviluppo Vite inoltra <code>/api</code> al server reale; in produzione servi questa applicazione dalla stessa origine del server (oppure lascia che la shell nativa inoltri le richieste).",

  // Settings screen
  "settings.server": "Server: {host}",
  "settings.vaultId": "ID della biblioteca: ",
  "settings.localCounts": "Locale: {notes} note · {branches} rami · {attributes} attributi · {blobs} blob",
  "settings.vaultSwitch": "Passando a <b>un'altra biblioteca</b> la copia locale viene cancellata automaticamente — le entità di due biblioteche non possono più essere districate. Il pulsante qui sotto serve solo a cancellarla manualmente.",
  "settings.language": "Lingua",
  "settings.syncInterval": "Intervallo di sincronizzazione automatica",
  "settings.blobCap": "Limite di sincronizzazione degli allegati (byte, 0 = illimitato)",
  "settings.reconfigure": "Riconfigura il server",
  "settings.clearData": "Cancella i dati locali (mantieni le impostazioni di connessione)",

  // Failures reported from the worker
  "error.cors": "Il browser non riesce a raggiungere {origin}: Trilium invia `Cross-Origin-Resource-Policy: same-origin` e nessun header CORS, quindi il browser rifiuta la richiesta invece di non riuscire a connettersi. Usa l'app HarmonyOS, che inoltra le richieste in modo nativo, oppure servi questa applicazione dalla stessa origine del server. (Errore originale: {message})",
  "error.hashMismatch": "Verifica dell'hash dei contenuti non riuscita: {count} settori differiscono",
  "error.dbInit": "Inizializzazione del database locale non riuscita: {message}",

  // Device self-test hooks
  "e2e.captureBody": "Creato offline dal dispositivo HarmonyOS: {marker}",
  "e2e.editBody": "{marker} modificato",

  // Inbox
  "inbox.title": "Posta in arrivo",
  "inbox.body": "<p>Creata automaticamente da TriliumMobile. Le note rapide del telefono finiscono tutte qui.</p>",
  "settings.inboxTitle": "Titolo della posta in arrivo",
  "settings.inboxTitleHint": "Le note rapide sono conservate sotto questa nota. Rinominarla non comporta alcuna perdita."
}

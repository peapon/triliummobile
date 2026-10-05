/**
 * French messages.
 *
 * Terminology follows Trilium's own `fr` translation wherever the concept exists there, so that this
 * client and the user's desktop show the same words for the same thing. The remainder is translated
 * here and has not been reviewed by a native speaker.
 */

export const fr: Record<string, string> = {
  // Screens
  "app.notes": "Notes",
  "app.library": "Bibliothèque",
  "app.search": "Rechercher",
  "app.settings": "Paramètres",
  "app.back": "Retour",
  "app.more": "Plus",
  "app.showOptions": "Afficher les options",
  "app.close": "Fermer",
  "app.all": "Tout",

  // Editor
  "editor.new": "Nouvelle note",
  "editor.title": "Titre",
  "editor.titlePlaceholder": "Titre (facultatif)",
  "editor.bodyPlaceholder": "Écrivez ce que vous voulez retenir…",
  "editor.save": "Terminé",
  "editor.saved": "Enregistré, en attente de synchronisation",
  "editor.empty": "Rien d'écrit",

  // Note actions
  "note.rename": "Renommer",
  "note.delete": "Supprimer",
  "note.deleteTitle": "Supprimer la note",
  "note.renamed": "Renommé, en attente de synchronisation",
  "note.deleted": "Supprimé, en attente de synchronisation",
  "note.untitled": "Sans titre",
  "note.untitledLower": "(sans titre)",
  "note.this": "cette note",
  "note.deleteBody": "«\u00a0{title}\u00a0» et toutes ses notes enfants seront supprimées, et la suppression sera synchronisée sur vos autres appareils.",

  // Search
  "search.placeholder": "Rechercher dans les titres et le texte…",

  // Layout and sorting
  "layout.list": "Liste",
  "layout.grid": "Grille",
  "sort.server": "Serveur",
  "sort.modified": "Modifié",
  "sort.created": "Créé",
  "sort.title": "Titre",
  "time.justNow": "à l'instant",
  "time.updated": "Modifié {date}",

  // Setup
  "setup.prompt": "Indiquez l'adresse du serveur et le mot de passe",
  "setup.connect": "Se connecter et synchroniser",
  "setup.connecting": "Connexion…",
  "setup.notConfigured": "Non configuré",
  "setup.notConfiguredParen": "(non configuré)",
  "setup.notSetParen": "(non défini)",
  "setup.notInitialised": "Ce serveur n'a pas encore été initialisé.",
  "setup.notInitialisedLong": "Ce serveur n'a pas encore été initialisé. Terminez d'abord la configuration de Trilium dans un navigateur.",
  "setup.noSecret": "Le serveur n'a pas renvoyé de documentId / documentSecret\u00a0; le mot de passe est peut-être incorrect.",
  "setup.noServer": "Aucun serveur configuré",
  "setup.differentVault": "Une autre bibliothèque a été détectée — suppression de la copie locale…",
  "setup.connectingServer": "Connexion au serveur…",
  "setup.pulling": "Réception…",
  "setup.pushing": "Envoi des modifications locales…",
  "setup.waitForFirstSync": "La première synchronisation n'est pas encore terminée\u00a0; réessayez dans un instant",
  "setup.cleared": "Copie locale effacée\u00a0; la prochaine synchronisation la récupérera",

  // Sync
  "sync.syncing": "Synchronisation…",
  "sync.failed": "Échec de la synchronisation",
  "sync.done": "Synchronisé",
  "sync.complete": "Synchronisation terminée",
  "sync.completeDetail": "Synchronisation terminée\u00a0: {pulled} éléments reçus en {seconds}\u00a0s",
  "sync.pending": "{count} éléments à synchroniser",

  // Attachments
  "attachment.downloading": "Téléchargement…",
  "attachment.downloadFailed": "Échec du téléchargement",
  "attachment.notLocal": "Cette pièce jointe n'a pas encore été téléchargée sur cet appareil",

  // Ink
  "ink.label": "Encre",
  "ink.labelDirty": "Encre •",
  "ink.hint": "Écrivez avec un stylet ou le doigt",
  "ink.penDetected": "Stylet détecté",
  "ink.saved": "Encre enregistrée\u00a0; elle sera synchronisée avec la note",
  "ink.red": "Rouge",
  "ink.green": "Vert",
  "ink.blue": "Bleu",
  "ink.white": "Blanc",

  // AI
  "ai.untitledChat": "Discussion sans titre",
  "ai.created": "Discussion créée, en attente de synchronisation",

  // Automatic sync intervals
  "interval.off": "Désactivé (manuel uniquement)",
  "interval.1m": "1 minute",
  "interval.5m": "5 minutes",
  "interval.15m": "15 minutes",
  "interval.30m": "30 minutes",
  "interval.1h": "1 heure",
  "interval.2h": "2 heures",
  "interval.4h": "4 heures",

  // Cache sizes
  "cache.5m": "5 minutes",
  "cache.30m": "30 minutes",

  // Labels shared by more than one screen
  "common.cancel": "Annuler",
  "common.save": "Enregistrer",
  "common.saved": "Enregistré",

  // Boot
  "boot.openingDb": "Ouverture de la base de données locale…",
  "boot.dbFailed": "Impossible d'ouvrir la base de données locale",

  // Quick notes list
  "notes.emptyAfterSync": "Vos notes rapides apparaîtront ici une fois la première synchronisation terminée.",
  "notes.empty": "Aucune note pour l'instant.",
  "notes.emptyHint": "Touchez le champ ci-dessus pour écrire la première.",
  "notes.recent": "Récentes",
  "notes.count": "{count} notes",

  // Library
  "library.empty": "Ce dossier est vide.",
  "library.emptyHint": "Écrivez une note rapide, ou ouvrez un autre dossier.",

  // Note detail
  "note.childCount": "{count} éléments",
  "note.edit": "Modifier",
  "note.emptyContent": "(note vide)",
  "note.imageRemote": "L'image est encore sur le serveur. Touchez «\u00a0Télécharger le texte\u00a0» ci-dessus pour la récupérer.",
  "note.attachmentRemote": "Note de pièce jointe ({mime}) — à télécharger d'abord.",
  "note.contentStubbed": "Le texte dépasse la limite de synchronisation et n'a pas encore été téléchargé sur cet appareil.",
  "note.downloadContent": "Télécharger le texte",
  "note.downloadFile": "Télécharger {title}",
  "note.addAttachment": "Ajouter une pièce jointe",
  "note.cacheNote": "{count} éléments n'ont pas encore été téléchargés sur cet appareil",
  "note.attachedOne": "Pièce jointe ajoutée\u00a0: {name}",
  "note.attachedMany": "{count} fichiers joints",

  // Options sheet
  "sheet.layout": "Affichage",
  "sheet.sort": "Trier par",
  "sheet.syncNow": "Synchroniser maintenant",

  // Editor
  "editor.cancel": "Abandonner",
  "editor.image": "Image",
  "editor.attachment": "Pièce jointe",
  "editor.pendingAttachments": "{count} fichiers seront insérés dans la note",

  // Search screen
  "search.empty": "Aucune note correspondante.",
  "search.emptyHint": "La recherche est locale et porte sur les titres comme sur le texte.",

  // Attachments
  "attachment.download": "Télécharger",
  "attachment.cached": "En cache",
  "attachment.downloadedKb": "{kb} Ko téléchargés",

  // Ink
  "ink.undo": "Annuler",
  "ink.clear": "Effacer",
  "ink.save": "Enregistrer l'encre",

  // AI
  "ai.empty": "Il n'y a pas encore de discussions IA dans la copie de cet appareil.",
  "ai.emptyHint": "Les discussions IA de Trilium nécessitent un fournisseur de modèle configuré sur le serveur\u00a0; une fois qu'il l'est, les discussions existantes apparaîtront ici au fil de la synchronisation.",
  "ai.title": "Notes IA",
  "ai.chats": "Discussions",
  "ai.chatCount": "{count} discussions",
  "ai.newChat": "Nouvelle discussion",
  "ai.open": "Discussions IA",
  "ai.chatTitle": "Discussion IA {stamp}",

  // Relative times
  "time.minutesAgo": "il y a {count} minutes",
  "time.hoursAgo": "il y a {count} heures",
  "time.daysAgo": "il y a {count} jours",

  // Setup screen
  "setup.title": "Se connecter à un serveur Trilium",
  "setup.intro": "Saisissez l'adresse et le mot de passe de votre propre serveur. Le mot de passe ne sert qu'à lire la clé de synchronisation\u00a0; ensuite, la synchronisation est authentifiée par un HMAC calculé à partir du documentSecret, et le mot de passe n'est plus jamais envoyé.",
  "setup.serverLabel": "Adresse du serveur",
  "setup.passwordLabel": "Mot de passe",
  "setup.firstSync": "La première synchronisation récupère toute l'arborescence des notes. Les pièces jointes binaires de plus de 4 MiB ne sont pas téléchargées\u00a0; elles sont récupérées à la demande, à l'ouverture.",
  "setup.originWarning": "⚠️ L'adresse doit être <b>de même origine</b> que cette page. Le serveur Trilium renvoie <code>Cross-Origin-Resource-Policy: same-origin</code> sans en-têtes CORS, et le navigateur refuse alors purement et simplement la lecture cross-origin. En développement, Vite proxifie <code>/api</code> vers le vrai serveur\u00a0; en production, servez cette application depuis la même origine que le serveur (ou laissez la coque native relayer les requêtes).",

  // Settings screen
  "settings.server": "Serveur\u00a0: {host}",
  "settings.vaultId": "ID de la bibliothèque\u00a0: ",
  "settings.localCounts": "Local\u00a0: {notes} notes · {branches} branches · {attributes} attributs · {blobs} blobs",
  "settings.vaultSwitch": "Passer à <b>une autre bibliothèque</b> efface automatiquement la copie locale — les entités de deux bibliothèques ne peuvent plus être démêlées ensuite. Le bouton ci-dessous ne sert qu'à l'effacer à la main.",
  "settings.language": "Langue",
  "settings.syncInterval": "Intervalle de synchronisation automatique",
  "settings.blobCap": "Limite de synchronisation des pièces jointes (octets, 0 = illimité)",
  "settings.reconfigure": "Reconfigurer le serveur",
  "settings.clearData": "Effacer les données locales (conserver les paramètres de connexion)",

  // Failures reported from the worker
  "error.cors": "Le navigateur ne peut pas joindre {origin}\u00a0: Trilium renvoie `Cross-Origin-Resource-Policy: same-origin` sans en-têtes CORS, le navigateur refuse donc la requête au lieu d'échouer à se connecter. Utilisez l'application HarmonyOS, qui relaie les requêtes nativement, ou servez cette application depuis la même origine que le serveur. (Erreur d'origine\u00a0: {message})",
  "error.hashMismatch": "Échec de la vérification du hachage du contenu\u00a0: {count} secteurs diffèrent",
  "error.dbInit": "Échec de l'initialisation de la base de données locale\u00a0: {message}",

  // Device self-test hooks
  "e2e.captureBody": "Créé hors ligne par l'appareil HarmonyOS\u00a0: {marker}",
  "e2e.editBody": "{marker} modifié",

  // Inbox
  "inbox.title": "Boîte de réception",
  "inbox.body": "<p>Créé automatiquement par TriliumMobile. Les notes rapides du téléphone arrivent toutes ici.</p>",
  "settings.inboxTitle": "Titre de la boîte de réception",
  "settings.inboxTitleHint": "Les notes rapides sont conservées sous cette note. La renommer ne perd rien."
}

# Audit produit Android — parcours, cas limites, cohérence des décisions

Statut : **partiel** (arrêt demandé le 2026-10-29). Lecture seule, aucun build,
aucune exécution sur appareil. Toute affirmation cite un fichier et une ligne ;
rien n'est « vérifié à l'écran ».

Périmètre lu en entier : `ui/screens/{Home,Auth,Intro,Plans,Servers,Profile}.kt`,
`ui/AppController.kt`, `ui/Shell.kt`, `MainActivity.kt`, `DeepLinkBus.kt`,
`net/ApiClient.kt` (DTO et appels), `brand/BrandTokens.kt`, et côté API
`routes/{auth,orders,payments,me,catalog,bundle,account,devices}.ts`,
`services/{payments,customOffer,xui,endpoints}.ts`, `lib/auth.ts`.

## Verdict provisoire

Le parcours **nominal** existe et est lisible : onboarding → inscription →
forfait → commande → navigateur → retour → activation → bundle → connexion.
Mais le parcours **payé** n'est pas récupérable : le retour de paiement est
perdu au démarrage à froid, la commande n'est jamais persistée, et l'écran de
suivi dépend d'un objet en mémoire. Un utilisateur qui a payé peut donc rester
« Sans forfait », sans bouton « Vérifier le paiement », et payer une seconde
fois. Les états d'erreur sont nombreux mais plusieurs sont **inatteignables**
(appareil révoqué) ou **faux** (« Paiement vérifié avec succès ! »,
« Liste des serveurs mise à jour. »).

## Défauts P0

1. **Retour de paiement perdu au démarrage à froid.**
   `MainActivity.kt:38` émet le deep link dans `onCreate` ; le collecteur n'est
   créé que dans `AppController.boot()` (`ui/AppController.kt:247-253`), après
   `withContext(Dispatchers.IO)` (`:213-242`). `DeepLinkBus` n'a **aucun
   replay** (`net/DeepLinkBus.kt:7`, `extraBufferCapacity = 1`). L'émission
   part donc dans le vide. Conséquence : après un paiement, si Android a tué
   l'app pendant que le navigateur était ouvert, aucun rafraîchissement, aucun
   message, aucun rattachement à la commande. L'utilisateur voit son ancien
   état (souvent « Sans forfait »).
2. **La commande n'est jamais persistée ; aucun historique.**
   `order` est un simple état mémoire (`ui/AppController.kt:141`). Au retour,
   `refreshOrder` ne rafraîchit que si `order != null` (`:301`) ; l'orderId du
   deep link est ignoré (`MainActivity.kt:100-105`, `AppController.kt:248`
   collecte sans utiliser la valeur). `checkOrder()` sort immédiatement si
   `order == null` (`:504`). L'écran `OrderDone` n'est atteignable qu'après
   `startOrder` dans le même processus (`Plans.kt:495`) ; le bouton « Suivre ma
   dernière commande » n'apparaît que si `c.order != null`
   (`Profile.kt:259`). L'API expose pourtant `GET /v1/orders`
   (`routes/orders.ts:149`), qu'`ApiClient` n'appelle pas. Conséquence : après
   redémarrage, l'utilisateur ne peut plus vérifier son paiement ; il peut
   racheter.

## Défauts P1

3. **Page de retour Fapshi câblée sur Nevpn, pour les 8 marques.**
   `routes/payments.ts:80-81` code en dur
   `cm.bouendji.vpn://pay/return` et surtout
   `package=cm.bouendji.nevpn` dans l'`intent://` de redirection automatique.
   Le manifeste Android, lui, enregistre le schéma fixe
   `cm.bouendji.vpn` (`AndroidManifest.xml:65`) pour toutes les marques. La
   redirection automatique après succès ouvre donc Nevpn (ou échoue) sur
   Bouendji, Dalas, Goat, Gregor, James, Saitrix et Test. Le bouton « Lien
   direct application » fonctionne, mais deux apps de marque installées se
   disputent le même schéma.
4. **Le retour affiche « succès » quoi qu'il arrive.**
   `AppController.kt:250` affiche `Paiement vérifié avec succès !` sans lire le
   statut ; `MainActivity.kt:100-105` ignore `status`. La page serveur, elle,
   affiche « Confirmé » dès que `qStatus=SUCCESSFUL` même si la commande est
   inconnue (`payments.ts:374`) et un montant par défaut de **300 FCFA**
   (`:376`). Un lien `status=failed` ou `pending` déclenche le même toast.
5. **`PLAN_CHANGED` sans rechargement : achat bloqué.**
   L'API renvoie 409 avec `details = {reason, planRevision}`
   (`services/payments.ts:388-392`). `AppController.friendly()` préfère
   `details.values.firstOrNull()` au message (`:203-207`) : l'écran affiche
   « PLAN_CHANGED » ou la révision, jamais « Le prix de l'offre a changé ».
   Aucun code ne traite ce cas, et `onEnter(PLANS)` ne recharge que si la liste
   est vide (`:127-128`). La même offre périmée est représentée à chaque
   tentative jusqu'au redémarrage.
6. **D67 non respecté : une échéance de nœud vide tout le coffre.**
   `config/SingBoxConfig.kt:317` prend `min(expirations des nœuds, expiresAt)`,
   puis `vpn/VpnTunnelService.kt:296-300` fait `vault.clear()` et publie
   `SUBSCRIPTION_EXPIRED`. Un nœud qui expire coupe un abonnement encore
   valide et affiche « Abonnement expiré ». `BundleResponse` ne transporte
   qu'un `expiresAt` (`net/ApiClient.kt:785-791`) : les deux échéances de D67
   n'existent pas côté client.
7. **« Appareil retiré » inatteignable ; un appareil sans place est dit
   « Actif ».**
   `deviceRevoked` ne lit que `me.device.status` (`AppController.kt:193`), or
   un appareil révoqué reçoit 403 sur `/v1/me` (`lib/auth.ts:178`) et l'erreur
   est avalée par `runCatching` (`AppController.kt:344-348`). L'état
   `DEVICE_REVOKED` n'est jamais publié par le service (grep : une seule
   occurrence, dans un libellé `VpnTunnelService.kt:690`). L'écran dédié
   (`Home.kt:125`, feuille `Intro.kt:316-321`) est donc mort. Par ailleurs
   `Profile.kt:288` affiche « Actif » pour tout statut ≠ `revoked`, y compris
   `enrolled` sans place. Le tunnel déjà monté continue jusqu'à l'expiration du
   bundle (D23), mais l'app ne dit jamais pourquoi.
8. **Limite d'appareils atteinte : écran muet.**
   `ensureDeviceSlot` laisse le second appareil `enrolled`
   (`routes/me.ts:355-383`) ; le bundle répond 403 « Cet appareil n'est pas
   actif… » (`routes/bundle.ts:399-402`). `refreshPrivate` avale l'erreur
   (`AppController.kt:341-368`) ; `Servers.kt:183` affiche indéfiniment « La
   liste des serveurs arrive avec ta configuration ». Aucun bouton ne renvoie
   vers « Mes appareils » ni n'explique la limite.
9. **Le quota d'un forfait limité n'est jamais affiché à l'achat.**
   `PlanDto.quotaBytes` est renvoyé par le catalogue (`routes/catalog.ts:63`)
   mais `PlanSummary` n'affiche que durée + appareils (`Plans.kt:94-95`) et
   `Bill` ne montre que prix, nom, description (`:446-460`). L'utilisateur
   achète des Go sans voir combien. Les options de nuit ne sont choisies qu'à
   l'écran Commande (`Plans.kt:502`), après un CTA qui annonce le prix de base
   (`:181`) : le prix augmente ensuite.
10. **Support : mauvais destinataire et bouton potentiellement mort.**
    `BrandTokens.kt:80` ouvre `mailto:support@henshins.online` (plateforme,
    pas l'admin de la communauté) ; `MainActivity.kt:123-131` avale
    `ActivityNotFoundException`, donc sans client mail le bouton ne fait rien.
    Le code d'appareil n'est affiché ni copié nulle part (grep
    `deviceCode`/`code d'appareil` : aucun résultat), alors que la passation
    R10 et le nœud support le prévoient. Le bandeau « Contacter »
    (`Shell.kt:194-199`) n'ajoute ni version, ni appareil, ni code d'erreur.
11. **Compte non gérable : aucun changement de mot de passe, aucune
    récupération.**
    `routes/account.ts` ne porte que `stats` et `referral` ; aucune route
    mobile de changement/réinitialisation, aucun écran. D116 refuse l'e-mail,
    mais aucun canal de secours n'est branché : un mot de passe oublié est un
    compte perdu. `logout` efface le coffre sans confirmation
    (`AppController.kt:465-480`, `Profile.kt:203`) tout en laissant
    `KEY_CACHED_ME`/`KEY_CACHED_QUOTA` ; au redémarrage le profil en cache peut
    rouvrir l'app « connectée » (`:220-241`), puis retomber sur AUTH au 401.

## Défauts P2 (sélection)

- D145 : le serveur ne désactive plus les nœuds expirés, mais l'app les retire
  (`SingBoxConfig.kt:391-397` filtre `expiresAt`) ; contradiction avec
  « `expires_at` = date d'affichage ».
- D140 : l'app ne filtre pas `startsAt` (`SingBoxConfig.kt:391-397`) ; l'API
  continue de servir des nœuds de nuit par créneau (`routes/bundle.ts:338-341`,
  `services/xui.ts:253-270`) alors que D140 dit « mêmes serveurs que le pool
  illimité ». L'utilisateur `limited_night` peut utiliser les nœuds de nuit en
  journée, ou n'en recevoir aucun si aucun `night_slot_id` n'est posé.
- D141 : `owner-vip` n'existe pas côté API (`me.ts:206,214` renvoie
  `owner-unlimited`) ; les branches `Servers.kt:93,131` sont mortes. L'owner
  voit « Limité » au lieu de « VIP ».
- Filtrage D141 dépendant du réseau : `userTier` retombe sur `free-labs`
  (`Servers.kt:85-99`) quand `me` est en cache/échec ; un abonné payant peut ne
  voir que les nœuds gratuits. `Home.kt:114-116` utilise la liste **non
  filtrée**, donc un ancien nœud payant peut rester affiché après downgrade.
- `refreshServers()` affiche « Liste des serveurs mise à jour. » même hors
  ligne : `refreshPrivate` avale chaque appel (`AppController.kt:559-566`).
  `error` n'est rendu ni sur Home ni sur Serveurs (seulement Auth, Plans,
  Order, Devices, Invite).
- `refreshAll` enveloppe cinq appels séquentiels dans 4 s
  (`AppController.kt:282-303`) ; le bundle est le dernier. Au premier lancement
  lent, `me`/quota/bundle peuvent manquer, et l'erreur affichée est « Connexion
  au service impossible » même si seul le bundle a expiré.
- `activationStatus == pending` ou `failureCode = ACTIVATION_FAILED` :
  `checkOrder` ne regarde que `status` (`AppController.kt:508-519`), affiche
  « activation en cours » et ne montre jamais `failureCode` (DTO
  `ApiClient.kt:766`, jamais lu). Aucune route de reprise manuelle (O22).
- `pollAfterSeconds` (15 s, `ApiClient.kt:767`) et `order.expiresAt` ne sont
  jamais utilisés : pas de suivi automatique, pas de compte à rebours.
- D116 : la feuille « Bienvenue » n'apparaît qu'après inscription
  (`AppController.kt:426`), pas au premier lancement ; ses boutons communauté
  sont masqués car `communityWhatsappUrl` est vide (`BrandTokens.kt:98`).
- Copies fausses ou ambiguës : « Touche pour te protéger » sur un abonnement
  expiré/appareil révoqué (`Home.kt:175`) ; « Aucun serveur » alors que la
  liste existe mais ne répond pas (`Home.kt:123`) ; « Inclus dans chaque
  forfait : illimité de nuit en option » (`Plans.kt:166`) alors que c'est
  obligatoire pour `limited_night` ; e-mail synthétique
  `…@<appId>.bouendji.internal` affiché dans « Ton compte »
  (`Plans.kt:509`, `routes/auth.ts:430`) ; « connecte-toi avec ton e-mail »
  (`Profile.kt:312`) alors que le formulaire demande le téléphone
  (`Auth.kt:121-128`).
- `SyncLoaderPill` mort (`Shell.kt:324`), jamais appelé.

## Ce qui est vérifié / incertain

**Vérifié par lecture** : tous les points ci-dessus, avec les fichiers et
lignes cités ; contrats API lus (login par `identifier` accepte le téléphone,
`auth.ts:530-544` ; quota dans le catalogue, `catalog.ts:63-64` ; bundle
payant = deux pools, `endpoints.ts:503-520`).

**Incertain / non vérifié** :
- Aucun build, aucune exécution : le comportement réel de Compose, du
  Keystore, de libbox et du Pixel 8 n'est pas rejoué.
- Base de prod non interrogée : présence de `night_slot_id` / `night_slots`
  (D140), nombre réel de nœuds servis, états des commandes.
- La valeur exacte de `supportUrl` dans les 8 APK est celle du nœud
  `support-channel-runtime-2026-10-29` (8/8 `mailto` plateforme) ; seul
  `BrandTokens.kt` versionné (Bouendji) a été relu ici.
- Le comportement Fapshi réel (délai webhook, page de retour avec `transId`)
  n'est pas testé ; la logique de retour est seulement relue.
- La réconciliation d'activation et la reprise O22 n'ont pas été exercées.

## Non examiné (faute de temps)

- `routes/bundle.ts` au-delà de la ligne 450 (scellement, cache, envoi) ;
  `services/payments.ts` après la ligne 416 (création Fapshi, webhook,
  réconciliation).
- Le contenu des 8 manifestes injectés (seul le manifeste source est lu) et le
  comportement multi-marques sur un même téléphone.
- `offline/OfflineBundle.kt` (import `.bvpn`), `crypto/SecureStore.kt`,
  `vpn/TunnelEngine.kt` / `VpnTunnelService.kt` hors points cités.
- Les écrans `Settings`/`Help` au-delà de ce qui est cité, les thèmes
  (`nebula`, `billet`) et l'accessibilité (contrastes, tailles, TalkBack).
- Les tests Android (inexistants) et l'API admin (révocation manuelle,
  réconciliation d'une commande payée).

## Recommandations prioritaires

1. Persister `orderId` (et le statut) dans `SecureStore`, ajouter un écran
   « Mes commandes » alimenté par `GET /v1/orders`, et faire du deep link la
   source de vérité : `api.order(orderId, refresh = true)` même si `order` est
   nul. Replay du deep link ou lecture de `intent` après `boot()`.
2. Rendre la page de retour paramétrée par la marque (schéma + package lus
   depuis `apps`), et ne jamais afficher « succès » sans commande `paid`.
3. Traiter `DEVICE_REVOKED` et `DEVICE_LIMIT_REACHED` comme des états de
   premier rang (me `403` → état dédié, message actionnable, lien vers
   « Mes appareils »), et corriger le libellé « Actif ».
4. Afficher `quotaBytes`, le prix total (nuit comprise) et l'échéance avant le
   paiement ; recharger le catalogue sur `PLAN_CHANGED`.
5. Brancher le support sur le contact de la communauté (profil runtime) et
   afficher/copier un code d'appareil court dans le message prérempli.
6. Corriger D67 côté client (deux échéances, ne jamais vider le coffre sur une
   expiration de nœud) et retirer le filtrage `expiresAt` si D145 doit
   s'appliquer à l'app.

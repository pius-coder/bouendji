---
id: android-state-review-2026-10-29
title: Revue Android — état, liste serveurs, dépendance réseau
tags: [android, etat, serveurs, bundle, securite, revue]
status: reviewed
updated: 2026-10-29
related: [flux-serveurs-app, decisions, open-questions]
---

# Revue Android — état, liste serveurs, dépendance réseau

Statut : **reviewed** — lecture du code, aucun build ni exécution sur le Pixel 8
dans cette passe. Toute affirmation ci-dessous cite un fichier et une ligne ;
aucune n'est « ça marche » ou « ça ne marche pas » à l'écran.

Racine : `apps/android/app/src/main/java/cm/bouendji/vpn/` (abrégé `vpn/`).

## Verdict

Trois problèmes distincts sont mélangés dans le ressenti « l'app gère mal ses
états » :

1. **L'état publié n'est pas l'état réel.** `TunnelStateBus` est écrit par le
   service à partir de son *intention*, pas d'une réconciliation avec le TUN et
   le moteur ; l'UI ne vérifie jamais l'état système. Un tunnel vivant peut être
   affiché « Non protégé » et inversement.
2. **La liste des serveurs est déjà persistée et chiffrée**, mais elle est
   détruite par trois chemins (expiration d'un nœud, plan illisible, logout) et
   filtrée côté client par un droit qui vient du réseau. C'est la cause la plus
   probable de « la liste n'arrive pas ».
3. **La crainte de sécurité est réelle mais mal cadrée** : le stockage local
   n'est pas le point faible. Ce qui manque, c'est l'**intégrité de la réponse**
   (bundle non signé) et l'**épinglage TLS**. Un APK modifié, lui, ne peut
   jamais être arrêté côté client — la parade est serveur.

## Faits vérifiés par lecture

### A. Cycle de vie du tunnel et état

- Un seul verrou de cycle de vie existe (`vpn/VpnTunnelService.kt:141`,
  `lifecycle.withLock` dans `launchConnect` `:255`, `requestStop` `:366`,
  `teardown` `:374`). Le diagnostic du 2026-10-25
  (`knowledge/agents/android-vpn-state-haiku/notes/diagnostic.md`) est
  **périmé sur ce point** : la course de deux tunnels n'est plus possible.
- `tunnelRunning()` (`:241-242`) et `live()` (`:245`) sont les deux seules
  notions de « en marche ». L'UI en a une troisième : `RUNNING` dans
  `ui/screens/Home.kt:82` (`CONNECTING, RECONNECTING, CONNECTED,
  NO_CONNECTION`), et `MainActivity.kt:67-74` une quatrième (le `when` du
  bouton). Trois définitions du même mot.
- `TunnelStateBus.publish` écrit `_detail` **puis** `_state`
  (`vpn/TunnelEngine.kt:192-194`), deux `StateFlow` distincts. Un collecteur
  peut lire un couple (état, détail) incohérent.
- La durée de session `since` est remise à zéro sur `STOPPED` seulement
  (`:197`) ; `NO_CONNECTION` garde le chrono alors que le tunnel ne porte plus
  rien — l'écran n'affiche le chrono qu'en `CONNECTED` (`Home.kt:209`), donc
  l'incohérence est masquée, pas corrigée.
- Rien ne réconcilie l'état avec le système : aucun `ConnectivityManager`, aucun
  contrôle de `VpnService` actif, aucune surveillance du processus moteur. Si le
  processus est tué (OOM), `onDestroy` (`:229-236`) n'est pas appelé et le
  dernier état publié reste affiché.

### B. Bouton de connexion

- `Home.kt:134-144` : cinq branches avant `toggleTunnel()` ; deux d'entre elles
  (`!hasConfiguration`, `!accessActive`) n'appellent **pas** le service. Le
  bouton ne fait donc « rien » (toast ou feuille) alors que l'utilisateur
  s'attend à une connexion.
- `MainActivity.kt:67-74` choisit stop/start d'après `state` lu à la
  composition. Correct depuis le verrou serveur, mais l'état affiché peut
  précéder l'état réel de plusieurs centaines de ms (démarrage moteur +
  première sonde).
- `engineAvailable` est calculé une seule fois (`MainActivity.kt:45-53`,
  `LaunchedEffect(Unit)`), jamais réévalué.
- La notification permanente n'a **aucune action** (pas de bouton
  « Déconnecter ») : `vpn/VpnTunnelService.kt:649-669`. L'utilisateur ne peut
  couper que depuis l'app.

### C. Liste des serveurs

Persistance réelle, contrairement à l'intuition :

- `offline/OfflineBundle.kt:31-54` (`ConfigVault`) écrit le bundle complet en
  AES-GCM, clé `vpn-store` dans le Keystore (`crypto/SecureStore.kt:58-72`),
  AAD = nom de la clé (`:91`). Le clair n'est jamais sur disque.
- La liste affichée est reconstruite depuis le coffre
  (`ui/AppController.kt:545-553` → `SingBoxConfig.nodesOf`).

Ce qui casse la liste :

1. **Expiration d'un seul nœud = tout le coffre effacé.**
   `config/SingBoxConfig.kt:317` prend `min(expiries des nœuds,
   expiresAt du bundle)`, puis `vpn/VpnTunnelService.kt:598-612` fait
   `container.vault.clear()` et publie `SUBSCRIPTION_EXPIRED`. Un nœud qui
   expire coupe donc l'abonnement de l'utilisateur et supprime les nœuds encore
   valides. **Contredit D67** (`knowledge/00-brief/decisions.md:395-397`) :
   `rightsExpiresAtMs` seule doit provoquer « expiré »,
   `nextConfigExpiryMs` doit seulement déclencher un rafraîchissement **sans
   vider le coffre**.
2. **Effacement sur état transitoire.** `vpn/VpnTunnelService.kt:291-294` :
   un plan `null` (URI illisible ou bundle vide) efface le coffre.
   `ui/AppController.kt:360` : un bundle vide n'est pas enregistré (D61) — donc
   un retrait serveur n'est jamais propagé, alors qu'un bundle illisible
   détruit tout. Les deux règles sont inversées.
3. **Rafraîchissement sous 4 s.** `ui/AppController.kt:282` :
   `withTimeoutOrNull(4_000)` englobe `plans`, `me`, `devices`,
   `subscription` puis `fetchBundle()` — cinq appels séquentiels
   (`:286-302`, `:341-368`). Sur un réseau mobile lent, le bundle est le
   dernier et n'est presque jamais atteint. Le `runCatching` interne avale
   `CancellationException`, donc le timeout produit en plus un message
   d'erreur réseau (`:304-310`).
4. **Pas de rafraîchissement pendant la session.** `fetchBundle` n'est appelé
   que depuis `refreshPrivate` (`:358`), lui-même appelé à l'ouverture, au
   retour de paiement et à l'ouverture de l'onglet Serveurs
   (`:122-130`). Aucun minuteur.
5. **Liste figée quand le tunnel tourne.** `syncServersFromVault`
   (`:546`) sort immédiatement si l'état n'est pas `STOPPED` et que
   `ServerBus` n'est pas vide. Un bundle rafraîchi pendant une session est
   enregistré mais jamais affiché.
6. **Filtrage par droit réseau.** `ui/screens/Servers.kt:89-100` filtre avec
   `c.me?.entitlement` ; si `me` n'a pas pu être rechargé, `userTier` retombe
   sur `free-labs` (`:86`) et un abonné payant ne voit que les nœuds
   `free-labs` — ou rien. Le droit vient d'un appel réseau, pas du coffre signé.
7. **`startsAt` n'est jamais appliqué au moteur.** `usableConfigs`
   (`config/SingBoxConfig.kt:391-397`) ne filtre que `expiresAt`. Un nœud
   « nuit » est utilisable en journée ; le filtre `isDoualaNight`
   (`Servers.kt:61-71`) ne masque que l'affichage.
8. **Aucun cache d'affichage.** `ServersScreen` n'affiche que
   `ServerBus.servers` ; si le processus vient de démarrer et que le coffre est
   vide, l'écran dit « La liste des serveurs arrive avec ta configuration »
   (`Servers.kt:183`) même hors ligne avec un bundle valide mais non encore
   chargé.

### D. Dépendance au serveur

- `ui/AppController.kt:357` : le bundle n'est tiré que si
  `me?.entitlement?.active == true`. Une réponse `me` en échec ou un droit
  calculé faux suffit à empêcher toute mise à jour.
- `Home.kt:140` : sans `accessActive`, le bouton ouvre la feuille
  « renouveler » au lieu de connecter, même avec un bundle hors-ligne importé
  et valide (`hasConfiguration == true`).
- `ui/AppController.kt:465-479` (`logout`) efface le coffre :
  une déconnexion détruit la liste hors-ligne.
- Le tunnel, lui, fonctionne hors ligne : `connectInternal` lit le coffre
  (`vpn/VpnTunnelService.kt:276`) et ne contacte pas l'API pour démarrer. La
  dépendance est donc dans l'**autorisation**, pas dans la connexion.

### E. Sécurité du stockage et de la réponse

- Chiffrement au repos : correct pour le modèle (Keystore, non exportable,
  `setUserAuthenticationRequired(false)` — `crypto/SecureStore.kt:68`).
- **Le bundle en ligne n'est pas signé.** `ApiClient.BundleResponse`
  (`net/ApiClient.kt:783-791`) ne porte que `revision, issuedAt, expiresAt,
  configCount, envelope`. L'enveloppe ECDH+AES-GCM garantit la
  confidentialité et l'authentification *par rapport à la clé éphémère*, pas
  l'origine : un attaquant qui termine le TLS peut sceller sa propre liste pour
  la clé publique de l'appareil et la faire accepter.
- **Aucun épinglage TLS.** `ApiClient.defaultHttpClient()`
  (`net/ApiClient.kt:88-94`) ne configure ni `CertificatePinner` ni trust
  manager. Sur un appareil rooté avec une CA utilisateur forcée, la liste peut
  être remplacée.
- Le fichier de secours `.bvpn`, lui, **est** signé Ed25519 avec une clé
  épinglée (`offline/OfflineBundle.kt:223-238`) : le mécanisme existe déjà et
  n'est pas réutilisé pour le bundle en ligne.
- Un APK modifié (comme le mod SimonFree décrit dans
  `knowledge/40-divers/re-simonfree-apk.md`) peut lire la configuration en
  mémoire au moment de `SingBoxConfig.build`. Aucune protection cliente ne
  survit à cela ; seules les contre-mesures serveur (UUID par appareil,
  révocation, quota, télémétrie) limitent les dégâts.

### F. Tenue de l'état UI (hors tunnel)

- `AppController` est créé dans `remember { }` (`ui/Shell.kt:112-135`) et
  `boot()` est relancé par `LaunchedEffect(Unit)` (`:136`). Aucun
  `ViewModel`, aucun `rememberSaveable` pour `screen`. Une rotation d'écran
  recrée l'Activity (aucun `android:configChanges` dans
  `app/src/main/AndroidManifest.xml`) → nouveau contrôleur → splash → `boot()`
  → navigation et formulaire perdus.
- `boot()` écrit l'état Compose depuis `Dispatchers.IO`
  (`ui/AppController.kt:213-240`) ; `screen` est ensuite écrit hors du
  `withContext`. Ce n'est pas un plantage, mais c'est une écriture d'état
  depuis un autre thread que la composition.
- Aucun test Android : `apps/android/**/src/test/**/*.kt` → aucun fichier. La
  machine à états, le coffre et le décodage VLESS ne sont couverts par rien.

## Ce que la revue ne prouve pas

- Aucun `assembleDebug`, aucune exécution sur le Pixel 8 : tout est **relu**.
- Les symptômes exacts (« la liste parfois », « le bouton ») restent à
  qualifier par l'utilisateur : quatre causes distinctes produisent le même
  ressenti.
- `libbox.aar` absent du dépôt : le comportement réel du moteur (démarrage
  asynchrone, totaux `/connections`, bascule) n'est pas rejoué ici.

## Décisions à prendre (voir la revue en session)

1. Une seule source de vérité pour l'état (contrôleur propriétaire + état
   dérivé du moteur), ou patch minimal de `TunnelStateBus` ?
2. Politique hors ligne : afficher et connecter sur la foi du coffre signé,
   ou continuer à exiger un droit rechargé en ligne ?
3. Appliquer D67 (ne jamais vider le coffre sur expiration d'un nœud) —
   confirmation.
4. Intégrité : signer le bundle en ligne (Ed25519, clé déjà utilisée pour
   `.bvpn`) avant d'ajouter l'épinglage TLS ?
5. `startsAt` : filtre moteur ou simple affichage ?
6. Tests : harnais JVM (config, coffre, machine à états) avant toute refonte ?

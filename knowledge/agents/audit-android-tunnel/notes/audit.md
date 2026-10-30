# Audit #1 — Cycle de vie du tunnel et machine à états

Date : 2026-10-29. Mode : **lecture seule**, aucun build, aucune exécution sur le
Pixel 8, aucun fichier de code modifié.

> **État de clôture (cutoff 2026-10-29)** — audit **partiel mais exploitable** :
> le périmètre demandé (service, moteur, bus, bouton, libellés, manifeste) a été
> lu en entier et les défauts P0/P1 ci-dessous sont cités. **Non examiné /
> non prouvé** : comportement runtime de `libbox` (AAR absent), compilation,
> exécution Pixel, logcat cleartext loopback, callback Android réel
> (`onRevoke` vs `onDestroy`), reproduction des courses, écrans UI hors
> `Home.kt`, et comportement serveur au-delà de `bundle.ts`.

Périmètre lu en entier :

| Fichier | Lignes |
|---|---|
| `apps/android/app/src/main/java/cm/bouendji/vpn/vpn/VpnTunnelService.kt` | 696 |
| `apps/android/app/src/main/java/cm/bouendji/vpn/vpn/TunnelEngine.kt` | 204 |
| `apps/android/app/src/main/java/cm/bouendji/vpn/vpn/ServerBus.kt` | 85 |
| `apps/android/app/src/main/java/cm/bouendji/vpn/MainActivity.kt` | 133 |
| `apps/android/app/src/main/java/cm/bouendji/vpn/ui/screens/Home.kt` | 363 |
| `apps/android/app/src/main/AndroidManifest.xml` | 119 |

Fichiers adjacents lus pour trancher les questions (hors périmètre strict, cités
comme preuve) : `vpn/LibboxTunnelEngine.kt`, `vpn/LibboxPlatform.kt`,
`config/SingBoxConfig.kt` (expiration et `usableConfigs`), `ui/AppController.kt`
(521-609, 340-368, 458-479), `ui/Shell.kt` (88-148), `ui/screens/Servers.kt`
(75-109, 227), `ui/screens/Profile.kt` (198), `offline/OfflineBundle.kt` (31-54),
`apps/api/src/routes/bundle.ts` (108-134), `apps/android/README.md` (120-148).

`apps/android/app/libs/` est absent : `libbox.aar` n'est pas dans le dépôt. Tout
le comportement du moteur (démarrage, arrêt, API Clash, sondes) est donc
**(non vérifié)**. Aucun `tsc`/`assembleDebug` n'a été lancé.

---

## 1. Verdict

Le Mutex `lifecycle` a bien supprimé la création simultanée de deux TUN/moteurs
dans le chemin nominal, mais il ne protège ni l'état publié ni l'intention
d'arrêt : `onHealthy`/`failover` publient hors verrou, `stopRequested` est remis
à `false` hors verrou, `onRevoke` publie `STOPPED` avant le démontage et
`onDestroy` ne publie rien et n'arrête pas le moteur. `CONNECTED` n'est pas la
preuve qu'un trafic passe : c'est le résultat d'une sonde HTTP unique via l'API
Clash, qui peut rester affichée 30 à 75 s après la mort du tunnel, qui ignore le
résultat de `selectOutbound`, et qui ne couvre ni l'IPv6 (non routé) ni le trafic
de l'app elle-même (capturé par le TUN). D67 n'est pas implémenté : le client
prend `min(expiration de chaque nœud, expiresAt du bundle)` alors que le serveur
prend `max(expiration des nœuds)` (D49), puis `scheduleExpiry`/`plan == null`
vident tout le coffre — un nœud qui expire coupe la session et supprime les
nœuds encore valides.

---

## 2. Réponses aux sept questions

### Q1 — Peut-on afficher `CONNECTED` alors qu'aucun trafic ne passe ?

**Oui, par plusieurs chemins.** Le seul endroit qui crée `CONNECTED` à partir
d'un autre état est `onHealthy` (`VpnTunnelService.kt:543-548`), appelé par :

1. la sonde initiale du superviseur (`:445-447`) ;
2. `failover` après `probeAll` (`:510-527`) ;
3. `selectNow` après une sonde réussie (`:540`).

`promoteToForeground` peut aussi **republier** un `CONNECTED` déjà présent
(`:205`). Chaque création exige un `measureDelayMs` réussi
(`:477-478`, `:487`), donc une requête HTTP réelle à travers le tunnel **au
moment de la sonde**. Ce n'est pas une preuve de transit général.

Chemins de mensonge :

- **Fenêtre de 30–75 s.** Après une sonde réussie, l'état reste `CONNECTED`
  jusqu'à **deux** échecs consécutifs (`:463-473`), à 30 s d'intervalle
  (`:83`), chaque sonde pouvant prendre 5 s (`:84`). Un tunnel mort reste donc
  « Protégé » ~30 à 75 s. C'est le prix de l'hystérésis, mais l'UI ne dit jamais
  « dernier signe de vie il y a X s ».
- **`selectOutbound` ignoré.** `failover` déplace le selector sans regarder le
  `Result` (`:521`), puis appelle `onHealthy` dès qu'**une** sortie a répondu à
  la sonde individuelle (`:510-527`). Si le `PUT /proxies/proxy` échoue, le
  selector peut rester sur le nœud mort : `CONNECTED` avec **zéro** trafic
  utilisateur. Même chose dans `selectNow` (`:539-540`) : le choix de
  l'utilisateur peut être ignoré, et la sonde réussie sur l'ancienne sortie
  suffit à publier `CONNECTED`.
- **Course `onHealthy` / `teardown`.** `onHealthy` lit `live()` (`:544`) puis
  publie (`:547`) ; `teardown` fait `engine.stop()` puis `closeTun()` puis
  `publish(STOPPED)` (`:391-396`). Rien ne sérialise ces écritures. Si
  `onHealthy` passe la vérification juste avant que `teardown` publie, un
  `CONNECTED` tardif peut écraser `STOPPED`. Les chemins `keepState = true`
  (`onRevoke` `:226`, expiration `:299`, `:603`/`:611`) ne republient **jamais**
  d'état terminal : le `CONNECTED` tardif est alors définitif. La fenêtre est
  étroite (quelques instructions non suspendues), non reproduite, mais réelle.
- **`onDestroy` sans démontage.** `onDestroy` (`:229-236`) annule les jobs,
  ferme le TUN et annule le scope ; il **ne publie pas** `STOPPED` et **n'arrête
  pas le moteur** (`:233-234`). Si Android détruit le service sans passer par
  `teardown` (révocation traitée par `onDestroy` plutôt que `onRevoke`, arrêt
  système, etc.), `TunnelStateBus` garde le dernier état — souvent `CONNECTED` —
  alors que le TUN est fermé. Le processus restant vivant, l'UI continue de
  l'afficher.
- **`promoteToForeground(current)`** (`:205`) republie l'état courant sur un
  `ACTION_START` fusionné. Si le bus est déjà `CONNECTED` et que le moteur est
  mort sans que le superviseur l'ait vu, l'état est renforcé.
- **IPv6 hors tunnel.** Le TUN n'a qu'une adresse IPv4 et une route IPv4
  (`:560-573` : `172.19.0.1/30`, `addRoute("0.0.0.0", 0)`, aucun `::/0`, aucune
  adresse IPv6). Sur un réseau qui fournit de l'IPv6, le trafic IPv6 des
  applications peut sortir par le réseau sous-jacent pendant que l'écran affiche
  « Protégé » (`Home.kt:120`). C'est un mensonge de protection, pas seulement un
  « pas de trafic ».
- **Sonde = plan de contrôle, pas plan de données.** Une réussite sur
  `gstatic.com/generate_204` via l'API Clash prouve qu'une requête HTTP passe à
  cet instant ; elle ne prouve ni les destinations de l'utilisateur, ni le DNS
  des applications, ni l'IPv6. Le service ne réconcilie jamais l'état avec le
  TUN, `ConnectivityManager` ou les compteurs de trafic.

**Ce qui empêcherait un faux `CONNECTED`** : un identifiant de session vérifié
dans chaque publication, une écriture d'état unique et sérialisée, une sonde
qui vérifie la sortie **après** `selectOutbound`, et une route IPv6 (ou un
blocage IPv6 explicite).

### Q2 — Peut-il exister deux TUN ou deux moteurs en même temps ?

**Dans le chemin nominal, non** : `lifecycle` (`:141`) sérialise
`launchConnect` (`:255`) et `teardown` (`:374`) ; `connectInternal` ferme le TUN
précédent (`:305`) avant d'en établir un nouveau (`:307`) ; `LibboxTunnelEngine`
est une instance unique dans `AppContainer` (`VpnApplication.kt:75`) et
`start()` appelle `stopInternal()` avant de créer un `CommandServer`
(`LibboxTunnelEngine.kt:73-82`). Mais le Mutex ne suffit pas pour le **sens** de
l'arrêt et pour l'état.

Table des entrées :

| Entrée | Ce qu'elle fait | Verdict |
|---|---|---|
| `ACTION_START`, `tunnelRunning()` vrai (`:200-207`) | Fusionne ; republie l'état courant ; si `NO_CONNECTION`, **arrête** (`:206`) | Pas de second tunnel ; `ACTION_START` en `NO_CONNECTION` est un stop |
| `ACTION_START`, `lastPlan != null` mais `stopRequested == true` (arrêt en cours) | `tunnelRunning()` est faux (`:241-242`), donc passe par `launchConnect(false)` (`:217`), qui remet `stopRequested = false` (`:252`) | **Trou** : un start peut se glisser derrière un démontage déjà lancé |
| `ACTION_RECONNECT` (`:190-195`) | Publie `RECONNECTING` **avant** de vérifier `lastPlan` ; `launchConnect(true)` | Pas de second tunnel simultané (Mutex), mais peut annuler un arrêt ; **aucun émetteur dans l'app** (grep) |
| `scheduleReconnect` (`:583-591`) | `delay(maxSession-60)`, puis `promoteToForeground(RECONNECTING)` + `launchConnect(true)` | Même trou : la cancellation du job est coopérative ; si le délai vient d'expirer pendant un stop, `launchConnect` remet `stopRequested=false` et se place derrière le démontage |
| `requestStop` (`:359-367`) | Met `stopRequested=true`, annule les jobs, lance `teardown` sous verrou | Ne attend pas ; si le scope est annulé avant le verrou, le démontage est perdu (`:366`) |
| `teardown` (`:374-400`) | NonCancellable ; moteur, TUN, état, `stopSelf` | Un seul démontage à la fois, mais `engine.stop()` n'a pas de timeout (`:391`) |
| `onRevoke` (`:224-227`) | Publie `STOPPED` **avant** `teardown` | Contredit l'invariant du commentaire (`:58-61`) |
| `onDestroy` (`:229-236`) | Annule, ferme le TUN, annule le scope | **N'arrête pas le moteur** ; ne publie pas ; peut courir avec `teardown` |
| `ACTION_SELECT` / `ACTION_PROBE` (`:176-188`) | Hors verrou ; `stopIfIdle()` si `lastPlan == null` | `stopIfIdle` (`:407-409`) lit `tun` non volatile hors verrou et peut arrêter un service **pendant** un `connectInternal` avant `lastPlan` (`:303`) |

Autres trous :

- **Démarrage partiel du moteur.** `LibboxTunnelEngine.start` crée `created`,
  l'appelle, puis affecte `server = created` seulement après
  `startOrReloadService` (`:78-82`). Si cet appel lève, `server` reste `null` :
  `teardown` ne peut pas fermer le `CommandServer` déjà démarré. Un prochain
  `start` en crée un second ; le premier est orphelin. (Non vérifié sans
  `libbox.aar`.)
- **`closeTun` avale l'échec de `close()` et met `tun = null`** (`:575-578`).
  Un descripteur qui ne se ferme pas est perdu et un second TUN peut être créé ;
  théorique, mais le code ne le detecte pas.
- **`stopIfIdle`** ne teste pas `connectJob?.isActive` : un `ACTION_SELECT` ou
  `ACTION_PROBE` arrivé pendant la lecture du coffre/`SingBoxConfig.build`
  (`:276-303`) peut `stopSelf()` et annuler un démarrage en cours. Le champ
  `tun` n'est pas `@Volatile` (`:149`) et est lu sans verrou (`:408`).

**Conclusion Q2** : le Mutex garantit « un seul moteur/TUN à la fois » dans le
chemin heureux ; il ne garantit pas « un stop gagne », ni « l'état publié
correspond au moteur », ni « le moteur est arrêté quand le service meurt ».

### Q3 — Processus tué (OOM), `onRevoke`, VPN désactivé, mode avion, Wi-Fi→4G

- **Processus tué (OOM).** Service et UI partagent le processus (aucun
  `android:process` dans le manifeste). Le TUN est fermé par le noyau, le
  service ne redémarre pas (`START_NOT_STICKY`, `:173/181/188/194/207/218`) et
  le singleton `TunnelStateBus` repart à `STOPPED` (`TunnelEngine.kt:184`) à la
  réouverture. C'est honnête **si** tout le processus meurt. Si seul le service
  est détruit alors que le processus/Activity survit, `onDestroy` ne publie rien
  et l'UI garde `CONNECTED` : le mensonge est certain par lecture, la fréquence
  est (non vérifiée).
- **`onRevoke`.** Publie `STOPPED` avec « Un autre VPN a pris la main »
  (`:225`), puis `requestStop(keepState = true)` (`:226`). L'UI apprend l'arrêt,
  mais le motif est faux quand c'est l'utilisateur qui désactive le VPN ou
  révoque le consentement. `keepState = true` empêche tout republish terminal
  après le démontage.
- **VPN désactivé depuis les réglages Android.** Android appelle `onRevoke`
  **ou** détruit le service ; le code ne traite que le premier. Dans le second
  cas, pas de `STOPPED`, pas d'arrêt du moteur (voir Q1/Q4). (Non vérifié :
  quel callback Android utilise pour un « Disconnect » depuis les réglages.)
- **Mode avion.** Aucun `ConnectivityManager` dans le service (grep : seul
  `LibboxPlatform.kt:181-228` en a un, pour l'interface par défaut du moteur).
  Le TUN reste monté avec la route par défaut (`:565`) ; les sondes échouent ;
  l'état reste `CONNECTED` ~30–75 s, puis `failover` publie `NO_CONNECTION`
  (`:515-519`) **sans démonter le TUN** (commentaire `:504-505`). Tout le trafic
  est alors blackholé, et la reprise attend `BACKOFF_MS` = 30 s → 2 min → 10 min
  (`:86`, `:457`). L'UI affiche « Aucun serveur » (`Home.kt:123`), ce qui est
  faux : le réseau local est absent, les serveurs peuvent être vivants. Le
  retour du réseau ne déclenche aucune sonde immédiate.
- **Wi-Fi → 4G.** `LibboxPlatform` publie l'interface par défaut
  (`:193-228`) et `SingBoxConfig` met `auto_detect_interface: true`
  (`SingBoxConfig.kt:301`), donc le moteur *peut* se rebinder. Mais le service
  ne le sait pas : pas de callback réseau, pas de `setUnderlyingNetworks`
  (grep), pas de sonde immédiate sur `onAvailable`. Si le rebinding échoue, on
  retombe sur `NO_CONNECTION` + backoff jusqu'à 10 min, avec le TUN qui bloque
  tout. `LibboxPlatform.kt:220-225` choisit `allNetworks.firstOrNull` et non
  `activeNetwork` : sur un téléphone avec Wi-Fi + 4G, il peut signaler la 4G
  alors que le Wi-Fi est le réseau par défaut (non vérifié, hors périmètre
  strict).
- **L'UI le sait-elle ?** Uniquement par `TunnelStateBus`. Aucune notion
  « pas de réseau », aucune distinction serveur mort / réseau local mort, aucun
  contrôle que le `VpnService` est réellement actif. `Home` ne fait que traduire
  l'état publié (`Home.kt:119-127`).

### Q4 — `STOPPED` est-il publié avant l'arrêt du moteur et la fermeture du TUN ?

**Dans `teardown` avec `keepState = false`, non : l'ordre est correct.**
`withContext(NonCancellable)` (`:374`) ; `engine.stop()` est attendu (`:391`) ;
`closeTun()` (`:392`) ; `lastPlan = null` (`:393`) ; **puis**
`publish(STOPPED)` (`:396`) ; `stopForeground`/`stopSelf` (`:398-399`).

**Mais l'invariant du commentaire (`:58-61`) est faux sur trois points :**

1. **`onRevoke` publie `STOPPED` avant `teardown`** (`:225-226`) : le moteur et
   le TUN sont encore vivants quand l'UI apprend l'arrêt. Ce n'est pas le sens
   dangereux (on dit « non protégé » alors que ça protège encore), mais c'est
   une violation de l'ordre annoncé.
2. **Les chemins d'expiration publient `SUBSCRIPTION_EXPIRED` avant le
   démontage** : `connectInternal` (`:298-299`) et `scheduleExpiry` (`:610-611`).
   L'état terminal est visible alors que le moteur tourne encore.
3. **Aucun timeout sur `engine.stop()`** (`:391`) : si `closeService()`/`close()`
   bloque, `teardown` reste dans `NonCancellable` en tenant `lifecycle` ; aucun
   `STOPPED` n'est publié, la notification reste « Connecté », un second
   `requestStop` attend le même verrou. La durée réelle de `closeService` est
   (non vérifiée).
4. **Le lancement de `teardown` est annulable** (`:366`) : si le scope est
   annulé avant l'acquisition du verrou (`onDestroy` `:234`), `teardown` ne
   tourne jamais. `onDestroy` ferme alors le TUN **sans** arrêter le moteur
   (`:233`), soit l'ordre inverse de celui revendiqué.

### Q5 — La notification permanente peut-elle mentir ou se désynchroniser ?

**Oui, et elle n'a aucune action de déconnexion.**

- **Pas d'action, pas de `contentIntent`.** `buildNotification`
  (`:649-669`) ne contient ni `addAction` ni `setContentIntent` ; `setOngoing(true)`
  (`:657`). La seule façon de couper est l'app (ou les réglages Android). Le
  texte de `Home` « Touche pour te déconnecter » ne s'applique pas à la
  notification.
- **Elle peut être absente.** `POST_NOTIFICATIONS` n'est demandée que depuis
  `Profile.kt:198` ; jamais au premier démarrage du tunnel. Sur Android 13+,
  si l'utilisateur ne va pas dans Profil, la notification du service d'avant-plan
  n'apparaît pas dans le tiroir. (Le service reste visible dans le gestionnaire
  des services, mais pas comme rappel permanent.)
- **Chronomètre divergent.** `connectedSince` est remis à zéro à **chaque**
  démarrage moteur (`:343`) et pilote le chronomètre de la notification
  (`:663-666`). `TunnelStateBus.since` n'est remis à zéro que sur `STOPPED`
  (`TunnelEngine.kt:196-197`) et pilote `Home` (`Home.kt:94`, `:209`). Après une
  reconnexion préventive D25 (`:583-590`), la notification repart de zéro, pas
  `Home`. Au premier `CONNECTED`, la notification démarre avant la sonde
  (`connectedSince` à `:343`, `since` au publish `:547` via `TunnelEngine.kt:196`).
  Trois durées différentes : session utilisateur (`since`), session moteur
  (`connectedSince`), session de trafic (`ServerBus.traffic`, remis à zéro au
  redémarrage moteur).
- **Désynchronisation d'état.** `publish` construit la notification à partir de
  son couple local `(state, detail)`, alors que `TunnelStateBus` peut finir avec
  un autre couple : `_detail` puis `_state` sont deux `StateFlow` distincts
  (`TunnelEngine.kt:192-198`) et deux publications concurrentes peuvent
  s'entrelacer. `MainActivity` collecte les deux séparément
  (`MainActivity.kt:43-44`), donc l'UI peut voir `(CONNECTED, ancien detail)` ou
  `(STOPPED, detail d'une autre publication)`.
- **Elle hérite des mensonges de Q1** : un `CONNECTED` tardif, une fenêtre de
  30–75 s, ou un `engine.stop()` bloqué laissent « Connecté » alors que rien ne
  passe.
- **Elle peut publier « Arrêté » à tort** : dans la branche `ACTION_START`
  fusionnée, si `current == STOPPED` (fenêtre de course), `promoteToForeground`
  appelle `publish(STOPPED)` (qui annule la notification) puis
  `startForeground` avec une notification « Arrêté » (`:633-646`) : une
  notification permanente « Arrêté » pendant que le service tente de démarrer.
- **Libellés incohérents** : « Appareil révoqué » (`:690`) vs « Appareil
  retiré » (`Home.kt:125`) ; « Aucune connexion disponible » vs « Aucun
  serveur » ; ce n'est pas un mensonge, mais deux vocabulaires pour le même
  état.

### Q6 — D67 : l'expiration d'un nœud rafraîchit-elle sans vider le coffre ?

**Non. Le code fait exactement l'inverse.**

Preuves :

- **Le modèle n'a qu'une échéance.** `BundlePayload` (`SingBoxConfig.kt:50-58`)
  ne porte que `revision`, `issuedAt`, `expiresAt`, `configs`. Aucun champ
  `rightsExpiresAtMs` ni `nextConfigExpiryMs` (grep sur tout `apps/android` :
  aucune occurrence). D67 ne peut donc pas être représenté tel quel.
- **Le serveur applique D49 (le dernier nœud).** `bundleExpiry` prend
  `min(fin des droits, max(expirations des configurations))`
  (`apps/api/src/routes/bundle.ts:113-134`, `:132-133`).
- **Le client applique le premier nœud.** `SingBoxConfig.kt:316-317` :
  `val expiresAt = usable.minOf { it.third }.let { minOf(it, payload.expiresAtMs() ...) }`.
  C'est un `min` sur **toutes** les configurations utilisables : le nœud qui
  expire le plus tôt devient l'échéance du plan entier. Le client re-casse donc
  D49, en plus de D67.
- **Le service planifie cet `expiresAtMs`** : `connectInternal` appelle
  `scheduleExpiry(plan.expiresAtMs)` (`VpnTunnelService.kt:349`) ; à
  l'échéance, `scheduleExpiry` fait `container.vault.clear()`
  (`:609`), publie `SUBSCRIPTION_EXPIRED` (`:610`) et `requestStop`
  (`:611`).
- **Deux autres effacements complets** :
  - `plan == null` (toutes expirées, URI illisibles ou liste vide) →
    `container.vault.clear()` puis `teardown(...)` (`:291-294`) ;
  - `plan.expiresAtMs <= now` → `container.vault.clear()` puis
    `SUBSCRIPTION_EXPIRED` (`:296-300`).
- **`ConfigVault.clear()` supprime l'unique clé `vault.bundle`**
  (`offline/OfflineBundle.kt:50-51`) : ce n'est pas un filtre, c'est la liste
  entière qui disparaît.

Conséquences concrètes :

1. Un bundle de plusieurs nœuds à TTL décalés meurt à l'expiration du **premier**
   nœud, alors que les autres sont encore valides (D49 dit « le dernier »).
2. L'utilisateur voit « Abonnement expiré : reconnexion impossible » même si ses
   droits sont actifs ; `Home` lui propose de recharger (`Home.kt:124`).
3. Le coffre est vidé : les nœuds encore valides sont perdus, et la liste
   hors-ligne aussi. `AppController` ne peut la restaurer que par un
   `fetchBundle` réussi, qui exige `me.entitlement.active == true`
   (`AppController.kt:357-360`) et un réseau qui passe — précisément ce que le
   tunnel mort empêche (voir Q3).
4. **Course avec un rafraîchissement** : `AppController.refreshPrivate` peut
   sauvegarder un nouveau bundle (`:360`) pendant que l'ancien `expiryJob`
   arrive à échéance ; `scheduleExpiry` ne vérifie ni la révision du coffre ni
   un identifiant de session avant `vault.clear()` (`:609`). Un ancien timer
   peut donc effacer un bundle fraîchement reçu. (Le `sessionId` n'est utilisé
   que dans `onFatal`, `:324`.)
5. **D61 est inversé** : `AppController` ignore un bundle vide
   (`if (configs.isNotEmpty())`, `:360`) alors que le serveur documente une
   liste vide signée comme un retrait valide
   (`bundle.ts:113-118`). Le client ne propage donc pas un retrait, mais il
   efface tout à l'expiration d'un nœud : les deux règles sont à l'envers.

**Réponse courte** : D67 n'est pas implémenté ; l'expiration d'un nœud ne
rafraîchit rien, elle coupe la session et détruit la liste.

### Q7 — Les définitions de « en marche » sont-elles équivalentes ?

Il y en a **cinq familles**, pas trois :

| Définition | Ensemble | Source |
|---|---|---|
| `Home.RUNNING` | `CONNECTING`, `RECONNECTING`, `CONNECTED`, `NO_CONNECTION` | `Home.kt:82` |
| `tunnelRunning()` | `!stopRequested && (connectJob actif \|\| lastPlan != null)` | `VpnTunnelService.kt:241-242` |
| `live()` | `!stopRequested && lastPlan != null` | `VpnTunnelService.kt:245` |
| `MainActivity` (bouton) | mêmes 4 états → stop, sinon start | `MainActivity.kt:67-74` |
| `!= STOPPED` (famille) | tout sauf `STOPPED` : inclut `SUBSCRIPTION_EXPIRED` et `DEVICE_REVOKED` | `AppController.kt:468`, `:546`, `:574` ; `Servers.kt:83` |
| `testLatency` (sous-ensemble) | `CONNECTED` ou `NO_CONNECTION` | `AppController.kt:588` |

`Home.RUNNING` et `MainActivity` sont **équivalents aujourd'hui** (les mêmes
quatre états), mais ce sont deux copies indépendantes : `MainActivity` a un
`else` qui accueille silencieusement tout nouvel état comme « start », tandis
que le `when` de `Home` est exhaustif et casserait à la compilation. Aucun test
ne relie les deux.

Cas de divergence :

1. **Arrêt en cours** (`stopRequested = true`, `teardown` pas encore exécuté) :
   `Home`/`MainActivity` disent encore « en marche » (l'état n'est pas encore
   `STOPPED`), `tunnelRunning()`/`live()` sont faux. Un appui envoie un second
   stop ; l'UI affiche « Protégé » pendant que le moteur s'arrête.
2. **Démarrage en cours avant `lastPlan`** : `tunnelRunning()` est vrai
   (`connectJob` actif), `live()` est faux (`lastPlan` affecté seulement à
   `:303`), l'état est `CONNECTING` ; `Home` dit « en marche », `MainActivity`
   envoie stop. Un appui annule le démarrage — cohérent, mais les trois notions
   diffèrent.
3. **`SUBSCRIPTION_EXPIRED` avant la fin du démontage** : `Home`/
   `MainActivity` disent « pas en marche » (start), alors que `live()` est
   encore vrai (le TUN est monté) et que `tunnelRunning()` peut être vrai
   (`connectJob` actif, cas `:298-299`). `Home` affiche « Touche pour te
   protéger » (`:175`) ; l'appui est avalé par la branche fusionnée
   (`tunnelRunning()` vrai → `promoteToForeground` de l'état expiré, pas de
   start) ou, si le démontage est fini, aboutit à `STOPPED` « Aucune
   configuration ».
4. **`NO_CONNECTION`** : toutes les définitions disent « en marche », mais le
   TUN est monté **sans sortie** ; « en marche » n'est pas « protégé ». C'est
   cohérent avec le commentaire `:504-505`, mais l'utilisateur voit « Aucun
   serveur » et « Touche pour annuler ».
5. **`onDestroy`** : l'état du bus peut être `CONNECTED`, alors que
   `tunnelRunning()`/`live()` de l'instance de service détruite ne sont plus
   observables ; l'UI et le service ne parlent plus du même objet.
6. **`!= STOPPED`** : `AppController.logout` (`:468`) traite `EXPIRED`/
   `REVOKED` comme « en marche » et appelle `toggleTunnel()` → `MainActivity`
   `else` → **start**, pas stop. `syncServersFromVault` (`:546`) ne recharge pas
   le coffre dès que l'état n'est pas `STOPPED`, donc après une expiration il
   continue d'afficher l'ancienne liste. `Servers.kt:83` marque le serveur actif
   comme « running » en `EXPIRED`/`REVOKED`. `testLatency` (`:588`) bascule en
   TCP direct dès que l'état n'est ni `CONNECTED` ni `NO_CONNECTION`, même si le
   TUN est encore monté en `RECONNECTING`.
7. **`DEVICE_REVOKED`** n'est jamais publié (grep : seulement l'enum
   `TunnelEngine.kt:24`, le libellé `:690` et l'UI `Home.kt:125`). Si un
   appareil est révoqué côté serveur, les sondes échouent et l'état devient
   `NO_CONNECTION` (« Aucun serveur »), pas « Appareil retiré ».

---

## 3. Défauts classés

Légende : **P0** = l'utilisateur peut être cru protégé alors que le trafic sort
ou ne passe pas, ou ne peut pas se déconnecter ; **P1** = session coupée, liste
perdue, ou panne user-visible avec contournement ; **P2** = diagnostic faux,
désynchronisation, robustesse ; **P3** = code mort, cosmétique, doc.

### P0

**P0-01 — IPv6 sort du tunnel alors que l'UI dit « Protégé ».**
`VpnTunnelService.estimateTun` en réalité `establishTun` (`:560-573`) :
`addAddress("172.19.0.1", 30)`, `addRoute("0.0.0.0", 0)`, aucun `addAddress`
IPv6, aucun `addRoute("::", 0)`. `SingBoxConfig` déclare aussi un TUN IPv4
seulement (`SingBoxConfig.kt:226-238`). Conséquence : sur un réseau IPv6
(Box Wi-Fi, certains opérateurs), les applications qui utilisent IPv6 peuvent
sortir par le réseau sous-jacent ; l'écran affiche « Protégé » (`Home.kt:120`)
et la notification « Connecté ». Vérifié : absence de configuration IPv6.
Non vérifié : la fuite effective sur le Pixel (à tester avec un APN IPv6-only
et `curl -6`), mais c'est le comportement Android standard d'un VPN sans route
IPv6.

**P0-02 — L'état peut survivre au tunnel (onDestroy, onRevoke, publication tardive).**
`onDestroy` (`:229-236`) ne publie pas `STOPPED` et n'appelle pas
`engine.stop()` ; `onRevoke` publie `STOPPED` **avant** `teardown`
(`:225-226`) ; `onHealthy` publie hors verrou après `live()`
(`:543-548`) alors que `teardown` ne republie pas en `keepState = true`
(`:396`). Conséquence : l'UI (et la notification) peut afficher « Protégé »
après la fermeture du TUN ou la fin du moteur ; l'utilisateur navigue en clair
en croyant l'être protégé. La course `onHealthy`/`teardown` est étroite et non
reproduite ; le trou `onDestroy` est certain par lecture. C'est le défaut le
plus grave pour la promesse du produit.

**P0-03 (à confirmer en premier) — `usesCleartextTraffic="false"` contre l'API
Clash en `http://127.0.0.1`.**
`AndroidManifest.xml:38` interdit le cleartext ; `LibboxTunnelEngine.clash()`
appelle `URL("http://127.0.0.1:$clashPort...")` (`LibboxTunnelEngine.kt:203`)
depuis Kotlin/`HttpURLConnection`. Le README du projet dit lui-même que la
sonde doit passer « côté Go, pas par OkHttp — sinon `usesCleartextTraffic=false`
bloquerait l'appel en boucle locale » (`README.md:140-145`). Si Android applique
la politique à la boucle locale (à vérifier dans logcat :
`Cleartext HTTP traffic to 127.0.0.1 not permitted`), alors **toutes** les
sondes, bascules et lectures de compteurs échouent : l'app ne peut jamais
prouver `CONNECTED` (ou vit sur un plan de contrôle mort), et les rapports D50
marquent tous les nœuds `down`. C'est un bloqueur, pas seulement un défaut
d'état. Non vérifié sur appareil ; contradiction code/README vérifiée.

### P1

**P1-01 — D67/D49 : l'expiration du premier nœud vide le coffre et coupe la session.**
`SingBoxConfig.kt:316-317` (`min` des expirations) + `VpnTunnelService.kt:349`
(`scheduleExpiry(plan.expiresAtMs)`) + `:598-612` (`vault.clear()`, `:609`) +
`:291-294` (`plan == null` → clear) + `:296-300` (`expiresAt <= now` → clear).
`ConfigVault.clear()` supprime la liste entière (`OfflineBundle.kt:50-51`).
Conséquence : nœuds encore valides supprimés, session coupée, « Abonnement
expiré » faux ; `D49` (max côté serveur, `bundle.ts:132-133`) est re-cassé côté
client. Course possible avec un bundle fraîchement sauvegardé
(`AppController.kt:360`) car `scheduleExpiry` ne vérifie pas la révision du
coffre (`:609`).

**P1-02 — Un arrêt peut être annulé par une reconnexion planifiée.**
`launchConnect` remet `stopRequested = false` **avant** de prendre le verrou
(`:252`) ; `scheduleReconnect` (`:583-591`) peut avoir passé son `delay` et
appeler `launchConnect(true)` pendant un `requestStop`. Le job de connexion se
place derrière le `teardown` (Mutex FIFO), qui publie `STOPPED` et
`stopSelf()` ; la connexion s'exécute ensuite et peut recréer un TUN/moteur
après l'arrêt du service. `onDestroy` ne stoppe pas le moteur (`:229-236`), donc
le moteur peut rester orphelin. Conséquence : l'utilisateur croit s'être
déconnecté et le VPN revient (ou un moteur tourne sans service). Course non
reproduite ; l'ordre est possible par lecture.

**P1-03 — Le plan de contrôle de l'app est capturé par le TUN.**
`establishTun` n'appelle pas `addDisallowedApplication(packageName)`
(`:560-573`) et seul le moteur reçoit `protect` (`:320`) ; `ApiClient`/OkHttp
n'est pas protégé (grep : aucun `protect`/`SocketFactory` dans `ApiClient`).
Conséquence : quand le TUN est monté mais sans sortie (`NO_CONNECTION`), les
appels de l'app (`me`, `fetchBundle`, télémetrie, login) passent dans le trou :
impossible de rafraîchir la liste, de signaler l'incident ou de se rétablir.
L'utilisateur est coincé avec « Aucun serveur » jusqu'à ce qu'il coupe le VPN.
C'est aussi ce qui rend la récupération D67 impossible.

**P1-04 — Aucune conscience du réseau ; `NO_CONNECTION` blackhole tout pendant
jusqu'à 10 min.**
Pas de `ConnectivityManager` dans le service (grep ; seul `LibboxPlatform` en a
un pour le moteur). `failover` ne démonte pas le TUN (`:504-505`, `:515-519`) ;
la route par défaut reste (`:565`) ; la reprise attend `30 s → 2 min → 10 min`
(`:86`, `:457`). Après mode avion ou Wi-Fi→4G, tout le trafic est bloqué et
l'UI dit « Aucun serveur » (`Home.kt:123`) au lieu de « pas de réseau » ; le
retour du réseau ne déclenche pas de sonde immédiate. Le moteur peut se
rebinder (`auto_detect_interface`, `SingBoxConfig.kt:301` ;
`LibboxPlatform.kt:193-228`), mais l'état, lui, ne le sait pas.

**P1-05 — `selectOutbound` ignoré : `CONNECTED` peut être publié sur un selector
resté mort.**
`failover` (`:521`) et `selectNow` (`:539`) ignorent le `Result` de
`selectOutbound`. `failover` mesure chaque nœud **par tag** (`probeAll`,
`:481-500`), pas le selector après déplacement ; si le `PUT` échoue, `best`
existe pourtant et `onHealthy` publie `CONNECTED` (`:524-527`). Selon l'état du
selector, l'utilisateur n'a aucun trafic. Le contrat `TunnelEngine` retourne un
`Result` : ne pas le lire est une violation du contrat.

**P1-06 — `teardown` peut se bloquer : `engine.stop()` sans timeout.**
`:391` dans `withContext(NonCancellable)` ; `LibboxTunnelEngine.stop()` appelle
`closeService()`/`close()` sans timeout (`LibboxTunnelEngine.kt:139-146`). Si
l'un bloque, `STOPPED` n'est jamais publié, le verrou reste tenu, un second
stop attend, la notification reste « Connecté ». (Non vérifié : comportement
de `closeService`.)

### P2

**P2-01 — La notification n'a pas d'action et peut être invisible.**
`buildNotification` (`:649-669`) : pas d'`addAction`, pas de
`setContentIntent`. `POST_NOTIFICATIONS` demandée seulement dans
`Profile.kt:198`, jamais au premier tunnel. Sur Android 13+, la notification
peut être absente. Le seul arrêt possible est l'app ou les réglages Android.

**P2-02 — Chronomètres divergents.**
`connectedSince` (`:343`, `:663-666`) repart à chaque démarrage moteur ;
`TunnelStateBus.since` (`TunnelEngine.kt:196-197`) ne repart qu'à `STOPPED`.
Après la reconnexion préventive D25 (`:583-590`), la notification et `Home`
affichent deux durées différentes ; au premier `CONNECTED`, la notification
démarre avant la sonde. `ServerBus.traffic` est une troisième remise à zéro
(`:415`, `:344`).

**P2-03 — `TunnelStateBus` n'est pas atomique.**
`_detail` puis `_state` (`TunnelEngine.kt:192-198`) ; `MainActivity` collecte les
deux séparément (`:43-44`). Deux publications concurrentes peuvent laisser un
couple `(état A, détail B)`. La notification, construite avec le couple local,
peut différer du bus. Correctif : un seul `StateFlow<UiState>` avec
`state + detail + since`.

**P2-04 — `since` n'est pas remis à zéro sur `SUBSCRIPTION_EXPIRED`/`DEVICE_REVOKED`.**
`TunnelEngine.kt:196-197` ne remet `_since` à zéro que sur `STOPPED` ; les
chemins `keepState = true` (`:299`, `:603`, `:611`) ne publient jamais
`STOPPED`. Après une expiration puis un rachat, le premier `CONNECTED` garde
l'ancien `since` et `Home` affiche une session de plusieurs heures pour une
connexion de quelques minutes (`Home.kt:209-219`).

**P2-05 — `DEVICE_REVOKED` est un état mort.**
Aucune publication (grep) ; seuls l'enum (`TunnelEngine.kt:24`), le libellé
(`VpnTunnelService.kt:690`) et l'UI (`Home.kt:125`). Un appareil révoqué est
diagnostiqué « Aucun serveur » après l'échec des sondes, pas « Appareil
retiré » ; l'utilisateur ne sait pas qu'il doit contacter le support.

**P2-06 — `stopIfIdle` peut arrêter un démarrage en cours.**
`:407-409` ne teste ni `connectJob?.isActive` ni `tunnelRunning()` ; il lit
`tun` (non `@Volatile`, `:149`) hors verrou. Un `ACTION_SELECT`/`ACTION_PROBE`
(`:179-186`) arrivé pendant `connectInternal` avant `lastPlan` (`:303`) peut
`stopSelf()` et annuler la connexion.

**P2-07 — `ServerStatus` perd `startsAt` et `endpointTier` au démarrage.**
`connectInternal` construit `ServerStatus(configId, tag, label, region)`
(`:344`) sans les deux champs ; `ServerBus.setServers` ne préserve que
`latencyMs`/`probe`/`method` (`ServerBus.kt:59-63`). Pendant une session, tous
les nœuds retombent à `free-labs` (`ServerBus.kt:28`) et `startsAt` est perdu :
le filtre D141/D140 de `Servers.kt:89-100` et l'affichage nuit sont faux.

**P2-08 — `Home` peut nommer le mauvais serveur.**
`shown = active ?: preferred` (`Home.kt:114-116`) ; le sous-titre
« Ton trafic passe par X » (`:120`) utilise `preferred` quand
`ServerBus.active` est `null` (échec de `refreshActive`, `:551-556`). Après une
bascule, l'UI peut afficher le serveur préféré (mort) alors que le trafic passe
par un autre.

**P2-09 — `onRevoke` donne un motif faux.**
`:225` affiche « Un autre VPN a pris la main » pour toute révocation, y compris
un « Disconnect » depuis les réglages ou un consentement retiré. L'UI affiche
ce texte (`Home.kt:126`). Le bon motif dépend du callback ; Android ne le
fournit pas, mais le texte ne devrait pas affirmer « un autre VPN ».

**P2-10 — `LibboxTunnelEngine.start` peut laisser un `CommandServer` orphelin.**
`server = created` seulement après `startOrReloadService` (`:78-82`) ; si
l'appel lève, `created` n'est pas fermé et `teardown` voit `server == null`. Un
`start` ultérieur crée un second serveur. (Non vérifié sans `libbox.aar`.)

**P2-11 — `AppController.logout` démarre le tunnel en `EXPIRED`/`REVOKED`.**
`:468` teste `state != STOPPED` ; `MainActivity` mappe ces états vers `else`
→ start. Un logout pendant une expiration peut donc lancer une connexion, puis
vider le coffre (`:471`) sous le service. Définition « en marche » divergente
(Q7).

**P2-12 — Le TUN garde des DNS qui ne répondent plus.**
`DNS_SERVERS = 1.1.1.1/1.0.0.1` (`:99`) et DoH 1.1.1.1
(`SingBoxConfig.kt:203-223`) ; en `NO_CONNECTION`, le TUN reste monté et les
requêtes DNS système partent dans le trou (`:568-570`). Aucun repli local
configuré.

### P3

- **P3-01** — `Home` : `onClickLabel = if (on) "Couper le VPN" else "Activer le VPN"`
  (`:351`) alors qu'en `CONNECTING`/`RECONNECTING`/`NO_CONNECTION` l'action est
  un **stop** (`:139`, `MainActivity.kt:69`). Le libellé d'accessibilité ment sur
  l'action ; le texte visible dit « Touche pour annuler » (`:177`).
- **P3-02** — `MainActivity` : `initialHasConfiguration` (`:65`) est passé à
  `VpnApp` mais jamais lu (`Shell.kt:98`) ; `AppController` calcule son propre
  `hasConfiguration` (`:366`). Câblage mort.
- **P3-03** — `ACTION_RECONNECT` est défini (`:71`) et traité (`:190-195`) mais
  **aucun émetteur** dans l'app (grep). Code mort qui donne une fausse
  impression de reprise manuelle.
- **P3-04** — `UnavailableTunnelEngine` et `LibboxTunnelEnginePlaceholder`
  (`TunnelEngine.kt:113-172`) sont inutilisés : `VpnApplication.kt:75` utilise
  `LibboxTunnelEngine`. Les commentaires `TunnelEngine.kt:53-57` et `:71-73`
  (« aucune dépendance libbox », « Unavailable par défaut ») sont faux.
- **P3-05** — `ServerBus.rates` est écrit (`VpnTunnelService.kt:426`) mais
  jamais lu (grep) ; `Home` recalcule son propre débit (`Home.kt:100-112`).
- **P3-06** — `scrub` n'est appliqué qu'aux logs debug (`:322`, `:376`) ; le
  détail publié par `teardown` (`:396`) et `onFatal` (`:324`) peut contenir un
  message d'erreur du moteur avec un UUID/une URI. `TunnelPlan` (`:149-162`) et
  `TunnelRequest` (`TunnelEngine.kt:32-48`) sont des `data class` sans
  `toString` masqué : un log/crash report les exposerait.
- **P3-07** — `LibboxTunnelEngine.writeDebugMessage` journalise le message brut
  (`:193-195`) ; `debug = false` (`:163`) devrait l'éviter, mais rien ne le
  garantit. `name = "libbox-1.14.3"` est codé en dur (`:54`), non vérifié.
- **P3-08** — `stop(context)` utilise `startService` (`:112-116`) et
  `select`/`probe` aussi (`:119-127`) ; si un futur appelant les utilise en
  arrière-plan, `IllegalStateException` (restrictions O+). Aujourd'hui appelés
  depuis l'UI.
- **P3-09** — Pas de `setConfigureIntent` (`:560-573`) : toucher la clé VPN
  dans les réglages rapides n'ouvre pas l'app. Icône de notification système
  (`:654`), pas de marque.
- **P3-10** — `setBlocking(false)` (`:566`) : compatibilité avec le lecteur Go
  de libbox (non vérifiée). `pickLoopbackPort` ferme le port puis le rend
  (`SingBoxConfig.kt:458-461`) : course étroite, repli fixe 20990 (`:469`).
- **P3-11** — `Home` : le libellé « Touche pour te protéger » s'applique aussi
  à `SUBSCRIPTION_EXPIRED` et `DEVICE_REVOKED` (`:175`), où l'action ouvre une
  feuille de renouvellement/support, pas une connexion.
- **P3-12** — `Home` `onPower` teste `c.deviceRevoked` **avant**
  `state in RUNNING` (`:138-139`) : un appareil révoqué avec un tunnel encore
  `CONNECTED` ne peut pas être déconnecté depuis le bouton (la feuille
  « revoked » s'ouvre).
- **P3-13** — `AppController.testLatency` (`:588`) ne traite que
  `CONNECTED`/`NO_CONNECTION` ; en `RECONNECTING`, il bascule en TCP direct
  alors que le TUN est monté ; l'UI indique « direct », mais la mesure n'est pas
  à travers le tunnel.
- **P3-14** — `ServerBus.notice` n'est pas effacé quand l'état passe à
  `CONNECTING`/`RECONNECTING` (`:509`, `:588`) ; un ancien bandeau peut rester.
- **P3-15** — `VpnTunnelService.onDestroy` ne `flush` pas le compteur et ne
  `stopForeground` pas ; la dernière usage et la notification dépendent du
  système.
- **P3-16** — `START_NOT_STICKY` (`:173/181/188/194/207/218`) + aucun
  `BOOT_COMPLETED` : après un kill, le VPN ne revient pas ; c'est documenté
  (`:55-57`), mais l'utilisateur n'est pas prévenu (la notification disparaît).
- **P3-17** — Docs : `README.md:135-139` dit encore que `UnavailableTunnelEngine`
  est le moteur par défaut ; `:140-145` décrit une sonde « côté Go » que le code
  ne fait pas. `TunnelEngine.kt:53-57` / `:71-73` sont périmés.
- **P3-18** — `ACTION_START` en `NO_CONNECTION` **arrête** (`:200-207`) : choix
  documenté, mais un `ACTION_START` qui déconnecte est surprenant pour un futur
  appelant (always-on, consentement).
- **P3-19** — `onStartCommand(null)` est traité comme un start (`:197-219`) :
  correct pour un always-on, mais aucun commentaire ne le dit ; un redémarrage
  système peut connecter sans action utilisateur.
- **P3-20** — `TunnelStateBus` est un singleton de processus ; un futur
  `android:process` sur le service casserait silencieusement l'UI. Aucun
  `android:process` aujourd'hui (manifeste), donc pas de bug actuel.

---

## 4. Ce que cet audit ajoute aux précédents

Les audits `audit-android-core-haiku` et `android-state-review-2026-10-29`
avaient déjà relevé : état non réconcilié, `NO_CONNECTION` sans coupure, D67,
notification sans action, deux flux `state`/`detail`. Le diagnostic
`android-vpn-state-haiku` du 25/10 est **périmé sur la course de deux tunnels**
(le Mutex existe). Cet audit ajoute, avec preuves :

1. **D49 est re-cassé côté client** (`SingBoxConfig.kt:317` `min` vs
   `bundle.ts:132-133` `max`), pas seulement D67.
2. **`onDestroy` ne publie pas et n'arrête pas le moteur** (`:229-236`) : trou
   d'état indépendant des courses.
3. **`stopRequested` est remis à `false` hors verrou** (`:252`) et
   `scheduleReconnect` peut annuler un arrêt (`:583-591`).
4. **IPv6 n'est pas routé** (`:560-573`) : fuite silencieuse sous « Protégé ».
5. **Le plan de contrôle de l'app est capturé par le TUN** (pas de
   `addDisallowedApplication`, seul le moteur est `protect`), donc pas de
   récupération en `NO_CONNECTION`.
6. **Aucune conscience réseau** : backoff jusqu'à 10 min, TUN qui blackhole,
   « Aucun serveur » pour un mode avion.
7. **`selectOutbound` ignoré** (`:521`, `:539`) : `CONNECTED` sur un selector
   mort.
8. **`since` n'est pas remis à zéro sur `EXPIRED`** (`TunnelEngine.kt:196-197`)
   et le chronomètre de notification diverge (`:343` vs `:196`).
9. **`stopIfIdle` peut annuler un démarrage** (`:407-409`) et lit `tun` hors
   verrou (non volatile).
10. **`ServerStatus` perd `startsAt`/`endpointTier`** au démarrage (`:344`).
11. **Contradiction code/README sur le cleartext loopback**
    (`Manifest:38`, `LibboxTunnelEngine.kt:203`, `README.md:143-145`).
12. **`DEVICE_REVOKED` et `ACTION_RECONNECT` sont morts**, `logout` traite
    `EXPIRED` comme « en marche » (`AppController.kt:468`).

---

## 5. Vérifié vs incertain

**Vérifié par lecture (fichier:ligne cité) :**

- Le Mutex `lifecycle` et les chemins `launchConnect`/`requestStop`/`teardown`.
- `CONNECTED` n'est créé que par `onHealthy`, après un `measureDelayMs` réussi.
- L'ordre `engine.stop()` → `closeTun()` → `publish(STOPPED)` dans `teardown`
  (`!keepState`), et les exceptions `onRevoke`/expiration.
- `onDestroy` ne publie pas et n'arrête pas le moteur.
- L'absence de `ConnectivityManager`/`setUnderlyingNetworks`/`addDisallowedApplication`
  dans le service et dans `establishTun` ; l'absence de route IPv6.
- L'absence d'action/`contentIntent` dans la notification ; la permission
  demandée seulement dans `Profile.kt:198`.
- `singBoxConfig.kt:317` prend le `min` des expirations ; `scheduleExpiry` et
  `plan == null` appellent `vault.clear()`.
- `BundlePayload` n'a qu'un `expiresAt` ; aucun champ D67 dans le code.
- Les cinq familles de « en marche » et leurs divergences.
- Les appels `selectOutbound` dont le `Result` est ignoré.
- `since` remis à zéro seulement sur `STOPPED`.

**Incertain (à vérifier sur appareil ou avec `libbox.aar`) :**

- **Cleartext loopback** : `HttpURLConnection` vers `127.0.0.1` est-il bloqué
  par `usesCleartextTraffic=false` sur l'Android du Pixel ? Le README affirme
  que oui ; le code fait le contraire. **À tester en premier** (logcat).
- **Fuite IPv6 effective** : dépend du réseau et du comportement Android ; le
  code n'a aucune route IPv6.
- **`onRevoke` vs `onDestroy`** pour un « Disconnect » depuis les réglages
  Android.
- **Comportement de `libbox`** : `startOrReloadService` synchrone/asynchrone,
  `closeService` bloquant, `serviceStop` sur mort silencieuse, compatibilité
  d'un fd non bloquant, sens exact de `/proxies/{tag}/delay`.
- **Les courses** `onHealthy`/`teardown`, `scheduleReconnect`/`requestStop`,
  `stopIfIdle`/`connectInternal` : raisonnées par lecture, non reproduites.
- **`HttpURLConnection`/Clash** : la sonde peut réussir sur `gstatic` mais
  échouer pour les destinations de l'utilisateur ; non testé.
- **Fréquence de `onDestroy` sans `onRevoke`** : dépend d'Android.
- **`allNetworks.firstOrNull`** (`LibboxPlatform.kt:220-225`) vs
  `activeNetwork` : non testé.

---

## 6. Recommandations (ordre d'exécution)

1. **Tester le cleartext loopback avant tout** : lancer l'app, `adb logcat |
   grep -i cleartext`, vérifier que `GET /proxies/proxy/delay` répond. Si
   bloqué, ajouter un `network_security_config` limité à `127.0.0.1`/
   `localhost` (ou appeler l'API Clash depuis le moteur Go, comme le README le
   prévoyait). Sans cela, tout le reste est théorique.
2. **Un seul écrivain d'état, avec époque de session** : `publish` uniquement
   sous `lifecycle` (ou via un acteur) ; capturer `sessionId` dans
   `connectInternal` et le vérifier dans `onHealthy`, `failover`, `selectNow`,
   `scheduleReconnect`, `scheduleExpiry`. Remplacer `(state, detail, since)` par
   un seul `StateFlow<UiState>`. Ne jamais republier un état terminal depuis un
   job d'une session close.
3. **Sémantique d'arrêt sous verrou** : `stopRequested` et un `stopEpoch`
   modifiés uniquement dans `lifecycle` ; `launchConnect` vérifie l'époque
   **après** acquisition du verrou ; `onDestroy` exécute un `teardown` courts
   (`engine.stop` + `closeTun` + `publish(STOPPED)`) même si le scope est
   annulé. Ajouter `withTimeout(5_000)` autour de `engine.start`/`stop`.
4. **D67/D49** : deux échéances distinctes (`rightsExpiresAt`, dérivée de
   `/me`/`subscription` ou ajoutée au bundle ; `nextConfigExpiry` = min des
   nœuds). À `nextConfigExpiry`, **rafraîchir le bundle** et reconstruire le
   plan sans le nœud expiré, sans `vault.clear()` ; ne vider que sur logout,
   révocation ou fin des droits. Planifier l'arrêt du tunnel au **max** des
   expirations de nœuds, pas au min. Vérifier la révision du coffre avant tout
   `clear()`.
5. **Réseau** : `ConnectivityManager.NetworkCallback` dans le service ;
   `onAvailable` → sonde immédiate et `backoff = 0` ; `onLost` → état
   « pas de réseau » (ou démontage explicite) au lieu de « Aucun serveur ».
   `setUnderlyingNetworks` ; décider fail-open/fail-closed pour `NO_CONNECTION`
   (le TUN qui blackhole est un kill switch implicite, mais l'app ne peut plus
   se récupérer).
6. **IPv6** : `addAddress` IPv6 + `addRoute("::", 0)`, ou blocage IPv6 explicite
   (fail-closed), jamais « IPv6 hors tunnel ». Tester avec un APN IPv6-only et
   `curl -6`.
7. **Plan de contrôle** : `addDisallowedApplication(packageName)` (le plus
   simple) ou protéger les sockets d'`ApiClient` ; sans cela, aucune
   récupération en `NO_CONNECTION`.
8. **Notification** : `contentIntent` vers `MainActivity`, action
   « Déconnecter » (`PendingIntent.getService` avec `ACTION_STOP`), demande de
   `POST_NOTIFICATIONS` au premier tunnel, chronomètre basé sur `since` (ou une
   seule notion de session), texte qui distingue « pas de réseau » de « serveur
   mort ».
9. **Tests** : harnais JVM avec un faux moteur (délais/faux `Result`) et un faux
   coffre pour reproduire les courses stop/reconnect, la double publication
   `CONNECTED`/`STOPPED`, D67 ; test instrumenté Pixel pour IPv6, mode avion,
   Wi-Fi→4G, `onRevoke`/`onDestroy`.
10. **Nettoyage** : retirer ou câbler `ACTION_RECONNECT`, `DEVICE_REVOKED`,
    `UnavailableTunnelEngine`/placeholder, `initialHasConfiguration`,
    `ServerBus.rates` ; appliquer `scrub` avant toute publication ; masquer
    `toString` de `TunnelPlan`/`TunnelRequest` ; corriger les libellés
    d'accessibilité et les docs.

---

## 7. Questions ouvertes

1. **Cleartext loopback** : `usesCleartextTraffic=false` bloque-t-il
   `HttpURLConnection` vers `127.0.0.1` sur le Pixel ? Si oui, l'app ne peut
   pas prouver `CONNECTED` ; c'est le premier test à faire.
2. **`onRevoke` vs `onDestroy`** : quel callback Android utilise pour un
   « Disconnect » depuis les réglages ? Le code ne couvre que le premier.
3. **Fail-open ou fail-closed en `NO_CONNECTION`** : garder le TUN (kill switch
   implicite, mais blackhole et app injoignable) ou le fermer (Internet
   fonctionne, mais aucune protection) ? D61 ne tranche que l'affichage.
4. **D67 côté serveur** : faut-il ajouter `rightsExpiresAt`/`nextConfigExpiry`
   au bundle, ou dériver les droits de `/me/subscription` ? Le format actuel n'a
   qu'un `expiresAt` (`bundle.ts:58/65`).
5. **IPv6** : les réseaux cibles (Cameroun, Wi-Fi domestique) fournissent-ils
   de l'IPv6 ? Si oui, P0 immédiat ; sinon, fuite sur Wi-Fi.
6. **`selectOutbound`** : le `PUT /proxies/proxy` échoue-t-il réellement dans
   certaines configurations (tag inconnu, secret, version) ? À instrumenter.
7. **`libbox.closeService`** : peut-il bloquer ? Si oui, `teardown` doit avoir
   un timeout et le moteur doit être fermé hors du verrou.
8. **`setBlocking(false)`** : est-ce le mode attendu par le lecteur Go de
   libbox ? (non vérifié)
9. **`startsAt`** : D140 a supprimé les serveurs de nuit ; le champ et le filtre
   `Servers.kt:98` sont-ils encore utiles ?
10. **Quota épuisé** : l'état `TunnelState` n'a pas de `QUOTA_EXHAUSTED` ; le
    client ne sait pas distinguer « quota fini » de « nœud mort ». Faut-il
    l'ajouter ou réutiliser `SUBSCRIPTION_EXPIRED` avec un détail ?

---

## 8. Fichiers écrits

- `knowledge/agents/audit-android-tunnel/notes/audit.md` (ce fichier).
- `knowledge/agents/audit-android-tunnel/log.md` (entrées via
  `node knowledge/cli.mjs agent log audit-android-tunnel ...`, y compris
  `CLÔTURE`).

Aucun fichier de code, aucun nœud partagé, aucun `knowledge/` hors du dossier de
l'agent n'a été modifié.

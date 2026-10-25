# Diagnostic — « aucun serveur » : UI déconnectée, VpnService encore actif

Date : 2026-10-25. Méthode : lecture du code (aucun appareil ni build lancé avant ce diagnostic).
Statut : **lu dans le code**, non reproduit sur le Pixel 8. Les affirmations marquées *(hypothèse)* ne sont pas vérifiées.

Racines : `apps/android/app/src/main/java/cm/bouendji/vpn/` (abrégé `vpn/`).

## Les quatre questions de la charte

### (a) Le chemin « aucun serveur »

- `vpn/VpnTunnelService.kt:406-426` — `failover()` : si `probeAll` ne rend aucune latence, elle publie `NO_CONNECTION` (ligne 415), pose le bandeau (414) et renvoie `false`. **Le tunnel n'est pas coupé** : c'est voulu (reprise 30 s → 2 min → 10 min, lignes 79 et 360-363), et `Home.kt:71` place `NO_CONNECTION` dans `RUNNING`.
- `vpn/VpnTunnelService.kt:347-378` — `supervise()` relance `failover()` après chaque backoff tant que rien ne répond.
- Point produit à trancher (non tranché ici) : tunnel monté sans sortie = le téléphone n'a plus d'accès Internet pendant `NO_CONNECTION`.

### (b) Qui publie l'état affiché

- `vpn/TunnelEngine.kt:182-196` — `TunnelStateBus` : singleton, `state` et `detail`. Seul `VpnTunnelService.publish` (`VpnTunnelService.kt:607-617`) et `promoteToForeground` (569-572) écrivent dedans.
- L'UI lit `TunnelStateBus.state` (`MainActivity.kt:41`), puis `Home.kt:110-121` traduit : `STOPPED` → « Non protégé » (ligne 119), `NO_CONNECTION` → « Aucun serveur » (ligne 116).
- Le mot « Déconnecté » **n'existe dans aucune source** (`grep -ri déconnect` : seulement « Touche pour te déconnecter » et « Se déconnecter »). L'état que l'utilisateur appelle « Déconnecté » est donc `STOPPED` (« Non protégé ») ou la notification « Arrêté » (`VpnTunnelService.kt:620`). *(non vérifié : libellé exact vu à l'écran)*.

### (c) Pourquoi l'état passe à « arrêté » sans arrêt réel, ou pourquoi l'arrêt échoue

1. **`START` sur un tunnel vivant ouvre un second tunnel.** Le bouton de `MainActivity.kt:64-72` n'envoie `stop` que pour `CONNECTED`, `CONNECTING`, `RECONNECTING`. Pour `NO_CONNECTION` (tunnel vivant, `Home.kt:71` le compte comme « en marche », et `Home.kt:132` appelle `toggleTunnel()`), la branche `else` envoie `VpnTunnelService.start` → `ACTION_START`.
   - `VpnTunnelService.kt:187` : `promoteToForeground(CONNECTING)` publie `CONNECTING` par-dessus un tunnel vivant.
   - `VpnTunnelService.kt:217-220` : `connect()` annule `connectJob` mais ne touche ni à `tun`, ni au superviseur, ni aux jobs de reconnexion/expiration du tunnel vivant.
   - `VpnTunnelService.kt:260-265` : `establishTun()` crée un second TUN et `tun = descriptor` **écrase la référence sans fermer l'ancienne** (aucun `closeTun()` avant). Le premier descripteur n'est plus fermé par le service.
   - `VpnTunnelService.kt:267` : `engine.start` relance le moteur ; `LibboxTunnelEngine.kt` (`start`) appelle `stopInternal()` d'abord, donc l'ancien moteur est arrêté sans que le service le sache.
2. **L'arrêt publie `STOPPED` avant d'arrêter le moteur.** `VpnTunnelService.kt:514-538` (`shutdown`) : `publish(STOPPED)` (ligne 534), puis `stopEngineAsync()` dans un scope détaché (ligne 529, corps 545-549), `closeTun()` (530) sans attendre le moteur, `stopSelf()` (537). Rien n'attend la fin de `engine.stop()`.
3. **Une connexion en cours n'est pas annulable.** `connectInternal` (`VpnTunnelService.kt:222-297`) ne vérifie pas `isActive` après `engine.start` (267-296) : elle continue, publie `CONNECTING` (293), lance superviseur, reconnexion et expiration **après** `stopSelf()`. Dans `LibboxTunnelEngine.kt` (`start`), `runCatching` avale `CancellationException`, donc l'annulation ne stoppe pas le démarrage. Scénario : appui 1 (démarrage) puis appui 2 (arrêt) très vite → `shutdown` s'exécute pendant `engine.start` → `stopEngineAsync` finit **avant** que `server = created` soit affecté → le moteur reste vivant, l'UI affiche « Non protégé ». *(hypothèse cohérente avec « appuyer vite plusieurs fois » ; non reproduite)*.
4. **Publications mensongères sans tunnel.**
   - `VpnTunnelService.kt:276-277` (`onFatal`) : publie `NO_CONNECTION` puis `shutdown(keepState = true)`. Le tunnel est coupé, la boucle de reprise est annulée (`supervisorJob`), mais l'UI dit « Aucun serveur. Nouvel essai automatique » : **aucun essai n'aura lieu**.
   - `VpnTunnelService.kt:246-248` (`plan == null`) : même schéma ; de plus `container.vault.clear()` (246) efface la configuration locale à la première connexion sans configuration utilisable (`SingBoxConfig.kt:180` renvoie `null` si `usable` est vide). *(point ouvert, voir ci-dessous)*.

### (d) Comment le bouton déclenche start/stop (double appui, course)

- `ui/screens/Home.kt:126-136` (`onPower`) : `state in RUNNING -> toggleTunnel()` ; puis `MainActivity.kt:64-72` choisit stop ou start **d'après l'état lu au moment de la composition**, sans verrou ni anti-rebond.
- `VpnTunnelService.onStartCommand` (`:149-198`) traite chaque intent en parallèle sur `scope` (`Dispatchers.Default`, `SupervisorJob`) : aucune exclusion mutuelle entre `ACTION_START`, `ACTION_STOP`, `ACTION_RECONNECT`, `scheduleReconnect`, `scheduleExpiry`, `onFatal` et `onRevoke`.
- Conséquence : deux appuis rapprochés produisent deux coroutines de cycle de vie concurrentes, dont l'ordre d'exécution n'est pas défini. C'est la raison pour laquelle « appuyer plusieurs fois vite » finit par marcher : une coroutine d'arrêt finit par passer après la coroutine de démarrage, et l'état publié ne reflète plus le moteur.

## Cause racine (une phrase)

Le cycle de vie du tunnel n'a pas de propriétaire unique : des coroutines concurrentes démarrent, arrêtent et republient l'état sans exclusion mutuelle, et l'UI ne demande pas l'arrêt dans l'état `NO_CONNECTION` alors que le tunnel tourne ; l'état publié n'est donc pas dérivé de l'état réel du moteur et du TUN.

## Ce qui n'est pas dans ce diagnostic

- Reproduction sur appareil : **non faite**. Le test réel (couper tous les nœuds, un appui, vérifier l'icône clé et `dumpsys`) reste à l'orchestrateur.
- Le libellé exact vu par l'utilisateur : *(non vérifié)*.

## Points ouverts (décisions produit, pas techniques)

1. Tunnel monté sans sortie (`NO_CONNECTION`) : coupe Internet sur le téléphone. Option A (retenue ici pour la correction) : le tunnel reste monté, l'état le dit. Option B : arrêter le tunnel et reprendre les essais par sonde TCP directe. À trancher.
2. `VpnTunnelService.kt:246` efface le coffre quand aucune configuration n'est utilisable à la connexion : destructif pour un état transitoire. À trancher avec D61 (« un bundle vide n'écrase pas la liste locale »).

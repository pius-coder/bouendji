# 3x-ui — verdict opérationnel

Sous-agent : `xray-ops` · 2026-10-20
Périmètre : les 5 questions du nœud `3x-ui` (`knowledge/60-research/3x-ui.md`).
Version analysée : **v3.10.2** (dernière release stable, publiée le 2026-10-14),
plus `main` au 2026-10-20. Les chemins cités sont ceux de v3.10.2 ; quand le
fichier diffère entre `main` et la release, c'est dit explicitement.
Méthode : arbre complet via `api.github.com/repos/MHSanaei/3x-ui/git/trees/main?recursive=1`
(2353 entrées, non tronqué), puis lecture des fichiers réels via
`raw.githubusercontent.com`, plus la doc officielle Xray et les `.proto` de
Xray-core. Aucun test d'exécution n'a été fait (pas d'instance ici) : tout ce
qui est chronométré est marqué **non mesuré**.

Note de cadrage : la branche `main` n'est plus l'ancien panel Go+Vue avec
`web/` et `xray/`. C'est une réécriture **v3** (`internal/web`, `internal/xray`,
`internal/database`, `internal/sub`). Le modèle de données a changé (table
`clients` normalisée + table de jointure `client_inbounds`, et non plus des
clients en JSON dans `inbounds.settings`). Toute la suite décrit **v3**.

---

## Verdict en 5 lignes

1. **Désactiver un client en < 5 s sans couper les autres : oui, à une condition.**
   La désactivation est un appel gRPC local `AlterInbound/RemoveUser` appliqué
   tout de suite ; mais il ne tue **pas** la session déjà établie, et le réglage
   `restartXrayOnClientDisable` vaut **`true` par défaut** — dans ce cas le panel
   redémarre Xray (donc **tout le monde** tombe) dans les 30 s.
2. **Lire le trafic par client de façon fiable : oui**, compteur Xray
   `user>>>email>>>traffic>>>uplink|downlink` échantillonné **toutes les 5 s** et
   persisté en base (`client_traffics`, `email` unique), SQLite par défaut,
   Postgres en option. Le seul trou est un arrêt du **panel** (les deltas en RAM
   sont perdus), pas un arrêt du core.
3. **Créer un inbound par API au démarrage : oui**, `POST /panel/api/inbounds/add`,
   appliqué à chaud (`AddInbound` gRPC), sans redémarrage. Le vrai coût est
   l'amorçage : le jeton d'API se fabrique en CLI (`x-ui setting -getApiToken`).
4. **Panneau non exposé + piloté par notre API : oui.** `webListen` à
   `127.0.0.1` (ou réseau Docker interne), aucun port publié, `Authorization:
   Bearer` (les appels Bearer sont exemptés de CSRF). Il reste que le panneau
   fait de l'egress (mises à jour, géodonnées) : à brider.
5. **API Xray directe sans 3x-ui : plus simple en surface, pas en coût total.**
   `HandlerService.AlterInbound` + `StatsService.QueryStats` suffisent
   techniquement, mais on rachète tout ce que 3x-ui fournit (génération de
   config, quotas, expiration, liens, UI) et **on garde le même problème de
   session vivante**. Recommandation : 3x-ui comme plan de contrôle par nœud,
   notre backend comme source de vérité de l'identité.

---

## Q1 — Désactiver un client en < 5 s, sans couper les autres ?

### Réponse

**Oui, si `restartXrayOnClientDisable` est à `false`.** Sinon, non : la
désactivation est bien immédiate côté credential, mais le panel programme un
redémarrage complet de Xray qui coupe **tous** les clients du nœud.

Trois faits distincts, souvent confondus :

| Geste | Effet réel | Délai |
|---|---|---|
| retirer le client du core (`RemoveUser`) | les **nouveaux** handshakes échouent | immédiat (appel synchrone, ms en pratique) |
| tuer la session **déjà** établie de ce client | impossible par l'API | — |
| redémarrer Xray | tue **toutes** les sessions du nœud | ≤ 30 s (tick cron) + durée du restart |

### Preuves

**(a) La désactivation passe par gRPC, pas par un redémarrage.**
`internal/web/service/client_inbound_apply.go` (v3.10.2), `SetClientEnableByEmail`
puis `applyClientFieldByEmail` → `UpdateInboundClient`, qui appelle le runtime :

> l.1030 `err1 := rt.RemoveUser(context.Background(), oldInbound, oldEmail)`
> l.1035 `if !clients[0].Enable && droppedClientNeedsRestart() { needRestart = true }`

et `droppedClientNeedsRestart` (l.22-24) :

> « droppedClientNeedsRestart is what restartXrayOnClientDisable asks for: the
> core API drops the credential only, so a live session needs the process replaced. »

**(b) Le réglage est `true` par défaut.**
`internal/web/service/setting.go` l.203 :

> `"restartXrayOnClientDisable":  "true",`

**(c) Le redémarrage n'est pas immédiat mais planifié.**
`internal/web/controller/client.go` (même logique l.234-239) pose un drapeau :
`a.xrayService.SetToNeedRestart()`. Le drapeau est consommé par un cron
`@every 30s` — `internal/web/web.go` :

> l.299 `cadenceXrayRestart   = "@every 30s"`
> l.331-333 `s.cron.AddFunc(cadenceXrayRestart, func() { s.xrayService.ApplyPendingRestart() })`

`ApplyPendingRestart` → `RestartXray(false)` → arrêt du process et relance
(`internal/web/service/xray.go` l.1382-1434).

**(d) `RemoveUser` ne coupe pas une session établie — c'est écrit dans le code.**
`internal/web/job/check_client_ip_job.go` l.724-725 :

> « The core's RemoveUser clears its validator: a session already up keeps
> running, except a reverse vless client, which is skipped above. »

et l.663-664 : « drops a client's credential for a moment, so new handshakes are
refused; the fail2ban ban is what ends live traffic. »

**(e) Le hot-apply lui-même évite le redémarrage pour tout le reste.**
`internal/web/service/xray.go` l.1457-1538 : `tryHotApply` fait
`RemoveUser` / `DelInbound` / `AddInbound` / `AddUser` / `ApplyRoutingConfig`
via gRPC ; l.1469-1474, si des clients quittent la config **et** que le réglage
est actif, il renonce au hot-apply : « hot apply: clients left the config,
restarting to drop their live sessions ».

**(f) Les verrous sont par inbound, pas globaux**: `internal/web/service/client_locks.go`,
`lockInbound(inboundId)` — une mutation sur l'inbound A ne sérialise pas
l'inbound B. (Le trafic, lui, passe par un writer unique, voir Q2.)

### Incertitude

- **Latence réelle non mesurée.** On peut seulement dire qu'elle est bornée :
  l'appel `RemoveUser` a un timeout client de **5 s**
  (`internal/xray/api.go` l.798 `context.WithTimeout(..., 5*time.Second)`), donc
  « < 5 s » n'est pas garanti au pire cas (core bloqué) — il l'est en pratique.
- Le comportement exact des sessions **mux / XHTTP / QUIC** après `RemoveUser`
  n'est pas documenté : on sait que la session TCP existante survit, pas
  combien de temps un client multiplexé peut la prolonger. **Non vérifié.**
- La durée d'un `RestartXray` (fenêtre de coupure) dépend du nombre d'inbounds
  et de la machine. **Non mesuré.**

### Conséquence opérationnelle

Pour de la révocation individuelle, **mettre `restartXrayOnClientDisable` à
`false`** et assumer : « le client ne peut plus se reconnecter, sa session en
cours meurt à la fin de son socket ». Si l'exigence est « couper maintenant, et
lui seul », il faut une brique réseau (iptables/fail2ban sur ses IP) — pas
l'API Xray.

Et attention à l'effet de bord : la **mise en quarantaine automatique pour
quota** suit le même chemin. `internal/web/job/xray_traffic_job.go` l.90-101 :
si des clients viennent d'être désactivés et que le réglage est actif,
`RestartXray(false)` est appelé. **Avec les valeurs par défaut, un client qui
atteint son quota coupe tous les autres clients du nœud.** C'est l'argument le
plus fort pour passer ce réglage à `false`.

---

## Q2 — Lire son trafic de façon fiable (quota mensuel) ? Où est persisté le compteur ?

### Réponse

**Oui.** Compteurs par utilisateur produits par Xray, lus toutes les **5 s**,
convertis en deltas, additionnés en base. Persistance : table `client_traffics`,
clé `email` (unique, globale au panel, pas par inbound). Base : SQLite
`/etc/x-ui/x-ui.db` par défaut, PostgreSQL en option. Un quota mensuel est
natif (`trafficReset: monthly` + `trafficResetDay` par client).

### Preuves

**Format des compteurs** — doc officielle
<https://xtls.github.io/en/config/stats.html> :

> `user>>>[email]>>>traffic>>>uplink` / `user>>>[email]>>>traffic>>>downlink` …
> « If the corresponding user does not specify an Email, statistics will not be enabled. »

et le prérequis : `"stats": {}` présent, puis activation des compteurs dans
`policy` (`statsUserUplink` / `statsUserDownlink`). Le template 3x-ui fait les
deux : `internal/web/service/config.json` l.50-51 (`statsUserDownlink` /
`statsUserUplink`), l.86 (`"stats": {}`).

**Lecture** — `internal/xray/api.go` l.822-858 : `GetTraffic()` appelle
`StatsService.QueryStats(&QueryStatsRequest{Reset_: false})` et extrait les
deltas par expression régulière (`user>>>…>>>traffic>>>(downlink|uplink)`).
`Reset_: false` : **les compteurs du core ne sont jamais remis à zéro par le
panel**, c'est le panel qui tient le cumul.

**Fréquence** — `internal/web/web.go` l.300 :
`cadenceXrayTraffic = "@every 5s"`, enregistré l.337
`job.NewXrayTrafficJob()`.

**Persistance** — `internal/web/service/inbound_traffic.go`,
`AddTraffic` → `addClientTraffic`, écrit dans la table `client_traffics`
(condition SQL citée l.46-60 : `((total > 0 AND up + down >= total) …)`).
Structure : `internal/xray/client_traffic.go` l.5-31 —
`Email string \`gorm:"unique"\``, `Up`, `Down`, `Total`, `ExpiryTime`,
`Reset`, `ResetDay`, `ResetWeekday`, `LastOnline`.

**Base** — `internal/config/config.go` l.155-170 : dossier `/etc/x-ui`
(surchargeable `XUI_DB_FOLDER`), fichier `<nom>.db` ; Postgres via
`XUI_DB_TYPE=postgres` + `XUI_DB_DSN` (`docker-compose.yml` l.42-46).

**Quota mensuel** — `internal/web/job/periodic_traffic_reset_job.go` :
`@daily` avec `period="monthly"`, `monthlyResetDue(resetDay, now)` (l.37-43) ;
côté client, `ResetDay`/`ResetWeekday`/`TrafficReset` sont des champs du modèle
(`internal/database/model/model.go` l.958-964). Le couple
« reset mensuel + `total` » **est** le quota mensuel.

**Application du quota** — `internal/web/service/inbound_disable.go` l.17 :
`((total > 0 and up + down >= total) or (expiry_time > 0 and expiry_time <= ?))
and enable = ?` → le client est désactivé **par le panel**, toutes les 5 s, puis
retiré du core (`trafficRemoveUser`, l.149).

### Incertitude

- **Trou de mesure au redémarrage du panel.** Les valeurs de référence sont en
  RAM (`XrayAPI.StatsLastValues`, `internal/xray/api.go` l.105-107) et la
  première lecture d'un process ne fait qu'enregistrer une base (l.815-821,
  `baselinePass` → `continue`). Conséquence : le trafic écoulé pendant que le
  **panel** est arrêté (mise à jour, crash, redéploiement) n'est pas attribué.
  Arrêt du **core** : géré, un compteur qui recule repart de zéro (l.851-853).
  Fenêtre perdue = durée d'indisponibilité du panel. **Non mesuré.**
- **Le compteur est par `email`, pas par (inbound, email)** : deux appareils qui
  partageraient un `email` voient leurs octets fusionnés. Chez nous : un `email`
  par `devices.id`, jamais partagé.
- `Reset_`/`reset` existe côté Xray (`QueryStats`, et `GetUsersStats(...)`
  avec `reset=true`) mais **`GetUsersStats` ne renvoie que les utilisateurs
  actuellement en ligne** (`app/stats/command/command.go` l.91-116 : la map est
  construite depuis `VisitOnlineMaps`, puis le trafic n'est rempli que pour ces
  entrées). Ne pas s'en servir pour un relevé de fin de mois : utiliser
  `QueryStats`, ou la base du panel.
- Précision du compteur Xray lui-même (octets réels vs facturés, overhead TLS) :
  **non vérifié** ; ce n'est pas un compteur de facturation télécom.

---

## Q3 — Créer un inbound par API au démarrage d'un conteneur ?

### Réponse

**Oui, et à chaud.** `POST /panel/api/inbounds/add` avec le JSON de l'inbound
(dont `settings.clients`) → `InboundService.AddInbound` → `rt.AddInbound(...)`
(gRPC `HandlerService.AddInbound`), sans redémarrage. Le seul point non trivial
est l'amorçage des credentials, et il est scriptable.

### Preuves

- Route : `internal/web/controller/inbound.go` l.84 `g.POST("/add", a.addInbound)`,
  sous le groupe `/panel/api` (`controller/api.go` l.175 `api := g.Group("/panel/api")`).
- Handler : `controller/inbound.go` l.163-189 — bind + validate `model.Inbound`,
  puis `AddInbound`, et `SetToNeedRestart()` seulement si `needRestart`.
- Application à chaud : `internal/web/service/inbound.go` l.1508-1517
  `rt.AddInbound(context.Background(), payload)` ; `needRestart = true`
  uniquement en cas d'échec.
- Implémentation gRPC : `internal/xray/api.go` l.136-162, `client.AddInbound(...)`.
- Amorçage du jeton : `main.go` l.503-548, `x-ui setting -getApiToken true
  -tokenScope admin` imprime un jeton en clair (créé si aucun n'existe, sinon
  régénéré — l'ancien devient invalide). Le hash seul est stocké
  (`service/panel/api_token.go` l.106-119).
- Contrat lisible par machine : `GET /panel/api/openapi.json`
  (`controller/api.go` l.183), spec versionnée dans le dépôt
  (`docs/public/openapi.json`, `frontend/public/openapi.json`).

### Incertitude

- **Séquence d'amorçage non testée bout en bout.** À froid : le panneau doit
  écouter avant tout appel ; `-getApiToken` ouvre la base et écrit dedans, donc
  à faire **avant** de démarrer le service, ou sur une base déjà initialisée.
- Si le port d'écoute Xray demandé est déjà pris, `bindConflicts` refuse le
  nouveau config et le changement est rejeté (`xray.go` l.1405-1413). Le choix
  de port reste donc à notre charge.
- Créer un inbound **vide** puis pousser les clients est plus simple que
  d'inliner les clients : les deux marchent, mais un ajout de client isolé
  (`/clients/add`) n'exige pas de re-sérialiser tout l'inbound. **Non mesuré**
  en charge.

---

## Q4 — Le panneau peut-il rester non exposé tout en étant piloté par notre API ?

### Réponse

**Oui.** Trois réglages suffisent : écoute loopback (ou réseau Docker interne
non publié), jeton Bearer (pas de session, pas de CSRF), pas de publication de
port. Le panneau n'a besoin d'aucune exposition entrante pour être piloté.

### Preuves

- Écoute : `internal/web/web.go` l.581-598 — `listen` vient du réglage
  `webListen`, puis `net.JoinHostPort(listen, port)` et
  `net.ListenConfig{}.Listen(ctx, "tcp", listenAddr)`. Défaut :
  `setting.go` l.57 `"webListen": ""` → **toutes les interfaces**. À passer
  explicitement à `127.0.0.1`.
- Auth API : `controller/api.go` l.37-77 — `Authorization: Bearer <token>`
  (`MatchToken`), sinon session, sinon 401/404. Pas de login, pas de 2FA sur
  ce chemin.
- CSRF : `internal/web/middleware/security.go` l.37-56 — « Bearer-token-authenticated
  callers … short-circuit the CSRF check ». Donc pas de `X-CSRF-Token` à gérer.
- Scopes : `controller/api.go` l.78-160 — `admin` (tout), `monitor`
  (status/metrics en GET seulement), `node-sync` (allowlist d'exploitation :
  inbounds, clients, restart Xray). Un jeton `monitor` ne peut pas désactiver
  un client ; c'est une bonne séparation pour notre backend.
- Jeton : `service/panel/api_token.go` — 48 caractères, SHA-256 stocké,
  `ExpiresAt` optionnel, `enabled`.
- Empreinte réseau minimale : `docker-compose.yml` publie `2053:2053` ; ne pas
  publier cette ligne, ou la lier à `127.0.0.1:2053:2053`.

### Incertitude

- **Egress du panneau non inventorié.** Il vérifie les mises à jour
  (`/server/getPanelUpdateInfo`), télécharge des géodonnées, peut joindre
  Telegram/SMTP/Discord. `XUI_TUNNEL_HEALTH_MONITOR` peut même redémarrer Xray
  (« a restart drops all clients », README) : à laisser à `false`.
  Liste exhaustive des appels sortants : **non vérifiée**.
- Auto-update : DLSEC-2025-1 (Digilol) documente un update qui accepte des
  certificats forgés — donc pas d'auto-update en production, image épinglée.
- CVE : CVE-2026-55477 (écriture de fichier arbitraire via import de base, admin
  authentifié, CVSS 7.2, **corrigée en 3.3.1** selon la fiche agrégée consultée)
  — sans impact sur 3.10.2, mais confirme que « admin du panneau » ≈ « root de
  la machine ». Inventaire CVE complet : **non vérifié** (pas de revue NVD
  exhaustive ici).

---

## Q5 — API Xray directe (HandlerService, AlterInbound) sans 3x-ui ?

### Réponse

**Techniquement plus simple, opérationnellement plus cher.** L'API gRPC fait
exactement ce qu'il faut pour ajouter/retirer un utilisateur et lire ses
compteurs. Mais elle ne règle **pas** la révocation d'une session vivante, elle
n'est **pas authentifiée**, et elle ne fournit ni stockage, ni quotas, ni
expiration, ni génération de config, ni liens d'abonnement.

### Preuves

- Services et conditions d'activation :
  <https://xtls.github.io/en/config/api.html> — `api.services` doit lister
  `HandlerService` / `StatsService` ; soit `api.listen` (mode simplifié depuis
  v1.8.12), soit un inbound + une règle de routage `inboundTag: ["api"]` →
  `outboundTag: "api"`. Le template 3x-ui fait la seconde forme :
  `config.json` l.11-19 (`"protocol": "tunnel"`, `127.0.0.1:62789`,
  `"tag": "api"`) et l.66-72 (règle de routage). `"tunnel"` est bien un alias
  de `dokodemo-door` : `infra/conf/xray.go` l.29-30.
- Messages : `app/proxyman/command/command.proto` l.13-38 —
  `AddUserOperation{user}`, `RemoveUserOperation{email}`,
  `AlterInboundRequest{tag, operation}`, `AddInboundRequest{inbound}`.
- **Limite de protocole, explicite dans la doc** : « Add a user to an inbound
  (supports VMess, VLESS, Trojan, Shadowsocks only) ». Un ajout à chaud
  WireGuard/Hysteria/TUIC n'est pas couvert par cette phrase ; pour du VLESS
  (notre cas) c'est bon.
- Stats : `app/stats/command/command.proto` — `QueryStats{pattern, reset}`,
  `GetUsersStats{include_traffic, reset}`, `GetAllOnlineUsers`,
  `GetStatsOnlineIpList`.
- Sécurité : `internal/xray/api.go` l.92-98 — `grpc.NewClient("127.0.0.1:"+port,
  grpc.WithTransportCredentials(insecure.NewCredentials()))`. **Aucune auth** :
  quiconque atteint ce port contrôle le nœud. Loopback obligatoire, ou socket
  Unix ; jamais derrière un port publié.
- Ce que l'API ne fait pas : il n'existe aucune RPC « tuer les connexions de
  l'utilisateur X ». `RoutingService` sait ajouter une règle de routage
  (`AddRule`), et la commande `xray api sib` s'en sert pour bloquer des **IP
  sources** (`main/commands/all/api/source_ip_block.go`) — granularité IP, et
  l'effet sur les connexions déjà établies est **non vérifié**.

### Incertitude

- Comportement de `AddRule`/`sib` sur les flux en cours : **non vérifié**.
- Coût réel (en homme-jours) d'un générateur de config + comptabilité + UI :
  hors de mon périmètre, pas d'estimation.

---

## Ce qu'on peut automatiser / ce qu'on ne peut pas

| Geste | Automatisable ? | Point d'entrée | Réserve |
|---|---|---|---|
| créer un inbound | **oui**, à chaud | `POST /panel/api/inbounds/add` | port à choisir ; conflit = refus |
| créer un client | **oui**, à chaud | `POST /panel/api/clients/add`, `/clients/bulkCreate` | `email` unique global |
| **désactiver** un client | **oui** | `POST /panel/api/clients/bulkDisable` (`{emails:[…]}`) | voir réserves ci-dessous |
| réactiver | oui | `POST /panel/api/clients/bulkEnable` | un reset de quota réactive aussi (`periodic_traffic_reset_job.go` l.129-133) |
| lire le trafic d'un client | oui | `GET /panel/api/clients/traffic/:email` | fraîcheur ≤ 5 s |
| lister clients + trafic | oui | `GET /panel/api/clients/list`, `/list/paged` | pagination pour les gros parcs |
| quota + expiration | oui | `POST /clients/bulkAdjust`, `/clients/update/:email` | **update partiel destructif** |
| remise à zéro trafic | oui | `POST /clients/resetTraffic/:email`, `/clients/bulkResetTraffic` | réactive le client |
| état en ligne | oui | `POST /panel/api/clients/onlines` | dépend de `statsUserOnline` |
| créer un jeton | oui | CLI `x-ui setting -getApiToken true -tokenScope admin` | regénérer invalide l'ancien |
| **tuer la session vivante d'un client** | **non** | — | seulement restart global, ou iptables/fail2ban par IP |
| désactiver **sans** redémarrer Xray | oui, **si** `restartXrayOnClientDisable=false` | réglage panneau | sinon restart ≤ 30 s, tous coupés |
| latence déterministe du restart | non | cron `@every 30s` | jusqu'à 30 s + durée du restart |
| update partiel d'un client | **non, piège** | — | `Update` réécrit l'entrée entière : `totalGB`, `expiryTime`, `limitIp` non fournis = **écrasés** |
| isolation par inbound | partielle | `lockInbound(id)` | le restart, lui, est **global au process** |
| multi-nœuds depuis un panneau | oui | `POST /panel/api/nodes/add` | le nœud doit exposer son panneau au maître (HTTPS + Bearer ou mTLS) |

Preuve du piège « update partiel » : `internal/web/service/client_crud.go`
l.663-678 ne reporte que `ID`, `Password`, `Auth`, `Secret`, `SubID`,
`CreatedAt` depuis l'existant ; le client est ensuite réinséré **en entier**
dans les settings (l.753 `json.Marshal(... "clients": {clientWithInboundFlow(...)})`)
et `UpdateInboundClient` ne préserve que `created_at`/`subId`
(`client_inbound_apply.go` l.796-830). Donc `{"email":"x","enable":false}`
efface le quota et l'expiration. **Toujours lire le client avant de le
réécrire, ou utiliser `bulkDisable`.**

Preuve du multi-nœuds : `internal/web/controller/node.go` (`/nodes/add`,
`/nodes/update/:id`, `/nodes/probe/:id`, `/nodes/mtls/*`) et
`internal/web/runtime/remote.go` l.29, l.160-182 : appel HTTP(S) vers le
panneau du nœud, Bearer ou mTLS, timeout 10 s.

---

## Recommandation d'architecture

**Contexte à respecter** : sur GCP/Cloud Run, l'endpoint est `shared`, court
(≤ 4 h, à trancher dans `endpoint-lifecycle`), et le backend ne peut pas entrer
dans le conteneur. Sur VPS permanent, on veut du `per_device` avec révocation.

### Retenu : 3x-ui par nœud, panneau non exposé, backend pilote l'API HTTP

Un conteneur par VPS, contenant 3x-ui + Xray (c'est déjà le modèle du projet :
Xray est un **process enfant** du panneau, `internal/xray/process.go`). Le
panneau écoute sur `127.0.0.1:2053` (ou le réseau Docker interne, sans
publication de port) ; notre agent, dans le même conteneur ou le même
namespace réseau, parle à `/panel/api` avec un jeton `admin` dédié, obtenu au
boot par `x-ui setting -getApiToken`.

Réglages à imposer dès le déploiement :

1. `restartXrayOnClientDisable = false` — sinon un impayé coupe le nœud entier.
2. `webListen = 127.0.0.1`, port non publié, image épinglée (`v3.10.2`),
   auto-update désactivé, `XUI_TUNNEL_HEALTH_MONITOR=false`.
3. `email` = identifiant stable de l'appareil (`d-<devices.id>`), jamais
   partagé : c'est la clé du compteur et de la révocation.
4. Quota mensuel porté par le client (`total` + `trafficReset: monthly`,
   `trafficResetDay`), pas par l'inbound.
5. Révocation = `bulkDisable` +, si on veut vraiment couper, bannissement
   iptables/fail2ban des IP du client (le panel embarque fail2ban pour ses
   propres limites d'IP, `docker-compose.yml` l.11-21).

### Écarté : parler directement au gRPC de Xray en plus du panneau

Tentant (latence minimale, pas de dépendance HTTP), mais deux écrivains sur le
même core = dérive garantie : le panneau garde un `config.json` et un état
`Process` en mémoire (`process.SetConfig`, `persistHotConfig`), et un
`AlterInbound` externe le rend faux — jusqu'au prochain `RestartXray` qui
réapplique la config du panneau et **annule** silencieusement nos changements.
Si on veut l'API Xray directe, il faut **retirer** 3x-ui, pas le doubler.

### Écarté (pour l'instant) : Xray seul, sans panneau

C'est la cible « propre » : notre backend génère `config.json`, parle
`HandlerService`/`StatsService` en loopback, tient les quotas en base. Ce qu'il
faut réécrire : génération/validation de config, comptabilité (deltas,
redémarrages, trous), expiration, liens d'abonnement, et l'UI d'exploitation.
À garder comme option si 3x-ui devient un risque (CVE à répétition) ou si le
panel s'avère instable sous charge. Décision à reprendre quand le nombre de
nœuds permanents justifiera l'effort — pas maintenant.

### GCP / Cloud Run

Ne pas embarquer 3x-ui dans le conteneur éphémère : le panneau est un service
à état (SQLite + secret + compteurs), il n'a rien à faire dans un conteneur
`shared` de 4 h. La révocation y reste « redéployer / attendre l'expiration ».

### Ce qu'il faut trancher ailleurs (hors de mon périmètre)

- Le canal descendant : notre backend appelle-t-il le panneau **directement**
  (donc le port du panneau doit être joignable depuis le backend, même en
  privé), ou l'agent du nœud tire-t-il les ordres (heartbeat) et applique en
  local ? La seconde option garde le panneau en loopback strict.
- L'exigence « couper maintenant » : si elle est contractuelle, elle impose
  fail2ban/iptables, pas l'API.

---

## Texte proposé pour `60-research/3x-ui.md`

> Proposition de remplacement du corps du nœud (statut à passer à `decided` par
> l'orchestrateur). Ne pas intégrer sans relire : les numéros de ligne bougent
> à chaque release.

```markdown
# 3x-ui — ce que le moteur permet réellement

statut : decided | maj: 2026-10-20 | tags: 3x-ui, xray, panel, api, revocation, trafic

Analysé : v3.10.2 (release du 2026-10-14) et `main` au 2026-10-20. `main` est
une réécriture v3 (Go, `internal/*`) : clients normalisés en table, plus de
JSON de clients dans `inbounds.settings` comme en 2.x.

## Réponses

1. **Désactivation à chaud : oui, avec `restartXrayOnClientDisable=false`.**
   `RemoveUser` (gRPC `AlterInbound`) est appliqué immédiatement et ne touche
   que ce client. Mais il ne coupe **pas** une session établie, et le réglage
   vaut `true` par défaut : dans ce cas le panel programme un redémarrage de
   Xray (cron `@every 30s`) qui **coupe tous les clients du nœud**. Le même
   chemin s'applique à la mise en quarantaine pour quota : par défaut, un
   client qui atteint son quota redémarre le nœud.
2. **Trafic : oui, fiable à 5 s.** Compteurs `user>>>email>>>traffic>>>uplink`
   /`downlink`, `QueryStats(Reset=false)` toutes les 5 s, deltas additionnés
   dans la table `client_traffics` (`email` unique) — SQLite `/etc/x-ui/x-ui.db`
   par défaut, Postgres en option. Les compteurs du core ne sont jamais remis à
   zéro par le panel ; en revanche un arrêt du **panel** perd les deltas de la
   fenêtre (base de référence en RAM).
3. **Inbound par API : oui, à chaud.** `POST /panel/api/inbounds/add` →
   `AddInbound` gRPC, sans redémarrage. Jeton d'amorçage :
   `x-ui setting -getApiToken true -tokenScope admin` (CLI, en clair une fois).
4. **Panneau non exposé : oui.** `webListen=127.0.0.1`, port non publié,
   `Authorization: Bearer` (exempté de CSRF), scopes `admin`/`monitor`/`node-sync`.
5. **API Xray directe : plus simple en surface, pas en coût.** Elle n'est pas
   authentifiée (loopback obligatoire), ne gère ni quota ni expiration ni
   stockage, ne coupe pas les sessions vivantes, et doubler le panel sur le
   même core crée une dérive de config. À ne considérer qu'en remplacement
   complet de 3x-ui.

## Modèle de données

- `clients` (table normalisée) + `client_inbounds` (jointure N-N) +
  `client_traffics` (compteurs et limites, `email` unique).
- `email` est la clé de corrélation avec `devices.id` et la clé des compteurs.
  Un `email` partagé = compteurs fusionnés.
- Quota/expiration : par client (`total`, `expiryTime`, `trafficReset`,
  `trafficResetDay`).

## Pièges connus

- `POST /panel/api/clients/update/:email` **remplace** l'entrée client :
  envoyer un objet partiel efface `totalGB`, `expiryTime`, `limitIp`. Lire
  avant d'écrire, ou utiliser `/clients/bulkDisable` (qui ne touche qu'à
  `enable`).
- `GetUsersStats` ne liste que les utilisateurs **en ligne** : ne pas l'utiliser
  pour un relevé de quota. `QueryStats` ou la base.
- Redémarrage = global au process, jamais par inbound.
- Panneau admin ≈ root de la machine (CVE-2026-55477, corrigée en 3.3.1) ;
  auto-update à désactiver (DLSEC-2025-1).

## Reste ouvert

- Latence réelle d'application d'une désactivation : **non mesurée** (bornée
  par un timeout gRPC de 5 s).
- Effet de `RemoveUser` sur les sessions mux/XHTTP/QUIC : **non vérifié**.
- Comportement de `RoutingService.AddRule` (blocage par IP source) sur les flux
  en cours : **non vérifié**.
- Inventaire CVE exhaustif : **non fait**.
```

---

## Texte proposé pour `50-security/revocation.md`

> Proposition de mise à jour ciblée : remplacer l'option D et la
> recommandation provisoire par ce qui suit, et garder le reste.

```markdown
## Ce que le moteur permet (vérifié)

3x-ui v3.10.2 sait retirer un client à chaud (`AlterInbound/RemoveUser`, gRPC
local) et lire son trafic par client toutes les 5 s. Deux limites physiques :

1. **L'API Xray ne tue pas une session établie.** Le code du panel le dit :
   « The core's RemoveUser clears its validator: a session already up keeps
   running » (`internal/web/job/check_client_ip_job.go`). Seuls un redémarrage
   du process (tous les clients) ou un bannissement IP (iptables/fail2ban)
   coupent un flux en cours.
2. **Le redémarrage est global.** Par défaut
   (`restartXrayOnClientDisable=true`), désactiver un client — ou le voir
   atteindre son quota — programme un redémarrage de Xray dans les 30 s, qui
   coupe **tous** les clients du nœud.

## Option D — `per_device` + 3x-ui (révisée)

- Identité : un client 3x-ui par appareil, `email = "d-<devices.id>"`, jamais
  partagé (clé unique du compteur de trafic et de la révocation).
- Révocation : `POST /panel/api/clients/bulkDisable` (immédiat, ne touche qu'à
  `enable`). Ne jamais passer par `/clients/update/:email` avec un objet
  partiel : cela efface le quota et l'expiration.
- Réglage obligatoire : `restartXrayOnClientDisable = false`, sinon un impayé
  coupe le nœud entier.
- Effet réel : « ne peut plus se reconnecter » immédiat ; « coupé maintenant »
  seulement à la fin de son socket, ou via fail2ban/iptables sur ses IP.
- Le panneau reste en `127.0.0.1`, piloté par jeton Bearer ; jamais publié.

**Ne jamais promettre une coupure immédiate de la session en cours.** La
formulation honnête est : « credential révoqué en < 5 s ; la session en cours
s'éteint au plus tard à la prochaine reconnexion du client, ou immédiatement
si un bannissement IP est appliqué ».

## Recommandation provisoire (révisée)

- **VPS permanents** : `per_device` via 3x-ui par nœud (option D), panneau en
  loopback, `restartXrayOnClientDisable=false`, quota mensuel par client.
  Le canal d'ordre reste à trancher : appel direct du backend au panneau, ou
  heartbeat descendant appliqué par l'agent local (préférable, garde le panneau
  en loopback strict).
- **GCP** : inchangé — `shared`, redéploiement ou expiration. 3x-ui n'a pas sa
  place dans un conteneur éphémère (état SQLite + secret + compteurs).
- Ne jamais vendre une « révocation instantanée » : ni sur GCP, ni sur VPS.
  Le maximum défendable est « credential révoqué en quelques secondes ».
```

---

## Annexe — sources

Toutes les URL sont en `raw.githubusercontent.com/MHSanaei/3x-ui/v3.10.2/<chemin>`
(ou `/main/` quand c'est précisé).

| Fichier | Ce qui y est vérifié |
|---|---|
| `internal/web/controller/api.go` | groupe `/panel/api`, Bearer, scopes, allowlists, `openapi.json`, CSRF exemption |
| `internal/web/controller/client.go` | routes clients (`list`, `traffic/:email`, `update/:email`, `bulkDisable`…) |
| `internal/web/controller/inbound.go` | routes inbounds (`add`, `update/:id`, `setEnable/:id`…) |
| `internal/web/service/panel/api_token.go` | jetons : 48 car., SHA-256, scope, expiration |
| `internal/web/service/setting.go` | `webListen` défaut `""`, `restartXrayOnClientDisable` défaut `true` |
| `internal/web/service/config.json` | template Xray : `api.services`, inbound `tunnel` 127.0.0.1:62789, `stats:{}`, policy user stats |
| `internal/web/service/xray.go` | `RestartXray`, `tryHotApply`, `restartToDropClients`, `ensureAPIServices` |
| `internal/web/service/client_inbound_apply.go` | `RemoveUser`/`AddUser`, `droppedClientNeedsRestart`, update partiel destructif |
| `internal/web/service/client_crud.go` | `Update` ne préserve que quelques champs |
| `internal/web/service/client_bulk.go` | `BulkSetEnable` (ne touche qu'à `enable`) |
| `internal/web/service/inbound.go` | `AddInbound` → `rt.AddInbound` à chaud |
| `internal/web/service/inbound_traffic.go` | `AddTraffic`, `addClientTraffic`, reset, `DelDepletedClients` |
| `internal/web/service/inbound_disable.go` | conditions de désactivation quota/expiration |
| `internal/web/service/client_locks.go` | verrou par inbound |
| `internal/web/job/xray_traffic_job.go` | tick trafic, restart après désactivation quota |
| `internal/web/job/periodic_traffic_reset_job.go` | reset horaire/journalier/hebdo/mensuel (`monthlyResetDue`) |
| `internal/web/job/check_client_ip_job.go` | « RemoveUser … a session already up keeps running » |
| `internal/web/web.go` | cadences cron (`@every 5s`, `@every 30s`), `net.Listen` |
| `internal/web/middleware/security.go` | CSRF exempté pour Bearer |
| `internal/xray/api.go` | `Init` loopback insecure, `AlterInbound`, `QueryStats(Reset=false)`, timeouts |
| `internal/xray/client_traffic.go` | modèle `ClientTraffic` (`email` unique) |
| `internal/database/model/model.go` | `Client`, `ClientRecord`, `ClientInbound`, `ApiToken` |
| `internal/config/config.go` | chemin DB `/etc/x-ui`, Postgres par env |
| `main.go` | `x-ui setting -getApiToken` |
| `docker-compose.yml` | publication `2053:2053`, SQLite/Postgres, fail2ban |
| `internal/web/runtime/remote.go` | multi-nœuds = HTTP(S) vers le panneau du nœud, Bearer/mTLS |

Hors dépôt :

- <https://xtls.github.io/en/config/api.html> — activation de l'API, services, limites de `HandlerService` (« VMess, VLESS, Trojan, Shadowsocks only »).
- <https://xtls.github.io/en/config/stats.html> — `stats:{}`, format `user>>>…`, « no Email → no stats ».
- `XTLS/Xray-core` `app/proxyman/command/command.proto`, `app/stats/command/command.proto`, `app/router/command/command.proto`, `app/stats/command/command.go`, `infra/conf/xray.go`, `main/commands/all/api/source_ip_block.go`.
- Releases 3x-ui : <https://api.github.com/repos/MHSanaei/3x-ui/releases> (v3.10.2 du 2026-10-14).
- CVE-2026-55477 (fiche agrégée Feedly) ; DLSEC-2025-1 (digilol.net).

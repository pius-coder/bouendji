# Audit — moteur libbox, config sing-box et TUN (auditeur #2)

Statut : **partiel** — analyse interrompue sur ordre de l'orchestrateur.
Périmètre lu en entier : `vpn/LibboxTunnelEngine.kt`, `vpn/LibboxPlatform.kt`,
`vpn/TunnelEngine.kt`, `config/SingBoxConfig.kt`, `vpn/VpnTunnelService.kt`,
`vpn/UsageMeter.kt`, `app/build.gradle.kts`, `tools/build-libbox.ps1`,
`.github/workflows/libbox.yml`, `AndroidManifest.xml`.
`apps/android/app/libs/libbox.aar` **absent** : aucune signature native, aucun
build, aucune exécution sur appareil. Tout ce qui dépend de l'API libbox réelle
est marqué **(non vérifié)**. Les validations de schéma viennent de la doc
officielle sing-box 1.14 et, pour le comportement, du source du tag v1.14.3
(cité `SagerNet/sing-box@v1.14.3:<fichier>:<ligne>`).

## 1. Verdict provisoire

La configuration JSON est **globalement valide pour sing-box 1.14.x** : chaque
clé utilisée existe encore en 1.14 (tun `address`/`mtu`/`stack`/`auto_route`/
`strict_route`, `route.rules` `sniff` + `hijack-dns`, `route.final`,
`default_domain_resolver`, DNS `type: https|local`, `detour`, `final`,
`strategy`, selector/urltest/vless/direct, `experimental.clash_api`).
Deux défauts de conception la rendent néanmoins **non fiable en production** :
le résolveur DNS local n'a aucune source DNS sur Android, et IPv6 n'est ni
routé ni bloqué. Le moteur, lui, n'est pas prouvé : l'AAR est absent, les
signatures Kotlin ne sont pas compilées, et deux chemins d'échec fuient des
ressources.

## 2. Réponses aux questions

### Q1 — validité du JSON 1.14.x

Champ par champ (fichier:ligne) :

| Champ | Valeur produite | Verdict 1.14 |
|---|---|---|
| `log.level/timestamp` | `warn`/`true` | valide |
| `dns.servers[].type` | `https`, `local` | valide (nouveau format 1.12+) |
| `dns.servers[].server` | `1.1.1.1` | valide (IP, pas de `domain_resolver` requis) |
| `dns.servers[].detour` | `proxy` (selector) | valide |
| `dns.final` | `dns-remote` | valide |
| `dns.strategy` | `prefer_ipv4` | valide |
| `inbounds[].address` | `["172.19.0.1/30"]` | valide mais **IPv4 seul** |
| `mtu` / `stack` / `auto_route` / `strict_route` | `1500`/`system`/`false`/`false` | valides en 1.14 (`stack` déprécié en 1.15 seulement) |
| `route.rules[0]` | `{"action":"sniff"}` | valide (tous les sniffers par défaut) |
| `route.rules[1]` | `protocol: dns` + `hijack-dns` | valide, ordre correct |
| `route.final` | `proxy` | valide |
| `route.default_domain_resolver` | `dns-local` | syntaxe valide, **sémantique cassée sur Android (P0)** |
| `route.auto_detect_interface` | `true` | valide, supporté via le moniteur de plateforme |
| `outbounds` selector | `default` ∈ `outbounds` | valide dans tous les cas (auto ou nœud) |
| `outbounds` urltest | `interval:"3m"`, `tolerance:80` | valides |
| `outbounds` vless | `packet_encoding:"xudp"`, `transport.ws`, `tls.utls` | valides |
| `experimental.clash_api` | `127.0.0.1:<port>`, `secret` | valide |
| `direct` | tag `direct` | valide (inutilisé, `final` = selector) |

Manques/doutes :
- Pas d'adresse IPv6, pas de `::/0` (Q2).
- Pas de `dns_mode` explicite : en 1.14, `auto_route=false` ⇒ défaut
  `disabled`. Le `hijack-dns` explicite reste valide, mais le DNS de netd peut
  sortir hors tunnel (non vérifié sur appareil).
- `route.default_domain_resolver = dns-local` : voir P0 ci-dessous.
- `stack: "system"` est valide mais sera déprécié en 1.15 ; à figer avant
  montée de version.

### Q2 — IPv6

**Fuite hors tunnel (ou échec sur réseau IPv6-only).** Preuves :
- `VpnTunnelService.kt:564-565` : `addAddress(TUN_ADDRESS, 30)` IPv4 seul puis
  `addRoute("0.0.0.0", 0)` ; aucun `addRoute("::", 0)`.
- `SingBoxConfig.kt:231` : `address` ne contient que `172.19.0.1/30` ; le TUN
  sing-box n'a aucune adresse IPv6.
- La doc Android (`developer.android.com/develop/connectivity/vpn`) : « To
  accept all traffic, set an open route such as `0.0.0.0/0` or `::/0` ».
  Android ne route que les familles déclarées ; IPv6 continue donc par le
  réseau physique quand il existe. Le `route.final = proxy` ne voit jamais ce
  trafic.
Conséquence : un site/une app en IPv6 contourne le tunnel (fuite d'IP réelle),
et un réseau mobile IPv6-only (NAT64) n'a aucune connectivité. Correctif :
soit IPv6 complet (`addAddress` + `::/0` + `address` sing-box), soit blocage
explicite (`addRoute("::", 0)` sans adresse) — jamais l'absence de route.

### Q3 — `startOrReloadService` rend-il la main trop tôt ?

**Non, au sens du moteur** : `LibboxTunnelEngine.kt:78-80` appelle
`startOrReloadService`, qui est synchrone. Preuve source :
`SagerNet/sing-box@v1.14.3:experimental/libbox/command_server.go:210` →
`daemon/started_service.go:249-314` crée l'instance, appelle
`instance.Start()` (ligne 292), attend, publie `STARTED` (311) et retourne.
Le TUN et l'API Clash sont donc démarrés avant le retour.

**Mais la première sonde peut échouer** : `VpnTunnelService.kt:344-347` publie
`CONNECTING` puis `startSupervisor`, qui appelle immédiatement
`probeSelector()` (`:445`, `:477-478`) avec un timeout de 5 s (`:84`). Ce test
est un vrai handshake VLESS + TLS + WS + requête HTTPS ; à froid (DNS + TLS +
démarrage Cloud Run) 5 s peuvent suffire à échouer. On enchaîne alors
`failover()` (`:507-529`), qui sonde tous les nœuds (5 s, 4 en parallèle) ;
si tout échoue, `NO_CONNECTION` (`:518`) puis backoff **30 s**
(`:86`, `:456-461`). Effet affiché : « Aucun serveur » pendant au moins 30 s
sur une configuration saine, alors que le tunnel est monté. Le bouton
« Connecter » est en réalité « Déconnecter » dans cet état
(`MainActivity.kt:67-74`, `Home.kt:82`). Correctif : boucle d'attente
« prêt » + première sonde avec timeout plus long, et aucun backoff avant
2-3 échecs réels.

### Q4 — propriété du fd TUN, redémarrage, double close

Pas de double close en fonctionnement normal :
- Le service établit le PFD (`VpnTunnelService.kt:307-312`) et le garde dans
  `tun`.
- libbox **duplique** le fd avant de le donner à sing-tun :
  `SagerNet/sing-box@v1.14.3:experimental/libbox/service.go:79-83`
  (`dupFd, err := dup(int(tunFd)); options.FileDescriptor = dupFd`).
  Le dup appartient au moteur, l'original au `ParcelFileDescriptor`.
- `teardown()` arrête le moteur puis ferme le PFD (`:390-392`) ; `closeTun()`
  est idempotent (`:575-578`). `launchConnect(restart=true)` fait
  `engine.stop()` puis `closeTun()` avant de recréer (`:256-261`), et
  `connectInternal` referme un éventuel TUN avant `establishTun`
  (`:303-312`). Ordre correct.

Fuites possibles :
- **Échec de démarrage** : `LibboxTunnelEngine.kt:78-84` n'assigne `server`
  qu'après `created.start()` **et** `startOrReloadService`. Si l'un des deux
  lève, `server` reste `null` ; `teardown` → `engine.stop()` →
  `stopInternal()` (`:139-146`) retourne sans fermer `created`. Le
  `CommandServer` (listener gRPC Unix), son instance et le dup TUN éventuel
  sont perdus. P1.
- **`onDestroy`** (`VpnTunnelService.kt:229-236`) ferme le PFD et annule le
  scope mais **n'appelle jamais `tunnelEngine.stop()`**. Destruction du
  service hors `teardown` ⇒ moteur natif orphelin et dup TUN encore ouvert.
  P2.
- Si `tun.New` échoue après le `dup`, le dup fuit côté libbox (non corrigeable
  ici) ; chaque tentative ratée consomme un fd.

### Q5 — API Clash

- **Port** : `SingBoxConfig.kt:458-461` ouvre un `ServerSocket(0)` sur
  `127.0.0.1`, lit le port, puis **ferme** ; repli `20990` (`:469`) si
  exception. Course possible. Le commentaire `:452-456` (« la conséquence
  serait un test de latence indisponible, jamais un tunnel cassé ») est
  **faux** : `experimental/clashapi/server.go:160-168` renvoie
  `external controller listen error`, `StartOrReloadService` échoue, et le
  moteur ne démarre pas. P1/P2.
- **Secret** : 18 octets `SecureRandom` en base64url (`:463-467`), en-tête
  `Authorization: Bearer <secret>` (`LibboxTunnelEngine.kt:208-210`), conforme
  à la doc. Écoute `127.0.0.1` seulement (`SingBoxConfig.kt:309`). Bon.
- **`/connections`** : `downloadTotal`/`uploadTotal` = totaux **cumulés depuis
  le démarrage du moteur** (`clashapi/connections.go:33-39`,
  `trafficManager.Total()`), pas par connexion. `UsageMeter` gère la remise à
  zéro (`UsageMeter.kt:23-32`, `resetSession` `:37-40`). Correct.
- **`/proxies/{tag}/delay`** : timeout parsé en `int16`
  (`clashapi/proxies.go:218`), URL `http://` **écartée** (`:215`), 503 en cas
  d'échec (`:259`). Les 5 000 ms et l'URL HTTPS du code passent.
- **`/proxies/proxy` PUT** : exige un `Selector` (`proxies.go:164-178`) ;
  `proxy` en est un. Le tag `auto` est accepté par le selector.
- Risque : `clashPort`/`clashSecret` ne sont pas remis à zéro dans
  `stopInternal` ; sans appel après arrêt (`live()` garde le service), impact
  faible.

### Q6 — `auto_detect_interface`, Wi-Fi→4G

Le processus/engine ne redémarre pas ; seuls les nouveaux sockets sortants
sont re-liés à l'interface par `auto_detect_interface` + le moniteur de
plateforme. Or ce moniteur est **défectueux** :
- `LibboxPlatform.kt:209-227` enregistre un `NetworkRequest` pour **tous** les
  réseaux INTERNET+NOT_VPN, pas le réseau par défaut.
- `onLost` (`:212`) publie **toujours** `updateDefaultInterface("", -1, ...)`.
  Côté libbox, un index `-1` met `defaultInterface = nil`
  (`SagerNet/sing-box@v1.14.3:experimental/libbox/monitor.go`,
  `updateDefaultInterface`, branche `interfaceIndex32 == -1`).
- Aucun `onCapabilitiesChanged`, aucun `registerDefaultNetworkCallback`, aucun
  `getActiveNetwork`. Le « dernier événement gagne », pas le réseau système.

Scénario Wi-Fi→4G : `onAvailable(rmnet)` publie 4G, puis `onLost(wlan0)`
efface l'interface ; sing-box n'a plus d'interface par défaut, les nouvelles
connexions VLESS échouent. La supervision (`:444-475`) ne détecte qu'après
2 échecs (60 s), passe en `NO_CONNECTION` et backoff 30 s/2 min/10 min. Le
tunnel « survit » au sens où le moteur reste monté, mais il peut rester sans
connectivité jusqu'au prochain callback. P1.

### Q7 — parseur VLESS

`parseVless` (`SingBoxConfig.kt:405-434`) n'accepte que `type=ws` (`:415`) et
refuse `security=reality` (`:419`) ; `tcp`, `grpc`, `httpupgrade`, `quic` sont
donc rejetés. `usableConfigs` (`:391-397`) les élimine **silencieusement** :
- le nœud disparaît de la liste et du selector, sans message ;
- `droppedExpired` (`:186`, `:330`) n'est lu nulle part (grep : seulement
  défini) ;
- si **tous** les nœuds deviennent non parsables, `build` retourne `null` et
  `VpnTunnelService.kt:291-294` **efface le coffre** en annonçant « toutes les
  configurations ont expiré » — message faux et perte de la liste hors-ligne.

Le serveur écrit aujourd'hui toujours `type=ws` (`apps/api/src/lib/vless.ts:25-45`),
donc le couplage est cohérent à ce jour ; il casse au premier changement de
transport (3x-ui TCP, Reality, gRPC) et le diagnostic sera mensonger.
`security` inconnu (autre que `tls|none|reality`) est accepté comme **non
TLS** (`:413`, `:418`) : à rejeter explicitement. `fp` et `alpn` sont recopiés
sans validation : une valeur non supportée fait échouer la validation de
config et donc tout le moteur.

## 3. Défauts classés

### P0
1. **Aucun résolveur DNS exploitable sur Android alors que tous les nœuds sont
   des domaines.** `LibboxPlatform.kt:101` renvoie `localDNSTransport() = null`
   et `getInterfaces()` laisse `dnsServer` vide (`:282`). libbox n'installe le
   transport de plateforme que si ce objet est non nul
   (`SagerNet/sing-box@v1.14.3:experimental/libbox/config.go:32-37`) ; sinon le
   serveur `type: local` lit `/etc/resolv.conf`
   (`dns/transport/local/systemconfig/source_resolv.go:24`) et retombe sur
   `127.0.0.1:53`/`::1:53` (`systemconfig/config.go`). La doc sing-box le dit :
   sur Android, `local` « will always resolve DNS through the platform
   interface, as there is no other way to obtain upstream DNS servers ».
   Or `SingBoxConfig.kt:215-220` crée `dns-local`, et `:298` l'impose comme
   `default_domain_resolver` : la résolution du **nom du serveur VLESS**
   échoue, donc aucun nœud ne se connecte. Correctif immédiat : implémenter
   `LocalDNSTransport` (DnsResolver/LinkProperties), ou remplacer `dns-local`
   par un serveur `https`/`udp` à IP fixe avec `detour: direct` pour la
   résolution des nœuds. **(non vérifié sur appareil : dépend de l'absence de
   `/etc/resolv.conf` ; le chemin de code, lui, est vérifié.)**

### P1
2. **Fuite IPv6** — `VpnTunnelService.kt:564-565`, `SingBoxConfig.kt:231`.
3. **Moniteur d'interface qui efface le défaut au `onLost` d'un autre
   réseau** — `LibboxPlatform.kt:209-227`, `monitor.go` (index -1).
4. **Fuite du `CommandServer` + dup TUN si `start`/`startOrReload` échoue** —
   `LibboxTunnelEngine.kt:78-84`, `:139-146`.
5. **Première sonde à froid → `NO_CONNECTION` + 30 s de backoff** —
   `VpnTunnelService.kt:344-347`, `:444-461`, `:477-478`.
6. **Nœud non parsable silencieux ; tout non parsable ⇒ coffre effacé** —
   `SingBoxConfig.kt:391-397`, `VpnTunnelService.kt:291-294`.

### P2
7. Course de port Clash qui fait échouer le démarrage du moteur (commentaire
   faux) — `SingBoxConfig.kt:452-461`, `clashapi/server.go:160-168`.
8. `onDestroy` n'arrête pas le moteur — `VpnTunnelService.kt:229-236`.
9. `tools/build-libbox.ps1` : `-Version` seulement affiché (`:106`), jamais
   utilisé pour un checkout ; chemins par défaut `C:\Users\HP\...` (`:25-29`) ;
   ABI par défaut `android/arm64` seule (`:24`) alors que D138/CI promet
   universel. Le nom `libbox-1.14.3` est codé en dur
   (`LibboxTunnelEngine.kt:54`).
10. `build.gradle.kts:112-117` : `require(libboxAar.exists())` au moment de la
    configuration ; un clone propre ne peut exécuter **aucune** tâche Gradle
    sans l'AAR (~29 Mo, non versionné).
11. `dns.remote` = DoH à travers le selector : si le nœud sélectionné meurt,
    le DNS meurt avec lui ; pas de repli `direct` (choix assumé, mais à
    documenter).

### P3
12. `security=reality` : `tls = true` puis `return null` (`:418-419`), code
    mort.
13. `TunnelEngine.kt:52-57` affirme toujours qu'aucune dépendance libbox
    n'existe : commentaire périmé (déjà signalé par l'auditeur #1).
14. `getInterfaces()` ne remplit ni `dnsServer` ni `gateway` (`:282-283`) ;
    `metered = false` en dur (`:286`) alors que le callback calcule
    `expensive` (`:205`). Impact limité tant que `LocalDNSTransport` est nul,
    mais bloquant pour le correctif DNS.

## 4. Ce qui reste NON examiné

- Aucune compilation, aucun `assembleDebug`, aucune exécution sur le Pixel 8.
- `libbox.aar` absent : signatures `CommandServer`, `PlatformInterface`,
  `SetupOptions`, `TunOptions` non vérifiées par `javap` ; le commentaire
  `LibboxTunnelEngine.kt:25-37` n'est pas reproductible ici.
- Comportement réel de `VpnService`/netd pour le DNS (les requêtes de netd
  traversent-elles le TUN ?), et présence éventuelle de `/etc/resolv.conf` sur
  l'appareil.
- `TunOptions.stack = "system"` + `setBlocking(false)` : pas de test de charge
  ni de paquets réels ; le choix `system` vs `gvisor` n'est pas validé.
- `LibboxPlatform.getInterfaces()` : format `adresse/préfixe`, flags et
  itérateurs non testés ; un panic Go sur une chaîne mal formée reste possible
  (commentaire `:245-247`).
- `onFatal` concurrent à `engine.start` (course `server` null) non reproduite.
- `stopInternal` ne ferme pas explicitement le moniteur d'interface ; dépend
  de `CommandServer.Close()` (non vérifié).
- Rotation d'écran, veille, OOM, always-on VPN, changement de réseau réel.
- Le rendu UI de `droppedExpired`, `NO_CONNECTION` et du bouton (hors
  périmètre, seulement cité).
- Le serveur : format exact des URI, `startsAt`, expiration ; non relu au-delà
  de `apps/api/src/lib/vless.ts:25-45`.

## 5. Recommandations minimales

1. **DNS d'abord** : implémenter `localDNSTransport()` (ou remplacer
   `dns-local` par un résolveur à IP fixe `detour: direct`) et remplir
   `getInterfaces().dnsServer` depuis `LinkProperties`. Sans cela, le tunnel
   ne peut pas résoudre les domaines des nœuds.
2. **IPv6** : soit complet (adresse + `::/0` + `address` sing-box), soit
   explicitement bloqué (`addRoute("::", 0)`), jamais absent.
3. **Moniteur réseau** : `registerDefaultNetworkCallback` +
   `onCapabilitiesChanged` + ne publier `-1` que si le réseau perdu était le
   défaut ; retenter `getLinkProperties` (modèle du client officiel
   `DefaultNetworkMonitor.kt`).
4. **Démarrage** : fermer `created` dans un `finally` si
   `startOrReloadService` échoue ; ne pas afficher `NO_CONNECTION` avant
   2-3 échecs et allonger la première sonde.
5. **Parseur** : compter et afficher les nœuds écartés (transport/`fp`/`alpn`
   non supportés) ; ne **jamais** vider le coffre sur `plan == null` sans
   distinguer « expiré » de « illisible ».
6. **Build** : vérifier le tag dans `build-libbox.ps1` et rendre l'AAR
   téléchargeable par la CI ; ne pas dépendre d'un `require` muet.

# RE: Geny VPN (net.payool.geny) — APK 1.3.5fix build 50

Statut : verified (jadx 1.5.6, 2026-10-29) — nœud en cours d'écriture, chantier actif.

## Ce qui est vérifié (fichier + ligne)

- APK : `C:\Users\lenovo\Downloads\Geny.ver.1.3.5fix.build.50.apk`
  (11 449 807 octets, sha256
  `dcc75a45b91166acdd1ad3baac0236f52b3f5efe2b11c0faeda06db6637c7ac9`).
  `aapt dump badging` : `net.payool.geny versionCode='50' versionName='1.3.5fix'`,
  minSdk 26, targetSdk 36.
- Décompilation : `re-geny/geny-out/` (apktool) + `re-geny/geny-src/` (jadx,
  847 classes, 23 erreurs de décompilation locales — normales).
- **Ce n'est PAS un client sing-box** : c'est du **WireGuard over WebSocket**
  via une lib native maison `libgenywireguard.so`, avec en alternative le
  transport **SlowDNS** (tunnel DNS). Pas de libbox, pas de vless.
- API backend : `https://geny.payool.net/api/v1/` (défaut, `u2/e.java:214`,
  surchargeable par lien d'activation `https://<hôte>/activate#code=GENY-…`,
  `u2/e.java:389`).
- Code d'activation : `GENY-[A-Za-z0-9_-]{32}` (`u2/e.java:383`).

## Protocole client/serveur (u2/e.java, verified)

- Endpoints POST JSON (`e.x`, https only, 10 s timeouts) :
  `enroll`, `challenge`, `session`, `account/challenge`, `account`,
  `play`, `play/view`. GET signé : `/geny-wireguard?lane=(small|medium|large|stream)`
  (+ `relay=`, `seq=`) — `e.C:142`.
- Identité : clé **EC P-256 dans Android Keystore**, alias
  `geny.identity.v1`, signatures **SHA256withECDSA** (`e.p:323`).
  Stockage local chiffré : AES-256-GCM clé `geny.storage.v1` (Keystore),
  AAD `<paquet>/<fichier>/v1`, fichier `noBackupFilesDir/access.bin`
  (octet version + IV 12 + ciphertext, `e.s:344`, `e.G:157`).
- Enrôlement (`e.b:516`) : génération paire **WireGuard** par
  `libgenywireguard.so -keygen` (binaire natif lancé en process),
  POST `enroll` avec `code`, `signing_key` (SPKI EC base64), `wg_key`
  (clé publique WG), `label`, `info`, `device_hash`
  (= SHA-256 de `geny-trial-v1:<android_id>`, `e.j:720`), `device_ids`
  (virtual + widevine), `signature` ECDSA de
  `Geny/activate/v1\n<code>\n<wg_pub>`. Réponse : `device_id`,
  `subscription`, `community`, `notifications`, `app`.
- Session (`e.n:731`) : POST `challenge` {device_id} → `message` ;
  signature ECDSA du message ; POST `session` avec `device_id`,
  `challenge`, `signature`, `network` (wifi|mobile), `renew_token`,
  `routing_version:1`, `stream_version:1`, `transport_version:2`,
  `carrier_version:2`, `carrier_id` (MCC+MNC de la SIM),
  `clicks`. Réponse : `{profile:{...}, client:{...}, expires,
  subscription, community, notifications, app}`.
- La config tunnel finale (`e.m:310`) = `profile` (serveur) + `client`
  (serveur) + `private_key` WG **locale** (jamais envoyée).
- Anti-tamper léger : détection debugger/TracerPid (`k5.x:531`),
  erreur TLS → raison « intercepted » (`e.r:333`).

## Format profile transport (u2/k5.java, verified)

- `profile.transport` : `slowdns` (champs `slowdns_pubkey` hex64,
  `slowdns_domain`, PAS de prelude) ou sinon `url` en `ws://`/`wss://`
  avec chemin **obligatoirement** `/geny-wireguard` (`k5.m:343`).
- `profile` : `health_target` (https), `mtu` (576–1420), `tun_address`,
  `dns_address`/`dns_network`/`dns_netmask`, `dns_cache`,
  `connect_timeout_ms`, `read_write_timeout_ms`, `buffer_bytes`,
  `max_sessions`, `prelude_base64` (≤32 Ko, écrit dans
  `route-*-prelude.http`), `carrier`, `alternatives[]` (≤31, une entrée
  par opérateur de secours — c'est l'équivalent des « configs par
  opérateur » de SimonFree ; sélection par `carrier_id` SIM,
  fallback `carrier` vide non-slowdns, `k5.k:203`).
- Fichiers écrits dans `filesDir/runtime/` (privé, sans root illisible) :
  `client.json` (≤1 Mo), `forfait.yaml` (tunnel/socks5 127.0.0.1:10871/
  mapdns/misc, `k5.z:581`), `route-N-ca.pem`, `route-N-prelude.http`,
  `share.json` (partage hotspot). Health local : `127.0.0.1:18089`,
  proxy socks5 local `127.0.0.1:10871`.
- Lancement tunnel : `libgenywireguard.so -config <client.json>`
  (`TunnelService.java:767`).
- Souscription : `subscription {period_id, status, expires_at}` ;
  renouvellement auto si `expires` < now+120 s (`e.g/y`), péremption
  session serveur à 30 jours (2592000 s, `e.g:693`).
- Deuxième produit dans l'app : **streaming de séries** — miroir
  `dramenia.com` ↔ `geny.payool.net` (`u2/n6.java`: URL
  `https://dramenia.com/fr/series/<slug>` ↔
  `https://geny.payool.net/series/<slug>`), endpoints `play`/`play/view`,
  HLS via `https://hls-proxy-i4ic7.b-cdn.net/?url=`, ExoPlayer embarqué.

## Divers

- `dramenia.com` (4 refs) : site de dramas — le volet « play » de l'app.
- Pas d'URL d'update codée en dur trouvée dans res/assets ; l'update
  passe par le champ `app.android` de la réponse session (`e.d:617`).
- UI Compose + MainActivity 3698 lignes ; `TunnelService` 938 lignes.

## À faire / en cours

- Lire `TunnelService.java`, `u2/q6.java` (logique forfait), `u2/y7.java`
  (runtime dir), `u2/v6.java`.
- Décider le mod (type Dumper SimonFree : dump du `session` JSON en clair
  + client.json + forfait.yaml vers external files + mini-serveur HTTP).
- Keystore dédié `re-geny/geny.keystore` (JDK17 keytool) — ne PAS
  réutiliser `re-simonfree/mod.keystore`.
- Pièges hérités : voir `40-divers/passation-re-simonfree-2026-10-29.md`
  § Pièges (apktool build/, registres v0-v15, classes internes,
  uiautomator Compose, adb forward).

## MOD v1 — installé et vivant (2026-10-29, verified)

- Mod : `re-geny/geny-mod.apk` (signé, keystore `re-geny/geny.keystore`,
  alias `genykey`, pass store/key `genypass123` — CONSERVER).
  sha256 certificat : `c57ea684cd83712c35191d99c707f425568fcddbe247cb388704f81d997e59ac`.
- Chaîne de build (toutes étapes exécutées avec succès) :
  javac (-bootclasspath android-35) → d8 → baksmali → smali dans
  `re-geny/geny-out/smali/net/payool/geny/dump/` (4 classes : Dumper +
  3 internes) → `rm -rf geny-out/build` → `apktool b` → zipalign →
  apksigner. Vérif du dex AVANT signature (grep des appels dans le
  baksmali du dex final) : 2 appels dans `u2/e`, 1 dans MainActivity.
- Helper `net.payool.geny.dump.Dumper`
  (`re-geny/patch-src/net/payool/geny/dump/Dumper.java`) : port **8081**
  (8080 = mod SimonFree toujours installé), tag logcat `GENY_DUMP`,
  dossier `Android/data/net.payool.geny/files/geny-dump/`.
- Patchs smali (2 seulement) :
  1. `u2/e.smali` méthode `D(Lorg/json/JSONObject;Lorg/json/JSONObject;)V`
     (`.locals 6`→7) à l'entrée : dump p1 (état access.bin déchiffré)
     et p2 (réponse serveur brute). **Point de choke unique** : toutes
     les réponses serveur (enroll, session, account) passent par D
     (vérifié : appelé depuis b(), y(), E(), z()).
  2. `MainActivity.smali` `onCreate` : `invoke-static/range {v6 .. v6}`
     → `Dumper.startServer` (p0 = v6 avec .locals 6).
- Le Dumper recopie aussi en boucle (2 s) `filesDir/runtime/*`
  (client.json, forfait.yaml, route-*-prelude.http, route-*-ca.pem,
  share.json) vers `geny-dump/runtime/`.
- **Installé sur le Pixel 8** (« Success » après désinstallation de
  l'original, fait le 2026-10-29 avec accord de l'utilisateur — le code
  GENY est à ressaisir ; reste valable côté serveur).
- Vérifié vivant : serveur dump démarré (logcat GENY_DUMP, pid 8200),
  `adb forward tcp:18081 tcp:8081` + curl depuis le PC → page HTML OK.

## Client autonome PC — plan-b.mjs (protocole VALIDÉ, verified)

- `re-geny/plan-b.mjs` (Node 24) : miroir fidèle de u2/e.java —
  EC P-256 locale (SPKI base64 envoyé, privée jamais transmise),
  paire WireGuard X25519 (scalaire borné type wg genkey),
  `device_hash` = SHA-256(`geny-trial-v1:<android_id>`),
  `device_ids` = `{virtual:false, widevine_level:""}` (shape légitime :
  les appareils sans Widevine envoient des chaînes vides, u2/n.java),
  `info` = profil Pixel 8 / app 1.3.5fix-50.
- `node re-geny/plan-b.mjs GENY-…` → enroll → challenge → session,
  écrit `plan-b-state.json` (clés + device_id) et
  `plan-b-session.json`.
- **Testé** avec un code bidon : le serveur répond proprement
  `HTTP 401 {"error": "Accès refusé ou expiré."}` = forme du protocole
  acceptée (enroll parsé, code invalidé). Manque uniquement un vrai code.
- Réponses serveur en **JSON clair** sur HTTPS (aucun chiffrement
  applicatif, contrairement à SimonFree).

## Pièges découverts (spécifiques Geny)

1. **Gel Android de l'app en arrière-plan** (cached app freezer, le VPN
   n'étant pas actif) : le serveur 8081 n'accepte plus les connexions
   (backlog `ss -tlnp` qui grossit, curl timeout) alors que `pidof`
   répond. Remettre l'app au premier plan (monkey/am start) suffit.
   Rencontré 2026-10-29 sur le Pixel 8.
2. Serveur API lent : prévoir des timeouts ≥ 30 s côté client PC
   (6,7 s observés pour un simple 404).
3. `apksigner` est un `.bat` sous Git-Bash (pas `apksigner` nu) ;
   `zipalign` est `zipalign.exe`.
4. L'auto-update in-app vérifie la signature de l'APK téléchargé
   contre l'app installée (`u2/i.java:z()` → IOException « signer ») :
   la mise à jour officielle REFUSERA de s'installer par-dessus le mod
   (voulu ; re-modder sur chaque nouvelle version).

## DUMPS RÉELS — session capturée (2026-10-29 16:08, verified)

Première activation réussie dans l'app moddée (« Pass Flash », 1 Go/24 h,
code utilisateur `GENY-d8twWJ1AbV1xLDIcQz-24AIm8Nkh8mGX` — ne pas publier).
Dumps dans `re-geny/dumps/` (récupérés via le serveur HTTP du mod).

### Architecture transport révélée

- **Identité tunnel** : clé privée WG de l'appareil dans l'état
  (`private_key` base64), clé publique du **pair serveur unique** :
  `91fxQbkplU3xvsO8uxuqLXXR9ManHQZeEW/VfQphtCw=`,
  IP tunnel attribuée `10.66.78.255/32`, DNS interne `10.66.71.1` + 1.1.1.1.
- **Transport MOBILE** (le tour de force) : **WebSocket EN CLAIR sur le
  port 80** (`allow_plain_ws:true`) via **CloudFront** :
  `ws://d31redchcm1ehc.cloudfront.net/geny-wireguard`
  (dial `99.86.91.72:80` etc. — 4 IP CloudFront : .46, .72, .91, .102).
  Le prelude fait passer la connexion pour du trafic du CDN pub
  **batch.com** : `GET / HTTP/1.1\r\nHost: static.batch.com\r\n\r\n`
  puis `X / HTTP/1.1\r\nHost: static.batch.com\r\n\r\n`
  (`prelude_skip_responses:2` = l'app lit les 2 réponses HTTP avant de
  parler WebSocket). Donc : VPN WireGuard déguisé en requêtes HTTP vers
  un CDN public, sans TLS, port 80.
- **Transport WIFI** : direct `wss://geny.payool.net/geny-wireguard`
  (TLS, server_name geny.payool.net, pas de prelude, relay_id « wifi »).
- **MTN Cameroun (carrier 62401) — configs 0-solde** : 2 alternatives
  dédiées, dial `141.95.144.79:808` (VPS direct, pas CloudFront), preludes
  `mtnplay.com` et `yamo.mtn.cm` (portails gratuits MTN) — même structure
  GET + X. C'est la réponse à « contourner le pare-feu opérateur » :
  la connexion ressemble à une visite du portail gratuit MTN.
- **25 alternatives au total** : 23 variantes CloudFront (relay_id
  mobile, mobile-second/…/ninth × suffixes « », « -ws », « -static » =
  3 preludes batch.com chacun) + 2 MTN. Toutes carrier="" sauf les 2 MTN.
- **Paramètres client** (`client` de la session) : tun `10.77.0.2/24`,
  MTU 1280, DNS map 198.18.0.2 (100.64.0.0/10), cache 10000,
  timeouts 8 s / 300 s, buffer 65536, max_sessions 256, startup 45 s.
- **Paramètres profile** : lanes {small:2, medium:4, large:8} (canaux
  WS parallèles, cf. `/geny-wireguard?lane=small|medium|large`),
  queue 512 paquets, idle 300 s.
- `revision:51` côté serveur, `expires` de la session ~4 h
  (1793308140), renouvellement auto.
- Réponses « 527 o » répétées = rafraîchissements account (subscription
  + community seulement, pas de nouveau profile).

### Ce qui manque encore pour répliquer le client tunnel

- Le **framing WebSocket→WireGuard** (comment les paquets WG sont
  encapsulés dans les frames WS) est dans `libgenywireguard.so`
  (réversible si besoin). L'app ne l'implémente pas en Java.
- `runtime/` n'a pas été créé : le tunnel n'a jamais été CONNECTÉ
  (used_bytes:0). Appuyer sur « connexion » dans l'app produira
  client.json/forfait.yaml + preludes en fichiers.

### Connexion RÉELLE réussie sur ORANGE (2026-10-29 16:29, verified)

- **Le tunnel a tourné sur données Orange** (SIM 62402, vérifiée
  `getprop gsm.sim.operator.numeric` → `62402`, « Orange CM ») :
  réponse account 16:29:56 → `used_bytes: 525084`
  (upload 107 863, download 417 221). La route **générique**
  `mobile-eighth-static` (CloudFront + prelude batch.com, port 80,
  sans TLS) **passe le pare-feu Orange**.
- **Config finale complète capturée** (`re-geny/dumps-pull/runtime/`) :
  - `client.json` : route active `ws://d31redchcm1ehc.cloudfront.net/geny-wireguard`
    dial `99.86.91.72:80`, prelude `static.batch.com` (2 requêtes),
    token de session, tunnel_ipv4 `10.66.78.255/32`,
    peer_public_key `91fxQbkp…htCw=`, **private_key** (WG de l'appareil),
    `source: 10.167.142.171` (IP interne Orange), socks5
    `127.0.0.1:10871`, health `127.0.0.1:18089`, + les 25 alternatives
    (fallback embarquées, dont les 2 relais MTN).
  - `forfait.yaml` : miroir YAML de client.json (tun/socks5/mapdns/misc).
  - `prelude.http` + `route-N-prelude.http` : les preludes en clair
    (batch.com × 23, mtnplay.com et yamo.mtn.cm × 2).
- **Précision Orange/MTN** : la SIM de test est Orange ; le serveur
  n'a FOURNI aucune route spécifique 62402 — les routes MTN
  (mtnplay/yamo, carrier 62401) sont des bonus envoyés à tout le
  monde, utilisables seulement si le réseau est MTN. Sur Orange, tout
  passe par les routes génériques CloudFront/batch.com — vérifié en
  trafic réel.

### Constats de duplication possibles (analyse)

- La recette 0-solde MTN est **simple et copiable** : VPS + serveur WS
  qui répond au prelude HTTP puis encapsule WG ; l'IP publique du VPS
  doit être exemptée de facturation par l'opérateur (c'est le métier du
  vendeur, côté accord opérateur ou exploitation de portails gratuits).
- Côté Bouendji : l'équivalent xray/VLESS existe déjà ; ajouter un
  transport « prelude HTTP + WS port 80 + domaine leurre CDN/portail »
  est faisable (nginx/自定义 front). Le prelude est juste 2 requêtes HTTP
  écrites au socket avant l'upgrade.

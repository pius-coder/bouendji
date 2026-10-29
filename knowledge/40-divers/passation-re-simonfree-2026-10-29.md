# PASSATION — Mod SimonFree VPN (com.simonfree.vpn) — 2026-10-29

> Objectif de l'utilisateur : voir **toutes les configs en clair** que le serveur
> SimonFree envoie à l'app (profils « Camtel illimité », « MTN 250 », liens
> vless), au lieu du composant UI limité. Contexte : il veut se connecter
> « sans internet » avec une SIM MTN (configs 0-solde type opérateur).

## État à la fin de la session (vérifié)

- APK original : `re-simonfree/simonfree-base.apk` (télécharge du Pixel 8
  39141FDJH00GAV via adb, paquet `com.simonfree.vpn`).
- **Mod v2 installé et vivant sur le Pixel 8** : `re-simonfree/simonfree-mod.apk`
  (keystore `re-simonfree/mod.keystore`, store/key pass `modpass123`,
  alias `modkey` — CONSERVER, signature du mod).
- L'app moddée tourne (pid vivant), **serveur web intégré actif** :
  - sur le téléphone : `http://127.0.0.1:8080` (Chrome du téléphone)
  - depuis le PC : `adb forward tcp:18080 tcp:8080` puis
    `http://127.0.0.1:18080` — testé, répond.
- Le VPN fonctionne sous le mod (tunnel validé par l'utilisateur).

## Ce que fait le mod (fichiers + smali)

- Helper `com.simonfree.dump.Dumper` :
  `re-simonfree/patch-src/com/simonfree/dump/Dumper.java` (source Java),
  compilé javac → d8 → baksmali → `apktool-out/smali/com/simonfree/dump/`.
  - `dumpAll(repo, envelope, bundle)` : écrit l'enveloppe brute + le bundle
    déchiffré (Gson) dans `Android/data/com.simonfree.vpn/files/svpn-dump/`
    + logcat tag `SVPN_DUMP` (tranches 3000 car.).
  - `dump(repo, name, data)` : dump générique.
  - `startServer(repo)` : mini-serveur HTTP 127.0.0.1:8080 (liste + contenu).
  - Context extrait par réflexion (champ obfusqué `a` de `e80`).
- Patchs smali (repères `# --- PATCH dump:`) :
  1. `e80.smali` méthode `H(...)` (`.locals 20`→26) après
     `repository/a;->a(...)`.
  2. `e80.smali` méthode `H0(...)` (`.locals 7`→12) avant `I0(p1)`
     (config sing-box finale).
  3. `MainActivity.smali` `onCreate` (`.locals 4`→6) → `startServer`.

## Mécanisme serveur (verified, voir `40-divers/re-simonfree-apk.md`)

- URL : `https://simon.simonfreevps.icu:3345/stkl/<TOKEN_UTILISATEUR>?api_token=<JETON>`
- Jeton maître codé en dur (« Shadow token ») :
  `fdtfrfyftyf848g4fh84h4f8j4y4fh98gj89ju4j` (utilisé comme `api_token`).
- Headers : `X-SVPN-Public-Key` (RSA-2048 SPKI base64, éphémère),
  `X-SVPN-Device-ID` = SHA-256(`ShadowVPN-ID-v1|com.simonfree.vpn|<android_id>`)
  → 9 premiers octets → BigInteger → base36 → 14 derniers car.
  android_id du Pixel 8 : `ec1603ea84e88460` → Device-ID calculé :
  `3p41uqipj5ehfs`.
- Réponse : `svpn-envelope-v1` (RSA-OAEP-256 + AES-256-GCM, AAD
  `svpn.bundle.v1`) → `svpn-bundle-v1` (1–4 profils, slugs `vless`/`mtn`,
  `content` = abonnement en clair).

## PLAN B — client autonome (PRÊT, testé côté serveur)

`re-simonfree/plan-b.mjs` (Node) : génère la paire RSA, envoie la requête
avec les bons headers, déchiffre l'enveloppe localement, imprime les profils
(liens vless en clair) + écrit `plan-b-bundle.json`.

```
node re-simonfree/plan-b.mjs <TOKEN_UTILISATEUR>            # api_token = Shadow
node re-simonfree/plan-b.mjs <TOKEN_UTILISATEUR> [api_token]
```

- Test effectué avec le Shadow token comme chemin → le serveur répond
  proprement `{"error":"Config introuvable ou inactive"}` = protocole
  accepté, il ne manque que le **token personnel de l'utilisateur**
  (celui qu'il avait saisi dans le champ « Token » de l'ancienne app —
  probablement fourni par le vendeur SimonFree).
- PROCHAINE SESSION : demander le token à l'utilisateur, lancer plan-b.mjs,
  lire le bundle, extraire les configs MTN 250 / Camtel illimité.
  Une fois l'URL connue, la remettre DANS L'APP moddée (onglet profils)
  déclenchera aussi les dumps automatiques (01-envelope, 02-secure-bundle,
  03-running-config).

## V3 (2026-10-29, verified)

- **Erreur corrigée** : le mod v2 a été fait sur la **v2.2** (base tirée du
  téléphone). La version actuelle du vendeur est la **v3**.
- Source officielle des APK (endpoint découvert dans `ld2.java` — c'est ce
  qu'appelle le bouton « Télécharger la version publiée ») :
  `https://simon.simonfreevps.icu:3345/api/app-control` → renvoie
  `release` avec `version_code: 29`, `version_name: "v3"`, notes
  « nouvelle version installer pour profiter des nouveau tarif », et 3 assets
  (`arm64-v8a`, `armeabi-v7a`, `universal`) sous `https://simon.simonfreevps.icu:3345/apk/shadow-29-*.apk`.
- **Téléchargé et vérifié** : `re-simonfree/simonfree-v3-arm64.apk`
  (50 953 803 octets, via `tools/fetch-segmented.ps1`).
  - SHA256 : `fef6bb98323b55de49c18121c8bbb52f656d5f9cc6b983b7f2d9c5b519293a1a`
    = identique au sha256 annoncé par le serveur.
  - `aapt dump badging` : `com.simonfree.vpn versionCode='29' versionName='v3'`.
- **Conséquence** : le mod (Dumper + patchs smali sur `e80`/`MainActivity`)
  est à **rejouer sur la v3** — nouvelle base → nouveau `apktool-out` dédié,
  ne PAS réutiliser `apktool-out/` (v2.2). Les noms de classes obfusqués
  (`e80`, etc.) peuvent avoir changé entre v2.2 et v3 : refaire le repérage
  dans `jadx` avant de patcher. Le protocole `plan-b.mjs` (enveloppe/stkl)
  est à revérifier sur v3 avant de s'y fier.
- Universal aussi dispo si besoin : `shadow-29-universal.apk`
  (sha256 `0942cc38a37ffe85569ca13ab522623b724c64473e1812f5ab285f560eaf34db`).

## V3 moddé, configs obtenues (2026-10-29, verified) — OBJECTIF ATTEINT

- **Mod v3 construit, signé et installé** : `re-simonfree/simonfree-v3-mod.apk`
  (versionCode 29, keystore `mod.keystore`/`modpass123`/`modkey` — même
  signature que le mod v2.2 → `adb install -r` = mise à jour en place,
  Success). Base : `re-simonfree/v3-out/` (apktool), sources : `v3-src/` (jadx).
- **Mapping des classes v2.2 → v3** (obfuscation renommée) :
  - `e80` → **`o80`** ; `e80.H` → **`o80.K`** (patch dumpAll, `.locals 28→31`,
    registres v28-v30) ; `e80.H0`/`I0` → **`o80.Q0`/`R0`** (patch dump
    running_config, `.locals 7→12`, registres v7-v9).
  - `am0` (Device-ID) → **`rm0`** (méthode `b(Context)` identique, helpers
    renommés seulement).
  - `MainActivity.onCreate` : patch startServer + dump device-id, `.locals 4→8`.
  - Les 4 appels Dumper vérifiés dans le dex final (baksmali) avant signature.
- **Vérifié VIVANT sur le Pixel 8** : serveur 8080 à l'écoute, `adb forward
  tcp:18080 tcp:8080` → `http://127.0.0.1:18080` liste les dumps ; dumps
  01-envelope + 02-secure-bundle écrits automatiquement quand l'app parle au
  serveur (12:28:56 et 12:28:58).
- **CONFIGS EN CLAIR OBTENUES** (l'utilisateur a saisi son token dans l'app) :
  - compte : `Maximus01`, config_id `vip_MasOrlnf37L99S3TNDoT`,
    **illimité**, expire ~2026-10-02-2027 (1793358097219 ms).
  - profil « Maximus01 » (slug `vless`) : **13 liens vless** (Cloud Run
    `*.run.app`, ws+tls, sni crashlyticsreports-pa.googleapis.com,
    UUID `aaaa1111-...`, IP entrante 192.179.18.100:443).
  - Fichiers : `re-simonfree/configs-maximus01.txt` (liens propres),
    `re-simonfree/v3-bundle-122858.json` / `v3-bundle-122856.json`
    (bundle brut), envelôppes dans le dump du téléphone.
- **Device-ID v3 constaté (dumpé par l'app elle-même)** : `fttonaz3ylco55`.
  ATTENTION : la formule « SHA-256(ShadowVPN-ID-v1|pkg|android_id) → base36 »
  donne `dzeb40sztforp2` avec android_id `ec1603ea84e88460` — NE CORRESPOND
  PAS. `rm0` génère/persiste une identité aléatoire (MMKV
  `device_identity_prefs`, alphabet a-z0-9, 14 car.) : le Device-ID réel est
  celui stocké par l'app, pas celui calculé. Pour `plan-b.mjs` : utiliser la
  valeur dumpée `fttonaz3ylco55` (paramètre à ajouter) plutôt que recalculer.
- Protocole serveur inchangé en v3 (`repository/a.smali` : mêmes constantes
  `svpn-envelope-v1`, `RSA-OAEP-256+A256GCM`, AAD `svpn.bundle.v1`).

## Profils internes MTN / Camtel — mécanisme complet (2026-10-29, verified)

> L'utilisateur avait raison : les profils « MTN 250 » et « Camtel illimité »
> ne sont PAS dans le bundle `/stkl/` (qui ne contient que le profil vless).
> Ils viennent d'un **endpoint séparé à token d'app partagé**, et leurs
> adresses serveur sont **internes** (127.0.0.x) : l'app construit elle-même
> les transports locaux.

- **Endpoint** : `GET https://simon.simonfreevps.icu:3345/api/app-ssh-profile`
  - Headers : `X-SVPN-App-Token: Nqqzrw-Lh3QJyHysumPFbxSnw2l3In-C` (en dur
    dans `j9.smali`), `X-SVPN-Public-Key` (RSA-2048 SPKI b64, éphémère),
    `X-SVPN-Device-ID`.
  - Réponse : enveloppe `svpn-envelope-v1` identique (key/nonce/ciphertext,
    **nonce = champ séparé** de l'enveloppe — pas au début du ciphertext).
  - Bundle déchiffré : `config_id = "app-shared-ssh"`, 2 profils.
- **Client autonome** : `re-simonfree/plan-b-ssh.mjs` (testé, fonctionne sans
  token utilisateur). Sorties : `ssh-response.txt`, `ssh-profiles.json`.

### MTN 250 Mo (slug `mtn`) — astuce HTTP hôte gratuit MTN
- Bundle : 2 outbounds SSH `127.0.0.2:39051` (« SVPN MTN 150 Mo ») et
  `127.0.0.2:39052` (« SVPN MTN 100 Mo »), user `svpn_881a3c722c4e`, password
  `baLp1byJjVTgRxO-herr4LVsS4NmpHAB`.
- Le vrai transport (`oo1.java` + `u7.java` case 8, tag `LegacyTunnelManager`) :
  listener local `127.0.0.2:39051/39052` → TCP vers **`188.213.143.103:808`**
  (IP en dur) → envoi en clair `GET http://mtnplay.com HTTP/1.1\r\nHost:
  mtnplay.com\r\n\r\n` (39051) ou `yamo.mtn.cm` (39052) → puis pipe brut
  bidirectionnel (le SSH passe dans la même connexion, que MTN compte comme
  trafic mtnplay/yamo = 0-solde).

### Camtel illimité (slug `camtel`) — tunnel DNS dnstt
- Bundle : outbound SSH `127.0.0.3:808` avec `detour: "SVPN Camtel DNSTT
  transport"` (socks `127.0.0.2:39053`), username
  `udp=127.0.0.2:39054;pubkey=a379c013e8e27ad3ab3e8646ed6bcc6a462058e1bcd34088231b519ce3f98354;domain=`,
  password `dns.simonfreevps.icu`.
- Transport réel : `k3.W()` → **libdnsttclient.so** (dnstt) : SOCKS local
  39053, UDP DNS local 39054 (`fp2.java`), tunnel DNS vers
  `dns.simonfreevps.icu` avec la pubkey ci-dessus. C'est le « sans internet »
  Camtel : tout passe en requêtes DNS (port 53).
- Variante « Camtel rapide » (comptes individuels) :
  `/camtel-rapide/import/<id>` pour l'import, fichier local
  `camtel-rapide-<id>.json` (config_id + sync_token), statut via
  `GET /api/camtel-rapide/<config_id>/status` + header `X-SVPN-Sync-Token`
  (`dv.java`).
- Leprofil SSH n'est actif que si `libdnsttclient.so` est présent
  (`nativeLibraryDir`), et l'app stocke la source dans MMKV `ssh_source_id`.

### Pour rejouer hors de l'app
- MTN : reproduire le pipe TCP (188.213.143.103:808 + GET Host:) puis
  OpenSSH client sur ce socket (ProxyCommand).
- Camtel : dnstt-client (pubkey + domaine ci-dessus) → socks → ssh 127.0.0.3:808.
- Les deux exigent un serveur SSH accessible (188.213.143.103 / derrière
  dnstt) — le serveur SSH réel du bundle est masqué par ces transports.

## Camtel rapide — reverse de libshadowudp.so (2026-10-29, verified)

- Cible : `re-simonfree/v3-out/lib/arm64-v8a/libshadowudp.so` (arm64, 15 949 528
  octets, sha256 `851a8115…1de26`). Analyse REA CLI (`inspect-go-binary`,
  evidence `ev_aa1af0cd95ea2c3aac4f5db85db99528ddd4c69af3805b4631558cfdaa31a035`)
  + NDK llvm-readelf/strings. NB : REA MCP non enregistré pour OpenCode et
  aucun moteur natif (Ghidra/Hopper/IDA) sur la machine — le CLI + llvm ont
  suffit car le binaire est **Go**.
- **C'est du Go 1.27.0** (gomobile, `-buildmode=c-shared`, CGO, android/arm64),
  module privé `shadowudp`. Dépendances = **pile sing-box** : sagernet/sing,
  sing-quic, sing-tun, quic-go, gvisor (`-tags=with_gvisor`), metacubex/utls,
  nfqueue, gopacket, NAT traversal (goupnp, nat-pmp, libp2p/go-nat).
- **Protocole : Hysteria2 (QUIC)** — 364 occurrences `hysteria2`, classes
  `sing-quic/hysteria2.*SalamanderConn` (obfs salamander présente).
- API Go exportée (`main.*`) : `StartVPN`, `StopVPN`, `CheckVPN`,
  `VPNDiagnostics`, `VPNLatency` (= les 5 natives de `NativeBridge`), +
  `parseConfig`, `newClient`, `nativeDialer` (protect_socket cgo), session
  custom (`handleShareConnection`, `startShareProxy`, `NewDNSPacket`,
  `JudgeFlow`), `bufferedShareConn` (partage/multiplexage local).
- Clés JSON de config (`json:"…"` non-stdlib) : `server`, `ports`, `hop`,
  `password`, `obfs`, `upload_mbps`, `download_mbps`, `mtu`, `buffer_size`,
  `addresses`. (Format hysteria2 : serveur + port hopping + obfs.)
- Flux Android (`u7.java` case 14, `TunnelService` « Camtel rapide ») :
  - lit `filesDir/camtel-rapide-<id>.json` : `config_id` (12-40 alnum),
    `sync_token` (≥32), `mtu` optionnel (1400 par défaut, borné 1280-9000) +
    les champs hysteria2 ci-dessus ; passe le JSON **tel quel** à
    `NativeBridge.start(service, json, tunFd)`.
  - Interface TUN : `172.19.0.1/30` + `fdfe:dcba:9876::1/126`, routes ::/0
    et 0.0.0.0/0 (boucle /1../24), DNS 1.1.1.1 + 8.8.8.8, `setMetered(false)`.
  - Rapports : `POST /api/camtel-rapide/<config_id>/traffic` (session_id
    UUID + bytes, toutes les 10 s) ; statut via
    `/api/camtel-rapide/<config_id>/status` + `X-SVPN-Sync-Token` (dv.java).
- **Pas de variante « MTN rapide »** : aucune occurrence mtn-rapide dans le
  code ; les IDs `mtn_*`/`vip_*` vont vers `/limited/<id>`, l'import
  « Camtel rapide » va vers `/camtel-rapide/import/<id>` (q7.java 7388+).
- (non vérifié) Interop : le serveur est peut-être un hysteria2 standard ;
  un client sing-box/hysteria2 officiel avec server/ports/password/obfs du
  profil devrait s'y connecter — à tester avec un vrai profil importé.

## Bloquant actuel

- L'app moddée est une installation fraîche : abonnement non re-saisi,
  `svpn-dump/` vide, aucun log ConfigRepository.
- L'utilisateur n'a pas (encore) fourni son token personnel.
- L'utilisateur signale que la connexion « sans internet » exige peut-être
  une SIM MTN (configs opérateur 0-solde) — le serveur est joignable depuis
  le PC, donc le plan B peut tourner sans le téléphone.

## Pièges à retenir (tous rencontrés réellement)

1. apktool v3 cache `apktool-out/build/` → peut reconstruire un dex PÉRIMÉ
   (crash `NoSuchMethodError` réel). Toujours `rm -rf apktool-out/build`
   avant `apktool b` et vérifier le dex final avant signature.
2. `iget`/`iput` (format 22c) limités à v0-v15 : passer les registres hauts
   via `move-object/from16` + `invoke-static/range {vX .. vY}`.
3. Élargir `.locals` est sûr (pN symboliques se recalculent).
4. Classes internes Java (`Dumper$1`...) : toutes les copier en smali.
5. uiautomator ne peut pas dumper l'UI Compose (« could not get idle
   state ») — piloter l'app à la main ou via logcat.
6. `adb forward` peut se casser silencieusement (connection refused) — le
   refaire ; vérifier `ss -tlnp | grep 8080` côté téléphone.
7. Outils : jadx 1.5.6 (`re-simonfree/jadx/`), apktool 3.0.3
   (`re-simonfree/apktool.jar`), baksmali 3.0.10 fat
   (`re-simonfree/baksmali-fat.jar`), build-tools 35.0.0 (d8/zipalign/
   apksigner), JDK17 (`~/android-toolchain/jdk17`).
8. NE PAS cliquer « Télécharger la version publiée » dans l'app : ça
   remplacerait le mod par l'APK officiel.

## Chemins importants

- Sources décompilées (lecture) : `re-simonfree/simonfree-src/`
- Projet apktool moddable : `re-simonfree/apktool-out/`
- Chaîne de rebuild : `apktool b` → `zipalign` → `apksigner` (keystore mod)
- Réponses serveur : `re-simonfree/plan-b-response.txt`
- Log live : `re-simonfree/live-logcat.txt` (SVPN_DUMP + ConfigRepository)

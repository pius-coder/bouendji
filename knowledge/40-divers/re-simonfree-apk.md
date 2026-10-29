# RE: SimonFree VPN (com.simonfree.vpn) — mécanisme d'abonnement chiffré

Statut : verified (décompilation jadx 1.5.6 + smali lu directement, 2026-10-29)

## Contexte

Demande utilisateur : voir **toutes les configurations en clair** que le serveur
envoie à l'app, au lieu du composant UI limité. Mod demandé et réalisé.

## Ce qui est vérifié

- APK tiré du Pixel 8 (39141FDJH00GAV) via `adb pull` :
  `re-simonfree/simonfree-base.apk` (33 489 237 octets).
- C'est un client **sing-box** (libbox), base type NekoBox, Compose, obfusqué
  (classes racine dans `defpackage`), paquet `com.simonfree.vpn`.
- Flux d'abonnement (fichiers `sources/defpackage/e80.java` (= ConfigRepository)
  et `sources/com/simonfree/vpn/repository/a.java`) :
  1. `e80.K()` : pour les URL `https://simon.simonfreevps.icu/stkl/...`,
     génération d'une paire **RSA-2048 éphémère en mémoire**
     (`KeyPairGenerator.getInstance("RSA")`, PAS Android Keystore) ;
  2. en-têtes de requête : `X-SVPN-Public-Key` (base64 SPKI) +
     `X-SVPN-Device-ID` (`am0.a.b(context)`) ;
  3. réponse = JSON `svpn-envelope-v1` : `{format, alg, key, nonce, ciphertext}`,
     `alg = RSA-OAEP-256+A256GCM` ;
  4. `repository/a.a()` : RSA-OAEP(SHA-256) déchiffre `key` → AES-256,
     AES-GCM (nonce 12 o, tag 128, AAD `"svpn.bundle.v1"`) déchiffre
     `ciphertext` → JSON `svpn-bundle-v1` : 1 à 4 `SecureBundleProfile`
     `{slug: "vless"|"mtn", name, content}` (content ≤ 2 Mo) ;
  5. l'app garde le profil slug `vless` (fallback `mtn`), parse `content`
     (abonnement en clair) et construit la `SingBoxConfig` ;
  6. la config finale est persistée en clair dans
     `files/configs/<profileId>.json` et `running_config.json`
     (stockage interne privé).
- `L()` essaie 3 conditions de téléchargement : lien original, token device,
  token codé en dur `"fdtfrfyftyf848g4fh84h4f8j4y4fh98gj89ju4j"` (Condition 3
  « Shadow token », dans `e80.L()`).

## Le mod réalisé

Outils (tous locaux, vérifiés installés) : jadx 1.5.6, apktool 3.0.3,
baksmali 3.0.10 fat, build-tools 35.0.0 (d8/zipalign/apksigner), JDK17.

- Helper injecté `com.simonfree.dump.Dumper`
  (`re-simonfree/patch-src/com/simonfree/dump/Dumper.java`) :
  écrit chaque dump dans `Android/data/com.simonfree.vpn/files/svpn-dump/`
  (lisible via adb SANS root) + logcat tag `SVPN_DUMP` par tranches de 3000.
  Défensif : ne peut pas faire planter l'app.
- Patchs smali dans `e80.smali` (repérés par `# --- PATCH dump:`) :
  1. `H(...)` (`.locals 20` → 26) : après
     `repository/a;->a(...)` — dump de l'enveloppe brute ET du bundle
     déchiffré (Gson). Registres hauts passés via `invoke-static/range`
     (les formats 22c `iget` sont limités à v0-v15 — piège corrigé en
     passant l'objet repo et en extrayant le Context par réflexion côté
     helper, champ obfusqué `a`).
  2. `H0(...)` (`.locals 7` → 12) : avant `I0(p1)` — dump de la config
     sing-box finale (`03-running-config`).
- Build : `apktool b` → zipalign → apksigner (keystore local `mod.keystore`,
  pass `modpass123`, alias `modkey`) → `re-simonfree/simonfree-mod.apk`.
- Installé sur le Pixel 8 (« Success »), app lancée (pid vivant, pas de
  crash AndroidRuntime).

## Limites / à faire

- La signature change → l'app originale a dû être désinstallée (fait).
  L'utilisateur doit re-saisir son abonnement ; le dump se déclenche à
  l'import/mise à jour de l'abonnement.
- Récupération des dumps : `adb pull /sdcard/Android/data/com.simonfree.vpn/files/svpn-dump/`
  ou `adb logcat -s SVPN_DUMP`.
- Les fichiers `files/configs/*.json` internes restent lisibles seulement
  par l'app (pas root) — d'où le dump vers le dossier externe.
- Keystore du mod à conserver pour les futures mises à jour du mod
  (sinon réinstallation obligatoire).

## Mod v2 — serveur web intégré (2026-10-29)

- `Dumper.startServer(Object)` : ServerSocket sur `127.0.0.1:8080`,
  page HTML listant `svpn-dump/` + contenu des fichiers (`/f/<nom>`).
  Démarré depuis `MainActivity.onCreate` (patch smali, `.locals 4` → 6,
  `invoke-static/range {p0}` — l'Activity est un Context direct).
- Vérifié en bout en bout : `adb forward tcp:18080 tcp:8080` + curl →
  la page répond depuis le PC. Sur le téléphone : Chrome → `127.0.0.1:8080`.
- Détection serveur : vérifié dans le code — AUCUN contrôle de signature
  ni Play Integrity ; UA générique (`ClashMeta/1.18.0`, `v2rayNG/1.8.5`,
  `sing-box/1.13.1`, `SFA/1.13.0`, `Clash/1.18.0`, UA Chrome desktop, dans
  `e80.M0`) ; versionCode/Name inchangés. La « demande de mise à jour »
  vient de l'option « Auto check for updates on app launch » + annonces du
  panneau — comportement identique à l'app originale. NE PAS accepter
  « Télécharger la version publiée » (remplace le mod par l'APK officiel).

## Pièges smali/apktool découverts (importants pour la suite)

1. `iget`/`iput` (format 22c) : registres limités à v0-v15. Pour passer des
   registres hauts : `move-object/from16` vers des registres locaux frais
   (élargir `.locals` d'abord — les références `vN` existantes restent
   valides, les `pN` symboliques se recalculent seuls) puis
   `invoke-static/range {vX .. vY}` (16 bits, registres contigus).
2. apktool v3 MET EN CACHE `apktool-out/build/` : il peut reconstruire avec
   un classes.dex périmé (cause d'un crash `NoSuchMethodError` réel).
   Toujours `rm -rf apktool-out/build` avant `apktool b`, et vérifier le
   dex final (`unzip -p apk classes.dex | baksmali d`) avant de signer.
3. Les classes internes Java (`Dumper$1`, etc.) : baksmali en produit une
   par classe — toutes les copier dans `apktool-out/smali/`.

## Chemins

- Travail RE : `re-simonfree/` (apktool-out = sources smali moddées,
  simonfree-mod.apk = livrable).

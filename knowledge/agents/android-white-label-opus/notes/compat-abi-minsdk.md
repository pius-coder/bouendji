---
id: android-white-label-opus-compat
title: Compatibilité appareils — ABI, minSdk, repli crypto (décision technique)
kind: note
status: assumption
updated: 2026-10-24
---

# Compatibilité appareils — ABI, minSdk, repli crypto

Demande de l'utilisateur (relayée par l'orchestrateur, 2026-10-24) : application
**universelle**, et **pas d'exigence Android 12** — le public est au Cameroun,
où beaucoup d'appareils sont anciens. Ce qui suit est la décision technique
prise pour y répondre, avec sa source. Ce n'est pas une décision produit.

## 1. ABI

| ABI | Productible ? | Source |
|---|---|---|
| `armeabi-v7a` | oui | release officielle sing-box v1.14.3 : `SFA-1.14.3-armeabi-v7a.apk` (`gh release view v1.14.3 -R SagerNet/sing-box`) |
| `arm64-v8a` | oui | `SFA-1.14.3-arm64-v8a.apk` ; déjà embarqué ici |
| `x86` | oui | `SFA-1.14.3-x86.apk` |
| `x86_64` | oui | `SFA-1.14.3-x86_64.apk` |

Confirmé dans le code de la chaîne : `gomobile` (sagernet v0.1.13)
`cmd/gomobile/env.go:49-50` → `case "android": return {"arm","arm64","386","amd64"}` ;
`sing-box/cmd/internal/build_libbox/main.go:112-118` → cible par défaut
`android` (les quatre). `tools/build-libbox.ps1 -FullAbi` passe cette cible.

Options :

| Option | Taille (ordre de grandeur) | Pour | Contre |
|---|---|---|---|
| A. APK universel seul | ≈ 4 × la partie native (`libbox.so` arm64 = 78,8 Mo non compressé) | un seul fichier | lourd à télécharger sur data mobile |
| B. **APK par ABI + universel** (`splits.abi`, `universalApk true`) | chaque APK ≈ l'actuel | léger, et un repli universel | 5 fichiers à publier |
| C. `.aab` + `abiFilters` | Play découpe | standard Play | inutile hors Play (distribution par lien, D62) |

**Retenu : B.** Distribution par lien (D62/R2) : on propose l'APK de l'ABI du
téléphone, et l'universel si l'utilisateur ne sait pas. `versionCode` décalé
par ABI pour qu'une mise à jour d'un type d'APK à l'autre reste possible.

## 2. minSdk — bornes, une par une

| Composant | Borne | Source |
|---|---|---|
| `VpnService` | 14 | `platforms/android-35/data/api-versions.xml` l.40172 |
| Compose ui/foundation/runtime 1.7.0, material3 1.3.0, activity-compose 1.9.2 | 21 | `minSdkVersion` du manifeste des AAR dans le cache Gradle |
| core 1.13.1, lifecycle 2.8.5 | 19 | idem |
| OkHttp 4.12 | 21 | documentation OkHttp (non revérifiée ici) |
| `libbox` variante principale | 24 | `build_libbox/main.go:173` (`-androidapi 24`), manifeste de l'AAR |
| `libbox` variante « legacy » | 21 | `build_libbox/main.go:185` (`-androidapi 21`, sans `with_naive_outbound`) |
| **Keystore `KeyGenParameterSpec`** (clé SIGN, clé de stockage AES-GCM) | **23** | `api-versions.xml` l.55072 |
| `PURPOSE_AGREE_KEY` (ECDH dans le Keystore) | 31 | `api-versions.xml` l.55212 |
| `java.time.Instant`, `java.util.Base64` | 26 | `api-versions.xml` l.88226, l.89893 |

**Retenu : `minSdk = 23` (Android 6.0).**

- La borne la plus haute **non contournable** est le Keystore (23) : sans
  `KeyGenParameterSpec`, ni la clé de signature ni la clé de stockage ne
  peuvent vivre dans le Keystore, et les jetons seraient stockés sans
  protection. On ne descend pas sous 23.
- `libbox` : on embarque la variante **legacy** (`-androidapi 21`). Elle ne
  diffère de la principale que par l'absence de `with_naive_outbound`, que
  l'application n'utilise pas (elle ne produit que des sorties `vless`).
- `java.time` / `java.util.Base64` (26) : **retirés du code** (analyseur ISO
  maison testé, `kotlin.io.encoding.Base64`), plutôt qu'un désucrage de la
  bibliothèque standard qui ajoute une dépendance à télécharger.
- `PURPOSE_AGREE_KEY` (31) : **repli**, voir §3.

## 3. Déchiffrement local sous Android 12

API fautive : `KeyProperties.PURPOSE_AGREE_KEY` (ECDH dans le Keystore), API 31.

- **API ≥ 31** : inchangé, la clé d'accord vit dans le Keystore.
- **API 23–30** : paire EC P-256 générée en logiciel ; la clé privée PKCS#8
  est **chiffrée au repos** par la clé AES-256-GCM du Keystore (`SecureStore`,
  alias `vpn-store`). Elle n'existe en clair qu'en mémoire, le temps d'un ECDH.
  C'est un affaiblissement réel par rapport à D4 (la clé privée passe en
  mémoire du processus), accepté par l'utilisateur pour ne pas exclure les
  appareils anciens. Le mode est mémorisé par installation : un téléphone mis
  à jour vers Android 12 garde sa clé logicielle (le serveur connaît sa clé
  publique), il n'est pas réenrôlé.
- Ed25519 (vérification du fichier hors-ligne, D29) : `KeyFactory("Ed25519")`
  n'est pas garanti avant Android 13 ; repli par une vérification RFC 8032 en
  Kotlin pur, testée contre les vecteurs de la RFC et contre Node.

## 4. TLS sur appareils anciens (constat, pas décision)

Android < 7.1.1 ne fait pas confiance à ISRG Root X1 (Let's Encrypt). Si l'API
est servie avec un certificat Let's Encrypt (cas habituel de Vercel, **non
vérifié** : `bouendji.numzer0.store` ne résout pas le 2026-10-24), ces appareils
échoueraient au TLS. Le client embarque donc ISRG Root X1 et X2 (empreintes
SHA-256 relevées dans le magasin Windows : `96BCEC06…DF08C6`, `69729B8E…CB1470`)
**en plus** des racines système, jamais à leur place.

## 5. Ce qui est testé, ce qui ne l'est pas

Voir le rapport final : seul le Pixel 8 (API 37, arm64) est disponible ; le
SDK n'a qu'une image système API 37 x86_64. Les API 23–30 et les ABI 32 bits
sont **relues**, pas testées.

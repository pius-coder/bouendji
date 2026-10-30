---
id: livraison-apk-2026-10-30
title: Livraison APK du 30/10 — 8 marques corrigées, pages de téléchargement à jour
tags: [apk, r2, marque, prod, download, audit, update]
status: verified
updated: 2026-10-30
related: [android-audit-2026-10-29, android-update-push-2026-10-30, livraison-apk-2026-10-29, decisions]
---

# Livraison APK du 30/10

## Builds CI (workflow `android-brand`, branche `api/prod-hardening`)

Commit `863dbcf` puis `dfe2c35` (concurrence unique par run). Les 8 builds ont
réussi ; l'APK est signé avec le certificat de production et publié sur R2.

| Marque | Package | Version | Run CI | Page dl |
|---|---|---|---|---|
| Bouendji VPN | `com.bouendji.vpn` | 1.0.0-beta.8 (8) | 41010046939 | `/` et `/bouendji/` |
| dalas npv | `cm.bouendji.dalasnpv` | 1.1.4 (6) | 41010202456 | `/dalas-npv/` |
| Goat VPN | `cm.bouendji.goatvpn` | 1.1.5 (7) | 41010088483 | `/goat-vpn/` |
| Gregor44 vpn | `cm.bouendji.gregor44` | 1.1.4 (6) | 41010208417 | `/gregor-44/` |
| James Pro | `cm.bouendji.jamespro` | 1.1.4 (6) | 41010214505 | `/james-pro/` |
| NevVPN | `cm.bouendji.nevpn` | 1.1.4 (6) | 41010219671 | `/nevpn/` |
| Saitrix | `cm.bouendji.saitrix` | 1.1.5 (7) | 41010230476 | `/saitrix/` |
| Teste | `cm.bouendji.test` | 1.1.4 (6) | 41010225048 | `/test/` |

URL versionnée : `https://apps.numzer0.store/brands/<package>/<package>-<version>-<code>.apk`.
APK ~157 Mo (arm64 + armv7, x86_64 retiré).

## Pages de téléchargement (D144)

Les 9 fichiers `index.html` de `/var/lib/dokku/data/storage/vpn-dl/` ont été
réécrits par SSH (version + lien versionné). Vérifié par `grep` sur le VPS :
toutes les pages portent la version du tableau ci-dessus.

## Politique logo / mascotte (workflow)

- Marque avec `tools/brands/<slug>/icon.png` : icône source ; mascotte source si
  `mascot.png`, sinon l'icône sert d'illustration.
- Marque sans assets : logo généré par `make-logo.mjs`, **sans mascotte
  générée** ; l'icône sert d'illustration (`brand_mascot.png` et
  `brand_mascot_alt.png`).
- Plus aucune marque n'hérite de la mascotte Bouendji du dépôt.
- Dispatch API : le dossier d'assets est retrouvé par `packageName` (le JSON
  dispatché ne porte pas le chemin du manifeste).

## Installation vérifiée

- Pixel 8 (`39141FDJH00GAV`) : **Saitrix 1.1.5 (7)** installé depuis R2,
  `versionCode=7`, `lastUpdateTime=2026-10-30 06:55`.
- Manifeste de l'APK vérifié : `networkSecurityConfig` présent,
  `REQUEST_INSTALL_PACKAGES`, `FileProvider`. L'écran d'onboarding affiche la
  **mascotte robot Saitrix** (pas Bouendji).
- Les autres marques ne sont pas installées dans cette passe ; les APK sont sur
  R2 et les pages pointent dessus.

## Ce qui n'est pas fait

- **API prod non déployée** : `support`, `latestVersionCode` et `announcement`
  ne sont pas encore servis. Le bandeau de mise à jour ne peut donc pas
  apparaître tant que `vpn-api` n'est pas reconstruite.
- `apps.store_url` et les lignes `builds` de la base prod ne sont pas mis à jour
  (les builds CI n'ont pas de callback) : le dashboard peut afficher l'ancien
  APK même si la page publique est à jour.
- Aucun test de tunnel sur le Pixel 8 avec le nouvel APK (cleartext loopback,
  IPv6).

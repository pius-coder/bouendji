---
id: brand-build
title: Marque blanche — injection au build et CI
tags: [marque, ci, github-actions, apk, signature, brandtokens]
status: verified
updated: 2026-10-22
related: [android-app, ui-identities]
---

# Marque blanche — injection au build

## Principe

Une marque **n'est pas un réglage**. Rien n'est lu depuis un serveur au
lancement, rien n'est tiré au hasard : le code source est réécrit avant
compilation (D2, D30). Conséquence assumée : publier une marque demande un
build, et changer la clé publique hors-ligne demande une nouvelle version de
l'application.

## Deux fichiers, deux rôles

| Fichier | Écrit par | Contenu |
|---|---|---|
| `apps/android/app/src/main/java/cm/bouendji/vpn/brand/BrandTokens.kt` | `tools/inject-brand.mjs` | thème, nom, package, URL d'API, `appId`, contact, accent, clé hors-ligne, locale, version |
| `apps/android/brand.properties` | idem | `applicationId`, libellé, `versionCode`, `versionName`, thème |

Le `namespace` Kotlin (`cm.bouendji.vpn`) **ne change jamais** : une marque
différente est une autre `applicationId`, pas un autre code.

## Manifeste de marque

Voir `tools/brands/_example.json`. Champs refusés s'ils sont faux :

- `theme` ∈ `halo | mono | vector | otaku` ;
- `packageName` : segments `[a-z][a-z0-9_]*`, pas de mot réservé Java, et
  **refus explicite** du package de référence `cm.bouendji.vpn` ;
- `apiBaseUrl` : `https`, **sans chemin, query ni fragment** (la signature
  d'appareil couvre le chemin exact) ;
- `appId` : ULID ou UUID de la ligne `apps` ;
- `supportUrl` obligatoire : c'est le contact affiché quand plus rien ne passe
  (D19) ;
- `accent` : `#RRGGBB` ou absent (couleur du thème) ;
- `versionCode` entier positif, `versionName` au format `1.0.0`.

Le script relit le fichier qu'il vient d'écrire et sort en **78** si une
constante n'a pas été remplacée. Un remplacement silencieusement raté
produirait un APK qui démarre avec l'API d'une autre marque.

## Workflow

`.github/workflows/android-brand.yml` (`workflow_dispatch`) :

1. lit le manifeste depuis l'entrée `spec` ;
2. `node tools/inject-brand.mjs --spec … --root apps/android` ;
3. `gradle wrapper --gradle-version 8.7` (le wrapper n'est pas commité) ;
4. `./gradlew :app:assembleRelease` ;
5. signe avec `apksigner` si `ANDROID_KEYSTORE_B64` existe — sinon **avertit**
   et ne prétend pas avoir produit un APK publiable ;
6. calcule le SHA-256, publie l'artefact, crée une release si `release_tag` est
   fourni ;
7. appelle `build_callback_url` si fourni (`continue-on-error`) — la route de
   rappel n'existe pas encore côté API, donc l'entrée est vide par défaut.

## Stockage et remise de l'APK (décision D44, 2026-10-22)

L'APK de chaque marque doit être conservé dans **Cloudflare R2** après le build,
et non uniquement comme artefact temporaire de GitHub Actions. Le bucket doit
rester privé ; le dashboard/API authentifie l'administrateur de la marque et
lui fournit un lien de téléchargement à durée limitée. Enregistrer les
métadonnées du build (app/marque, version, empreinte SHA-256 et clé d'objet R2)
pour retrouver et auditer les APK.

Ce flux est **décidé mais pas implémenté ni vérifié** : le workflow actuel publie
l'artefact GitHub Actions et peut créer une GitHub Release ; il ne téléverse pas
vers R2. La remise depuis le dashboard/API reste donc à construire.

Secrets attendus : `ANDROID_KEYSTORE_B64`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_PASSWORD`, `BUILD_CALLBACK_TOKEN`.

## Fichier hors-ligne

`tools/offline-keygen.mjs` produit la paire Ed25519 :

- privée → `OFFLINE_BUNDLE_SIGNING_KEY` (base64 PKCS#8), jamais commitée ;
- publique → `offlineBundleSigningKeyB64` du manifeste de marque, épinglée dans
  l'APK.

Changer cette clé invalide **tous** les fichiers déjà distribués : c'est une
décision de version, pas une rotation de routine.

## Vérifié ici

- `node tools/inject-brand.mjs` sur une copie : valeurs écrites, `brand.properties`
  cohérent ;
- quatre refus testés : thème inconnu, `http://`, package de référence, chemin
  dans l'URL — sortie **78** avec un message qui nomme le champ ;
- `node tools/offline-keygen.mjs --out` : deux fichiers, 65 et 61 octets.

## Vérification

- Build **debug** vérifié le 2026-10-21 : `:app:compileDebugKotlin` et
  `:app:assembleDebug` réussis ; APK installé sur l'émulateur (`android-ui-research`).
- Le build **release par marque** du workflow GitHub Actions n'a pas été exécuté.
- Le téléversement R2, l'enregistrement des métadonnées et le téléchargement
  authentifié depuis le dashboard/API ne sont pas implémentés ni vérifiés.

## Discrétion du nom (contexte produit, 2026-10-21)

Les noms de marque observés sur les captures (pays, « illimiter », bouendji,
etc.) servent aussi à **ne pas ressembler à un client VPN grand public** : le
nom ne dit ni « VPN », ni protocole, ni fournisseur. C'est un choix de
discrétion commerciale, pas une contrainte technique.

Conséquence pour `inject-brand.mjs` : le nom, le libellé et l'icône sont libres,
mais le `package_name` et le namespace Kotlin restent stables. Aucun texte de
l'interface ne doit exposer `vless://`, le nom du protocole ou l'hôte du nœud.


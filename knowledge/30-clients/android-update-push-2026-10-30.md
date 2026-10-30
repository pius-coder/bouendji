---
id: android-update-push-2026-10-30
title: Mise à jour in-app et notifications Android
tags: [android, update, notification, api, geny, apk]
status: reviewed
updated: 2026-10-30
related: [android-audit-2026-10-29, support-channel-runtime-2026-10-29, livraison-apk-2026-10-29]
---

# Mise à jour in-app et notifications Android

Statut : **reviewed** — code écrit et compilé ; installation et test sur le
Pixel 8 en cours. Aucun test d'installation réelle de l'APK de mise à jour.

## Ce qui a été copié de Geny (et ce qui ne l'a pas été)

Geny publie la version et l'APK dans la réponse de session (`app.android`),
télécharge l'APK, **vérifie sa signature** contre l'app installée
(`knowledge/40-divers/re-geny-apk.md:162-165`), puis ouvre l'installateur
Android. Aucune dépendance à un store.

Bouendji fait la même chose, sans Firebase :

- `GET /v1/apps/:appId/plans` renvoie désormais le **dernier build réussi**
  (`builds.status = 'succeeded'`, tri par `version_code`), son `updateUrl`
  (`COALESCE(apk_url, artifact_url)`) et son `sha256` ;
- l'app compare `latestVersionCode` à `BuildConfig.VERSION_CODE` ;
- `net/UpdateManager.kt` télécharge dans `cacheDir/updates/`, vérifie le
  SHA-256, puis la **signature** (certificat de l'archive = certificat
  installé), et ouvre l'installateur via `FileProvider` ;
- une notification locale « Mise à jour disponible » est publiée (canal
  `updates`) — ce n'est **pas** du FCM, il n'y a pas de projet Firebase.

## Surface ajoutée

- `apps/api/src/routes/catalog.ts` : jointure LATERAL sur `builds` et
  `announcements`.
- `apps/api/src/http/contracts.ts` : champs `latestVersionCode`,
  `latestVersionName`, `updateUrl`, `updateSha256`, `announcement`.
- Android : `UpdateManager`, `AndroidManifest` (`REQUEST_INSTALL_PACKAGES`,
  provider `${applicationId}.files`), `res/xml/file_paths.xml`,
  `AppController.update/updateBusy/installUpdate()`, bandeau dans `Shell.kt`.

## Vérifié

- `tsc -p tsconfig.json --noEmit` : aucune sortie.
- API `admin.test.ts` + `r6.test.ts` : **37/37**.
- `openapi.json` régénéré après l'ajout des champs.
- Kotlin : `:app:compileDebugKotlin` **BUILD SUCCESSFUL**.
- APK debug : **159,4 Mo** avec 2 ABI ; build de test arm64 plus petit.

## Non vérifié / limites

- Aucune installation réelle d'un APK de mise à jour (il faut un APK signé
  avec le même certificat que l'app installée ; les builds debug `.debug` ne
  peuvent pas recevoir l'APK de production).
- Pas de FCM : une vraie notification push serveur (app fermée) exigerait un
  projet Firebase et `google-services.json`, absents.
- Les annonces sont renvoyées par l'API mais **pas encore affichées** dans
  l'UI : il reste un bandeau à brancher et un état « déjà lu ».
- L'API de production n'est pas déployée : tant que `vpn-api` n'est pas
  reconstruite, `support`, `latestVersionCode` et `announcement` n'arrivent
  pas au téléphone.

## Décisions ouvertes

1. Déployer `vpn-api` maintenant (sauvegarde DB puis `git:sync --build`) ?
2. Afficher les annonces dans un bandeau et les mémoriser par `id` ?
3. Ajouter `latestVersionCode`/`updateUrl` au dashboard pour voir ce que l'app
   recevra ?

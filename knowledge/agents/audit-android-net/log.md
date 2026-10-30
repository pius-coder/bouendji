# Journal — audit-android-net

## 2026-10-29T19:06:03Z · Création
- fait: charte créée
- portée: Audit en lecture seule de lapp Android, axe : Client API reseau et preuve d appareil. Ne modifie aucun fichier de code.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-29T19:53:39Z · Cadrage et lecture des nœuds

- fait: Lu la charte, android-state-review-2026-10-29, support-channel-runtime-2026-10-29, décisions D43/D61/D67, rapport api-bundle et audit android-core-haiku (section réseau).
- etat: ok
- suite: Lire les cinq fichiers du périmètre et le contrat API de refresh/bundle.
- fichiers: knowledge/agents/audit-android-net/charter.md; knowledge/30-clients/android-state-review-2026-10-29.md; knowledge/agents/api-bundle/notes/rapport.md

## 2026-10-29T19:54:36Z · Lecture du client réseau et de la preuve

- fait: Lu ApiClient.kt (912 l.), DeviceAuth.kt (199 l.), DeepLinkBus.kt, DeviceKeys.kt (254 l.), VpnApplication.kt ; relevé timeouts 10/20/30 s, absence de pinning, preuve METHOD/PATH/sha256(body)/timestamp/nonce, et la récursion de refresh sur 401.
- etat: ok
- suite: Vérifier le contrat serveur (rawBody, refresh rotatif, ETag 304) et l'interaction avec AppController.
- fichiers: apps/android/app/src/main/java/cm/bouendji/vpn/net/ApiClient.kt; apps/android/app/src/main/java/cm/bouendji/vpn/net/DeviceAuth.kt; apps/android/app/src/main/java/cm/bouendji/vpn/net/DeepLinkBus.kt; apps/android/app/src/main/java/cm/bouendji/vpn/crypto/DeviceKeys.kt; apps/android/app/src/main/java/cm/bouendji/vpn/VpnApplication.kt

## 2026-10-29T19:55:57Z · Vérification du contrat API refresh, bundle et erreurs

- fait: Lu lib/auth.ts (canonicalProof/verifyDeviceProof), lib/crypto.ts, routes/auth.ts (rotation et reprise 5 min, révocation de chaîne), routes/bundle.ts (ETag/304/expiration), routes/devices.ts (enrôlement 409), app.ts (rawBody, limiteur 300/min), lib/errors.ts, config.ts, routes/payments.ts (deep link).
- etat: ok
- suite: Recouper avec AppController.refreshAll (4 s) et le cycle de vie du coffre, puis rédiger.
- fichiers: apps/api/src/lib/auth.ts; apps/api/src/lib/crypto.ts; apps/api/src/routes/auth.ts; apps/api/src/routes/bundle.ts; apps/api/src/routes/devices.ts; apps/api/src/app.ts; apps/api/src/routes/payments.ts

## 2026-10-29T19:56:37Z · Rédaction de l'audit

- fait: Écrit notes/audit.md : verdict, 5 défauts majeurs, réponses Q1-Q7, défauts P0-P3, vérifié/incertain, recommandations et questions ouvertes. Aucun fichier de code modifié.
- etat: ok
- suite: Clôturer après vérification de l'absence de secret dans le fichier.
- fichiers: knowledge/agents/audit-android-net/notes/audit.md

## 2026-10-29T19:58:34Z · CLÔTURE
CLÔTURE — Verdict : preuve d'appareil correcte, mais P0 de récursion de refresh sur 401 (ApiClient.kt:405-415/253-259), P1 de verrou ETag après vidage du coffre (VpnTunnelService.kt:598-613 + bundle.ts:438), P1 de budget 4 s pour 5+ appels (AppController.kt:282 + ApiClient.kt:88-94), absence de pinning et bundle non signé, et bundle vide ignoré dont l'ETag avance. Vérifié par lecture croisée Android/API (fichiers cités dans notes/audit.md) ; non exécuté : aucun build, aucun appel réseau, aucun test Pixel, libbox.aar absent. Questions ouvertes : budget 2G, signature du bundle vs pinning, trafic API dans le tunnel, coffre multi-compte, paquet cm.bouendji.nevpn dans payments.ts:81.

# Journal — audit-android-tunnel

## 2026-10-29T19:06:02Z · Création
- fait: charte créée
- portée: Audit en lecture seule de lapp Android, axe : Cycle de vie du tunnel et machine a etats. Ne modifie aucun fichier de code.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-29T19:45:53Z · Lecture charte, contexte et audits antérieurs

- fait: Charte lue ; noeuds android-state-review-2026-10-29, flux-serveurs-app et décisions D18/D25/D47/D49/D50/D61/D67 lus ; audits core-haiku et state-haiku lus (diagnostic du 25/10 périmé sur le Mutex, conservé pour les points NO_CONNECTION/expiration).
- etat: ok
- suite: Lire intégralement les 6 fichiers du périmètre et les fichiers adjacents nécessaires (LibboxTunnelEngine, SingBoxConfig, AppController).

## 2026-10-29T19:48:43Z · Lecture intégrale service, moteur et bus

- fait: VpnTunnelService.kt (696 l.), TunnelEngine.kt (204 l.), ServerBus.kt (85 l.) lus intégralement ; LibboxTunnelEngine.kt et la fin de SingBoxConfig.kt (expiry/usableConfigs) lus pour trancher D67 et le sens réel de CONNECTED.
- etat: ok
- suite: Lire Home.kt/MainActivity.kt/AndroidManifest.xml, puis vérifier par grep l'absence de ConnectivityManager, setUnderlyingNetworks, IPv6, addDisallowedApplication, actions de notification, DEVICE_REVOKED et ACTION_RECONNECT.

## 2026-10-29T19:59:26Z · CLOTURE partielle

- fait: audit.md ecrit : verdict provisoire, reponses Q1-Q7, defauts P0/P1/P2/P3 cites fichier:ligne, verifie vs incertain, recommandations et questions ouvertes. Perimetre demande lu en entier ; aucun build, aucun test appareil.
- etat: partiel
- suite: Non examine : runtime libbox (AAR absent), compilation, logcat cleartext 127.0.0.1, onRevoke vs onDestroy sur appareil, reproduction des courses, ecrans UI hors Home.kt, serveur au-dela de bundle.ts.

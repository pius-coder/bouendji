---
id: android-app
title: Application Android — architecture
tags: [android, kotlin, compose, vpnservice, keystore]
status: decided
updated: 2026-10-22
related: [singbox-engine, failover-client, ui-identities]
---

## Socle

Kotlin, Compose, `VpnService`, moteur `libbox` (sing-box) en processus
séparé ou en service lié. Un seul module `app` + un module `branding` généré au
build.

## Identité de l'appareil

Pas de HWID, pas d'IMEI, pas de numéro de série. Deux paires de clés EC P-256
dans **Android Keystore** (séparées par usage : signature de requête et accord
ECDH). Elles ne sortent jamais du Keystore.

- Enrôlement : l'app envoie la clé publique + une preuve de possession.
- Chaque requête est signée :
  `METHOD\nPATH\nsha256(body)\ntimestamp\nnonce`.
- Play Integrity en complément, jamais comme unique défense.

## Stockage

- Bundle chiffré, déchiffré uniquement en mémoire au moment de construire la
  configuration sing-box.
- Aucun `vless://` en clair sur disque.
- Aucune action « copier » ou « exporter » dans l'interface.
- Écran de debug absent des builds de production, ou protégé.

## Service VPN

- Notification permanente (obligatoire), avec durée et débit.
- Redémarrage au boot si l'utilisateur l'a demandé.
- Toujours-actif (always-on) proposé, pas imposé : sinon l'appareil peut perdre
  tout réseau si le tunnel échoue.
- Bascule sans redémarrer le service quand c'est possible (changement de
  `selector` plutôt que recréation du tunnel).

## États visibles

`Arrêté` · `Connexion` · `Connecté` · `Reconnexion` · `Aucune connexion
disponible` · `Abonnement expiré` · `Appareil révoqué`.

Chaque état doit dire la vérité : ne jamais afficher « protégé » quand le tunnel
ne passe pas.

## Contraintes d'environnement

La chaîne est installée et **prouvée** depuis le 2026-10-21 : `assembleDebug`
produit `app-debug.apk` et l'APK s'installe sur l'émulateur API 37 (détail :
`android-toolchain`). Aucun wrapper Gradle n'est versionné : le build passe par
`tools/build-apk.ps1` (Gradle 8.7 + JDK 17 sous `C:\Users\HP\android-toolchain`).

Compiler ne prouve pas le transport : `libbox.aar` est arm64-v8a seulement, donc
le tunnel se vérifie sur le Pixel 8, pas sur émulateur.

## En-têtes leurre côté client (2026-10-22, vérifié)

`ApiClient` envoyait `User-Agent: vpn-android` depuis le début, mais **pas**
`X-App-Id` : la moitié du contrat de D43 n'était pas tenue côté app. Corrigé :

- `appId` est un paramètre du constructeur — le client ne lit pas `BrandTokens`
  lui-même ; `AppContainer` passe `BrandTokens.appId` ;
- `send()` pose `X-App-Id` sur **toutes** les requêtes, challenge et enrôlement
  compris (le serveur ne le demande pas seulement sur les routes authentifiées) ;
- `HEADER_APP_ID` vit dans `DeviceAuth.kt`, à côté de `HEADER_DEVICE_TOKEN`.

Vérifié par `assembleDebug` (APK 89 580 046 o, 2026-10-22). Le comportement HTTP
n'est **pas** couvert par un test : `DeviceAuth` dépend d'Android Keystore et de
`android.util.Base64`, donc un test JVM ne peut pas instancier le client sans
Robolectric. La preuve reste la lecture du chemin unique : `send()` contient le
seul `newCall` de l'app (l'autre appel réseau, `LibboxTunnelEngine`, parle en
`127.0.0.1`).

Écart relevé au passage : `CONTRIBUTING.md` §3 affirme que
`/v1/apps/:appId/plans` exige `X-App-Id` **égal à** `:appId` ; ni
`routes/catalog.ts` ni `lib/decoy.ts` ne le vérifient, et le leurre ne redirige
que si `Accept: text/html`. Voir `00-brief/open-questions` O21.

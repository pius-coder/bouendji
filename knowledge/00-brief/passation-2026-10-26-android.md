---
id: passation-2026-10-26-android
title: Passation — reprise du chantier Android (R10)
tags: [passation, android, r10, compose, libbox, quota, paiement, whatsapp]
status: verified
updated: 2026-10-26
related: [passation-2026-10-26, audit-synthese, audit-brief, android-toolchain]
---

# Passation Android — 2026-10-26

But : reprendre **l'app Android** (`apps/android`) sans relire tout le code.
Personne d'autre n'y travaille : aucun agent ni aucun worktree ne touche `apps/android`.
Travailler dans le dépôt principal `C:\Users\lenovo\Projects\bouendji`, branche
`api/prod-hardening` (dernier commit `2947316`).

## À lire (dans cet ordre, rien d'autre au départ)

1. Cette note.
2. `agents/audit-android-ui-haiku/notes/audit.md` : écrans Compose, avec `fichier:ligne`.
3. `agents/audit-android-core-haiku/notes/audit.md` : réseau, VPN, bundle, offline, marque.
4. `30-clients/audit-synthese.md`, section **R10**.
5. `00-brief/decisions.md` de **D113 à D125** : le modèle produit.
6. `30-clients/android-toolchain` (`node knowledge/cli.mjs read android-toolchain`) : la compilation.

Chemins Kotlin relatifs à `apps/android/app/src/main/java/cm/bouendji/vpn/`.

## Modèle produit à respecter (résumé des décisions)

- **Deux familles de forfaits** :
  - **Limité** : quota de data, client VLESS dédié dans 3x-ui. Quota épuisé → accès coupé, l'app propose de racheter.
  - **Limité + illimité de nuit** : même quota le jour, data illimitée la nuit sur des nœuds éphémères. Plages : 20h-24h, 24h-4h ou 20h-4h, heure de Douala.
- **La page de paiement est dans l'app**, au thème de la marque. On y choisit la plage, le prix se met à jour, puis paiement Fapshi.
- **Pas d'email, WhatsApp partout.** Pop-up « Bienvenue sur <nom de l'app> » **au premier lancement**, avec « Rejoindre le groupe WhatsApp » et « Écrire à l'admin ».
- **Activité** : un **bouton** qui ouvre une **feuille** (bottom sheet), pas une page. Contenu : débit en direct, data reçue/envoyée de la session, data restante.
- **Serveurs** : liste avec ping. Si rien ne passe : bouton « Demander de l'aide » qui ouvre le WhatsApp de l'admin et copie le **code d'appareil**. L'admin envoie alors un fichier de secours.
- L'utilisateur ne voit **jamais** de lien `vless://`.

## État constaté par l'audit (non recontrôlé ligne par ligne)

- **Solide** :
  - design « Billet » (`ui/theme/Billet.kt`) et kit (`ui/kit/Kit.kt`) ;
  - écrans branchés sur l'API : serveurs, latence, favoris, appareils, parrainage, import `.bvpn` ;
  - crypto par appareil, clés non exportables ;
  - usage unique des fichiers de secours, côté app.
- **Trafic en direct déjà disponible** :
  - `vpn/LibboxTunnelEngine.kt:129-135` lit `uploadTotal`/`downloadTotal` (API Clash `/connections`), toutes les secondes (`VpnTunnelService.kt:413-425`) ;
  - le débit est calculé dans `ui/screens/Home.kt:96-106` → **à réutiliser pour la feuille Activité**.
- **Paiement** : externe. La commande crée `checkout.url`, ouvert dans le navigateur (`ui/AppController.kt:339-353`). L'écran Commande n'a ni plage ni prix dynamique (`ui/screens/Plans.kt:254-311`).
- **Quota** : rien.
  - `EntitlementDto` (`net/ApiClient.kt:606-618`), `PlanDto` (`:668-683`) et `CreateOrderRequest` (`:688-689`) n'ont ni quota, ni famille, ni plage.
  - Pas de jauge, pas d'écran « Data épuisée » (`ui/screens/Home.kt:112-120`).
- **Pop-up de bienvenue** : il existe, mais **seulement après inscription** (`AppController.kt:310`, `ui/screens/Intro.kt:280-302`). Ses boutons WhatsApp sont masqués car `communityWhatsappUrl` est vide (`brand/BrandTokens.kt:92`). Le contact est un `mailto:` (`BrandTokens.kt:74`).
- **Connexion** : email seul (`ui/screens/Auth.kt:62-63`, `AppController.kt:282`, `LoginRequest` `net/ApiClient.kt:578-579`). Après connexion, le forfait choisi est perdu : retour à l'accueil (`AppController.kt:313`).
- **Aide et code d'appareil** : absents de `ui/screens/Servers.kt`.
- **Bundle** :
  - un bundle vide est ignoré (`AppController.kt:248`) → un accès coupé reste utilisable ;
  - le bundle n'est tiré que dans `refreshPrivate()` (`AppController.kt:240-252`), donc les nœuds de nuit ajoutés à 20 h ne sont pas vus ;
  - `BundleConfig` (`config/SingBoxConfig.kt:26-40`) n'a pas de `startsAt`.
- **Bug probable** : `refresh.join()` n'attend pas le réseau (`AppController.kt:195-203`). L'auto-connexion peut partir avant le chargement de `me`. À vérifier sur l'appareil.
- **Commentaire périmé** : `vpn/TunnelEngine.kt:52-57` dit « pas de dépendance libbox ».

## Contrats API attendus (côté serveur, pas encore fusionnés)

- **R6** (branche `w1/r6`, commit `de90dd8`, suite complète non relancée) :
  - `GET /v1/me/subscription` ajoute `family`, `quotaBytes`, `usedBytes`, `remainingBytes`, `nightWindow`, `state` (`active` | `exhausted` | `expired`) ;
  - catalogue `GET /v1/apps/:appId/plans` : famille, quota, options de nuit avec prix ;
  - commande : `nightWindow` facultatif, total calculé par le serveur.
  - Le détail exact est dans la section R6 de `apps/api/src/http/contracts.ts` sur `w1/r6`. **La lire avant de coder les DTO.**
- **R7** (worktree `bouendji-wt\r7`, **non commité**) : bundle avec `startsAt` par configuration, bundle vide si quota épuisé ou expiré, client 3x-ui dédié. Contrat à confirmer quand R7 sera commité.
- **R1** (`w1/r1-api`) : la connexion accepte `identifier` (email ou numéro). Vérifier si la route **mobile** `/v1/auth/login` accepte aussi le numéro : R1 n'a traité que la connexion admin.
- **Marque (R4/R5)** : la communauté porte `whatsapp_group_url` et `contact_whatsapp`. Le manifeste de build les transmet à `tools/inject-brand.mjs`. Côté app : ajouter `supportWhatsappNumber` et renseigner `communityWhatsappUrl` dans `BrandTokens`.

## Travaux R10, dans l'ordre proposé

1. DTO (`net/ApiClient.kt`) :
   - `EntitlementDto` avec quota et état ;
   - `PlanDto` avec famille et options de nuit ;
   - `CreateOrderRequest` avec `nightWindow` ;
   - `BundleConfig` avec `startsAt`.
   - Les tolérer absents tant que l'API n'est pas déployée.
2. Bundle :
   - un bundle vide coupe le tunnel ;
   - re-tirage du bundle au début de chaque plage (20 h, minuit) ;
   - un nœud n'est pas utilisé avant son `startsAt`.
3. Accueil : jauge de quota (consommé / restant / échéance), écran « Data épuisée » avec « Racheter ».
4. Feuille Activité : bouton à l'accueil, bottom sheet, à partir des compteurs existants.
5. Page de paiement native : récapitulatif, choix de plage, prix, puis paiement Fapshi. Garder le forfait choisi après connexion (`AppController.kt:313`).
6. Pop-up de bienvenue au **premier lancement** (pas après inscription), boutons WhatsApp.
7. Serveurs : « Demander de l'aide » qui ouvre WhatsApp et copie le code d'appareil.
8. Connexion par numéro, si la route mobile l'accepte.
9. Corriger l'auto-connexion (`AppController.kt:195-203`).

## Compilation et appareil

- Outils installés sur ce PC (passation du matin) :
  - JDK 17.0.20.1, Gradle 8.7 ;
  - SDK dans `%LOCALAPPDATA%\Android\Sdk` (android-35, build-tools 35.0.0, NDK 28.2.13676358) ;
  - `JAVA_HOME` et `ANDROID_HOME` définis ;
  - `apps\android\local.properties` écrit.
- Compilation : `tools/build-apk.ps1` (reprises multiples, cache Gradle conservé). Pas de wrapper Gradle versionné.
- **Bloquant** : `apps/android/app/libs/libbox.aar` est **absent**, et la release GitHub `libbox-1.14.3` n'a aucun fichier. Deux solutions : le reconstruire (`tools/build-libbox.ps1`) ou le récupérer sur l'ancien PC ou la clé de sauvegarde. Sans lui, pas de tunnel.
- **Accord de l'utilisateur obligatoire** avant tout build : Gradle et Maven téléchargent sur un forfait mobile limité.
- Appareil : Pixel 8 en USB, API 37 (`adb devices` → `device`). `libbox.aar` est arm64-v8a seulement : l'émulateur x86_64 ne peut pas tester le tunnel.
- « Vérifié » = `assembleDebug` réussi + APK présent, ou test exécuté avec sa sortie citée (`AGENTS.md`).

## Points de sécurité

- Jamais de `vless://` en clair dans l'app, un log ou un test (`AGENTS.md`).
- Le code d'appareil copié pour l'aide ne doit être qu'un identifiant lisible, jamais une clé ni un jeton.
- Fichier de secours : il reste scellé pour la clé Keystore de l'appareil destinataire. Ne pas affaiblir cette vérification à l'import.

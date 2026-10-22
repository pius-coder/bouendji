---
id: android-ui-research
title: Recherche Android pour le parcours Halo v2
tags: [android,compose,ui,halo,accessibilite]
status: verified
updated: 2026-10-21
related: [ui-v2-html-audit, ui-restructure-plan, journeys, android-ui, android-app]
---

## Question

Comment transposer fidèlement Halo v2 sur Android tout en livrant le parcours
réel décidé et en respectant les conventions Compose actuelles ?

## Faits

- Android 15 / target SDK 35 impose l'affichage edge-to-edge. Le fond Halo peut
  passer sous les barres système, mais tout contrôle doit appliquer les insets
  de barres, gestes et découpe écran. `enableEdgeToEdge()` assure la compatibilité
  antérieure ; le manifeste utilise déjà `adjustResize`.
- Les composants Material/Foundation portent les sémantiques accessibles par
  défaut. Les contrôles personnalisés (orbe, cartes de navigation) doivent
  exposer rôle, libellé, état et action ; cible tactile minimale 48 dp.
- `TextField` / `OutlinedTextField` est recommandé pour connexion/inscription :
  libellé persistant, comportement clavier et sémantique intégrés. Les valeurs
  saisies et la destination courante sont du petit état UI à conserver avec
  `rememberSaveable`; les objets réseau restent hors du Bundle.
- `Scaffold` fournit la structure cohérente barre haute / barre basse / contenu
  et transmet les espacements internes à appliquer. Sur téléphone compact, la
  navigation principale est une barre basse ; une rail est préférable sur
  largeur étendue. Le présent chantier cible d'abord le Pixel 8 compact, mais
  la structure ne doit pas empêcher une adaptation ultérieure.
- Le HTML v2 n'est pas un contrat produit. Le parcours officiel reste les cinq
  écrans de `ui-restructure-plan`, plus les états d'entrée et de blocage. Les
  données doivent venir de `ApiClient` ; aucune latence, vitesse, quantité de
  configurations, limite d'appareils ou prix ne sera inventé.
- Le client Android sait déjà enrôler, inscrire, connecter, lire compte,
  abonnement et appareils, activer/révoquer un appareil et récupérer le bundle.
  Il manque les méthodes catalogue `/v1/apps/:appId/plans` et commandes
  `/v1/orders`; les routes existent côté API et leurs schémas sont lisibles
  dans `routes/catalog.ts` et `routes/orders.ts`.

## Recommandation

Une seule racine Compose pilotée par un état de destination sauvegardé, avec
barre Halo 1+3 et navigation basse Connexion/Forfaits/Compte. Les pages Aide et
Réglages s'ouvrent depuis la barre haute et reviennent à la destination
précédente. Les formulaires utilisent les champs Material recolorés par les
tokens Halo ; l'orbe reste le seul contrôle dominant de l'accueil.

## Implémentation et vérification — 2026-10-21

- `ui/AppRoot.kt` porte désormais les destinations Connexion, Abonnement,
  Compte, Réglages et Aide, ainsi que les écrans bloquants réseau, abonnement
  expiré et appareil révoqué. La barre haute respecte 1 + 3 et la barre basse
  reste limitée aux trois destinations principales.
- Connexion et inscription appellent l'enrôlement puis `ApiClient`; le compte
  relit le droit et les appareils; la révocation exige une confirmation.
- `ApiClient.kt` implémente le catalogue public et les commandes à partir des
  contrats réels `catalog.ts` et `orders.ts`. Le client n'envoie jamais de
  montant : uniquement `planId` et la révision entière publiée par le serveur.
- L'apparence Auto/Clair/Sombre et la réduction des animations sont conservées
  dans `SecureStore`. Le premier lancement utilise Halo sombre, comme la
  référence v2, tout en laissant Auto disponible.
- `MainActivity` active réellement l'edge-to-edge, applique l'apparence aux
  barres système et expose les permissions Android VPN/notification.
- Vérification réelle : `:app:compileDebugKotlin` puis `:app:assembleDebug`
  réussis le 2026-10-21. APK produit :
  `apps/android/app/build/outputs/apk/debug/app-debug.apk`, 89 571 479 octets.
- APK installé avec succès sur `emulator-5554`. Rendu observé : accueil Halo,
  navigation basse, connexion et abonnement se dessinent sans plantage. Le
  moteur natif est honnêtement indiqué indisponible sur cet émulateur x86_64
  (`libbox.so` absent pour cette ABI), ce qui ne remet pas en cause le rendu.

## Correction de fidélité visuelle — 2026-10-21

- Le premier portage a été refusé par l'utilisateur : il reprenait la palette
  Halo mais pas le dessin v2. Cette distinction est désormais une contrainte
  explicite : **le HTML v2 est la source de vérité visuelle, valeur par valeur**.
- Valeurs relevées dans `../Atelier-identites-VPN-v2.html` puis portées dans
  Compose : boutons supérieurs 44, orbe 210 et disque intérieur 186, puce 28,
  statistiques 58/rayon 16, carte abonnement 62/rayon 18, barre basse 62/rayon
  23, marge horizontale 16 à 20 et trois colonnes égales.
- La barre haute reproduit maintenant l'avatar `H`, l'assistance, la cloche avec
  pastille et les deux curseurs. La navigation Connexion utilise le bouclier
  coché du HTML et non une icône générique de maison.
- L'accueil générique et sa grande carte diagnostic ont été retirés. Les états
  réels sont rendus à l'intérieur de la composition v2 (puce, titre, sous-titre,
  orbe, métriques, abonnement), sans fabriquer latence ni débit.
- Vérification visuelle sur `emulator-5554` après installation et effacement des
  données de test : le premier lancement est Halo sombre et la structure suit
  désormais celle du téléphone v2. Les pages Connexion/Inscription et Forfaits
  conservent le même shell et les mêmes surfaces de verre.

## Sources

- Android Developers — Edge-to-edge et barres système :
  https://developer.android.com/develop/ui/compose/system/setup-e2e
- Android Developers — WindowInsets :
  https://developer.android.com/develop/ui/compose/system/insets
- Android Developers — Semantics et valeurs par défaut accessibles :
  https://developer.android.com/develop/ui/compose/accessibility/semantics
  et https://developer.android.com/develop/ui/compose/accessibility/api-defaults
- Android Developers — TextField :
  https://developer.android.com/develop/ui/compose/text/user-input
- Android Developers — état sauvegardé :
  https://developer.android.com/develop/ui/compose/state-saving
- Android Developers — Scaffold et navigation adaptative :
  https://developer.android.com/develop/ui/compose/components/scaffold
  et https://developer.android.com/develop/adaptive-apps/guides/build-adaptive-navigation
- `../Atelier-identites-VPN-v2.html`
- `preview/halo/index.html`
- `apps/android/app/src/main/java/cm/bouendji/vpn/net/ApiClient.kt`
- `apps/api/src/routes/catalog.ts`, `apps/api/src/routes/orders.ts`

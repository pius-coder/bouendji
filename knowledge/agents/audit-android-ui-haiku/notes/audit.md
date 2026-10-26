# Audit Android - interface Compose (tranche `apps/android/app/src/main/java/cm/bouendji/vpn/ui/` + `MainActivity.kt`)

Lecture seule. Chemins relatifs à `apps/android/app/src/main/java/cm/bouendji/vpn/`.

## 1. Verdict

- La tranche UI est **solide sur le visuel et la navigation de base** : design « Billet » cohérent (`ui/theme/Billet.kt`), kit de composants réutilisable (`ui/kit/Kit.kt`), écrans réels branchés sur l'API et le tunnel (serveurs, latence, favoris, appareils, parrainage, import `.bvpn`).
- Le **parcours d'achat est externe** : le forfait se paie sur une page hébergée ouverte dans le navigateur. Il n'y a **aucune** page de paiement native, aucun choix de plage nocturne, aucun prix recalculé.
- Les **données de quota n'existent pas côté app** : pas de champ quota dans les DTO, pas de jauge, pas de data restante, pas d'état « Data épuisée ». Le plan (points 4 et 9) suppose un contrat API qui n'est pas encore exposé.
- Le **pop-up de bienvenue** existe mais seulement **après inscription**, pas au premier lancement, et ses boutons WhatsApp sont masqués car l'URL de communauté est vide dans la marque.
- Un bug probable de démarrage (auto-connexion) et plusieurs écarts de parcours (perte du forfait choisi après connexion) sont à traiter avant la refonte.

## 2. Inventaire

Tailles approximatives issues de `wc -c` sur les fichiers listés.

| Fichier | Rôle | Taille | État |
|---|---|---|---|
| `MainActivity.kt` | Activité, fichier `.bvpn` reçu, consentement VPN, ouverture d'URL | 5 Ko | solide ; code mort mineur (`hasConfiguration`, MainActivity.kt:43-49) |
| `ui/AppController.kt` | État global, navigation par pile, auth, commande, serveurs, réglages, import | 24 Ko | partiel : démarrage fragile (AppController.kt:195-203), pas de quota, pas de plage |
| `ui/Shell.kt` | Racine `VpnApp`, thème, animations d'écran, barre d'onglets, bandeau, `ScreenColumn`/`CtaBar` | 14 Ko | solide ; paramètre inutilisé `initialHasConfiguration` (Shell.kt:95) |
| `ui/kit/Kit.kt` | Composants : `T`, `Btn`, `BlockBtn`, `ListRow`, `Sheet`, `Toast`, `NoticeBanner`, `Meter`, `Triplet`, `Bars`, `Banknote` | 28 Ko | solide, réutilisable (Meter Kit.kt:624 et Triplet Kit.kt:454 prêts pour jauge et feuille Activité) |
| `ui/kit/Icons.kt` | Jeu d'icônes vectorielles (`Ic`) | 7 Ko | solide ; pas d'icône « activité/graphique » (liste : Icons.kt:30-88, utiliser `Bolt`, `ArrowDown`, `ArrowUp`, `Clock`) |
| `ui/kit/Flags.kt` | Drapeaux dessinés par région | 7 Ko | solide |
| `ui/kit/Guilloche.kt` | Motifs guillochés animés (sceau, rosette, vagues) | 5 Ko | solide |
| `ui/theme/Billet.kt` | Tokens de couleur par thème et mode clair/sombre | 10 Ko | solide ; police d'affichage = serif système (Billet.kt:55), pas la police de marque |
| `ui/screens/Intro.kt` | Splash, 3 slides d'onboarding, autorisation VPN, feuilles (`SheetHost`) | 17 Ko | partiel : feuille `welcome` seulement après inscription (Intro.kt:280-302) |
| `ui/screens/Auth.kt` | Inscription / connexion (e-mail seul pour se connecter) | 7 Ko | partiel : pas de connexion par WhatsApp (Auth.kt:62-63, 102) |
| `ui/screens/Home.kt` | Accueil : bouton d'alimentation, état, débit et latence (connecté seulement), serveur courant | 15 Ko | partiel : pas de jauge quota, pas de feuille Activité |
| `ui/screens/Plans.kt` | Forfaits (liste, carte membre), commande (récapitulatif + Payer), retour de paiement | 18 Ko | partiel : pas de plage, paiement externe |
| `ui/screens/Servers.kt` | Liste des serveurs, recherche, filtres, test de latence, favoris | 10 Ko | solide ; pas de « Demander de l'aide » |
| `ui/screens/Profile.kt` | Profil, paramètres, abonnement, appareils, parrainage, aide FAQ | 23 Ko | partiel : pas de « Mon compte » (mot de passe, sessions) ; déconnexion et retrait d'appareil sans confirmation |

Points d'entrée et états relevés :

- Écrans : `enum class Screen` (AppController.kt:36), onglets `TABS` (AppController.kt:38), rendu par `ScreenFor` (Shell.kt:218-236).
- Navigation : `go()` (AppController.kt:90-96), `back()` (AppController.kt:99-113), `BackHandler` (Shell.kt:146-148).
- États du tunnel : `TunnelState` mappé en titres et couleurs dans Home.kt:112-120. Il y a 7 états (connecté, connexion, reconnexion, aucun serveur, abonnement expiré, appareil retiré, arrêté). **Aucun état « quota épuisé »**.

## 3. Ce qui sert le plan

- Thème par marque et clair/sombre : `tokensFor(BrandTokens.theme, dark, BrandTokens.accent)` (Shell.kt:140), injecté via `LocalTokens` (Shell.kt:150), accent surchargeable par hex (Billet.kt:80-83). Tous les écrans lisent `LocalTokens.current` (ex. Plans.kt:106).
- Carte de membre au mot de la marque (`BrandTokens.memberWord`, Plans.kt:96, Profile.kt:101) et abonnement en « billet » (Profile.kt:212-263) : base visuelle déjà prête pour la page de paiement.
- Récapitulatif de commande en billet : Plans.kt:263-279 (nom, durée, prix, `noteBrush`). Il suffit d'y ajouter le choix de plage.
- Forfaits avec choix de taille et prix : Plans.kt:117-133 (sélecteur `Segmented` + `Bill`), prix via `fcfa()` (Plans.kt:83).
- Feuilles : `Sheet` (Kit.kt:527-556) et `SheetHost` (Intro.kt:235-327) avec les feuilles `renew` (Intro.kt:265-279), `welcome` (Intro.kt:280-302), `import` (Intro.kt:303-317). Le modèle existe pour la feuille Activité et l'écran « Data épuisée ».
- Débit en direct : calcul déjà présent (Home.kt:94-105, Mb/s à partir de `ServerBus.traffic`), affiché seulement quand connecté (Home.kt:189-210). À extraire pour la feuille Activité.
- Serveurs avec ping : `ServerRow` (Servers.kt:190-224), barres de qualité `Bars` (Kit.kt:404). Le ping est un TCP direct tant que le tunnel est coupé (AppController.kt:458-464, mesure différente signalée Servers.kt:175).
- Aide WhatsApp côté communauté : boutons déjà câblés (Auth.kt:121-146, Profile.kt:412-419) mais masqués quand l'URL est vide (`communityWhatsappUrl` = `""`, BrandTokens.kt:92).
- Copie dans le presse-papiers : `Platform.copy` (interface AppController.kt:50, implémentation Shell.kt:123-125) et exemple (Profile.kt:339).
- Import hors ligne : feuille et flux complets (AppController.kt:503-528, Settings Profile.kt:171-182).

## 4. Écarts avec le plan

**Point 1 (mot de passe forcé, Mon compte, connexion e-mail ou WhatsApp).**
- Connexion par e-mail seulement : Auth.kt:62-63 (« Connecte-toi avec l'adresse e-mail »), Auth.kt:102, AppController.kt:282 (validation de l'e-mail), AppController.kt:305 (`api.login(..., form.email, ...)`).
- Pas de changement de mot de passe forcé : aucun état dans `AppController` ni écran (absence vérifiée par recherche des écrans du `Screen` enum, AppController.kt:36).
- « Mon compte » (profil, mot de passe, sessions ouvertes, thème) : absent. Le profil (Profile.kt:86-136) ne montre que nom, date et renvois ; le thème est dans Paramètres (Profile.kt:194, feuille Shell via `SheetHost` `appearance`, Intro.kt:239-250).

**Point 2 (libre-service admin).** Hors tranche : l'onboarding admin est côté dashboard. Rien à ajouter dans l'app.

**Point 3 (guide par rôle).** Hors tranche de l'app (concerne l'espace admin).

**Point 4 (forfaits, deux familles, plages).**
- Deux familles existent seulement comme niveaux de serveurs `free-labs` / `paid-gcp` (Plans.kt:72-75, `tierLabel` Plans.kt:75), pas comme « limité + nuit ». Aucune plage 20h-24h / 24h-4h / 20h-4h dans l'app (Plans.kt:104-158, Plans.kt:254-311).
- Quota de data absent des DTO : `EntitlementDto` (net/ApiClient.kt:606-617) n'a que `daysRemaining`, `deviceLimit`, `endpointTier` ; `StatsDto` (ApiClient.kt:558-564) donne seulement des cumuls (`bytesUp`, `bytesDown`, `seconds`, `todayBytes`).
- Accès coupé à l'épuisement : aucun état côté UI (Home.kt:112-120) ; le seul mécanisme est `SUBSCRIPTION_EXPIRED` (Home.kt:117), donc on ne distingue pas quota et fin de forfait.

**Point 5 (prix plancher, indicateur de prix).** Côté admin, hors tranche. L'app affiche seulement le prix final (Plans.kt:152, Plans.kt:303).

**Point 6 et 7 (Telegram, dashboard).** Hors tranche.

**Point 8 (Réseau).** Hors tranche.

**Point 9 (app Android).**

- Pop-up de bienvenue au premier lancement : **écart**. Le seul pop-up `welcome` est déclenché après inscription (AppController.kt:310 `if (form.register) sheet = "welcome"`), pas au premier lancement. Au premier lancement, le flux est ONBOARDING puis AUTH/HOME (AppController.kt:197-201, `finishOnboarding` AppController.kt:211-214) sans pop-up. Ses boutons WhatsApp ne s'affichent pas tant que `communityWhatsappUrl` est vide (Intro.kt:291-293 ; BrandTokens.kt:92).
- « Écrire à l'admin » : **absent**. Le seul contact est `supportUrl` = `mailto:support@henshins.online` (BrandTokens.kt:74), ouvert par `openSupport` (MainActivity.kt:112). Pas de numéro WhatsApp de l'admin.
- Page de paiement au thème de la marque avec choix de plage et prix : **écart majeur**. Le paiement est externe : `startOrder` crée la commande puis ouvre `checkout.url` dans le navigateur (AppController.kt:339-353, en particulier AppController.kt:348 ; `openUrl` MainActivity.kt:114-121). La page « Commande » (Plans.kt:254-311) n'a qu'un récapitulatif et un bouton « Payer ». Aucun choix de plage, aucun prix recalculé. Le bouton `createOrder(plan.id, plan.revision)` (AppController.kt:344) n'envoie pas de plage.
- Jauge de quota à l'accueil : **absente**. Le composant `Meter` existe (Kit.kt:624) mais n'est utilisé que pour les jours d'abonnement (Profile.kt:242). Aucun champ de données à afficher (voir point 4).
- Feuille Activité (débit en direct, data reçue/envoyée, data restante) : **partiellement présente, non séparée**. Le débit, la session et la latence existent, mais seulement sur l'accueil, et seulement quand connecté (Home.kt:189-210). La data restante n'existe pas. Pas de feuille ni de bouton d'ouverture.
- Liste des serveurs avec ping : **présente** (Servers.kt:190-224, Servers.kt:208-212). Le ping n'est pas mesuré à l'ouverture, il faut toucher « Tester » (Servers.kt:86-97).
- Bouton « Demander de l'aide » (WhatsApp) qui copie le code d'appareil : **absent**. `ServersScreen` n'a pas ce bouton (Servers.kt:58-182). Aucun « code d'appareil » dans le code (recherche sans résultat dans `apps/android/app/src/main/java/cm/bouendji/vpn/`). Le seul identifiant est `DeviceDto.id` (net/ApiClient.kt:597), à valider (non vérifié : son rôle de « code »).

**Écarts transverses relevés.**

- Perte du forfait choisi : depuis l'écran Forfaits sans compte, « Continuer » mène à AUTH (Plans.kt:153), mais après connexion le flux retourne à HOME (AppController.kt:313), pas à la commande.
- Feuille `renew` : bouton « Voir les forfaits » (Intro.kt:276) ; pas de différence entre « expiré » et « quota épuisé » (Intro.kt:267-273).

## 5. Structure de code proposée

Conventions à suivre : état dans `AppController` (AppController.kt:127-155), feuilles par `SheetHost` (Intro.kt:235), composants du kit (Kit.kt), tokens via `LocalTokens` (Billet.kt:59).

**A. Page de paiement (fichiers modifiés : `ui/screens/Plans.kt`, `ui/AppController.kt`).**
- `enum class NightWindow(val label: String, val code: String) { EVENING("20h-24h", "20-24"), EARLY("24h-4h", "24-4"), FULL("20h-4h", "20-4") }` dans `AppController.kt` près de `Screen` (AppController.kt:36).
- `var nightWindow by mutableStateOf<NightWindow?>(null); private set` et `fun chooseWindow(w: NightWindow)` dans `AppController`.
- `suspend fun quote(planId: String, window: NightWindow): ApiClient.QuoteDto` côté API (dépendance). L'app affiche le prix renvoyé et ne calcule rien localement.
- `OrderScreen` (Plans.kt:254): après le récapitulatif (Plans.kt:263-279), insérer `Segmented(NightWindow.entries.map { it.label }, ...)` (Kit.kt:354) puis un `Text` de prix recalculé. Le bouton (Plans.kt:301-309) reste « Payer ».
- `startOrder(plan, window)` (AppController.kt:339) passe la plage à `container.api.createOrder(plan.id, plan.revision, window.code)` (dépendance `net/ApiClient.kt`).

**B. Pop-up de bienvenue au premier lancement (fichiers : `ui/AppController.kt`, `ui/screens/Intro.kt`).**
- Constante `KEY_WELCOME_SEEN = "ui.welcomeSeen"` dans le `companion object` (AppController.kt:538-545).
- Dans `boot()` après `screen = ...` (AppController.kt:197-201) : `if (!seen && screen == Screen.HOME) sheet = "welcome_first"`. Persister `"1"` dans `finishOnboarding()` (AppController.kt:211-214) ou à la fermeture.
- Nouveau cas dans `SheetHost` (Intro.kt:280 pattern) : `"welcome_first"` avec `BlockBtn("Rejoindre le groupe WhatsApp", { c.platform.openUrl(BrandTokens.communityWhatsappUrl) }, icon = Ic.Whatsapp)` et `BlockBtn("Écrire à l'admin", { c.platform.openUrl(BrandTokens.adminWhatsappUrl) }, kind = BtnKind.TINTED, icon = Ic.Whatsapp)`.
- `BrandTokens.adminWhatsappUrl: String` (`brand/BrandTokens.kt`, hors tranche) à ajouter. Les boutons sont masqués si la valeur est vide (même garde que Intro.kt:291).

**C. Jauge de quota à l'accueil (fichiers : `ui/screens/Home.kt`, `net/ApiClient.kt` hors tranche).**
- Côté DTO (hors tranche) : `EntitlementDto` (ApiClient.kt:606-617) reçoit `val dataQuotaBytes: Long? = null` et `val dataUsedBytes: Long = 0`.
- Dans `HomeScreen` (Home.kt:164-176) après `PowerControl` : `QuotaGauge(used, total)` (nouveau composable dans `ui/kit/Kit.kt`, utilise `Meter` Kit.kt:624 et `T`). Ne rien afficher si `dataQuotaBytes == null` (forfait illimité).

**D. Feuille Activité (fichiers : `ui/screens/Home.kt`, `ui/screens/Intro.kt`, `ui/AppController.kt`).**
- Extraire le calcul de débit (Home.kt:94-105) dans une classe `TrafficRates` (fichier `ui/TrafficRates.kt` à créer, ou dans `vpn/ServerBus.kt`, hors tranche) qui expose `val rates: StateFlow<Pair<Double, Double>>`.
- Bouton « Activité » sur l'accueil (ex. à côté de la latence, Home.kt:189-210) qui fait `c.sheet = "activity"`.
- `SheetHost` (Intro.kt:235): nouveau cas `"activity"` avec `Triplet(...)` (Kit.kt:454) pour Réception / Envoi / Latence, `Meter` pour la data restante, et `Icon(Ic.ArrowDown / Ic.ArrowUp)` (Icons.kt).

**E. État « Data épuisée » (fichiers : `ui/screens/Home.kt`, `ui/screens/Intro.kt`, `vpn/TunnelState` hors tranche).**
- Ajouter `TunnelState.QUOTA_EXHAUSTED` (hors tranche) et sa ligne dans le `when` de Home.kt:112-120, par ex. `Quad("Data épuisée", "Recharge pour continuer.", t.danger, t.dangerSoft)`.
- Sheet `"quota"` sur le modèle de `"renew"` (Intro.kt:265-279) : titre « Data épuisée », bouton « Racheter un forfait » (`c.go(Screen.PLANS)`), bouton « Plus tard ».
- Déclenché dans `onPower` (Home.kt:127-137) : `c.sheet = "quota"` quand l'état est `QUOTA_EXHAUSTED`.

**F. Bouton « Demander de l'aide » dans Serveurs (fichier : `ui/screens/Servers.kt`).**
- Après `GroupFooter` (Servers.kt:177-179), ajouter `BlockBtn("Demander de l'aide", { c.platform.openUrl(BrandTokens.adminWhatsappUrl) }, kind = BtnKind.TINTED, icon = Ic.Whatsapp)`.
- Code d'appareil : `c.platform.copy("Code appareil", deviceCode)` puis `c.showToast("Code copié.")` (même schéma que Profile.kt:339). Source du code : dépendance API (`DeviceDto.id`, ApiClient.kt:597, non vérifié).

**G. Connexion WhatsApp et « Mon compte » (fichiers : `ui/screens/Auth.kt`, `ui/screens/Profile.kt`, `ui/AppController.kt`).**
- `Auth.kt`: basculer le champ identifiant entre e-mail et WhatsApp (`Segmented` ou champ unique), et adapter `AppController.authenticate` (AppController.kt:275-318).
- Nouvel écran `Screen.ACCOUNT` (ajout à l'enum AppController.kt:36) avec `ScreenFor` (Shell.kt:218-236) : profil, `FormRow` mot de passe (Kit.kt:223), liste des sessions, thème (réutiliser `SheetHost` `appearance`).
- Flux forcé : `AppController.boot` (AppController.kt:179-209) vérifie un drapeau `me.mustChangePassword` (DTO hors tranche) et ouvre `Screen.ACCOUNT` en plein écran sans bouton retour.

**H. Retour après connexion (fichier : `ui/AppController.kt`).**
- `var pendingAfterAuth: Screen? = null` posé dans `startOrder` quand non connecté (AppController.kt:341), consommé dans `authenticate` (AppController.kt:313) au lieu de HOME.

**I. Nettoyage (fichiers : `MainActivity.kt`, `ui/Shell.kt`).**
- Supprimer `initialHasConfiguration` (Shell.kt:95) et `hasConfiguration` (MainActivity.kt:44, 49, 63).
- Confirmation avant « Se déconnecter » (Profile.kt:203) et « Retirer » un appareil (Profile.kt:302) : `sheet = "confirm"`.

## 6. Bugs et risques

1. **Auto-connexion au démarrage peut ne jamais se déclencher.** `refresh` est un `scope.launch { refreshAll() }` (AppController.kt:195), or `refreshAll` lance à son tour un `scope.launch` (AppController.kt:216-217). `refresh.join()` (AppController.kt:202) ne attend donc pas le réseau. La condition `accessActive` (AppController.kt:203) peut être lue avant que `me` soit chargé. Scénario : réseau lent (> 1,1 s, délai de AppController.kt:196), l'utilisateur payant n'est pas reconnecté. (non vérifié à l'exécution)
2. **Écriture d'état Compose depuis Dispatchers.IO.** `appearance`, `reduceMotion`, `autoConnect`, `favorites`, `preferredServer` sont assignés dans `withContext(Dispatchers.IO)` (AppController.kt:181-188). Le risque de lecture/écriture concurrente existe (non vérifié).
3. **Débit figé.** `rates` (Home.kt:95) ne revient à zéro que si `traffic` devient `null` (Home.kt:97). Si le service cesse d'émettre sans passer à `null`, l'accueil affiche le dernier débit (Home.kt:100-103). (non vérifié, dépend de ServerBus.kt:74)
4. **Paiement sans retour si aucun navigateur.** `openUrl` avale `ActivityNotFoundException` (MainActivity.kt:118-120). Scénario : aucun navigateur, l'écran « Commande créée » (Plans.kt:316-363) n'ouvre rien et ne dit rien.
5. **Destructif sans confirmation.** « Se déconnecter » vide le coffre et coupe le tunnel (AppController.kt:320-335, Profile.kt:203). « Retirer » un appareil est immédiat (Profile.kt:302).
6. **Perte du forfait choisi après connexion.** Voir section 4, « Écarts transverses ». Scénario : utilisateur sans compte choisit un forfait, s'inscrit, et doit re-choisir (AppController.kt:313).
7. **Connexion e-mail seule.** Un utilisateur qui n'a que son numéro WhatsApp ne peut pas se connecter (Auth.kt:62-63, AppController.kt:282).
8. **Pop-up de bienvenue et aide invisibles.** `communityWhatsappUrl` vide (BrandTokens.kt:92) masque les rangées et boutons (Auth.kt:121, Intro.kt:291, Profile.kt:412). Si la valeur n'est jamais injectée au build, la fonctionnalité est morte (non vérifié : mécanisme d'injection hors tranche).
9. **Valeur littérale fragile.** `preferredServer == "auto"` (Profile.kt:159-161) au lieu de `ServerBus.AUTO` (vpn/ServerBus.kt:35). Identique aujourd'hui, pas garanti.
10. **Code mort.** Paramètre `initialHasConfiguration` non utilisé (Shell.kt:95), état `hasConfiguration` calculé puis ignoré (MainActivity.kt:43-49).
11. **Wrapper inutile.** `platform.let { selectInService(configId) }` (AppController.kt:411) : cosmétique.
12. **Police de marque absente.** `Fonts.display = FontFamily.Serif` (Billet.kt:55), le prototype utilise Fraunces (commentaire Billet.kt:54). Écart visuel avec la charte, pas bloquant.

## 7. Dépendances hors tranche

- `net/ApiClient.kt` : `createOrder` avec plage (AppController.kt:344), `EntitlementDto` avec quota (ApiClient.kt:606-617), nouveau endpoint `quote(planId, window)` pour le prix, `DeviceDto.id` comme code d'appareil (ApiClient.kt:597, non vérifié), `me.mustChangePassword` (non vérifié, à créer).
- `vpn/ServerBus.kt` : `traffic` (ServerBus.kt:48-49, 74), `AUTO` (ServerBus.kt:35), candidat pour `TrafficRates`.
- `vpn/TunnelState` (enum, hors tranche) : ajout de `QUOTA_EXHAUSTED` (Home.kt:112-120).
- `brand/BrandTokens.kt` : `communityWhatsappUrl = ""` (BrandTokens.kt:92), `communityTelegramUrl = ""` (BrandTokens.kt:93), `supportUrl` mailto (BrandTokens.kt:74), `memberWord = "NJI"` (BrandTokens.kt:89), `theme` et `accent` (BrandTokens.kt, autour de la ligne 76). À vérifier : mécanisme d'injection du thème au build.
- `offline/`, `config/`, `vpn/VpnTunnelService.kt` : non lus, hors tranche.
- Côté API / dashboard : création automatique du client VLESS au paiement, lecture du trafic côté serveur, gestion des plages nocturnes (points 4 et 9 du plan, hors tranche).

## 8. Non vérifié

- Comportement réel au démarrage (auto-connexion, délai réseau) : lu dans le code, non exécuté. Gradle n'a pas été lancé (consigne).
- Thread-safety des écritures d'état Compose dans `boot()` (AppController.kt:181-188).
- Rendu visuel des écrans, contraste de l'accent surchargé en clair (Billet.kt:82-83 : `accentText = accent`).
- Injection des valeurs de marque au build (`communityWhatsappUrl`, `adminWhatsappUrl`, thème) : mécanisme hors tranche.
- Rôle exact de `DeviceDto.id` comme « code d'appareil » pour l'aide WhatsApp.
- Fréquence d'émission de `ServerBus.traffic` (conditionne le débit affiché, Home.kt:94-105).
- Aucun test UI ni instrumenté n'a été lu : `apps/android/app/src/test` et `androidTest` non inspectés.

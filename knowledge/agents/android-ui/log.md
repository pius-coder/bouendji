# Journal — android-ui

## 2026-10-20T16:51:32Z · Création
- fait: charte créée
- portée: Écrire la couche UI : MainActivity, écrans, 4 identités, états de connexion, minuterie dans le contrôle principal, barre 1+3, clair/sombre. Ne touche ni au socle (vpn/, crypto/, net/, config/), ni aux fichiers Gradle. Le manifeste sera complété par l orchestrateur.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-20T16:56:57Z · Lecture du socle et de la planche

- fait: Lu BrandTokens, TunnelEngine, ApiClient, SingBoxConfig, VpnTunnelService, OfflineBundle, build.gradle.kts, manifeste et Atelier-identites-VPN-v2.html (CSS des 4 identites et etats). Contraste des 28 paires de couleurs calcule (toutes >= 4.5).
- etat: ok
- suite: Ecrire ui/theme, ui/components, ui/screens, MainActivity, res/

## 2026-10-20T19:06:24Z · Crash reseau, etat du travail ecrit

- fait: sous-agent mort (UNKNOWN_CERTIFICATE_VERIFICATION_ERROR) ; ecrit jusqu'a 18:45 : MainActivity.kt, ui/AppState.kt, ui/Support.kt, ui/theme/{Tokens,Motion}.kt, ui/components/{TopBar,PrimaryControl,Surfaces,BrandIcons,SupportAction}.kt, ui/screens/{Home,Account}Screen.kt, res/ ; bloc activity du manifeste non rapporte
- etat: partiel
- suite: inventaire des ecrans manquants, bloc activity, relecture (aucun build possible sans JDK)

## 2026-10-20T19:32:47Z · CLÔTURE
Lot interface clos par orchestrateur apres crash reseau

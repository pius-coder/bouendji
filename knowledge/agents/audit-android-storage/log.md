# Journal — audit-android-storage

## 2026-10-29T19:06:03Z · Création
- fait: charte créée
- portée: Audit en lecture seule de lapp Android, axe : Coffre bundle et persistance chiffree. Ne modifie aucun fichier de code.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-29T19:28:05Z · Lecture des sources du coffre

- fait: Lu en entier OfflineBundle.kt (387 l), ImportInbox.kt (47), SecureStore.kt (152), Hkdf.kt (55), DeviceKeys.kt (254), UsageMeter.kt (90), VpnTunnelService.kt (appels vault + onStartCommand + boucle trafic + scheduleExpiry), AppController.kt (boot/refreshPrivate/logout/importOffline), ApiClient.fetchBundle, SingBoxConfig.build/nodesOf, MainActivity, VpnApplication, AndroidManifest.
- etat: ok
- suite: Confronter D20/D61/D67 au code et chiffrer les defauts

## 2026-10-29T19:31:25Z · Reponse aux 7 questions, chiffrage des defauts

- fait: Etabli: 2 ecritures du coffre (AppController:360, OfflineBundle:292), 4 clear (VpnTunnelService:292/297/609, AppController:471); D67 absent du code (0 occurrence de rightsExpiresAt/nextConfigExpiry); expiresAt client = min des noeuds vs max cote serveur (bundle.ts:127-133); ETag ecrit avant le coffre (ApiClient:387) et jamais force (forgetBundleEtag sans appelant); aucune comparaison de revision; MAX_CONSUMED_IDS=32; 3 commits AES par seconde (UsageMeter.onTotals).
- etat: ok
- suite: Ecrire le rapport et classer P0/P1/P2/P3

## 2026-10-29T19:31:56Z · Rapport ecrit

- fait: notes/audit.md : verdict, reponses Q1-Q7 avec fichier:ligne, 1 P0, 3 P1, 6 P2, 6 P3, recommandations ordonnees, section verifie/incertain, 4 questions ouvertes. Aucun fichier de code modifie.
- etat: ok
- suite: Cloture

## 2026-10-29T19:32:49Z · CLOTURE

- fait: Verdict: chiffrement au repos correct (AES-GCM/Keystore/AAD, Ed25519 avant dechiffrement), cycle de vie faux. P0: expiration d'un noeud vide le coffre et coupe le tunnel (SingBoxConfig:317 + VpnTunnelService:297/609) -> D67 inverse. P1: ETag persiste avant le coffre et ecriture ignoree -> 304 definitif, retrait/revocation jamais propage; aucun controle de revision -> downgrade par .bvpn; toute erreur de dechiffrement supprime l'entree donc l'identite d'appareil en silence. Verifie par lecture seule; non verifie: Keystore/OEM, fournisseur Ed25519, totaux /connections de libbox, ANR. Aucun build, aucun code modifie.
- etat: ok
- suite: Integrer par l'orchestrateur: P0-1 et P1-1 a trancher avant toute correction UI

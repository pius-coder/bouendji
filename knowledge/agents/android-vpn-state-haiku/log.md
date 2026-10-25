# Journal — android-vpn-state-haiku

## 2026-10-25T05:23:55Z · Création
- fait: charte créée
- portée: Corriger : quand aucun serveur n'est actif, l'app affiche « déconnecté » alors que le VpnService reste actif ; il faut appuyer vite plusieurs fois sur le bouton. Le tunnel doit être réellement arrêté (ou l'UI refléter l'état réel), et un appui unique doit suffire. Compiler avec tools/build-apk.ps1.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-25T05:25:20Z · Lecture charte et nœuds

- fait: Charte, AGENTS.md, context/report, nœuds android-toolchain et handoff-2026-10-24 (section Application) lus. Périmètre : vpn/ et ui/AppController.kt.
- etat: ok
- suite: Localiser le chemin 'aucun serveur' et la publication d'état

## 2026-10-25T05:28:32Z · Diagnostic du bug aucun serveur

- fait: Lu VpnTunnelService, TunnelEngine, ServerBus, AppController, LibboxTunnelEngine, LibboxPlatform, MainActivity (toggle), Home.kt (RUNNING, onPower), Shell.kt, SingBoxConfig.build. Cause identifiee : pas de proprietaire unique du cycle de vie ; START pendant un tunnel vivant (NO_CONNECTION absent de la branche stop de MainActivity) ; shutdown publie STOPPED avant l'arret du moteur ; connectInternal non annulable apres engine.start ; onFatal et plan nul publient NO_CONNECTION alors que le tunnel est coupe. Mot Deconnecte absent du code.
- etat: ok
- suite: Ecrire notes/diagnostic.md puis corriger VpnTunnelService.kt (mutex, START idempotent, arret ordonne)
- fichiers: knowledge/agents/android-vpn-state-haiku/notes/diagnostic.md

## 2026-10-25T05:31:15Z · Correction VpnTunnelService

- fait: Reecrit vpn/VpnTunnelService.kt : verrou de cycle de vie (Mutex), START idempotent (sur NO_CONNECTION un appui coupe), requestStop + teardown NonCancellable (moteur puis TUN puis STOPPED), session-id contre rappels obsoletes, onFatal et plan nul publient STOPPED au lieu de NO_CONNECTION. Supprime shutdown/connect/reconnect/stopEngineAsync. Non compile encore.
- etat: partiel
- suite: Compiler tools/build-apk.ps1 et citer la sortie
- fichiers: apps/android/app/src/main/java/cm/bouendji/vpn/vpn/VpnTunnelService.kt

## 2026-10-25T05:32:21Z · Verification compilation

- fait: tools/build-apk.ps1 : tentative 1/10, sortie 'OK APK produit' (app-debug.apk 06:31:54, posterieur a VpnTunnelService.kt 06:30:55 ; classes VpnTunnelService*.class regenerees). adb devices : aucun appareil attache, installation non faite.
- etat: ok
- suite: Test sur Pixel 8 par l'orchestrateur : adb install -r apps/android/app/build/outputs/apk/debug/app-debug.apk, puis couper tous les noeuds et verifier l'etat
- fichiers: apps/android/app/build/outputs/apk/debug/app-debug.apk

## 2026-10-25T05:32:21Z · CLÔTURE
Diagnostic ecrit (notes/diagnostic.md). Cause : cycle de vie sans proprietaire unique ; START sur tunnel vivant en NO_CONNECTION ouvre un second tunnel ; STOPPED publie avant arret moteur ; connexion en vol non annulable ; onFatal et plan nul publient NO_CONNECTION alors que le tunnel est coupe. Correction dans vpn/VpnTunnelService.kt (verrou, START idempotent, NO_CONNECTION coupe, teardown ordonne). Compile : OK APK produit. Non execute sur appareil. Incertain : reproduction du symptome exact, decision produit sur tunnel monte sans sortie, vault.clear au plan nul.

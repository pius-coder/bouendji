# Journal — android-core

## 2026-10-20T15:02:57Z · Création
- fait: charte créée
- portée: Écrire le projet Gradle, le manifeste, le VpnService, le gestionnaire Keystore, le constructeur de configuration sing-box, le client API signé et l import de bundle hors-ligne. L UI Compose est la vague suivante.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-20T15:04:11Z · Lecture des noeuds

- fait: lu android-app, singbox-engine, failover-client, offline-bundle, apps/api/src/lib/auth.ts et crypto.ts
- etat: ok
- suite: verifier routes enrolement/challenge et schema

## 2026-10-20T16:55:40Z · Projet Gradle et manifeste

- fait: settings/build/properties, libs.versions.toml comme seule source de versions (niveaux SDK inclus), app/build.gradle.kts (injection de marque, R8, proguard), AndroidManifest.xml (service VPN BIND_VPN_SERVICE, specialUse, permissions minimales, aucune activite, aucune icone)
- etat: ok
- suite: Keystore et stockage chiffre

## 2026-10-20T16:55:58Z · Keystore et stockage chiffre

- fait: DeviceKeys (alias vpn-sign/vpn-agree, EC P-256, PURPOSE_SIGN/PURPOSE_AGREE_KEY, aucune lecture de cle privee exportable), Hkdf.kt (HKDF-SHA256 absent du JDK), SecureStore (AES-GCM, cle Keystore vpn-store, commit() au lieu de apply(), nom d'entree en AAD)
- etat: ok
- suite: TunnelEngine et configuration sing-box

## 2026-10-20T16:56:04Z · TunnelEngine et configuration sing-box

- fait: interface TunnelEngine a 7 etats, UnavailableTunnelEngine par defaut, placeholder libbox avec TODO(verify against libbox X.Y.Z) non branche ; SingBoxConfig construit le JSON en memoire (tun, selector, urltest si >=2 noeuds, vless par config, clash_api en loopback) ; VpnTunnelService (avant-plan, notification obligatoire, D25, expiration du bundle, START_NOT_STICKY)
- etat: ok
- suite: client API signe

## 2026-10-20T16:56:17Z · Client API signe

- fait: DeviceProof.canonical identique a lib/crypto.ts:114 (METHOD\nPATH\nsha256hex(body)\ntimestamp\nnonce), quatre en-tetes X-Device-*, horloge synchronisee sur Date et serverTime, un seul reessai apres refresh sur 401, chemins ApiPaths recopies des routes reelles
- etat: ok
- suite: bundle hors-ligne

## 2026-10-20T16:56:23Z · Bundle hors-ligne et coffre

- fait: OfflineBundle.import : taille, version de conteneur, appareil, not_after, non-consomme, cle epinglee, Ed25519 sonde a l'execution, dechiffrement ECDH+HKDF+AES-GCM, marquage consomme AVANT ecriture ; ConfigVault stocke le payload chiffre, jamais en clair ; conteneur v1 documente comme proposition (aucune route serveur n'existe)
- etat: partiel
- suite: relecture de coherence
- bloque: format hors-ligne non implemente cote serveur : contrat propose, pas confirme

## 2026-10-20T16:56:34Z · Relecture de coherence (1/2) : references

- fait: tous les imports cm.bouendji.* pointent un fichier existant (brand.BrandTokens, crypto.{DeviceKeys,SecureStore,DeviceEnvelope}, net.{ApiClient,DeviceAuth}, offline.{ConfigVault,OfflineBundle}, config.{SingBoxConfig,BundlePayload,parseInstant}, vpn.{TunnelEngine,UnavailableTunnelEngine}, AppContainer) ; manifeste : .VpnApplication = cm.bouendji.vpn.VpnApplication et .vpn.VpnTunnelService = cm.bouendji.vpn.vpn.VpnTunnelService, les deux presents ; manifestPlaceholders appName defini dans app/build.gradle.kts
- etat: ok
- suite: relecture versions et signature

## 2026-10-20T16:56:52Z · Relecture de coherence (2/2) : corrections

- fait: compileSdk/minSdk/targetSdk deplaces dans libs.versions.toml (plus aucune version en dur dans app/build.gradle.kts) ; POST sans corps envoye en {} et signe comme tel (OkHttp refuse un corps nul, Fastify refuse un application/json vide) ; ACTION_RECONNECT et chemin sans consentement passent en avant-plan avant de pouvoir s'arreter (regle des 5 s) ; activateCurrentDevice passe par le corps nul au lieu de la chaine vide
- etat: ok
- suite: verification signature et secret, puis rapport

## 2026-10-20T16:59:36Z · Rapport et README

- fait: README reecrit : certain (contrats serveur cites fichier:ligne), a verifier au premier build (13 points ordonnes), commande de build exacte, contrat de marque, GPL-3.0 ; ajout de ui/theme (vague UI, hors lot, non relu) ; rapport ecrit dans notes/rapport.md ; 3 defauts corriges pendant la relecture (POST sans corps, ordre avant-plan, niveaux SDK en dur) + activateCurrentDevice
- etat: ok
- suite: cloture

## 2026-10-20T16:59:56Z · CLÔTURE
Socle Android ecrit et RELU, jamais compile (ni JDK, ni SDK, ni Gradle, ni adb). 11 sources Kotlin + Gradle + manifeste + README + rapport. Verifie contre le serveur : forme canonique de preuve, 4 en-tetes, tolierance 120 s, nonce 16-80, chemin sans query, ECDH+HKDF+AES-GCM, ETag/304, 11/11 chemins d'API. Verifie en interne : references du manifeste, imports, versions uniquement dans libs.versions.toml, aucun Log ni ecriture claire, aucune cle privee lisible. 3 defauts reels corriges (POST sans corps envoye en {} et signe ; avant-plan avant arret dans les chemins RECONNECT et sans consentement ; niveaux SDK deplaces au catalogue). Bloque : API 31 exigee par PURPOSE_AGREE_KEY alors que minSdk=26 (decision produit), conteneur de bundle hors-ligne propose sans route serveur. Ouvert : exported/BIND_VPN_SERVICE, foregroundServiceType specialUse vs connectedDevice, GPL-3.0 de libbox, Ed25519 sonde a l'execution. A faire au premier build : gradle wrapper --gradle-version 8.7 puis ./gradlew :app:assembleDebug et :app:lintDebug.

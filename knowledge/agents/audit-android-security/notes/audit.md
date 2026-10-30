# Audit sécurité Android — manifeste, anti-tamper, fuites

Statut : **partiel** (arrêt sur consigne, 2026-10-29). Lecture seule, aucun build,
aucune exécution sur le Pixel 8. Toute affirmation est **relue** (fichier:ligne),
jamais « vérifiée » au sens du dépôt (pas de test exécuté). Les points dépendant
d'un appareil sont marqués (non vérifié).

Périmètre lu : `AndroidManifest.xml`, `crypto/{SecureStore,DeviceKeys,Hkdf}.kt`,
`net/{ApiClient,DeviceAuth,DeepLinkBus}.kt`, `offline/{OfflineBundle,ImportInbox}.kt`,
`brand/BrandTokens.kt`, `app/build.gradle.kts`, `proguard-rules.pro`,
`gradle.properties`, plus lectures croisées indispensables :
`MainActivity.kt`, `VpnApplication.kt`, `ui/AppController.kt`, `ui/Shell.kt`,
`vpn/VpnTunnelService.kt`, `vpn/LibboxTunnelEngine.kt`, `config/SingBoxConfig.kt`.

## Verdict provisoire

La **surface exposée est petite et globalement bien tenue** : une seule activité,
un seul service, aucun provider/receiver/WebView, service VPN protégé par
`BIND_VPN_SERVICE` (système seul), `allowBackup=false`, `usesCleartextTraffic=false`,
pas d'identifiant matériel, clés non exportables. Ce n'est pas là que le bât blesse.

Le défaut structurant est **l'intégrité du bundle en ligne** : le chiffré est
authentifié *par rapport à sa propre clé éphémère*, pas par rapport au serveur.
Un attaquant qui termine le TLS (ou qui rejoue une réponse capturée) peut
imposer une liste, ou bloquer toute mise à jour par un faux `304`. Le fichier
`.bvpn` hors-ligne, lui, est signé Ed25519 : le mécanisme existe déjà et n'est
pas réutilisé.

Deuxième constat : **un client modifié ne peut pas être arrêté côté client**.
Les contre-mesures réelles sont serveur (UUID par appareil, TTL court,
révocation, quota, télémétrie). Le code ne fait aucune vérification d'intégrité
(pas de Play Integrity, `integrityToken` toujours `null`), ce qui est cohérent
avec la distribution hors Play, mais doit être assumé explicitement.

Troisième constat : plusieurs défauts **P1 de robustesse** (réccursion du
refresh, API Clash en clair bloquée par la politique réseau, fuite IPv6,
build debug distribuable) dégraderont l'app en production plus sûrement qu'un
attaquant.

## Défauts

### P1

**P1-1 — Bundle en ligne non signé ; rejeu et faux 304 acceptés.**
`ApiClient.BundleResponse` (`net/ApiClient.kt:783-791`) ne porte que
`revision, issuedAt, expiresAt, configCount, envelope` ; `SealedEnvelopeDto`
(`:772-781`) n'a ni `sig` ni `keyId`. `DeviceEnvelope.open`
(`crypto/DeviceKeys.kt:198-247`) déchiffre avec la clé `vpn-agree` et vérifie un
`digest` transporté dans la même enveloppe : c'est une somme de contrôle
auto-attestée, pas une preuve d'origine. `fetchBundle` (`ApiClient.kt:341-389`)
n'impose aucune monotonie de `revision`, ne vérifie pas `expiresAt` du DTO, et
`AppController.refreshPrivate` (`ui/AppController.kt:357-365`) enregistre tout
payload non vide. Un `304` est cru sur parole (`ApiClient.kt:348`).
Conséquences : un attaquant qui connaît la clé publique `vpn-agree` (capturée à
l'enrôlement) peut sceller sa liste ; sans même cette clé, il peut **rejouer**
une réponse antérieure ou répondre `304` pour empêcher la révocation, jusqu'à
expiration des configs. Preuve que le mécanisme correct existe :
`offline/OfflineBundle.kt:223-238` et `:330-337` (Ed25519 épinglée).

**P1-2 — Récursion infinie du refresh sur 401.**
`ApiClient.authed` (`net/ApiClient.kt:395-419`) appelle `refresh()` sur
`401 UNAUTHENTICATED` ; `refresh()` (`:253-259`) repasse par `authed()` avec
`bearer=null`. Si le refresh token est expiré/révoqué, le serveur renvoie
`401 UNAUTHENTICATED` (`apps/api/src/routes/auth.ts:655,664,676,680,712` ;
`errors.ts:21`), le token est encore stocké, donc `refresh()` se rappelle
immédiatement : récursion sans borne, `clearSession()` n'est atteint qu'après.
Conséquences : après expiration du refresh (ou révocation par un autre
appareil), l'app boucle au lieu de revenir à l'écran de connexion ; `logout()`
(`AppController.kt:465-479`) ne peut plus aboutir, donc le coffre n'est pas
vidé ; rafale de requêtes côté serveur. Dans `refreshAll`, le
`withTimeoutOrNull(4_000)` masque partiellement le problème ; ailleurs
(`checkOrder`, `loadStats`, `logout`) il n'y a aucun garde-fou.

**P1-3 — L'API Clash en clair contredit `usesCleartextTraffic="false"`.**
`LibboxTunnelEngine.clash()` fait `URL("http://127.0.0.1:$clashPort…")`
(`vpn/LibboxTunnelEngine.kt:203`) via `HttpURLConnection`, alors que le
manifeste interdit le clair (`AndroidManifest.xml:38`). `HttpURLConnection`
applique `NetworkSecurityPolicy` ; le README du module le dit lui-même
(`apps/android/README.md:144-145`). (non vérifié sur appareil : certains
OEM/versions exemptent la boucle locale.) Si bloqué, `selectOutbound`,
`measureDelayMs` et `trafficTotals` échouent tous : la supervision conclut
« aucun serveur », l'UI affiche `NO_CONNECTION` alors que le tunnel porte du
trafic, et le compteur reste à zéro. Correctif : `network_security_config.xml`
avec exception `127.0.0.1`/`localhost`, base en clair interdite.

**P1-4 — Fuite IPv6 du tunnel.**
`VpnTunnelService.establishTun` (`vpn/VpnTunnelService.kt:560-573`) n'ajoute
qu'une adresse IPv4 (`172.19.0.1/30`) et une route `0.0.0.0/0` ; aucune adresse
ni route IPv6, et `SingBoxConfig.TunOptions` (`config/SingBoxConfig.kt:124-129`)
est IPv4 seul. Sur un réseau qui annonce IPv6 (Wi-Fi, certains opérateurs), le
trafic IPv6 des applications sort par l'interface physique, hors tunnel. Pour un
VPN vendu comme protecteur de vie privée, c'est un défaut de promesse.
Hors périmètre littéral (fichier non listé), mais directement lié aux questions
transport. (non vérifié sur appareil ; dépend du réseau.)

**P1-5 — Chaîne de distribution non vérifiable dans le dépôt ; build debug
distribuable.**
`app/build.gradle.kts` n'a **aucun** `signingConfigs` (`:27-85`) : `release`
produit un APK non signé, signé hors dépôt. Aucun workflow `.github/**` n'est
présent dans le dépôt (glob vide). Le seul chemin de build local est
`tools/build-apk.ps1:19,32` → `assembleDebug` → `app-debug.apk`, donc
`debuggable=true`, signé avec la clé debug. Si cet APK est celui servi par
`dl.numzer0.store` (à vérifier), `adb run-as`/débogueur donne accès aux données
privées et à la mémoire (donc au bundle déchiffré). Un APK re-signé **ne peut
pas** écraser l'original (contrôle de certificat Android) : il faut désinstaller
→ nouvelle place d'appareil. Mais rien dans l'app n'affiche la version, la
signature ou une mise à jour minimale : `min_version_code` n'est **jamais lu**
(aucune occurrence dans `apps/android`), aucun contrôle de mise à jour.
Risque majeur associé (D102/D128) : **une seule clé de signature pour les 8
marques**, sauvegardée sur le VPS ; sa compromission permet des mises à jour
silencieuses valides pour toutes les marques. (non vérifié : emplacement et
droits de la clé, workflow CI absent du dépôt.)

### P2

**P2-1 — Deep link de paiement non authentifié, et perdu au démarrage à froid.**
`MainActivity.handleDeepLink` (`MainActivity.kt:100-106`) accepte
`cm.bouendji.vpn://pay` depuis n'importe quelle app (activité exportée, filtre
BROWSABLE, `:61-66`) ; `orderId` et `status` sont **ignorés**.
`AppController` réagit en affichant « Paiement vérifié avec succès ! » et en
rafraîchissant (`ui/AppController.kt:248-252`). Un `status=failed` ou un lien
forgé produit donc un faux succès. Le droit n'est pas accordé (le serveur reste
la vérité), mais c'est un vecteur d'ingénierie sociale et de bruit réseau.
De plus `DeepLinkBus` n'a ni `replay` ni abonné au moment de `onCreate`
(`net/DeepLinkBus.kt:7-12`) : **tout retour de paiement au démarrage à froid est
perdu** ; seul `onNewIntent` (app vivante) fonctionne. Le schéma est en dur
`cm.bouendji.vpn` pour les 8 marques, alors que le serveur émet en plus un
`intent://…package=cm.bouendji.nevpn` (`apps/api/src/routes/payments.ts:80-81`,
hors périmètre) qui ne correspond ni à Saitrix ni à Bouendji.

**P2-2 — Lecture de fichier sur le thread principal depuis une activité
exportée.**
`MainActivity.receiveFile` (`:109-121`) appelle `ImportInbox.offer`
(`offline/ImportInbox.kt:24-39`) sur le thread UI ; la lecture va jusqu'à
256 Ko + 1. Un `content://` fourni par une app tierce (ou un `file://` spécial)
qui bloque le flux provoque un ANR, et un ANR suivi de « fermer » peut tuer le
processus, donc le tunnel. Le contenu reste **inutilisable** sans signature
Ed25519 valide, un `deviceId` correspondant et une enveloppe GCM pour la clé de
l'appareil : l'import arbitraire est bien fermé. Le filtre `content://` +
`application/octet-stream` (`AndroidManifest.xml:72-77`) revendique en revanche
**tous** les fichiers binaires, ce qui élargit inutilement la surface et
entraîne l'utilisateur à ouvrir n'importe quoi avec l'app.

**P2-3 — « Déconnexion » qui ne déconnecte pas vraiment.**
`logout` (`ui/AppController.kt:465-479`) vide le coffre mais ne supprime ni
`cache.me`, ni `cache.quota`, ni `offline.pending_reg`
(`KEY_CACHED_ME`, `AuthForm` avec le mot de passe). Au démarrage suivant,
`boot` recharge `cache.me` et pose `signedIn = me != null` (`:220-225,241`) :
l'ancien compte réapparaît (nom, téléphone, forfait) jusqu'au 401 ; et
`syncPendingRegistration` (`:320-339`) peut **recréer une session** avec le mot
de passe conservé, sans action de l'utilisateur. Sur un téléphone partagé,
fuite de données personnelles et session surprise. `SecureStore.wipe()` et
`DeviceAuth.forgetDevice()` ne sont appelés **nulle part**.

**P2-4 — Révocation serveur ignorée par le client.**
`TunnelState.DEVICE_REVOKED` existe (`vpn/TunnelEngine.kt:17-25`) et est rendu
(`ui/screens/Home.kt:125`), mais n'est **jamais publié**. `refreshAll` avale
silencieusement `DEVICE_REVOKED` et `SUBSCRIPTION_REQUIRED`
(`AppController.kt:304-310`). Le tunnel continue avec le coffre en cache
jusqu'à l'expiration de l'enveloppe. La révocation n'a donc d'effet qu'à la
prochaine expiration / rotation d'UUID, pas au moment où l'admin la pose.

**P2-5 — Transport : aucune épingle, et la protection réelle est mal cadrée.**
`ApiClient.defaultHttpClient()` (`net/ApiClient.kt:88-94`) ne configure ni
`CertificatePinner`, ni trust manager, ni `networkSecurityConfig` (aucun
`res/xml/*`). `targetSdk=35` (`gradle/libs.versions.toml:13`) : depuis Android 7,
une **CA utilisateur installée par l'utilisateur n'est pas de confiance par
défaut** ; l'affirmation « CA utilisateur sur appareil rooté » de la revue
précédente est donc imprécise. Le vrai scénario est une **CA système**
(root/Magisk, MDM, OEM, État) : là, sans épingle, le TLS est terminable.
L'épingle coûte cher en rotation (LE 90 j) et reste contournable par patch de
l'APK ; le correctif de fond est la **signature du bundle** (P1-1), pas
l'épingle. À noter aussi : OkHttp suit les redirections par défaut
(`followRedirects`/`followSslRedirects` non désactivés) ; un `307` vers un autre
hôte HTTPS renverrait `Authorization`, `X-Device-Token` et, pour un login, le
mot de passe. Aucune preuve d'exploitation, mais la surface est inutile.

### P3

- **P3-1 — `toString` non masqués.** `BundleConfig` (`:40-41`) et
  `VlessEndpoint` (`:86-88`) masquent bien l'URI/UUID, `PlanNode` (`:146`) masque
  l'hôte. Mais `TunnelPlan` (contient `json` complet avec les UUID),
  `TunnelRequest` (`configJson`, `clashApiSecret`), `SessionResponse`
  (`accessToken`, `refreshToken`) et `AuthForm` (`password`) sont des data
  classes **sans** `toString` : tout log/crash futur les cracherait.
  Aucun de ces objets n'est journalisé aujourd'hui (grep `Log.` négatif).
- **P3-2 — `scrub` partiel.** `VpnTunnelService.scrub` (`:693-695`) n'est
  appliqué qu'en `BuildConfig.DEBUG` (`:322,376`) ; le `detail` publié vers
  `TunnelStateBus` et la notification (`:649-681`) n'est pas scrubé (pas de
  secret observé dans les messages actuels). `LibboxTunnelEngine.writeDebugMessage`
  (`:193-195`) journalise sans garde DEBUG ; `debug=false` dans `SetupOptions`
  (`:163`) réduit mais ne prouve pas le silence.
- **P3-3 — Keystore : pas de StrongBox, pas d'auth utilisateur, pas de
  ré-enrôlement.** `vpn-store` AES-GCM (`crypto/SecureStore.kt:58-72`),
  `vpn-sign`/`vpn-agree` EC P-256 (`DeviceKeys.kt:67-98`), tous en
  `setUserAuthenticationRequired(false)`. Pas de `setIsStrongBoxBacked`, pas de
  `setUnlockedDeviceRequired`, pas d'attestation de clé. Modèle réel : protège
  contre l'extraction hors ligne, la sauvegarde et les autres apps ; **ne protège
  pas** contre un OS rooté/compromis, un client modifié ou une instrumentation
  live. En cas de clé invalidée, `SecureStore` supprime l'entrée (perte
  silencieuse) et `DeviceKeys` lève une `IllegalStateException` que l'UI traduit
  par « Cette version n'est pas encore reliée au service » (`AppController.kt:205`),
  message faux.
- **P3-4 — Conteneur `.bvpn` : champs non signés.** `signedMessage`
  (`OfflineBundle.kt:308-328`) couvre `v`, `bundleId`, `deviceId`, dates,
  `revision` et le digest de l'enveloppe, mais **pas** `envelope.version` ni
  `envelope.digest` ; `envelope.version` n'est jamais vérifié (`:241-262`). Sans
  impact aujourd'hui (GCM), piège pour une v2. `peek()` est du code mort.
- **P3-5 — Pas de `FLAG_SECURE`, pas de `filterTouchesWhenObscured`.** Captures
  d'écran possibles (nom, téléphone, forfait) ; tapjacking non filtré (l'action
  sensible reste l'ouverture du navigateur, pas un débit direct). Aucun
  `PendingIntent`, donc pas de surface de mutabilité.
- **P3-6 — Divers.** `buildToolsVersion` figé, pas de lockfile/checksums Gradle
  (`settings.gradle.kts:9-29`), `libbox.aar` non versionné et sans sha256 dans
  le build (`app/build.gradle.kts:104-117`) : un AAR substitué contrôle le
  tunnel. `proguard-rules.pro:46-50` conserve `SourceFile`/`LineNumberTable` en
  release (choix support, mais aide le reverse). `versionCode`/`packageName`
  injectés sans contrôle croisé avec `BrandTokens.packageName`.

## Ce qui est solide (à ne pas casser)

- Service VPN `exported=true` + `android:permission="BIND_VPN_SERVICE"`
  (`AndroidManifest.xml:104-115`) : seul le système peut le lier/démarrer.
- `allowBackup=false`, `fullBackupContent=false`, `usesCleartextTraffic=false`
  (`:32-38`).
- Aucun `ContentProvider`, `BroadcastReceiver`, `WebView`, `PendingIntent`.
- Aucun identifiant matériel : identité = paire de clés + UUID d'installation
  aléatoire (`DeviceAuth.kt:103-132`).
- Coffre AES-GCM avec AAD = nom de l'entrée (`SecureStore.kt:87-128`) ;
  clair jamais sur disque ; `ConfigVault` chiffré.
- `.bvpn` : taille bornée, JSON strict, `deviceId`, `notAfter`, usage unique,
  signature Ed25519 épinglée, marquage **avant** écriture
  (`OfflineBundle.kt:189-301`).
- Secret de l'API Clash tiré par `SecureRandom` à chaque construction, lié à
  `127.0.0.1` (`SingBoxConfig.kt:194-195,304-312,463-467`).
- Import hors-ligne refusé si la clé de vérification est absente du build
  (fail-closed, `BrandTokens.kt:85-89`).

## Non examiné (à faire dans une passe suivante)

1. L'APK réel `scratch_apk/cm.bouendji.saitrix-1.1.4-6.apk` : `debuggable`,
   certificat de signature, `minSdk/targetSdk`, composants effectifs. Non
   inspecté (temps écoulé).
2. Le workflow CI de build/signature (absent du dépôt) et le stockage de la clé
   de release ; procédure `apksigner` (v2/v3), rotation, sauvegarde.
3. `vpn/LibboxPlatform.kt`, le `.aar` natif `libbox`, le comportement réel de
   `protect()`, du TUN et de l'API Clash sur le Pixel 8.
4. Le reste de l'UI (`Home`, `Servers`, `Plans`, `Profile`, `Auth`) au-delà des
   points cités ; `ui/kit/*`.
5. Le serveur au-delà de `routes/bundle.ts`, `lib/crypto.ts`, `routes/auth.ts`
   (refresh) et `routes/payments.ts:80-81` (liens de retour).
6. La politique exacte d'Android pour le clair en boucle locale, et le niveau
   d'API où `Ed25519` est réellement disponible (le code sonde et refuse
   proprement, mais l'import pourrait être mort sur Android 12).
7. Tests : aucun test Android dans le dépôt ; aucun des défauts ci-dessus n'est
   couvert.

## Recommandations, par efficacité réelle

1. **Signer le bundle en ligne** (Ed25519, clé déjà utilisée pour `.bvpn`) et
   vérifier avant `vault.save` ; couvrir `revision|issuedAt|expiresAt|deviceId|
   sha256(enveloppe)`. Imposer `revision > revision_locale`, refuser un DTO
   expiré. C'est le seul correctif qui survit à un TLS terminé **et** à un APK
   modifié (le mod peut lire, pas forger).
2. **Corriger la récursion du refresh** (garde `refreshing` + `clearSession`
   avant tout nouvel essai) ; c'est un bug de disponibilité et de déconnexion.
3. **Exception NSC pour `127.0.0.1`** ou déplacer l'API Clash sur un transport
   non soumis à la politique ; sinon la supervision est morte en release.
4. **IPv6** : ajouter une adresse/route IPv6 au TUN, ou une route noire, et le
   déclarer dans le contrat de confidentialité.
5. **UUID par appareil + TTL court + révocation** (D69) : la seule vraie
   contre-mesure au mod ; afficher `DEVICE_REVOKED` à l'écran et couper le
   tunnel.
6. **Nettoyer la déconnexion** : `cache.me`, `cache.quota`,
   `offline.pending_reg`, `wipe()`/`forgetDevice()` explicites ; ne jamais
   re-enrôler sans action.
7. **Vérifier l'APK distribué** (release, non debuggable, signé) et **lire
   `min_version_code`** ; refuser côté API une version sous le plancher plutôt
   que d'espérer un client obéissant.
8. **Désactiver les redirections OkHttp** et ajouter une épingle de secours
   (intermédiaire + backup), en sachant que ce n'est qu'une couche.
9. **Sortir le mot de passe du stockage durable** (ne garder qu'un hash local
   ou un jeton d'inscription à usage unique) ; `KEY_PENDING_REGISTRATION`
   contient aujourd'hui le mot de passe chiffré, sans expiration.
10. **Ne pas promettre d'anti-tamper** : documenter que le client est
    contournable et que la sécurité est serveur.

## Incertitudes

- Tous les P1 sont **relus**, pas exécutés : la récursion et le blocage du clair
  sont des déductions de flux, pas des traces.
- La présence d'un `304` forgé et le rejeu supposent un attaquant qui termine le
  TLS ; sans CA système, ce n'est pas le cas par défaut.
- Le niveau d'API Ed25519 et le comportement exact de `NetworkSecurityPolicy`
  sur les OEM camerounais ne sont pas vérifiés.
- La signature et le caractère `debuggable` de l'APK livré ne sont pas vérifiés.

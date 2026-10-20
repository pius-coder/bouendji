# Rapport — `android-core`

**Verdict : socle écrit et relu, jamais compilé.** Aucun fichier n'est passé
devant `kotlinc`, `javac`, `aapt2` ou Gradle : la machine n'a ni JDK, ni SDK
Android, ni Gradle, ni `adb`. Conformément à `AGENTS.md`, ce lot est **relu**,
pas **vérifié**. Ce qui est réellement vérifié ici, ce sont les contrats
serveur (lus dans `apps/api/src`) et la cohérence interne des fichiers entre
eux — pas leur exécution.

Trois défauts réels ont été trouvés en relecture et corrigés (§3). Deux points
restent bloqués par des décisions qui ne m'appartiennent pas (§5, §6).

---

## 1. Vérifié dans le code du serveur (source citée)

| Contrat | Source |
|---|---|
| Forme canonique `METHOD\nPATH\nsha256hex(body)\ntimestamp\nnonce`, méthode en majuscules | `apps/api/src/lib/crypto.ts:114-122` |
| En-têtes lus : `x-device-token`, `x-device-timestamp`, `x-device-nonce`, `x-device-signature` | `apps/api/src/lib/auth.ts:141-152` |
| Horodatage ms, tolérance `±120 000` ms | `lib/auth.ts:157` |
| Nonce 16–80 caractères, unicité en base (`device_nonces`, purge à 10 min) | `lib/auth.ts:160`, `:176-177` |
| `path` = `req.url.split("?")[0]` — donc **jamais** de query dans la chaîne signée | `lib/auth.ts:165` |
| Signature ECDSA-SHA256, DER, base64 ; clé publique SPKI base64 | `lib/crypto.ts:105-107` |
| Enveloppe : ECDH P-256 → HKDF-SHA256(`vpn-bundle-v1\|deviceId\|revision`) → AES-256-GCM, IV 12 o, tag 16 o, digest = sha256(plaintext) | `lib/crypto.ts:138-178` |
| Format d'URI vless (`encryption=none&type=ws&security=tls&sni&fp&alpn&host&path`) | `apps/api/src/lib/vless.ts` |
| `maxSessionSeconds` porté par **chaque** configuration | `routes/bundle.ts:34-37` |
| ETag stable par compte+appareil+révision, 304 possible | `routes/bundle.ts:82-84`, `:187`, `:209-235` |
| Corps d'erreur `{ error: { code, message, details?, retryAfter? } }` | `lib/errors.ts:3-34` |
| Enrôlement : challenge public, puis signature **avec le nonce du challenge** | `routes/devices.ts:98-216` |
| `POST /v1/me/devices/current/activate` et `POST /v1/auth/logout` sans corps | `routes/devices.ts:259`, `routes/auth.ts:287-293` |
| Les 11 chemins de `ApiPaths` existent et sont identiques au caractère près | `routes/{auth,devices,me}.ts`, `routes/bundle.ts:31` |

Test de cohérence des chemins : `ApiPaths` (11 constantes) comparé à la liste
des `app.get/post/delete("/v1/…")` du serveur — **11/11 identiques**.

## 2. Vérifié par relecture interne (les 5 points demandés)

1. **Références du manifeste.** `.VpnApplication` → `cm.bouendji.vpn.VpnApplication`
   (`VpnApplication.kt:1,22`) et `.vpn.VpnTunnelService` →
   `cm.bouendji.vpn.vpn.VpnTunnelService` (`VpnTunnelService.kt:1,51`) existent
   tous les deux. `android:label="${appName}"` correspond bien à
   `manifestPlaceholders["appName"]` défini dans `app/build.gradle.kts:44` —
   un placeholder non défini aurait fait échouer `processDebugManifest`.
2. **Imports internes.** Tous les `import cm.bouendji.*` ont été confrontés aux
   déclarations réelles : `brand.BrandTokens`, `crypto.{DeviceKeys, SecureStore,
   DeviceEnvelope}`, `net.{ApiClient, DeviceAuth}`, `offline.{ConfigVault,
   OfflineBundle}`, `config.{SingBoxConfig, BundlePayload, parseInstant}`,
   `vpn.{TunnelEngine, UnavailableTunnelEngine}`, `AppContainer`. Aucun import
   mort, aucune cible manquante. Les signatures appelées existent et sont
   compatibles : `DeviceKeys.supportsAgreement()` (compagnon),
   `DeviceAuth.proof(method, path, body, nonceOverride)`,
   `DeviceEnvelope.open(keys, deviceId, revision, ephemeralKeyB64, saltB64,
   ivB64, ciphertextB64, tagB64, digestB64)`,
   `SingBoxConfig.build(payload, nowMs, tun, exposeClashApi)` avec
   `TunOptions(address, mtu)`, `TunnelRequest(configJson, tun, protect,
   onFatal, clashApiPort, clashApiSecret)`.
3. **Source unique des versions.** `gradle/libs.versions.toml` porte les
   bibliothèques **et** les niveaux de SDK (`compileSdk`, `minSdk`,
   `targetSdk`) ; `app/build.gradle.kts` ne contient plus aucun littéral de
   version — il lit `libs.versions.*`. La racine (`build.gradle.kts`,
   `settings.gradle.kts`) ne fixe que des `alias(libs.plugins.…)` et
   `RepositoriesMode.FAIL_ON_PROJECT_REPOS`, donc aucun dépôt ni version
   implicite.
4. **Signature et en-têtes.** `DeviceProof.canonical` (`DeviceAuth.kt:42-52`)
   construit exactement `METHOD(uppercase)\nPATH\nsha256hex(body)\ntimestamp\n
   nonce`, dans cet ordre, sans champ ajouté. `ProofHeaders.asHeaders()`
   (`:74`) produit les trois en-têtes de preuve ; `ApiClient` ajoute
   `X-Device-Token` (`:165`, `:359`). Le texte signé est désormais **le texte
   envoyé** : `sendSigned` choisit le corps avant de calculer la preuve. Nonce
   = 16 octets base64url sans padding = 22 caractères, dans la fenêtre 16–80.
   Horloge recalée sur l'en-tête `Date` de chaque réponse et sur `serverTime`,
   ce qui garde la preuve dans `±120 s` même avec une horloge dérivée.
5. **Rien de sensible en clair.** Vérifié par recherche sur tout le module :
   aucun `Log`, aucun `FileOutputStream`, `writeText`, `openFileOutput`,
   `getExternal*`, `println`. Seule lecture de clé : `certificate.publicKey.encoded`
   (`DeviceKeys.kt:124`) — **public** ; la clé privée n'est jamais lue sous
   forme d'octets, seules des poignées (`getKey`, `Signature`, `KeyAgreement`)
   sont utilisées, le fournisseur AndroidKeyStore ne rend pas de matériel
   exportable. Le bundle clair est zéro-rempli après usage
   (`ApiClient.kt:319`, `OfflineBundle.kt:269`). Le `toString()` de
   `BundleConfig` masque l'URI et celui de `VlessEndpoint` masque l'UUID.

## 3. Défauts trouvés en relecture, corrigés

1. **`POST` sans corps partait avec un corps `null`.** OkHttp lève
   `IllegalArgumentException` (« method POST must have a request body ») ; et
   envoyer un `application/json` vide fait échouer le parseur Fastify. Un
   `logout()` ou un `activateCurrentDevice()` aurait planté avant le réseau.
   → `sendSigned` substitue `{}` pour `POST/PUT/PATCH` sans données **et signe
   ce `{}`**, puisque le serveur hache le corps brut reçu. Les `GET`/`DELETE`
   restent sans corps, signés sur `""`.
2. **`ACTION_RECONNECT` et le chemin « consentement absent » pouvaient sortir
   sans passer en avant-plan.** Lancés par `startForegroundService`, ils
   violaient la règle des 5 s (`startForeground` ou `stopSelf` immédiat).
   → promotion en avant-plan **avant** la décision, puis arrêt propre.
   L'ordre inverse était un ANR latent, pas une hypothèse.
3. **Niveaux de SDK écrits en dur** (`compileSdk = 35`, `minSdk = 26`,
   `targetSdk = 35`) alors que la règle est « le catalogue est la seule
   source ». → déplacés dans `[versions]`, lus via `libs.versions.*`.
4. **`activateCurrentDevice()` signait `""` puis n'envoyait rien.** Corrigé par
   le passage au corps nul, qui déclenche la substitution `{}` du point 1.

## 4. Ce qui reste incertain (non vérifiable ici)

- **Toute la compilation.** Le code n'a jamais été lu par un compilateur. Les
  erreurs les plus probables sont nommées dans `apps/android/README.md`
  (`kotlinOptions` déprécié en Kotlin 2.0, `foregroundServiceType` sous
  `minSdk 26`, icône système).
- **Résolution des dépendances.** Toutes les versions du catalogue sont des
  versions qui existent, aucune n'a été résolue par Gradle.
- **Comportement réel AndroidKeyStore.** `KeyAgreement.generateSecret()` doit
  rendre les 32 octets de la coordonnée X, comme `diffieHellman()` côté Node.
  Si le fournisseur rend autre chose, GCM échouera — symptôme net, cause à
  confirmer par un aller-retour serveur → appareil.
- **`libbox`.** Aucune version citée, aucune dépendance déclarée, aucun
  adaptateur branché. `UnavailableTunnelEngine` est le moteur par défaut : le
  service dit « moteur indisponible » au lieu d'afficher « connecté ».
- **Format de bundle hors-ligne.** Le conteneur v1 (`{v, bundleId, deviceId,
  issuedAt, notAfter, revision, envelope, sig}` + Ed25519) est une
  **proposition** : aucune route ni table serveur n'existe (`grep` sur
  `apps/api/src` : rien). Il devra être écrit côté serveur ou remplacé.
- **`Ui/theme/`.** Trois fichiers Compose (`Tokens.kt`, `ColorMath.kt`,
  `BrandTheme.kt`, horodatés 17:57) ont été ajoutés par la vague UI **après**
  ce lot. Ils ne sont pas relus ici et ne font pas partie de mon périmètre ;
  ils consomment `BrandTokens.theme`, qui existe (`BrandTokens.kt:57`).

## 5. Points bloqués (décision extérieure requise)

1. **API 31 contre `minSdk 26`.** `PURPOSE_AGREE_KEY` n'existe qu'à partir
   d'Android 12. Sur Android 8–11, enrôlement et déchiffrement sont **refusés
   explicitement** (`ApiClient.kt:126-135`, `:292-310`,
   `OfflineBundle.kt:257-262`) ; aucun repli ne fait sortir de clé privée du
   Keystore. Trois issues possibles, aucune tranchée : `minSdk = 31`,
   bibliothèque d'accord de clés, ou hypothèse produit « Android 12+ ».
2. **Conteneur de bundle hors-ligne.** Le format est défini, rien ne l'émet.
   Tant que le serveur ne le produit pas, l'import est du code sans données.

## 6. Questions laissées ouvertes (proposées, pas tranchées)

- `android:exported="true"` + `BIND_VPN_SERVICE` sur le service : forme
  documentée, à confirmer sur appareil (WireGuard utilise `false`).
- `foregroundServiceType="specialUse"` : impose une justification en fiche
  Play ; alternative `connectedDevice`. Non tranché.
- Intégrer `libbox` = **GPL-3.0** sur l'APK distribué. Décision juridique, pas
  technique.
- Sonde de latence via `experimental.clash_api` : nom de section et
  comportement de `protect()` à vérifier contre la version de sing-box retenue.
- Ed25519 : `KeyFactory.getInstance("Ed25519")` est **sondé** à l'exécution
  (`OfflineBundle.kt:306`), pas supposé. Si l'import doit marcher sur tout
  Android 12+, il faudra une implémentation embarquée (dépendance non ajoutée,
  version non vérifiée).

## 7. Fichiers écrits

```
apps/android/.gitignore                                      (139 o)
apps/android/brand.properties.example                         (440 o)
apps/android/build.gradle.kts                                 (393 o)
apps/android/gradle.properties                                (478 o)
apps/android/settings.gradle.kts                              (870 o)
apps/android/README.md                                        (relecture + checklist de build)
apps/android/gradle/libs.versions.toml                        (versions + niveaux SDK)
apps/android/app/build.gradle.kts                             (injection de marque, R8)
apps/android/app/proguard-rules.pro                            (45 l.)
apps/android/app/src/main/AndroidManifest.xml                  (63 l.)
apps/android/app/src/main/java/cm/bouendji/vpn/
  VpnApplication.kt                                            (68 l.)
  brand/BrandTokens.kt                                         (114 l.)
  config/SingBoxConfig.kt                                      (352 l.)
  crypto/DeviceKeys.kt                                         (225 l.)
  crypto/Hkdf.kt                                               (49 l.)
  crypto/SecureStore.kt                                        (134 l.)
  net/ApiClient.kt                                             (626 l.)
  net/DeviceAuth.kt                                            (165 l.)
  offline/OfflineBundle.kt                                     (340 l.)
  vpn/TunnelEngine.kt                                          (158 l.)
  vpn/VpnTunnelService.kt                                      (364 l.)
```

Rien n'a été écrit hors de `apps/android/` et de ce dossier d'agent. Aucune
image produite.

## 8. Ordre exact du premier build

```bash
# prérequis : JDK 17, ANDROID_HOME avec platforms;android-35 + build-tools;35.0.0, Gradle 8.7
cd apps/android
gradle wrapper --gradle-version 8.7     # une seule fois (les binaires du wrapper ne sont pas versionnés)
./gradlew :app:assembleDebug
./gradlew :app:lintDebug
```

Aucune de ces commandes n'a été exécutée sur cette machine. Le premier build
servira à confirmer, dans cet ordre : résolution des versions, `kotlinOptions`,
`foregroundServiceType`, liaison du service par le système.

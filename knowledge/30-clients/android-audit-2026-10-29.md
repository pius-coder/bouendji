---
id: android-audit-2026-10-29
title: Audit Android consolidé — 10 axes, P0 et plan de correction
tags: [android, audit, p0, tunnel, bundle, securite, build]
status: reviewed
updated: 2026-10-29
related: [android-state-review-2026-10-29, support-channel-runtime-2026-10-29, flux-serveurs-app, decisions]
---

# Audit Android consolidé — 10 axes

Statut : **reviewed**. Les dix auditeurs ont rendu. Tout est **relu**, rien
n'est exécuté : aucun build,
aucun test sur le Pixel 8, `libbox.aar` absent du dépôt. Les affirmations qui
dépendent d'un comportement runtime sont marquées **(à confirmer)**.

Rapports détaillés : `knowledge/agents/audit-android-{tunnel,engine,net,storage,
ui-state,security,product,perf,build,quality}/notes/audit.md`.

## P0 — à corriger avant toute nouvelle marque

| # | Défaut | Preuve | Conséquence | Confiance |
|---|---|---|---|---|
| 1 | **API Clash bloquée par le cleartext** | `AndroidManifest.xml:38` (`usesCleartextTraffic=false`) + `LibboxTunnelEngine.kt:203` (`http://127.0.0.1`) + aucune config réseau | Chaque sonde, bascule et lecture de trafic échoue. Le tunnel peut être monté alors que l'UI passe en `NO_CONNECTION` ; le bouton ne reflète plus rien. **Explique à lui seul les symptômes rapportés.** | code certain, effet à confirmer par `adb logcat \| grep -i cleartext` |
| 2 | **Fuite IPv6** | `VpnTunnelService.kt:560-573` (aucune route `::/0`), `SingBoxConfig.kt:231` (TUN IPv4 seul) | Le trafic IPv6 sort hors tunnel pendant que l'écran affiche « Protégé ». | code certain |
| 3 | **Expiration d'un nœud = coffre vidé** | `SingBoxConfig.kt:316-317`, `VpnTunnelService.kt:297,609` | Le premier nœud expiré efface toute la liste et coupe la session ; **D67 inversé**. Plusieurs fois par jour avec des nœuds de 4 h. | code certain |
| 4 | **Récursion de refresh** | `ApiClient.kt:253-259` + `:405-415`, serveur `auth.ts:655` | Jeton de refresh mort → boucle 401→refresh→401, session jamais effacée, aucun retour à l'écran de connexion, quota 300/min/IP consommé. | code certain |
| 5 | **Paiement perdu au démarrage à froid** | `MainActivity.kt:38`, `DeepLinkBus.kt:7` (sans replay), `AppController.kt:141,301,504` | L'utilisateur paie, l'app ne le sait jamais : aucune commande persistée, aucun bouton « Vérifier », risque de double paiement. | code certain |
| 6 | **Chaîne d'approvisionnement APK** | `.github/workflows/android-brand.yml:30-32,200-224` ; dépôt public, `master` non protégée | Un push qui touche `tools/brands/*.json` signe avec la clé de prod et écrase `latest.apk` ; même certificat = installation par-dessus l'app légitime. | code + `gh` vérifiés par l'auditeur |
| 7 | **État CONNECTED survivant au tunnel** | `VpnTunnelService.kt:229-236` (`onDestroy` sans STOPPED ni arrêt moteur), `:225-226` | Après destruction du service, l'UI peut continuer d'afficher « Protégé ». | code certain |
| 8 | **Fuite de compte après logout** | `AppController.kt:465-480`, `boot:220-241` | `cache.me`, `cache.quota`, `offline.pending_reg` survivent ; au redémarrage, nom, forfait, quota et appareils du compte précédent réapparaissent. | code certain |
| 9 | **APK de 253 Mo** | `app/build.gradle.kts:82-85` : 239,6 Mo de `.so`, dont 85,5 Mo de `x86_64` inutile | Sur un forfait 1 Go au Cameroun, le téléchargement consomme un quart du crédit data avant la première connexion. Split ABI possible à 81–89 Mo. | taille mesurée par l'auditeur sur l'APK debug local |

## P1 — fonctionnel ou sécurité, lot suivant

- **ETag écrit avant le coffre** : `ApiClient.kt:387` puis `AppController.kt:360` ;
  `save` ignoré, bundle vide non appliqué → `304` définitif, retrait jamais
  propagé. `forgetBundleEtag()` sans appelant.
- **Budget 4 s pour 5 appels séquentiels** (`AppController.kt:282`) : le bundle
  est le dernier ; sur 2G il n'arrive pas et l'erreur affichée est fausse.
- **`minSdk 26` vs enrôlement API 31** (`libs.versions.toml:12`,
  `DeviceKeys.kt:42`) : l'APK s'installe sur Android 8–11 et ne peut jamais
  s'enrôler.
- **`BrandTokens.kt` (Bouendji) ≠ `brand.properties` (Saitrix)** : un build
  local produit un APK Saitrix sur la ligne `apps` de Bouendji.
- **AAR libbox + empreinte dans la même Release `--clobber`** : la vérification
  ne couvre que la corruption, pas la substitution.
- **Deep link de paiement global** `cm.bouendji.vpn://pay` : toute app peut
  l'émettre ; la page de retour est câblée `package=cm.bouendji.nevpn` pour les
  8 marques (`payments.ts:81`).
- **Inscription hors ligne jamais atteinte** : `AppController.kt:432` teste
  `IOException`, or le client enveloppe le réseau en `ApiException(0, NETWORK)`
  (`ApiClient.kt:466-470`).
- **DNS local** : `LibboxPlatform.localDNSTransport()` renvoie `null`
  (`:101`) ; `dns-local` retombe sur le résolveur Go. **Probablement
  fonctionnel via cgo**, mais non conforme au client officiel — à vérifier sur
  appareil, pas un P0.
- **Perte d'interface par défaut** : `LibboxPlatform.kt:209-227`, `onLost`
  d'un réseau non défaut publie `-1` → passage Wi-Fi→4G en `NO_CONNECTION`
  jusqu'à 10 min.
- **Rotation** : `AppController` dans `remember` (`Shell.kt:112`) ; toute
  recréation d'Activity rejoue le splash et perd formulaire, commande, pile.
- **Double commande** : retour « Forfaits » depuis ORDER dépile vers ORDER
  (`Plans.kt:547`), second « Payer » possible.
- **Test de latence bloqué** après rotation (`AppController.kt:601-617`), et
  « Liste mise à jour » affiché hors ligne (`:341-368`).
- **Notification sans action** de déconnexion (`VpnTunnelService.kt:649-669`).
- **Support** : `mailto:` plateforme dans les 8 marques, groupe confondu avec
  support direct (nœud `support-channel-runtime-2026-10-29`).
- **Aucun test Android** (`src/test` vide), aucun lint, aucun handler de crash.

## Ce que les auditeurs ont écarté ou rétrogradé

- Pas de P0 « deux tunnels » : le `Mutex lifecycle` couvre le chemin nominal.
- `localDNSTransport` nul : rétrogradé de P0 à P1 (le résolveur Go/cgo peut
  fonctionner ; le client officiel implémente l'interface pour d'autres raisons).
- Le diagnostic `android-vpn-state-haiku` (2026-10-25) est périmé sur la course
  de deux tunnels ; il reste valable sur l'absence de réconciliation d'état.

## Corrections appliquées le 2026-10-29 (après l'audit)

Compilées et testées, **non rejouées sur appareil** sauf mention :

- P0 #1 cleartext loopback : `res/xml/network_security_config.xml` +
  `android:networkSecurityConfig` ; manifeste fusionné vérifié.
- P0 #2 IPv6 : adresse `fd00:1:fd00:1::1/64` et route `::/0` ; adresse aussi
  dans le TUN de sing-box.
- P0 #3 D67 : plus de `vault.clear()` sur expiration ; rafraîchissement du
  bundle puis reconnexion, distinction droits/nœuds via `vpn.rightsEnd`.
- P0 #4 refresh : `allowRefresh = false` sur la route de refresh.
- P0 #5 paiement : commande persistée (`order.pending`), `DeepLinkBus` en
  `Channel` (démarrage à froid), vérification serveur avant le message.
- P0 #7 état : `onDestroy` publie `STOPPED` et arrête le moteur ;
  réconciliation au démarrage via `VpnTunnelService.alive`.
- P0 #8 logout : purge de `cache.me`, `cache.quota`, `offline.pending_reg`,
  `order.pending`, ETag et fin des droits.
- P0 #9 APK : `abiFilters` arm64 + armv7 ; APK debug 253 → **159,4 Mo**.
- P1 : ETag écrit après `save` seulement ; budget 4 s → 30 s et splash non
  bloquant ; inscription hors ligne (`ApiException.isNetwork`) ; `finally` sur
  le test de latence ; `onLost` d'un réseau non défaut ; écritures d'usage par
  lots (plus 3 `commit()`/s) ; rotation (`configChanges`) ; action
  « Déconnecter » dans la notification ; retour d'écran après paiement ;
  import `.bvpn` hors du thread principal.
- Support : contacts admin via le catalogue, plus de `mailto:` plateforme.

Preuves : `tsc --noEmit` sans sortie ; API 37/37 (admin + r6) ;
`:app:testDebugUnitTest` 8/8 ; `:app:assembleDebug` OK ; `openapi.json`
régénéré.

Non fait : P0 #6 protection de branche/CODEOWNERS (réglage GitHub), signature
du bundle en ligne, épinglage TLS, `minSdk` 31, déploiement API.

## Plan de correction proposé

| Lot | Contenu | P0 couverts | Rebuild 8 APK |
|---|---|---|---|
| 0 | Vérifier sur le Pixel : cleartext loopback, IPv6, tunnel réel | 1, 2 | debug seulement |
| 1 | Vérité du tunnel : network security config loopback, IPv6 `::/0`, STOPPED sur onDestroy, réconciliation `VpnService` | 1, 2, 7 | oui |
| 2 | Coffre et liste : D67, plus de `vault.clear` sur expiration, ETag après `save`, rafraîchissement en fond, budget par appel | 3 | oui |
| 3 | Session et paiement : borner le refresh, persister la commande, deep link avec `orderId` + replay, purge au logout | 4, 5, 8 | oui |
| 4 | Distribution : trigger CI, branche protégée, CODEOWNERS, empreinte AAR épinglée | 6 | non |
| 5 | Build : `BrandTokens` ↔ `brand.properties`, `minSdk` 31 ou repli, versionCode | — | oui |
| 6 | UI : ViewModel/état sauvegardé, garde anti-double commande, `finally` sur les tests | — | oui |
| 7 | Support runtime : profil public + cache (nœud dédié) | — | oui |
| 8 | Tests JVM : config, parseur, coffre, machine à états | — | non |

## Volet performance (auditeur #8)

Estimations, aucun test batterie ni radio réel :

- **~3,2 Mo/h et ~77 Mo/j** de sondes avec 13 nœuds (hypothèse 8 Ko par sonde) :
  un forfait de 1 Go serait consommé en ~13 jours sans navigation. À confronter
  aux mesures réelles avant d'en faire une vérité.
- **3 écritures AES-GCM + 3 `commit()` par seconde** (`UsageMeter.kt:23-33` →
  `SecureStore.kt:87-98`, appelé chaque seconde par `VpnTunnelService.kt:430`) :
  10 800 fsync/h, batterie et usure flash. Ironie : ces écritures n'ont lieu que
  si l'API Clash répond — donc pas tant que le P0 #1 n'est pas corrigé.
- `/connections` chaque seconde ouvre une connexion TCP et parse tout le JSON
  (`LibboxTunnelEngine.kt:129-135`) ; l'API événementielle de libbox existe.
- APK release ~245 Mo, split ABI 81–89 Mo (P0 #9).

## Décisions bloquantes

1. **CI** : supprimer le trigger `push` (tout par l'API, D117) ou le garder
   derrière un Environment à approbation ?
2. **`minSdk`** : 31 assumé, ou repli cryptographique pour 26–30 ?
3. **Cleartext loopback** : autoriser `127.0.0.1` par network security config
   (simple), ou remplacer l'API Clash HTTP par l'API libbox (plus propre, plus
   de travail) ?
4. **Double commande** : bloquer le retour vers ORDER, ou rendre la commande
   idempotente côté API ?

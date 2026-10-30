# Audit stockage Android — coffre, chiffrement au repos, fichier `.bvpn`, compteurs

Statut : **audité par lecture seule**. Aucun build, aucune exécution, aucun
fichier de code modifié. Racine :
`apps/android/app/src/main/java/cm/bouendji/vpn/` (abrégé `vpn/`).

Tout ce qui dépend du Keystore réel, du fournisseur Ed25519, de libbox ou d'un
OEM est marqué **(non vérifié)**.

---

## 1. Verdict

Le **chiffrement au repos est correct** : AES-256-GCM, clé non exportable dans
le Keystore, IV aléatoire imposé par le fournisseur, AAD = nom de la clé, donc
pas d'échange d'entrées possible. Le fichier `.bvpn` est signé Ed25519 avec une
clé épinglée et **vérifié avant tout déchiffrement et toute écriture**.

Ce qui est cassé n'est pas la cryptographie, c'est la **politique de cycle de
vie** :

1. **Un seul nœud qui expire vide tout le coffre et coupe le tunnel**
   (`vpn/VpnTunnelService.kt:292`, `:297`, `:609` ; cause amont :
   `config/SingBoxConfig.kt:317` prend le `min` des expirations). Avec des nœuds
   éphémères de 4 h (D21, D113), c'est un effacement toutes les quelques heures,
   alors que d'autres nœuds restent valides. **D67 est inversé, pas seulement
   ignoré.**
2. **L'ETag est persisté avant l'écriture du coffre, et le résultat de cette
   écriture est ignoré** (`net/ApiClient.kt:387` puis `ui/AppController.kt:360`).
   Un bundle vide, ou une écriture qui échoue, laisse le client en `304` : la
   liste n'est plus jamais retéléchargée tant que la révision du pool ne bouge
   pas. `ApiClient.forgetBundleEtag()` (`:391`) n'a **aucun appelant**, donc même
   « Actualiser la liste » ne débloque pas.
3. **Aucune écriture ne compare les révisions** : `BundlePayload.revision` est
   stocké (`offline/OfflineBundle.kt:287`) et jamais relu. Un `.bvpn` ancien
   encore dans `notAfter` écrase une liste plus récente et peut réintroduire un
   nœud retiré.
4. **Toute erreur de déchiffrement supprime l'entrée, sans le dire**
   (`crypto/SecureStore.kt:123-126`). Comme une seule clé (`vpn-store`) porte
   l'identité d'appareil, les jetons, le coffre et les compteurs, une
   invalidation du Keystore transforme un incident récupérable en **perte
   silencieuse de tout l'état local**, y compris le `deviceId` qui rend le
   `.bvpn` importable.

Sévérité globale : **le produit perd la liste et la session sans explication,
et ne peut pas récupérer seul**. Ce n'est pas une faille de confidentialité.

---

## 2. Réponses aux questions

### Q1 — Cycle de vie du coffre

Un seul emplacement : `ConfigVault` (`offline/OfflineBundle.kt:31-54`), clé
`vault.bundle`, chiffré par `SecureStore`.

**Écritures** (`vault.save`) — deux seulement :

| # | Site | Condition | Écrase une liste valide ? |
|---|---|---|---|
| W1 | `ui/AppController.kt:360` | `refreshPrivate`, `BundleFetch.Fresh`, `me.entitlement.active == true`, **`configs.isNotEmpty()`** | oui (remplacement total) ; ignoré si la liste reçue est vide (D61) |
| W2 | `offline/OfflineBundle.kt:292` | import `.bvpn` : signature OK, `notAfter` futur, `deviceId` local, id non consommé, ≥ 1 config non expirée | oui, **sans comparer les révisions** |

**Effacements** (`vault.clear`) — quatre :

| # | Site | Condition | Détruit une liste encore valide ? |
|---|---|---|---|
| C1 | `vpn/VpnTunnelService.kt:292` | `SingBoxConfig.build()` renvoie `null` : aucune config utilisable (toutes expirées, ou **toutes illisibles**) | oui si le `null` vient d'URI illisibles (§ Q2) |
| C2 | `vpn/VpnTunnelService.kt:297` | à la connexion, `plan.expiresAtMs <= now` | **oui** : `expiresAtMs` = min des nœuds (`SingBoxConfig.kt:317`) |
| C3 | `vpn/VpnTunnelService.kt:609` | `scheduleExpiry` atteint `plan.expiresAtMs` (min des nœuds) | **oui** |
| C4 | `ui/AppController.kt:471` | `logout()` | oui (choix produit, mais la liste hors-ligne survit à la déconnexion chez d'autres clients) |

**Lectures** : `VpnTunnelService.kt:276` (chaque connexion/redémarrage),
`AppController.kt:366` (`hasConfiguration`), `:549` (liste des serveurs), `:595`
(test de latence), `MainActivity.kt:51` (état initial). Aucune lecture en
composition Compose (la seule est dans `withContext(IO)`, `MainActivity.kt:49-52`).

**Le point structurel** : `vault.save` remplace tout et `vault.clear` efface
tout. Il n'existe aucune primitive « retirer les nœuds expirés, garder les
autres ». D'où les deux seuls comportements possibles dans le code : tout
remplacer, ou tout jeter. C'est la cause racine des défauts D1/D2 ci-dessous.

### Q2 — D61 vs D67

**D61** (`decisions.md:380-381`) : « un bundle vide n'écrase pas la liste
locale ». Implémenté littéralement à `AppController.kt:360`. Conséquence non
voulue : **un retrait serveur n'est jamais propagé**, et comme l'ETag est déjà
écrit (`ApiClient.kt:387`), la prochaine requête renvoie `304` : le retrait est
définitif pour cette révision.

**D67** (`decisions.md:395-397`) : « `rightsExpiresAtMs` seule provoque expiré ;
`nextConfigExpiryMs` déclenche un rafraîchissement sans vider le coffre ».
**Aucune des deux notions n'existe côté Android** : recherche
`rightsExpiresAt|nextConfigExpiry|nextConfig|rights` → 0 occurrence dans
`apps/android`. Le client ne dispose que de :

- `EntitlementDto.endsAt` (`net/ApiClient.kt:618`), **jamais utilisé** — seul
  `active` est lu (`ui/AppController.kt:192`, `:357`) ;
- `BundlePayload.expiresAt`, qui vaut côté serveur
  `min(fin des droits, max(expirations des configs))`
  (`apps/api/src/routes/bundle.ts:127-133`) ;
- `BundleConfig.expiresAt` par nœud.

Et `SingBoxConfig.kt:317` écrase tout avec
`expiresAt = min(min(expirations des nœuds), payload.expiresAt)`. Donc :

- **le serveur dit** « ce bundle vit jusqu'à la dernière config » (max) ;
- **le client calcule** « ce bundle meurt à la première config » (min) ;
- **le service efface le coffre** à cette date (`:297`, `:609`).

C'est la contradiction exacte. Elle est amplifiée par le rythme réel : les nœuds
`free-labs` vivent 4 h 30 (D21). Un utilisateur qui ne rouvre pas l'app dans la
fenêtre perd la liste alors que d'autres nœuds du même bundle sont valides.

**Là où D61 et D67 se contredisent dans le code** : D61 exige de *garder* la
liste quand le réseau ne dit rien ; D67 exige de *garder* la liste quand un
nœud expire. Le code garde la liste quand le réseau dit « vide » (W1), et la
jette quand un nœud expire (C2/C3). Les deux règles sont appliquées à l'envers
l'une de l'autre. Il manque la fusion par nœud, pas une règle de plus.

### Q3 — Chiffrement au repos

- **AES-256-GCM**, clé `vpn-store` dans `AndroidKeyStore`
  (`crypto/SecureStore.kt:54-72`), `setRandomizedEncryptionRequired(true)`
  (`:67`), `setUserAuthenticationRequired(false)` (`:68`).
- **IV** : 12 octets, généré par le fournisseur à chaque `init(ENCRYPT_MODE)`,
  relu via `cipher.iv` et préfixé au blob (`:89-94`). Découpe stricte à la
  lecture (`:112-117`), tag 128 bits (`:120`).
- **AAD = nom de la clé** (`:91`, `:121`). Une entrée copiée de `vault.bundle`
  vers `cache.me` échoue au tag et est **supprimée** (destination seulement).
- **Clé invalidée** (effacement des identifiants, réinitialisation, panne TEE) :
  `getBytes` attrape `Exception`, appelle `remove(key)` et renvoie `null`
  (`:123-126`). L'appelant ne distingue pas « jamais écrit » de « perdu ». Toute
  la chaîne est touchée entrée par entrée : `vault.bundle`, `auth.accessToken`,
  `auth.refreshToken`, `auth.deviceId`, `auth.deviceToken`, `bundle.etag`,
  `offline.consumed`, `usage.*`, réglages.
  Conséquence concrète : l'utilisateur est **déconnecté sans message**, et
  `OfflineBundle.import` refuse ensuite avec `NOT_ENROLLED`
  (`offline/OfflineBundle.kt:203-207`) parce que `deviceId()` est vide. Il doit
  se ré-enrôler — ce qui consomme une place d'appareil (`plans.device_limit`,
  défaut 1).
- **Prefs copiées sur un autre appareil** : la clé ne quitte pas le Keystore,
  donc le déchiffrement échoue et les entrées sont supprimées. **Pas de fuite**,
  mais perte silencieuse. `android:allowBackup="false"`
  (`app/src/main/AndroidManifest.xml:32`) empêche le scénario par sauvegarde
  Google ; il faut un accès root/`adb` pour copier le fichier.
- **Entrée déplacée d'une clé à une autre** : AAD différent → tag invalide →
  entrée de destination supprimée, source intacte. Comportement correct.
- **Portée** : la même clé protège des données de sensibilités très différentes.
  Une compromission du processus (appareil rooté) lit tout ; c'est accepté par
  le modèle (clé non authentifiée par l'utilisateur, pour que le tunnel
  fonctionne écran éteint, `crypto/DeviceKeys.kt:76-79`).

### Q4 — Écritures synchrones et thread principal

`SecureStore.putBytes` fait `prefs.edit()...commit()` (`:94`) : **fsync
synchrone** sur le thread appelant. `getBytes` fait un déchiffrement Keystore
sous `synchronized(lock)` (`:104`).

Appels effectivement sur le thread principal :

| Site | Opération | Pourquoi c'est sur le main |
|---|---|---|
| `VpnApplication.kt:43` | `SecureStore` → `KeyStore.load(null)` (`SecureStore.kt:50`) | `Application.onCreate` |
| `VpnApplication.kt:45` | `DeviceKeys` → `KeyStore.load(null)` (`DeviceKeys.kt:49`) | idem, **deuxième** chargement |
| `vpn/VpnTunnelService.kt:178` | `putString` = Keystore + AES + `commit()` | `onStartCommand` (main looper) |
| `ui/AppController.kt:305` | `getString(KEY_PENDING_REGISTRATION)` = déchiffrement | `onFailure` de `refreshAll`, **hors** du `withContext(IO)` |
| `MainActivity.kt:120` → `ImportInbox.offer` | lecture du `ContentResolver` jusqu'à **256 Ko + 1** (`ImportInbox.kt:27`) | `onCreate` / `onNewIntent` |

Ce qui est correct : `connectInternal` lit le coffre sur `Dispatchers.Default`
(`VpnTunnelService.kt:254`, `:276`), `boot()` restaure dans
`withContext(Dispatchers.IO)` (`AppController.kt:213-242`), tous les réglages et
favoris écrivent sur `Dispatchers.IO`, `MainActivity` lit le coffre sur IO.

**Risque d'ANR** :

- pas d'ANR déterministe : un `commit()` isolé coûte quelques ms ;
- mais `SecureStore` est un **singleton** partagé UI/service, et le verrou est
  tenu pendant le Keystore **et** le fsync. Or la boucle de trafic écrit
  **3 fois par seconde** (voir Q7) : `onTotals` fait 3 `get` + 3 `put`, soit
  ~6 opérations Keystore + 3 fsync par seconde, en continu. Le thread principal
  peut attendre ce moniteur à chaque `putString`/`getString`. Sur un TEE lent ou
  bloqué, l'attente n'est plus bornée → ANR possible **(non vérifié)**.
- `Application.onCreate` fait deux `KeyStore.load(null)` avant la première
  frame : démarrage à froid ralenti, StrictMode mécontent. Pas un ANR seul.
- `ImportInbox.offer` lit un flux fourni par une **application tierce** sur le
  thread principal : un `ContentProvider` lent bloque l'UI sans limite. C'est le
  chemin « Ouvrir avec WhatsApp ».

### Q5 — Fichier `.bvpn`

Contrôles réels, dans l'ordre du code (`offline/OfflineBundle.kt:189-301`) :

1. taille (256 Ko, `:118`, `:191`) ;
2. `v == 1` (`:199`) ;
3. `deviceId` local présent (`:203`) puis **égal** au `deviceId` du conteneur
   (`:208`) ;
4. `notAfter > now` (`:212-216`) ;
5. `bundleId` absent de la liste consommée (`:218-221`) ;
6. clé épinglée non vide (`:223`) ;
7. disponibilité du fournisseur Ed25519 (`:232`) puis **signature** (`:236`) ;
8. déchiffrement ECDH+HKDF+AES-GCM, `info = vpn-bundle-v1|deviceId|revision`
   (`:241-262`) ;
9. filtre des configs déjà expirées, refus si aucune (`:273-279`) ;
10. **marquage consommé** (`:282`) ;
11. **écriture du coffre** (`:292`).

Le commentaire `:99-104` annonce « signature → not_after → appareil →
non-consommé → … ». Le code fait l'inverse : **appareil, date et consommation
sont évalués avant la signature**. Aucun déchiffrement ni écriture n'a lieu
avant la vérification, donc pas d'exploit direct ; mais un fichier forgé obtient
des réponses distinctes (`WRONG_DEVICE`, `EXPIRED`, `ALREADY_CONSUMED`) et peut
sonder l'état local. Écart doc/code à corriger dans un sens ou dans l'autre.

**Rejeu** : possible dans la fenêtre `notAfter`, et **après 32 autres imports**
puisque `MAX_CONSUMED_IDS = 32` avec `takeLast(32)` (`:121`, `:353`). La liste
est aussi modifiée en lecture-écriture non atomique (`consumedIds()` puis
`putString`, `:352-356`) : deux imports concurrents peuvent perdre un id. Le
rejeu ne donne aucun privilège nouveau (le fichier est lié à l'appareil et à la
révision) ; il réapplique une liste ancienne. Après réinstallation, `deviceId`
change → `WRONG_DEVICE`, donc le rejeu inter-appareils est fermé.

**Downgrade de révision** : **oui**. Aucune comparaison avec la révision du
coffre avant `vault.save(accepted)` (`:286-292`), alors que
`payload.revision` est disponible et déjà stocké. Même chose en ligne :
`AppController.kt:360` enregistre tout `Fresh` sans regarder
`bundle.revision`, et `BundleFetch.Fresh.revision` (`ApiClient.kt:812`) n'est
lu nulle part. Un `.bvpn` d'hier écrase la liste d'aujourd'hui.

**Consommer puis échouer l'écriture** : oui, par construction (`:282` avant
`:292`). C'est documenté (`:101-104`) et le raisonnement est bon — mieux vaut un
fichier brûlé qu'un fichier réutilisable — mais l'utilisateur reçoit
« Impossible d'enregistrer les configurations » et le fichier est inutilisable :
il doit en redemander un. Aucun rollback de `offline.consumed`.

**Écart D20** : D20 (`decisions.md:70-72`) dit « détruit par l'app après
import ». L'app ne supprime pas le fichier (elle ne peut pas, c'est dit
`OfflineBundle.kt:61-65`), et l'usage unique repose sur une liste locale
plafonnée. C'est un écart assumé mais à écrire dans D20.

### Q6 — Corruption et pertes silencieuses

1. `ConfigVault.read()` renvoie `null` pour trois causes différentes : entrée
   absente, déchiffrement impossible (déjà supprimé), **JSON illisible**
   (`offline/OfflineBundle.kt:45-48`). Dans le troisième cas l'entrée n'est
   **pas** supprimée : chaque lecture rééchoue, pour toujours. L'UI affiche
   « aucun serveur » (`AppController.kt:366` → `hasConfiguration = false`) sans
   jamais nommer la corruption. L'utilisateur ne sait pas qu'il doit réimporter
   ou se reconnecter.
2. `SecureStore.getBytes` supprime sur **n'importe quelle** exception
   (`:123-126`), y compris une erreur transitoire du fournisseur. Une panne d'une
   seconde devient une perte définitive.
3. `putBytes` renvoie `false` en cas d'échec ; **la valeur de retour est ignorée**
   par tous les appelants sauf `OfflineBundle.markConsumed`
   (`:282`) et `OfflineBundle` pour `vault.save` (`:292`). Sont ignorés :
   `AppController.kt:273, 290, 337, 347, 354, 449, 450, 573, 632, 639, 644,
   649, 655, 678, 698`, `UsageMeter.kt:78`, `DeviceAuth.kt:130, 141, 142, 160`,
   `ApiClient.kt:110-113`. Un réglage, un cache ou une inscription en attente
   peuvent donc ne pas être écrits sans que personne ne le sache.
4. `AppController.kt:360` ignore le booléen de `vault.save`, **et** l'ETag est
   déjà persisté (`ApiClient.kt:387`). Écriture ratée = `304` définitif.
5. Le fichier `.bvpn` : `markConsumed` réussi + `vault.save` raté = bundle brûlé
   (assumé). Si l'échec vient du Keystore, **tous** les imports suivants
   échouent aussi et brûlent leur identifiant.
6. File de confirmation `offline.toReport` plafonnée à 16 (`AppController.kt:678`)
   alors que la liste consommée en garde 32 : les plus anciens ne sont jamais
   signalés au serveur. Un `markOfflineConsumed` qui échoue en 4xx reste en file
   et est retenté indéfiniment (`:695-698`).
7. `ApiClient.forgetBundleEtag()` (`:391`) n'a aucun appelant : aucun chemin ne
   force un retéléchargement.

### Q7 — Compteurs d'usage

`UsageMeter` (`vpn/UsageMeter.kt`) persiste dans `SecureStore` :
`usage.day` (date locale), `usage.up`, `usage.down`, `usage.seconds`.

- **Cadence** : `onTotals` est appelé à chaque tick de 1 s
  (`VpnTunnelService.kt:430`, boucle `:416-436`). Chaque appel fait `rollDay()`
  (1 lecture), 3 lectures puis 3 écritures (`:30-32`) → **3 `commit()` par
  seconde**, en plus des déchiffrements. C'est le défaut de performance
  principal du service.
- **Granularité** : les trois clés sont écrites séparément, sans transaction.
  Une coupure entre deux `put` laisse `up`/`down`/`seconds` incohérents.
- **Perte** : `put` renvoie un booléen ignoré (`:78`) ; si l'écriture échoue,
  `lastUp`/`lastDown` avancent quand même (`:28-29`) → le delta est perdu
  définitivement. Si `getString` échoue (clé invalidée), le total repart de 0.
  Au changement de jour, `rollDay` remet à zéro **avant** le flush du tick
  (`:22-23`, `:67-73`) : la dernière minute de la veille peut ne jamais être
  envoyée. Désinstallation/`wipe` = tout perdu.
- **Double comptage** : `resetSession()` remet `lastUp/lastDown` à `-1`
  (`:37-40`) à chaque `startSupervisor` (`VpnTunnelService.kt:415`). Si les
  totaux de `/connections` ne repartent pas de zéro au redémarrage du moteur,
  le premier tick après reconnexion ré-ajoute **tout le cumul** (`:26-27`).
  Le commentaire `:25` affirme qu'ils repartent de zéro : **(non vérifié)**,
  dépend du comportement de l'API Clash de libbox. Si c'est faux, chaque
  reconnexion double le compteur.
- **Côté serveur** : le total du jour est envoyé en valeur absolue et le serveur
  garde le maximum ; un renvoi ne double rien. Deux `flush` concurrents
  (boucle de trafic `:433` et `teardown` `:384`) sont idempotents grâce à ça.
- `seconds` est plafonné à 86 400 (`:55`) ; la date vient du téléphone, donc
  l'utilisateur peut remettre le compteur à zéro (sans gain, le serveur garde le
  max).

---

## 3. Défauts

### P0

**P0-1 — L'expiration d'un nœud vide le coffre et coupe la session.**
`config/SingBoxConfig.kt:317` : `expiresAt = min(min(expirations des nœuds),
payload.expiresAt)`. Puis `vpn/VpnTunnelService.kt:297` (à la connexion) et
`:609` (`scheduleExpiry`) appellent `vault.clear()` à cette date.
Avec des nœuds de 4 h (D21), la liste disparaît à la première mort de nœud,
même si les autres sont valides. Contredit D67. Un utilisateur hors ligne qui
rouvre l'app après 4 h trouve un coffre vide, sans message autre que
« abonnement expiré » alors que son abonnement court toujours.

### P1

**P1-1 — ETag écrit avant le coffre, résultat d'écriture ignoré → 304
définitif.** `net/ApiClient.kt:387` persiste l'ETag, `ui/AppController.kt:360`
écrit ensuite la liste **si elle est non vide**, en ignorant le booléen.
Un bundle vide (retrait), ou une écriture ratée, laisse l'ETag en place ; toute
requête suivante renvoie `304` (`ApiClient.kt:348`) et la liste n'est jamais
récupérée tant que la révision du pool ne change pas. `forgetBundleEtag()` n'est
appelé nulle part (`:391`). Conséquence : une révocation ou un retrait de nœud
n'est **jamais** propagé, et « Actualiser la liste » ne sert à rien.

**P1-2 — Aucun contrôle de révision : downgrade possible.**
`offline/OfflineBundle.kt:286-292` écrit `accepted` sans comparer
`payload.revision` à `vault.read()?.revision` ; `ui/AppController.kt:360` fait de
même pour le bundle en ligne ; `BundlePayload.revision` n'est lu nulle part
(recherche `.revision` : uniquement des écritures). Un `.bvpn` encore valide
mais ancien réintroduit des nœuds supprimés par-dessus une liste plus récente.

**P1-3 — Une erreur de déchiffrement détruit tout l'état local en silence.**
`crypto/SecureStore.kt:123-126` supprime l'entrée sur toute exception, sous une
clé unique (`vpn-store`) qui porte aussi `auth.deviceId` et `auth.deviceToken`.
Après invalidation du Keystore : déconnexion sans message, import `.bvpn`
refusé `NOT_ENROLLED` (`OfflineBundle.kt:203-207`), ré-enrôlement obligatoire
qui consomme une place d'appareil. Aucun diagnostic, aucun écran ne distingue
« perdu » de « jamais présent ».

### P2

**P2-1 — 3 `commit()` chiffrés par seconde + contention avec le thread
principal.** `UsageMeter.onTotals` (`:22-33`) appelé chaque seconde
(`VpnTunnelService.kt:430`) écrit 3 clés séparément ; `SecureStore` tient un
verrou unique pendant le Keystore et le fsync. Le thread principal y accède en
plus par `onStartCommand` (`:178`), `AppController.kt:305` et
`Application.onCreate` (`VpnApplication.kt:43,45`). Usure flash, batterie,
ralentissements ; ANR possible si le TEE bloque **(non vérifié)**.

**P2-2 — Lecture d'un fichier tiers sur le thread principal.**
`MainActivity.kt:120` → `ImportInbox.offer` lit jusqu'à 256 Ko du
`ContentResolver` dans `onCreate`/`onNewIntent`. Un fournisseur lent bloque
l'UI sans limite.

**P2-3 — `read()` confond « vide », « corrompu » et « perdu » ; un JSON
corrompu n'est jamais purgé.** `offline/OfflineBundle.kt:45-48` : l'entrée
illisible reste et rééchoue à chaque lecture ; l'UI dit « aucun serveur »
(`AppController.kt:366`) sans cause.

**P2-4 — Le cache `me` peut être réécrit après `logout()`.** `refreshAll`
enveloppe tout dans `withTimeoutOrNull(4_000)` (`AppController.kt:282`) et
avale `CancellationException` via `runCatching` (`:283`, `:344`, `:349`,
`:350`, `:358`). Un `api.me()` déjà en vol peut écrire `KEY_CACHED_ME`
(`:347`) après que `logout()` a remis `me = null` (`:473`) ; au démarrage
suivant, `signedIn` est reconstruit avec `|| me != null` (`:241`) → l'UI
réaffiche un compte déconnecté. Le coffre, lui, est protégé par
`clearSession()` (jeton absent → 401). **(course non reproduite)**

**P2-5 — `UsageMeter` : pertes et double comptage possibles.**
Écritures non atomiques, booléen ignoré (`:78`), remise à zéro du jour avant
flush (`:67-73`), et `resetSession()` (`:415`) qui ré-ajoute le cumul entier si
les totaux Clash ne repartent pas de zéro **(non vérifié)**.

**P2-6 — Rejeu `.bvpn` après 32 imports.** `MAX_CONSUMED_IDS = 32` avec
`takeLast` (`:121`, `:353`) et lecture-écriture non atomique ; D20 promet un
usage unique. Sans gravité (fichier lié à l'appareil et à la révision), mais
la promesse est plus forte que le code.

### P3

- `SecureStore.wipe()` (`:75`), `DeviceKeys.deleteAll()` (`:108`),
  `DeviceAuth.forgetDevice()` (`:145`), `ConfigVault` sans appelant de `peek()`
  (`OfflineBundle.kt:374`), `SecureStore.contains()` (`:130`) : **aucun
  appelant**. Pas de chemin « réinitialiser l'identité » dans l'app.
- `OfflineBundle.peek()` ne vérifie **ni la signature, ni l'appareil**
  (`:374-386`) ; c'est documenté, mais c'est un piège si l'UI s'en sert un jour
  pour autoriser un import.
- Le commentaire d'ordre des contrôles (`:99-104`) ne correspond pas au code
  (signature en 6e position, pas en 1re).
- `BundleConfig.startsAt` n'est pas filtré par `usableConfigs`
  (`SingBoxConfig.kt:391-397`) : un nœud « nuit » est utilisable en journée.
  Déjà signalé par `android-state-review-2026-10-29` §C.7 ; vaut aussi pour le
  `.bvpn` (`OfflineBundle.kt:273-275`).
- La note `audit-android-core-haiku` annonce « ImportInbox, borne 1 Mo »
  (ligne 31) : c'est **256 Ko** (`OfflineBundle.kt:118`), à corriger.
- `UsageMeter.today()` peut étiqueter les compteurs d'hier avec la date du jour
  si `usage.day` a été perdu mais pas les compteurs (`:49-56`).

---

## 4. Recommandations (ordonnées)

1. **Séparer les deux échéances** dans `TunnelPlan` : `rightsEndsAtMs` (fin des
   droits, seule à provoquer « expiré ») et `nextConfigExpiryMs` (plus proche
   expiration de nœud, qui déclenche un `refreshPrivate()`). Supprimer
   `vault.clear()` de `:292`, `:297` et `:609` ; laisser `usableConfigs` filtrer
   les nœuds morts. `vault.clear()` ne doit rester que sur `logout` (et encore,
   le rendre optionnel).
2. **Écrire l'ETag après le coffre, pas avant** : déplacer
   `store.putString(KEY_BUNDLE_ETAG, …)` hors de `fetchBundle`, ne le faire
   qu'après un `vault.save` réussi ; effacer l'ETag si la liste est vide ou si
   l'écriture échoue. Câbler `forgetBundleEtag()` sur « Actualiser la liste ».
3. **Refuser un downgrade** : comparer `payload.revision` à la révision stockée
   sur les deux chemins (W1, W2) ; conserver `lastAppliedRevision` même quand la
   liste est vide, pour pouvoir appliquer un retrait sans effacer.
4. **Rendre les échecs observables** : `SecureStore.getBytes` ne doit pas
   supprimer à la première erreur — retenter une fois, puis mettre de côté
   (`<clé>.lost`) et exposer un état « coffre illisible » à l'UI. `ConfigVault.read`
   doit distinguer absent / corrompu / déchiffré. Vérifier le booléen de
   `vault.save` et de chaque `putString` critique (`deviceId`, jetons, pending
   registration).
5. **Sortir les compteurs du chemin chaud** : garder `up/down/seconds` en
   mémoire, persister toutes les 30–60 s et à `teardown`, en une seule entrée
   (petit JSON) avec `apply()` ; garder `commit()` uniquement pour
   `offline.consumed`.
6. **Retirer `putString` de `onStartCommand`** (`:178`) : `selectServer` écrit
   déjà la préférence sur IO (`AppController.kt:573`) ; le service peut lire
   l'extra de l'Intent.
7. **Lire le `.bvpn` hors du thread principal** : `ImportInbox.offer` doit
   recevoir l'`Uri` et lire dans une coroutine, pas dans `onCreate`.
8. **Augmenter/atomiciser la liste consommée** et documenter que le `deviceId`
   est la vraie barrière ; aligner la file de rapport (16) sur 32.
9. **Tests JVM** : expiration d'un nœud ne vide pas le coffre ; bundle vide ne
   vide pas et n'empoisonne pas l'ETag ; révision inférieure refusée ; plafond
   des ids consommés ; delta d'usage après redémarrage moteur.

---

## 5. Vérifié / incertain

**Vérifié par lecture** (fichier:ligne cités ci-dessus) : ordre des contrôles
`.bvpn`, absence de comparaison de révision, absence totale des champs D67,
`min` des expirations, `vault.clear()` aux quatre sites, ETag avant écriture,
`commit()` dans `putBytes`, suppression sur erreur de déchiffrement, cadence de
`UsageMeter`, appels stockage sur le thread principal listés en Q4,
`allowBackup=false`.

**Incertain (dépend d'Android réel / libbox)** :

- comportement exact du Keystore à l'invalidation et sur les OEM (délai d'un
  `commit()`, invalidation par changement d'écran de verrouillage) ;
- disponibilité du fournisseur `Ed25519` selon la version d'Android
  (`OfflineBundle.kt:306`) ;
- nature des totaux `/connections` de libbox (cumulés depuis le démarrage du
  moteur ou depuis le démarrage du processus) — conditionne le double comptage
  de P2-5 ;
- existence réelle d'un ANR (aucune mesure) ;
- course `refreshAll`/`logout` (P2-4) : déduite du code, non reproduite ;
- comportement du serveur sur `markOfflineConsumed` en 4xx (hors tranche).

**Non vérifié** veut dire : relu, jamais exécuté. Aucun build n'a été lancé.

## 6. Questions ouvertes

1. D61 doit-il continuer à ignorer un bundle vide, ou faut-il accepter un
   retrait explicite (avec un champ `configs: []` signé côté serveur) ?
2. Le `.bvpn` doit-il porter une révision minimale et être refusé si elle est
   inférieure à la liste locale ?
3. Que doit faire l'app quand le Keystore est invalidé : se ré-enrôler
   automatiquement (consomme une place) ou afficher un écran de récupération ?
4. Le compteur d'usage doit-il être persisté à chaque tick (choix actuel) ou
   par lot, avec une perte maximale assumée de 60 s ?

# Audit #5 — État Compose, navigation et tenue de session UI

**Périmètre** : `ui/AppController.kt`, `ui/Shell.kt`, `MainActivity.kt`, `ui/screens/*.kt`,
usage d'état de `ui/kit/*.kt`, `AndroidManifest.xml` (configChanges, launchMode).
**Mode** : lecture seule. Aucun build, aucune exécution sur le Pixel 8.
**Statut des affirmations** : *relu* (fichier:ligne) ; les comportements de framework
(rotation, `rememberCoroutineScope`, `SharedFlow`, snapshot Compose) sont documentés
mais **non reproduits ici**. Les contrastes sont **calculés** à partir des couleurs de
`ui/theme/Billet.kt`, pas mesurés à l'écran.
**Rapport précédent** : `knowledge/agents/audit-android-ui-haiku/notes/audit.md`
(ci-après « audit #4 »). Ce rapport ne répète pas son inventaire : il prolonge ses
points F/6.1/6.2 (rotation, écritures IO) et ajoute ce qu'il n'avait pas vu —
cycle de session après logout, sémantique du deep link de paiement, commande
dupliquée, test de latence bloqué, retour mort, erreurs globales périmées.

---

## Verdict

L'UI est cohérente visuellement et les écrans sont branchés sur de vraies données,
mais la **tenue d'état est celle d'un prototype** :

1. **Aucun propriétaire d'état survivant à l'Activity.** `AppController` vit dans un
   `remember` (`Shell.kt:112-135`) avec `rememberCoroutineScope` (`:108`) ; `screen`,
   `stack`, formulaire, commande, feuille et sélection sont des `mutableStateOf`
   nus. Toute recréation d'Activity (rotation, thème système en `AUTO`, changement de
   langue/police, « ne pas conserver les activités ») détruit tout et rejoue un
   splash d'au moins 1,1 s (`AppController.kt:211-262`). Les opérations en vol
   (inscription, commande, test de latence) sont annulées avec la composition.
2. **La session n'est pas proprement terminée.** `logout()` (`AppController.kt:465-480`)
   n'efface ni `cache.me`, ni `cache.quota`, ni `offline.pending_reg`, ni les
   préférences de serveur. `boot()` déduit `signedIn` de `me != null` (`:241`), donc
   un démarrage à froid après déconnexion peut afficher le nom, le forfait, le quota
   et les appareils du compte précédent. En outre, `offline.pending_reg` est remis à
   `""` après synchronisation (`:337`) et le test 401 exige `== null` (`:305`) :
   **après une inscription hors ligne, l'auto-déconnexion sur 401 ne se produit plus
   jamais**.
3. **Le retour de paiement n'est pas fiable.** L'intent est émis dans `onCreate`
   (`MainActivity.kt:38`) avant l'enregistrement du collecteur
   (`AppController.kt:247`) ; `DeepLinkBus` est un `SharedFlow` sans replay
   (`DeepLinkBus.kt:7`) : à froid, l'événement est perdu. Le collecteur **ignore
   l'`orderId`** et affiche toujours « Paiement vérifié avec succès ! » (`:247-253`),
   alors que `refreshAll(refreshOrder = true)` ne peut vérifier que l'`order` encore
   en mémoire (`:301`). Toute application peut lancer
   `cm.bouendji.vpn://pay` (activité exportée, `AndroidManifest.xml:60-66`) et
   produire ce message.
4. **La navigation a une impasse et une boucle de commande.** Sur Forfaits ouvert
   déconnecté, « Retour » appelle `back()` qui renvoie `false` ; le `NavBar`
   ignore le résultat (`Plans.kt:112`, `AppController.kt:106-120`) : **bouton mort**.
   Le retour système, lui, met l'app en arrière-plan (`Shell.kt:150-152`). Depuis
   « Commande créée », le retour étiqueté « Forfaits » dépile vers l'écran Commande
   (`Plans.kt:547`), d'où un second « Payer » possible : **deux commandes**.
5. **Le rafraîchissement n'a ni propriétaire ni résultat.** `refreshAll` et
   `refreshServers` se lancent sans mutex (`:277-318`, `:559-568`) ; `busy` est un
   booléen global ; `refreshPrivate` avale toutes les erreurs réseau (`:341-368`)
   donc « Liste des serveurs mise à jour. » s'affiche même hors ligne ; aucun écran
   Home/Servers ne rend `c.error`.
6. **Un test de latence interrompu peut bloquer son propre bouton.** `testLatency`
   marque les nœuds `TESTING` dans `ServerBus` sans `finally`
   (`AppController.kt:601-617`) ; une rotation annule la coroutine et laisse ces
   états dans le singleton (`ServerBus.kt:57-64`). `Servers` déduit `testing` de ces
   états et désactive « Tester » (`Servers.kt:82,117-126`, `Kit.kt:326`) : plus aucun
   test direct n'est lançable depuis Serveurs ; seule une sonde du service (Home
   connecté) ou un redémarrage du processus peut effacer l'état.

Aucun **P0** n'est démontré par lecture (pas de crash ni de corruption de données
prouvés). Les six défauts ci-dessus sont **P1** : ils cassent un parcours utilisateur
réel ou exposent les données d'un autre compte.

---

## 1. Où vit l'état (Q1)

### 1.1 Propriétaires actuels

| État | Propriétaire | Rotation / recréation | Mort du processus |
|---|---|---|---|
| `screen`, `stack`, `forward` | `AppController` (`:91-95`) | **perdu** → splash puis HOME/AUTH/ONBOARDING | perdu |
| `authForm` (dont mot de passe) | `AppController` (`:150`) | **perdu** | perdu |
| `selectedPlanId`, `customGb`, `customDays`, `nightWindow` | `AppController` (`:140,170-172`) | **perdu** | perdu |
| `order` (`OrderDto`, `orderId`, checkout) | `AppController` (`:141`) | **perdu** | perdu |
| `me`, `plans`, `quota` | `AppController` + `cache.me/plans/quota` | restaurés du coffre | restaurés du coffre |
| `devices`, `stats`, `referral` | `AppController` (`:136-138`) | perdus ; rechargés au boot | perdus |
| `busy`, `syncing`, `error`, `toast` | `AppController` (`:146-149`) | perdus | perdus |
| `sheet`, `importMessage`, `importOk` | `AppController` (`:153-157`) | **perdus** | perdus |
| `appearance`, `reduceMotion`, `autoConnect`, `dnsProtection`, `favorites`, `preferredServer` | `AppController` + `SecureStore` (`:159-164`) | restaurés (asynchrones) | restaurés |
| `servers`, `active`, `notice`, `traffic`, `rates`, probes | `ServerBus` (objet) | **survit** | perdu, reconstruit depuis le coffre |
| `state`, `detail`, `since` du tunnel | `TunnelStateBus` (objet) | **survit** | perdu |
| Octets `.bvpn` en attente | `ImportInbox` (objet) | survit | perdu |
| Événement de retour paiement | `DeepLinkBus` (`SharedFlow`) | **survit seulement s'il a un collecteur au moment de l'émission** | perdu |
| Scroll, `query`, `filter`, `tierIndex`, FAQ ouverte | `rememberScrollState` / `rememberSaveable` locaux (`Shell.kt:294`, `Servers.kt:79-80`, `Plans.kt:120`, `Profile.kt:370`) | en pratique perdus : l'écran n'est pas restauré (retour à SPLASH) | perdus |
| `engineAvailable`, `hasConfiguration` locaux | `MainActivity` (`:45-53`) | recalculés | recalculés |
| Jobs réseau | `rememberCoroutineScope` (`Shell.kt:108`) | **annulés** | annulés |

### 1.2 Ce que fait exactement `boot()` (`AppController.kt:211-270`)

1. `withContext(Dispatchers.IO)` : lecture du Keystore/SharedPreferences chiffré
   (`:213-242`) — apparence, mouvement réduit, auto-connexion, DNS, favoris,
   serveur préféré, `cache.me`, `cache.plans`, `cache.quota`, puis
   `hasSession() || me != null` (`:241`).
2. `signedIn = restored.second` (`:243`), puis enregistrement des collecteurs
   `ImportInbox` (`:245`) et `DeepLinkBus` (`:247-253`).
3. `syncServersFromVault()` (`:254`), lancement de `refreshAll()` (`:256`).
4. `delay(1_100)` (`:257`) — **après** le bloc IO, donc le splash dure le temps du
   Keystore + 1,1 s.
5. `screen = ONBOARDING | AUTH | HOME` (`:258-262`) — **toujours** l'un de ces trois,
   jamais l'écran où l'utilisateur était.
6. `refresh.join()` (`:263`) : **n'attend rien**, car `refreshAll` relance un
   `scope.launch` (`:278`) ; `refresh` ne contient que ce lancement.
7. Auto-connexion (`:264-268`) : si `hasConfiguration` est encore `false` (il n'est
   initialisé qu'à `:366`, dans `refreshPrivate`), la condition échoue.

### 1.3 Conséquences par événement

- **Rotation** : nouvelle Activity (aucun `android:configChanges`,
  `AndroidManifest.xml:50-55`) → nouveau `AppController` → splash → HOME/AUTH. Un
  formulaire d'inscription rempli, un forfait choisi, une feuille ouverte, une
  commande en cours : tout est perdu. Une inscription ou un paiement en vol est
  annulé (`rememberCoroutineScope`), alors que le serveur a peut-être déjà créé le
  compte/la commande.
- **Changement de thème système avec `Appearance.AUTO`** : `uiMode` est un
  changement de configuration ; l'Activity est recréée → même perte. `Appearance`
  est restauré du store, mais l'écran ne l'est pas.
- **Retour depuis les réglages Android** : l'Activity n'est pas recréée si seul le
  focus change, mais **rien ne recharge l'état** : pas de `onResume`, pas de
  `Lifecycle`/`repeatOnLifecycle`, pas de `collectAsStateWithLifecycle` (recherche
  sans résultat dans le module). D129 dit « au lancement, au retour au premier plan
  et à l'ouverture de Serveurs » : le retour au premier plan **n'est pas implémenté**.
  Après un changement de thème dans les réglages, la recréation s'applique en
  revanche et ramène au splash.
- **Mort du processus** : `cache.me/quota` sont restaurés, `order` et l'événement de
  paiement ne le sont pas. C'est le scénario le plus dommageable pour l'achat.

### 1.4 Ce qu'il faudrait sauvegarder

| À sauvegarder | Où | Pourquoi |
|---|---|---|
| `screen` + `stack` (+ `forward`) | `ViewModel` + `SavedStateHandle`, ou `rememberSaveable` avec `Saver` | revenir sur l'écran courant, pas au splash |
| `authForm` **sans le mot de passe** | `SavedStateHandle` (jamais le mot de passe dans le Bundle) ; mot de passe dans `SecureStore` uniquement si un flux hors-ligne l'exige | ne pas perdre 4 champs saisis |
| `selectedPlanId`, `customGb`, `customDays`, `nightWindow` | `SavedStateHandle` | le forfait choisi et le prix affiché |
| `orderId` + URL de checkout | `SecureStore`, pas le Bundle | survivre à la mort du processus et au retour navigateur |
| `sheet` + son contexte | `SavedStateHandle` | ne pas perdre une feuille ouverte |
| `query`, `filter`, `tierIndex`, FAQ ouverte | `rememberSaveable` **avec un `SaveableStateHolder` par écran** | survivre au changement d'onglet et à la rotation |
| scroll | `rememberScrollState` est déjà saveable ; il faut surtout que l'écran soit restauré | sinon le scroll repart à zéro |
| `error` / `toast` | **ne pas** les sauvegarder : ce sont des événements, pas un état | éviter de réafficher une erreur périmée |

Le **mot de passe** ne doit pas aller dans `SavedStateHandle` (Bundle susceptible
d'être écrit sur disque par le système). Le formulaire en cours peut être sauvegardé
sans lui ; si D137 exige de recréer le compte hors ligne, le mot de passe doit rester
dans `SecureStore` et être effacé après succès.

---

## 2. Écritures d'état Compose depuis `Dispatchers.IO` (Q2)

### 2.1 Champs réellement écrits hors du thread principal

| Champ | Ligne | Contexte |
|---|---|---|
| `appearance` | `AppController.kt:214` | `boot`, `withContext(IO)` |
| `reduceMotion` | `:215` | idem |
| `autoConnect` | `:216` | idem |
| `dnsProtection` | `:217` | idem |
| `favorites` | `:218` | idem |
| `preferredServer` | `:219` | idem |
| `me` | `:224` | idem, puis `:346` dans `refreshPrivate` appelé sous IO |
| `plans` | `:233`, puis `:289` | idem |
| `quota` | `:239`, puis `:352` | idem |
| `devices` | `:349`, `:535` | `refreshPrivate` / `revoke`, sous IO |
| `hasConfiguration` | `:366` | `refreshPrivate`, sous IO |
| `engineAvailable`, `hasConfiguration` (locaux) | `MainActivity.kt:50-51` | `LaunchedEffect(Unit)`, sous IO |

`refreshAll` appelle `refreshPrivate` **à l'intérieur** du `withContext(IO)` (`:284-303`) ;
`refreshServers` et `checkOrder` font de même (`:563`, `:512`). Ce n'est donc pas un
accident localisé à `boot`.

### 2.2 Risques réels

- **Pas de crash de snapshot démontrable.** Les écritures de `mutableStateOf` depuis
  un thread quelconque passent par le snapshot global, qui est thread-safe. Il n'y a
  pas ici d'écriture *pendant* la composition (elles sont dans des coroutines), donc
  pas de « read-only snapshot ». Le problème n'est pas la sûreté mémoire.
- **Mises à jour non atomiques.** Chaque champ est un snapshot séparé. Une
  recomposition peut observer `me` restauré avec `signedIn` encore faux, ou
  l'apparence changer au milieu du splash. Aujourd'hui l'écran est SPLASH pendant la
  restauration, ce qui masque la plupart des transitions ; ce n'est pas une garantie
  de conception.
- **Mises à jour perdues par concurrence.** `boot` (IO) et `toggleFavorite` /
  `selectServer` (Main) écrivent `favorites` / `preferredServer` sans génération ni
  verrou : la restauration peut écraser un geste utilisateur, ou l'inverse.
  `me`/`quota` sont écrits par `refreshAll` **et** `refreshServers` **et**
  `checkOrder` ; deux réponses peuvent arriver dans le désordre (pas de numéro de
  requête) et la plus ancienne gagne.
- **Ressurrection après `logout`.** `logout` (`:465-480`) ne cancel pas les jobs en
  vol. Un `refreshPrivate` démarré avant peut écrire `me` (`:346`) et `quota`
  (`:352`) **après** la déconnexion. Au prochain `boot`, `me != null` suffit à
  remettre `signedIn = true` (`:241`).
- **Annulation = état partiel.** À la rotation, le scope est annulé au milieu d'un
  `refreshPrivate` ou d'un `testLatency` ; les champs déjà écrits restent (dans
  `ServerBus` pour les probes), les suivants non. C'est la cause du bouton
  « Tester » bloqué (§6).
- **Ordre de `boot`** : `me` est écrit avant `signedIn`, ce qui est le bon ordre ;
  mais `screen` est écrit 1,1 s plus tard, et `refreshAll` peut avoir déjà mis
  `screen = AUTH` sur 401 (`:307`) — `boot` écrase ensuite par `AUTH`/`HOME` selon
  `signedIn`. Pas de crash, mais la navigation de démarrage n'est pas déterministe.

### 2.3 Ce qui n'est pas le problème

Les lectures/écritures du `SecureStore` sont bien sur IO (`SecureStore` fait un
`commit()` synchrone et un déchiffrement AES ; `:84-123`) : les déplacer sur le main
serait pire. Le défaut est l'**assignation des champs Compose** dans ce même bloc, pas
l'accès disque.

**Recommandation** : calculer sur IO, puis assigner sur `Dispatchers.Main` (ou exposer
un unique `StateFlow<UiState>` immuable, mis à jour atomiquement). Si plusieurs champs
doivent changer ensemble, utiliser `Snapshot.withMutableSnapshot { ... }`.

---

## 3. Navigation (Q3)

### 3.1 Modèle actuel

- `go(next)` (`AppController.kt:97-103`) : si `next` est un onglet (`TABS`, `:41`),
  **vide toute la pile** ; sinon empile l'écran courant. Puis `onEnter(next)`.
- `back()` (`:106-120`) : ferme d'abord la feuille ; sinon dépile ; sinon, si
  `screen != HOME && signedIn`, va à HOME ; sinon renvoie `false`.
- `Shell` (`:150-152`) : `if (!back()) moveTaskToBack(true)` — le retour système ne
  termine pas l'activité, il met la tâche en arrière-plan.
- `NavBar` (`Kit.kt:523-541`) appelle directement `c.back()` et **ignore le booléen**
  (`Plans.kt:112`, `:475`, `:547`, `Profile.kt:145`, etc.).
- Onglets : `TabBar` visible seulement si `signedIn && screen in TABS`
  (`Shell.kt:173-179`) ; un onglet actif ne se re-sélectionne pas (`go` renvoie tôt).
- Feuilles : `sheet` global (`Shell.kt:205`, `SheetHost` `Intro.kt:233-325`), rendu
  au-dessus des onglets ; `back()` la ferme en premier.
- Deep link : `cm.bouendji.vpn://pay` (`AndroidManifest.xml:60-66`), traité dans
  `MainActivity.handleDeepLink` (`:100-106`), événement `DeepLinkBus`.
- `launchMode="singleTop"` (`AndroidManifest.xml:53`) ; `onNewIntent` (`:94-98`)
  traite le lien et le fichier.

### 3.2 Impasses et défauts de navigation

**N1 — « Retour » mort sur Forfaits déconnecté (P1).**
Parcours : AUTH → « Voir les forfaits » (`Auth.kt:138`) → `go(PLANS)` ;
`PLANS` ∈ `TABS`, donc `stack.clear()` (`AppController.kt:100`) même si
`signedIn == false`. `PlansScreen` calcule `asTab = c.signedIn == false`, affiche
`NavBar(backLabel = "Retour", onBack = { c.back() })` (`Plans.kt:109-112`).
`back()` a une pile vide, `screen != HOME`, `signedIn == false` → `false`
(`:106-120`) ; le `NavBar` ignore le résultat : **le bouton ne fait rien**. Le retour
système, lui, passe par `Shell` et fait `moveTaskToBack` (`:150-152`) : l'app
disparaît. Depuis AUTH, « Continuer » (`Plans.kt:182`) repart vers AUTH en empilant
PLANS ; le retour système ramène à Forfaits : boucle AUTH ↔ Forfaits sans sortie
visible.

**N2 — « Commande créée » → retour → Commande → second paiement (P1).**
`Plans` → `go(ORDER)` empile PLANS. `startOrder` fait `order = created;
go(ORDER_DONE)` (`AppController.kt:493-496`) : la pile devient `[PLANS, ORDER]`.
Le `NavBar` de `OrderDone` est étiqueté « Forfaits » mais appelle `c.back()`
(`Plans.kt:547`) : il dépile vers **ORDER**, pas vers PLANS. Sur ORDER, le CTA
« Payer » (`:525-533`) rappelle `startOrder`, qui ne vérifie ni `busy` ni l'existence
d'une commande (`AppController.kt:484-501`) : **deuxième commande**. L'étiquette
« Forfaits » est en plus fausse.

**N3 — Retour de paiement non récupérable (P1).** Voir §5.3/§8 S3 :
l'`orderId` du lien est ignoré, l'événement est perdu à froid, et l'écran
`ORDER_DONE` n'a aucun polling (`Plans.kt:540-586`).

**N4 — Feuille non fermée par la navigation (P2/P3).**
`go()` ne remet jamais `sheet = null` (`:97-103`). La plupart des boutons de feuille
le font eux-mêmes (`Intro.kt:274-275`, `:295-298`, `:309-312`), mais le collecteur
DeepLink fait `go(HOME)` sans fermer la feuille (`AppController.kt:247-253`) : une
feuille « renew »/« welcome »/« import » peut rester au-dessus de HOME après le
retour de paiement. `logout()` ne la ferme pas non plus (`:465-480`).

**N5 — `singleTop` ne garantit pas l'instance unique (P3, non vérifié).**
`singleTop` ne réutilise l'instance que si elle est au sommet de la tâche. Pendant la
boîte de consentement VPN (`VpnService.prepare`, activité système dans la même
tâche), un lien de paiement peut créer une seconde `MainActivity` → second
`AppController`, second `boot`, deux collecteurs `DeepLinkBus`. Non reproduit.

**N6 — Le libellé « Forfaits » de `OrderDone` ment aussi quand on vient de
l'abonnement.** `SubscriptionScreen` propose « Suivre ma dernière commande » →
`go(ORDER_DONE)` (`Profile.kt:259`) ; le retour « Forfaits » dépile vers
`SUBSCRIPTION`. P3.

**N7 — Feuilles et boutons.** La feuille est un `Box`/`AnimatedVisibility`, pas un
`Dialog` (`Kit.kt:572-600`) : elle recouvre visuellement les onglets et le CTA, mais
le contenu derrière reste dans l'arbre d'accessibilité (voir §7). Aucune feuille
n'a de hauteur maximale ni de scroll global ; la feuille « pays » a une liste de
420 dp (`Intro.kt:252`) et peut dépasser un petit écran / une grande police. Aucun
bouton de CTA n'est masqué par une feuille dans les tailles usuelles, mais le
`Toast` et le `NoticeBanner` se superposent (voir §7).

**N8 — Le bouton « Retour » de `NavBar` est petit** (26 dp d'icône + 8 dp de padding,
`Kit.kt:529-537`) et sans libellé quand `backLabel == null` (mais ce cas n'arrive pas
sur les écrans avec retour). Voir §7.

---

## 4. Matrice des états par écran (Q4)

Légende : **L** = chargement, **V** = vide, **E** = erreur, **S** = succès.
« global » = `c.error` / `c.busy`, partagé entre écrans.

| Écran | L | V | E | S | Défaut d'état constaté |
|---|---|---|---|---|---|
| `SPLASH` | — | — | — | — | fixe : IO + 1,1 s (`AppController.kt:257`) ; rejoué à chaque rotation |
| `ONBOARDING` | — | — | — | — | pas de réseau ; `slides` non vide supposé (`Intro.kt:137`) |
| `AUTH` | bouton `busy` global | — | `GroupFooter(c.error)` / inline | navigation | formulaire perdu à la rotation ; `busy` d'un refresh de fond affiche un spinner sur « Créer mon compte » (`Auth.kt:137,216`) ; `error` d'un autre écran s'affiche ici ; Nebula non scrollable (`:187-190`) |
| `VPN_AUTH` | — | — | — | — | consentement annulé = aucun état, écran perdu (`Intro.kt:220-225`, `MainActivity.kt:55-57`) |
| `HOME` | aucun | « Aucun serveur reçu » confond vide/chargement/échec (`Home.kt:246-254`) | **aucun** `c.error` | — | `hasConfiguration` faux au boot malgré le coffre (`:144`, `init` jamais utilisé) ; `accessActive` peut être faux si `me` échoue → bouton renvoie « renew » ; chrono peut inclure une coupure (`TunnelEngine.kt:196-197`) ; `engineAvailable` figé (`MainActivity.kt:45-53`) |
| `SERVERS` | seulement le bouton Actualiser (`Servers.kt:148`) | message « La liste arrive… » même hors ligne (`:183`) ; bloc d'empty par filtre **mort** (`:211-219` inatteignable après le `return` de `:191`) | **aucun** `c.error` | toast toujours « mise à jour » (`AppController.kt:564`) | « Tester » bloqué après rotation (§6) ; `Actualiser` désactivé par un `busy` d'un autre écran ; filtre Favoris/Disponibles affiche le message générique |
| `PLANS` | « Chargement… » seulement si `plans` vide et `busy` (`:155-157`) | « Aucun forfait » (même sur échec réseau) | `GroupFooter(c.error)` global (`:175`) | — | `plans` en cache non rafraîchis (pas de `loadPlans` si non vide, `AppController.kt:127`) ; changement de tier laisse `selectedPlanId` sur un forfait masqué (`Plans.kt:119-126,153-162` + `AppController.kt:167`) ; CTA peut payer un forfait invisible |
| `ORDER` | — | `plan == null` → écran sans message, CTA désactivé | global (`:521`) | — | `NightPicker` peut auto-sélectionner une plage (`:356-358`) ; prix client vs serveur (`:527`) |
| `ORDER_DONE` | — | `order == null` → « Commande créée » + « Vérifier » qui ne fait rien (`AppController.kt:504` `?: return`) | global (`:573`) | statique, jamais pollé | retour vers ORDER (§N2) ; pas de récupération après mort du process ; `checkout == null` → aucun moyen de payer (`:582`) |
| `PROFILE` | — | `stats == null` → « — » | **aucun** (les échecs de `loadStats` sont avalés, `AppController.kt:375-378`) | — | `me` en cache peut être un autre compte ; `loadStats` ne recharge pas `devices` ; pas de `onEnter(DEVICES)` |
| `SETTINGS` | — | — | — | — | logout sans confirmation ni `busy` visible (`Profile.kt:203`, `AppController.kt:465-480`) ; écritures de préférences annulables (`:637-657`) ; notifications sans résultat (`:198`) |
| `SUBSCRIPTION` | — | `me == null` → « Aucun forfait » | aucun | — | dépend du cache ; « Suivre ma dernière commande » seulement si `order` en mémoire (`:257-260`) |
| `DEVICES` | — | `devices` vide → `Build.MODEL` + « Actif maintenant » (`:283-289`) | global (`:308`) | — | pas de chargement à l'entrée ; état « Actif » optimiste même hors ligne ; « Retirer » immédiat et petit (`:302`) |
| `INVITE` | — | code « … » (`:336`) | global (`:345`) | — | pas de distinction chargement/échec ; code copiable seulement si non nul |
| `HELP` | — | — | — | — | statique ; FAQ sans état `expanded` sémantique (`:381`) |
| Feuilles | import seulement | — | `importMessage` | `importOk` | pas de `Dialog`/focus piégé ; « import » annoncé « Tu peux te connecter » même sans droit actif (`Intro.kt:306`) |

---

## 5. `refreshAll` / `refreshServers` (Q5)

### 5.1 Où le réseau est déclenché par la navigation

| Déclencheur | Ligne | Appels |
|---|---|---|
| `go(next)` → `onEnter` | `AppController.kt:102` | `PROFILE` → `loadStats` (`:124`, 2 appels), `INVITE` → `loadReferral` (`:125`), `SERVERS` → `refreshServers` (`:126`, 4-5 appels), `PLANS` → `loadPlans` si vide (`:127`) |
| Démarrage | `:256` | `refreshAll` (plans, me, devices, subscription, bundle) |
| Inscription/connexion | `:430` | `refreshAll` |
| Retour paiement (deep link) | `:249` | `refreshAll(refreshOrder = true)` |
| Bouton Power sans config | `Home.kt:141` | `refreshAll` (à chaque appui) |
| Bouton Actualiser | `Servers.kt:145` | `refreshServers` |
| Vérifier paiement | `Plans.kt:581` | `checkOrder` (order + `refreshPrivate`) |
| Révocation | `Profile.kt:302` | `revoke` (revoke + devices) |
| Test latence | `Servers.kt:120` / `Home.kt:240` | TCP direct ou service, pas l'API |

Aucun de ces points n'est déclenché par `onResume`/`ON_RESUME` : D129 n'est pas
implémenté pour le retour au premier plan.

### 5.2 Concurrence

- **Pas de mutex ni de job unique.** `refreshAll` (`:277-318`) et `refreshServers`
  (`:559-568`) font chacun `scope.launch`. Deux entrées successives dans Servers
  (Servers → Accueil → Serveurs) lancent deux `refreshPrivate` qui écrivent `me`,
  `quota`, `devices`, le coffre et `ServerBus`. Aucun numéro de génération : la
  réponse la plus lente gagne.
- **Power sans configuration** (`Home.kt:141`) : chaque appui relance `refreshAll`
  (`:277`), donc un nombre non borné de refresh concurrents tant que
  `hasConfiguration` est faux.
- **`busy` n'est pas un verrou** : `refreshAll` le met à `true` (`:279`), le remet à
  `false` dans son `finally` (`:313-316`), même si un second refresh tourne encore.
  Le second écran voit `busy == false` alors que la requête est en vol.
- **`busy` est global** : il désactive le bouton d'Actualiser (`Servers.kt:148`), le
  bouton Payer (`Plans.kt:531`), Vérifier (`Plans.kt:581`), les boutons d'Auth
  (`Auth.kt:137,216`) et affiche « Chargement des forfaits… » (`Plans.kt:156`). Un
  refresh de fond sur l'écran précédent peut donc bloquer un bouton sur l'écran
  courant. `syncing` (`:147`) n'est **lu nulle part** et `SyncLoaderPill`
  (`Shell.kt:324`) n'est **jamais appelé** : aucun indicateur global.
- **Timeout de 4 s** (`:282`) englobant 5 appels séquentiels (plans, me, devices,
  subscription, bundle) : sur réseau lent, le bundle (dernier) ne dispose que du
  temps restant. Le `runCatching` interne avale `CancellationException` et transforme
  le timeout en erreur réseau (`:304-310`). Cette erreur reste ensuite dans `c.error`
  (jamais effacé par `go`, `:97-103`) et s'affiche sur Forfaits/Commande/Auth.
- **Succès mensonger** : `refreshPrivate` avale chaque appel (`:344,349,350,358`) et
  ne lève pas ; `refreshServers` considère donc l'opération comme réussie et affiche
  « Liste des serveurs mise à jour. » (`:564`) même si le réseau est coupé. Le seul
  cas d'échec remonté est une exception du coffre (`vault.save`, `:360`).
- **`refresh.join()` inutile** (`:256,263`) : `refreshAll` lance un second
  `scope.launch` (`:278`) ; `join()` ne attend que le premier. L'auto-connexion
  (`:264-268`) lit `hasConfiguration`, qui vaut encore `false` au démarrage
  (`MainActivity` calcule un `hasConfiguration` local mais `VpnApp` ne l'utilise pas,
  `Shell.kt:98`). L'auto-connexion n'est donc fiable que si le réseau répond en moins
  de 1,1 s — ce que le timeout de 4 s ne garantit pas.

---

## 6. Durée de vie, timers, collecteurs (Q6)

### 6.1 Ce qui survit à une rotation

- `TunnelStateBus` (`state`, `detail`, `since`) et `ServerBus` (`servers`, `active`,
  `notice`, `traffic`, `rates`, probes) : objets de processus, donc **oui**.
- `ImportInbox.pending` : **oui** (octets en mémoire), mais un seul slot.
- Les préférences (`appearance`, `favorites`, `preferredServer`, etc.) : **oui** via
  `SecureStore`, avec une lecture asynchrone au boot.
- Le tunnel et sa notification : **oui**, le service est indépendant de l'Activity.
- Les `rememberSaveable` locaux : **seulement si l'écran est recomposé au même
  endroit**. Or `screen` repart à SPLASH, donc l'écran n'est pas restauré ; en
  pratique `query`/`filter`/`tierIndex`/FAQ et le scroll sont perdus. (Non exécuté :
  le comportement exact de `AnimatedContent` sans `SaveableStateHolder` n'a pas été
  reproduit.)
- `order` : **non**. Un `OrderDto` en mémoire disparaît ; le `orderId` du deep link
  n'est pas réutilisé.
- `sheet` : **non**.
- Les jobs : **non**, annulés avec `rememberCoroutineScope`.

### 6.2 Timers

- **Chrono d'accueil** : `LaunchedEffect(state) { while (state in RUNNING) { now = ...;
  delay(1_000) } }` (`Home.kt:96-98`). L'effet est annulé quand l'état change ou que
  Home quitte la composition ; pas de fuite. `since` est tenu par le singleton
  (`TunnelEngine.kt:196-197`), donc il survit à la navigation et à la rotation.
  **Mais** `since` n'est remis à zéro que sur `STOPPED` : après `NO_CONNECTION`,
  `SUBSCRIPTION_EXPIRED` ou `DEVICE_REVOKED`, une reconnexion sans `STOPPED` continue
  le même chrono (`Home.kt:209-219`). Le temps affiché inclut la coupure.
- **Débit** : `LaunchedEffect(traffic)` (`Home.kt:103-112`) redémarre à chaque
  émission ; `lastTotals`/`rates` sont des `remember`, remis à zéro à la rotation ;
  le premier échantillon affiche 0,0 Mb/s. Pas de fuite.
- **Animations infinies** : `Mascot` (`Intro.kt:111-120`), `Guilloche` (`:84-105`),
  `PermArt` (`Kit.kt:644-653`), `StatusDot`/blink (`Home.kt:129-132`). Elles sont
  annulées avec la composition, mais `reduceMotion` n'est honoré que par
  `PowerControl` (`Home.kt:327`) et la transition d'écran (`Shell.kt:160`) : le
  mascotte flotte, le splash tourne à 120 s, `PermArt` à 90 s, les feuilles glissent
  encore. Le réglage « Mouvement réduit » est donc partiellement mort (P3).
- **Toast** : `scope.launch { delay(2_400); if (toast == message) toast = null }`
  (`AppController.kt:195-201`). Deux messages identiques rapprochés : le premier
  timer efface le second avant ses 2,4 s. P3.

### 6.3 Collecteurs et fuites

- `boot()` enregistre `ImportInbox.pending.collect` (`:245`) et
  `DeepLinkBus.paymentReturn.collect` (`:247-253`) dans le scope de composition.
  À la rotation, le scope est annulé et les deux collecteurs sont recréés par le
  nouveau `boot()` : **il y a une fenêtre sans collecteur** (tout le bloc IO du boot),
  et `DeepLinkBus` n'a pas de replay. C'est la perte du retour de paiement.
- `ImportInbox` : un seul `MutableStateFlow<ByteArray?>` (`ImportInbox.kt:21-22`).
  Deux fichiers partagés avant le traitement : le second écrase le premier. La
  lecture se fait sur le thread appelant (`MainActivity.onNewIntent` → `offer`,
  `:120` ; `ImportInbox.kt:26-35`), jusqu'à `MAX_BYTES + 1` : jank possible sur un
  ContentProvider lent. P3.
- `AppController` capture `context` (Activity) dans l'objet `Platform`
  (`Shell.kt:116-130`) ; il est `remember` et meurt avec la composition, donc pas de
  fuite statique. En revanche, si on le déplace tel quel dans un `ViewModel`, ce
  capture deviendra une fuite d'Activity : il faudra séparer état et effets.
- **Aucune annulation sur logout** : les jobs `refreshAll`/`refreshServers`/
  `loadStats`/`testLatency`/`checkOrder` continuent et peuvent écrire après la remise
  à zéro. C'est la cause de la « résurrection » de `me`/`quota`.
- **`testLatency` sans `finally`** : voir §8 S5. C'est la fuite d'état la plus
  visible : les entrées `TESTING` restent dans `ServerBus`.

---

## 7. Accessibilité mesurable (Q7)

### 7.1 Libellés d'icônes

- `Icon` n'a **aucun paramètre `contentDescription`** (`ui/kit/Icons.kt:95`) et
  n'ajoute aucune sémantique. Dans tout le module, `contentDescription` n'apparaît
  que deux fois, sur des images (`Intro.kt:102`, `:119`).
- Conséquences mesurables :
  - bouton d'alimentation : `Box.clickable(role = Role.Switch, onClickLabel = ...)`
    (`Home.kt:333-353`) — `onClickLabel` est un libellé d'**action**, pas le nom du
    contrôle ; aucun `stateDescription` on/off ;
  - `IconBtn` (engrenage, copier) : `size(36.dp)`, `onClickLabel = label`, pas de
    `contentDescription` (`Kit.kt:359-369`) ;
  - favori : `Box.size(34.dp).clickable(role = Role.Checkbox, onClickLabel = "Favori")`
    (`Servers.kt:280-285`) — pas de `toggleableState`, donc TalkBack ne sait pas si
    c'est coché ;
  - retour `NavBar` : icône 26 dp, `role = Button`, aucun libellé si `backLabel` est
    nul (`Kit.kt:529-537`) ;
  - fermeture du bandeau : `Box.size(30.dp).clickable` sans libellé
    (`Kit.kt:636-638`) ;
  - effacement de recherche : `Box.clickable { onValue("") }` sans libellé
    (`Kit.kt:431`).
- `Segmented` et `TabBar` utilisent `role = Role.Tab` mais pas `selected`/`selectable`
  (`Kit.kt:393-416`, `Shell.kt:267-281`) : l'onglet actif n'est annoncé que par la
  couleur. Les cartes de forfait sont `clickable(role = Role.RadioButton)` sans état
  sélectionné (`Plans.kt:212,285,424`) ; le `RadioDot` est purement visuel.

### 7.2 Cibles tactiles < 48 dp (mesurées dans le code)

| Contrôle | Taille | Ligne |
|---|---|---|
| favori de serveur | 34 dp | `Servers.kt:281` |
| `IconBtn` | 36 dp | `Kit.kt:363` |
| fermeture du bandeau | 30 dp | `Kit.kt:636` |
| `PillSwitch` | 51 × 31 dp | `Kit.kt:381` |
| `Segmented` | 34 dp de haut | `Kit.kt:396` |
| `SearchField` | 38 dp de haut | `Kit.kt:422` |
| `Capsule` cliquable | 32 dp de haut | `Kit.kt:462` |
| `Btn(height = 34/40/42/44)` | 34-44 dp | `Servers.kt:124,149`, `Auth.kt:168`, `Intro.kt:141` |
| retour `NavBar` | ~26 dp de haut | `Kit.kt:526-537` |
| avatar | 34 dp | `Home.kt:151`, `Kit.kt:479-489` |

`ListRow` a bien `heightIn(min = 50.dp)` (`Kit.kt:220`) ; les boutons pleine largeur
par défaut font 52 dp (`Btn` `:296`). Le problème est concentré sur les contrôles
secondaires.

### 7.3 Sémantique de modal, de toast et de formulaire

- `Sheet` est un `Box` avec `AnimatedVisibility`, pas un `Dialog` (`Kit.kt:572-600`) :
  le contenu derrière (onglets, CTA) reste dans l'arbre d'accessibilité ; TalkBack
  peut le parcourir alors que la feuille est ouverte. Pas de `paneTitle`, pas de
  focus piégé, scrim cliquable sans libellé (`:576`). P2.
- `Toast` n'a pas de `liveRegion` (`Kit.kt:604-616`) : « Code copié », « Liste des
  serveurs mise à jour », « Paiement vérifié » ne sont pas annoncés.
- `FormRow` : le libellé est un `T` séparé du `BasicTextField` (`Kit.kt:244-280`) ;
  aucun `semantics`/`contentDescription` sur le champ. `SearchField` idem
  (`:419-433`). P3.
- FAQ : `Column.clickable` sans `stateDescription` expanded/collapsed
  (`Profile.kt:381-386`). P3.

### 7.4 Contrastes (calcul WCAG, thème Billet clair par défaut)

Valeurs : `bg #F6F4EC`, `surface #FFFEFA`, `danger #C2412D`, `dangerSoft` =
danger à 12 % sur surface (`Billet.kt:105,131-134`).

| Paire | Ratio | Verdict |
|---|---|---|
| `danger` sur `bg` (texte d'erreur 13 sp) | **4,67:1** | passe de justesse (≥ 4,5) |
| `danger` sur `surface` | **5,09:1** | passe |
| `danger` sur `dangerSoft` (Tag « Retiré », Capsule « Expiré », 12-13 sp) | **4,28:1** | **échoue** (4,5 requis pour du texte < 18,66 sp gras) |
| `label3` (alpha 0,36) sur `bg` — placeholders, unités, « — » | **2,23:1** | échoue largement ; information secondaire mais lisible |
| blanc sur `gold` (Tag « NJI », `Profile.kt:102`) | **3,56:1** | échoue (12 sp) |
| `danger` sur `bg` en sombre (`#FF6B57` / `#0B100D`) | **6,85:1** | passe |

Le texte d'erreur principal (`GroupFooter(danger = true)`, 13 sp Medium) passe donc
de justesse en clair ; ce sont les **badges** d'erreur et les textes secondaires qui
échouent. Calcul reproductible à partir des couleurs ; non mesuré sur capture.

### 7.5 Troncature et grande police

- `T` utilise `TextOverflow.Clip` dès que `maxLines == Int.MAX_VALUE`
  (`Kit.kt:100`) : dans un conteneur à hauteur fixe, le texte est coupé au milieu
  d'une ligne, sans ellipse. Exemple : `Capsule` a une hauteur de 32 dp et un `T`
  sans `maxLines` (`Kit.kt:458-468`) ; un `planName` long peut déborder/couper.
- Les boutons `height = 34.dp` avec un texte de 15 sp (`Kit.kt:296,341`) et
  `Segmented` 34 dp avec 14 sp (`:396,412`) ne tiennent pas à 200 % de taille de
  police (hauteur de ligne > hauteur du contrôle). `Capsule` 32 dp / 13 sp idem.
  C'est un défaut de mise en page mesurable, pas un simple avis esthétique.
- `Btn` texte `maxLines = 1` (`:344`) : un libellé long à grande police est tronqué
  avec ellipse (le prix « Continuer · … FCFA » sur un écran étroit).

### 7.6 Autres

- `T`/`TabBar` à 10,5 sp (`Shell.kt:280`) : petit, mais lisible ; pas un critère
  formel.
- `Toast` et `NoticeBanner` sont tous deux `TopCenter` (`Shell.kt:183-203`,
  `Kit.kt:608`) : le toast recouvre le bandeau et son bouton d'action (« Contacter »/
  « Mon choix ») pendant 2,4 s. Action momentanément masquée. P3.
- `reduceMotion` non honoré par `Mascot`, `Splash`, `PermArt`, `Sheet` (§6.2).
- Le splash clignote entre le thème par défaut et le thème restauré : `appearance`
  est lu sur IO après la première composition (`AppController.kt:214`), alors que
  `dark` est déjà calculé (`Shell.kt:138-142`). P3.

---

## 8. Défauts classés

### P0

**Aucun défaut P0 démontré par lecture.** Aucun crash reproductible n'est visible dans
le périmètre ; l'absence de build/exécution interdit de l'affirmer. Les défauts
ci-dessous sont classés P1 à P3.

### P1 — bloquants pour l'axe état/navigation

**S1 — Toute recréation d'Activity détruit l'état et rejoue le splash.**
`Shell.kt:108,112-136` ; `AppController.kt:91-95,211-262` ; absence de
`configChanges` (`AndroidManifest.xml:50-55`) ; `screen` non sauvegardé.
Conséquences : formulaire, forfait, feuille, commande, écran et pile perdus ;
inscription/paiement en vol annulés ; retour au splash puis HOME/AUTH. Le thème
système en `AUTO` déclenche le même cycle.
**Preuves** : `remember { AppController(...) }` sans clé, `rememberCoroutineScope`,
`screen` `mutableStateOf`, `delay(1_100)` après IO, aucun `ViewModel`/`SavedStateHandle`
(recherche sans résultat).

**S2 — La déconnexion ne termine pas la session locale ; le compte précédent peut
réapparaître.**
`AppController.kt:220-243` (restauration de `cache.me` + `signedIn = me != null`),
`:305` (401 ignoré si `pending_reg != null`), `:337` (`pending_reg = ""`), `:450`
(formulaire avec mot de passe), `:465-480` (logout incomplet). `cache.me`,
`cache.quota`, `offline.pending_reg`, `PREF_SERVER` et les favoris ne sont jamais
supprimés (recherche `remove(KEY_...` : seuls les jetons et l'ETag le sont,
`ApiClient.kt:118-123`).
Conséquences : nom, forfait, quota, appareils et série de l'ancien compte affichés
après déconnexion + redémarrage ; en ligne, l'auto-déconnexion sur 401 ne se produit
plus après une inscription hors ligne (clé `""` non nulle) ; un `refreshPrivate` en
vol peut réécrire `me`/`quota` après le logout. `syncPendingRegistration` peut
recréer le compte en attente **après** le logout, et `api.register` remplace la
session (`ApiClient.kt:237`) : l'utilisateur B peut se retrouver dans le compte A.
**Preuves** : lignes ci-dessus ; `syncPendingRegistration` appelé à chaque
`refreshAll` (`:285`) sans vérifier l'utilisateur courant.

**S3 — Retour de paiement perdu, non vérifié ou falsifiable.**
`MainActivity.kt:38` (émission avant `setContent`), `DeepLinkBus.kt:7` (replay 0),
`AppController.kt:247-253` (`collect {` sans paramètre ; toast de succès
inconditionnel), `:301` (`order?.let` : rien si `order == null`), `:504`
(`checkOrder` sans ordre), `Plans.kt:540-586` (aucun polling).
Conséquences : app tuée pendant le paiement → au retour, HOME + « Paiement vérifié
avec succès ! » alors qu'aucune commande n'a été vérifiée ; l'`orderId` du lien est
jeté ; toute app peut lancer le schéma exporté et produire le même message ; la
commande n'est récupérable ni par Abonnement (`Profile.kt:259`) ni par Commande.
**Preuves** : lignes ci-dessus.

**S4 — « Commande créée » → retour → Commande → second paiement.**
`Plans.kt:547` (`NavBar` « Forfaits » → `c.back()`), `AppController.kt:493-496`
(`ORDER_DONE` empile ORDER), `Plans.kt:525-533` (`Payer` rappelle `startOrder`),
`AppController.kt:484-501` (aucun garde `busy`/commande existante).
Conséquence : deux commandes pour le même forfait, risque de double débit si les deux
pages de paiement sont payées. Le libellé « Forfaits » est faux.
**Preuves** : pile `[PLANS, ORDER]` ; le retour dépile vers ORDER, pas vers PLANS.

**S5 — Test de latence bloqué après rotation ; rafraîchissement qui ment.**
`AppController.kt:592-617` (`directTesting`, `TESTING` sans `finally`),
`ServerBus.kt:57-64` (probes conservées), `Servers.kt:82,117-126` (`testing` déduit
des probes, `Btn(busy=testing)`), `Kit.kt:326` (`enabled && !busy`),
`AppController.kt:341-368` + `:559-568` (erreurs avalées, toast de succès),
`Servers.kt` (aucun `c.error`).
Conséquences : rotation pendant « Tester » → des lignes restent `TESTING` ; le bouton
« Tester » est désactivé (même après Actualiser, car `setServers` préserve les
probes) ; aucun chemin **depuis Serveurs** ne le débloque — il faut une sonde du
service (Home connecté) ou un redémarrage du processus. Hors ligne,
« Liste des serveurs mise à jour. » s'affiche avec une liste vide/inchangée, sans
aucune erreur visible.
**Preuves** : lignes ci-dessus ; `Servers.kt:82` et `:118-126`.

**S6 — « Retour » mort sur Forfaits déconnecté (impasse de navigation).**
`Auth.kt:138`, `AppController.kt:41,100,106-120`, `Plans.kt:109-112`,
`Shell.kt:150-152`.
Conséquence : un prospect ouvre les forfaits, le bouton « Retour » ne fait rien ; le
retour système met l'app en arrière-plan ; via « Continuer » → AUTH, le retour
système ramène à Forfaits : boucle sans sortie visible autre que l'arrière-plan.
**Preuves** : `back()` renvoie `false` ; `NavBar` ignore le retour.

### P2 — pertes d'état et incohérences visibles

**S7 — `busy` global et refreshs concurrents.**
`AppController.kt:146,277-318,559-568` ; lectures `Auth.kt:137,216`,
`Plans.kt:156,531,581`, `Servers.kt:148`. Un refresh de fond désactive des boutons
d'un autre écran, affiche « Chargement des forfaits… » à tort, et le premier
`finally` remet `busy = false` alors qu'un second refresh tourne. Aucune
génération/annulation : les réponses peuvent s'écraser.

**S8 — `error` global jamais effacé, affiché sur des écrans sans rapport.**
`AppController.kt:148` ; `go()` (`:97-103`) et `logout()` (`:465-480`) ne le
remettent pas à zéro. Rendus : `Plans.kt:175,521,573`, `Profile.kt:308,345`,
`Auth.kt:133,211`. Non rendus : Home, Servers, Subscription, Settings, Help. Une
erreur de refresh de Serveurs apparaît donc sous la liste des forfaits, ou une
erreur d'inscription sous « Payer ».

**S9 — `refreshAll` ne attend pas ; auto-connexion et `hasConfiguration` faux au
démarrage.**
`AppController.kt:256,263,264-268` ; `MainActivity.kt:45-53,65` ; `Shell.kt:98`
(paramètre `initialHasConfiguration` jamais lu) ; `hasConfiguration` n'est écrit
qu'à `:366`/`:675`. Conséquence : le premier appui sur Power après un démarrage à
froid affiche « Réception de ta configuration… » même avec un coffre valide, et
l'auto-connexion échoue si le réseau dépasse 1,1 s.

**S10 — Forfaits en cache non rafraîchis / sélection d'un forfait masqué.**
`AppController.kt:127` (`loadPlans` seulement si vide), `:167` (`selectedPlan`),
`Plans.kt:119-126,153-162` (filtre par tier) ; le `selectedPlanId` n'est pas corrigé
quand on change de tier : le CTA et l'écran Commande peuvent porter sur un forfait
qui n'est plus affiché. Prix en cache potentiellement périmé (le serveur recalcule,
mais l'écran affiche l'ancien).

**S11 — Appareils : pas de chargement à l'entrée, faux « Actif maintenant ».**
`AppController.kt:122-130` (pas de `onEnter(DEVICES)`), `:349` (devices chargés
seulement par `refreshPrivate`), `Profile.kt:275,283-289` (`current == null` →
`Build.MODEL` + « Actif maintenant »). Hors ligne ou avant le premier refresh, la
liste est vide et l'appareil local est présenté comme actif.

**S12 — `ORDER_DONE` statique et boutons potentiellement morts.**
`Plans.kt:540-586` : le statut ne change que sur `checkOrder` ; `order == null` →
titre « Commande créée » + « Vérifier » qui fait `?: return` (`AppController.kt:504`) ;
`checkout == null` → aucun bouton de paiement (`Plans.kt:582`) ; pas de polling, pas
de reprise après mort du processus.

**S13 — Feuille non modale pour l'accessibilité et non fermée par `go()`.**
`Kit.kt:572-600` (pas de `Dialog`, scrim non libellé), `AppController.kt:97-103`
(`sheet` non remis à zéro), `:247-253` (deep link). Le contenu derrière reste
focusable ; une feuille peut survivre à un changement d'écran.

**S14 — `AuthScreenNebula` non scrollable.**
`Auth.kt:187-190` : `Column.fillMaxSize()` centrée, sans `verticalScroll` ; avec le
clavier (`adjustResize`), les champs/le bouton peuvent être hors de la zone visible
sur un petit écran. Le thème par défaut est « billet », mais les builds Nebula
(D141 addendum) sont concernés.

**S15 — `logout` destructif sans confirmation ni indicateur.**
`Profile.kt:201-204`, `AppController.kt:465-480`. Un appui sur « Se déconnecter »
vide le coffre immédiatement ; `busy` n'est pas rendu sur Settings ; `api.logout()`
peut durer jusqu'à 30 s (`ApiClient.kt:89-92`) sans retour visuel. « Retirer » un
appareil est aussi immédiat (`Profile.kt:302`).

**S16 — `loadStats`/`loadReferral`/`loadPlans` n'ont pas la même politique 401 que
`refreshAll`.**
`AppController.kt:370-384` : les `runCatching` avalent un 401 sans provoquer la
déconnexion ; seul `refreshAll` (`:305`) le fait (et seulement si
`pending_reg == null`). Un utilisateur dont la session expire sur Profil/Parrainage
reste sur un écran avec des données périmées.

**S17 — L'état du serveur choisi et les favoris traversent les comptes.**
`AppController.kt:571-574` (`PREF_SERVER`), `:629-633` (`KEY_FAVORITES`) ; `logout`
ne les efface pas (`:465-480`). Le nouveau compte hérite d'un `preferredServer`
inconnu (Home affiche « Automatique »/« Le serveur le plus rapide » alors que la
préférence est un id manuel, `Home.kt:256-263`) et des favoris de l'ancien.

**S18 — Le bandeau et le toast se recouvrent.**
`Shell.kt:183-203` et `Kit.kt:604-616` : tous deux `TopCenter` ; le toast masque
l'action du bandeau pendant 2,4 s.

### P3 — finitions d'état, code mort, accessibilité secondaire

- **S19** `SyncLoaderPill` (`Shell.kt:324`) et `syncing` (`AppController.kt:147`) ne
  sont jamais lus : aucun indicateur de synchronisation global.
- **S20** `initialHasConfiguration` (`Shell.kt:98`) et le `hasConfiguration` local
  de `MainActivity` (`:46,51,65`) ne servent à rien (le second déchiffre le coffre
  pour rien).
- **S21** `ServerBus.rates` (`ServerBus.kt:53-54,82-84`) est écrit par le service
  mais jamais lu (Home recalcule depuis `traffic`).
- **S22** `showToast` : deux messages identiques, le premier timer efface le second
  (`AppController.kt:195-201`).
- **S23** `Toast` sans `liveRegion` (`Kit.kt:604-616`).
- **S24** Libellés d'icônes absents (`Icons.kt:95`), cibles < 48 dp (§7.2),
  `Role.Tab`/`RadioButton` sans état sélectionné (`Kit.kt:408, Plans.kt:212,285,424`).
- **S25** Contrastes : badge `danger`/`dangerSoft` 4,28:1, `label3` 2,23:1,
  blanc/`gold` 3,56:1 (§7.4).
- **S26** Grande police : hauteurs fixes 32/34/38 dp avec 13-15 sp (`Kit.kt:296,381,
  396,422,462`), `Capsule` sans `maxLines` ; troncature sans ellipse quand `T` a
  `maxLines = MAX` (`Kit.kt:100`).
- **S27** `reduceMotion` non honoré par `Mascot`, `Splash`, `PermArt`, `Sheet`
  (`Intro.kt:111-120`, `:84-105`, `Kit.kt:644-653,572-600`).
- **S28** Feuille « pays » à hauteur fixe 420 dp sans limite d'écran
  (`Intro.kt:252`) ; peut dépasser un petit écran / grande police.
- **S29** `ImportInbox` : un seul slot et lecture sur le thread appelant
  (`ImportInbox.kt:21-35`, `MainActivity.kt:120`).
- **S30** `logout` ne remet pas `sheet`, `error`, `toast`, `importMessage`,
  `quota`, `ServerBus.active/notice/traffic/rates` (`AppController.kt:465-480`).
- **S31** Le splash peut afficher un thème différent du thème restauré
  (`Shell.kt:138-143` vs `AppController.kt:214`).
- **S32** `checkout == null` / absence de navigateur : `openUrl` avale
  `ActivityNotFoundException` (`MainActivity.kt:125-131`) ; « Commande créée » sans
  action de paiement (`Plans.kt:582`). Déjà signalé par l'audit #4 pour le navigateur ;
  le cas `checkout == null` est nouveau.
- **S33** `Devices`/`Invite` : actions destructives ou de copie sans confirmation ;
  « Support » `mailto:` sans application de messagerie = bouton sans effet.
- **S34** `singleTop` ne garantit pas l'instance unique pendant une activité système
  au sommet (consentement VPN) ; risque de second `AppController` (non vérifié).

---

## 9. Vérifié / incertain

### Relu avec preuve fichier:ligne

- Propriétaires d'état et cycle de `boot` : `Shell.kt:108-136`,
  `AppController.kt:91-95,211-270`.
- Absence de `configChanges` et `launchMode=singleTop` : `AndroidManifest.xml:50-55`.
- Absence de `ViewModel`/`SavedStateHandle`/`Lifecycle`/`onResume` : recherche dans
  le module, aucun résultat.
- Champs écrits sous `Dispatchers.IO` : §2.1, lignes citées.
- `logout` incomplet et clés de cache jamais supprimées : `:220-243,305,337,450,
  465-480,701-712` ; `ApiClient.kt:118-123`.
- Deep link : `MainActivity.kt:38,100-106`, `DeepLinkBus.kt:7`,
  `AppController.kt:247-253,301,504`.
- Pile et retours : `AppController.kt:97-120`, `Plans.kt:109-112,547`,
  `Shell.kt:150-152`.
- Test de latence : `AppController.kt:592-617`, `ServerBus.kt:57-64`,
  `Servers.kt:82,117-126`, `Kit.kt:326`.
- `refreshPrivate` avale les erreurs : `:341-368` ; toast : `:564` ; aucun
  `c.error` dans Servers.
- Contrastes : calcul à partir de `Billet.kt:94,105,131-134` ; formules WCAG.
- A11y : `Icons.kt:95` (pas de `contentDescription`), tailles citées, `Sheet`
  `Kit.kt:572-600`, `Toast` `:604-616`.

### Incertain / non exécuté

- **Aucun build, aucune exécution** : tout le comportement runtime (rotation,
  annulation du scope, perte du `SharedFlow`, blocage du bouton) est **déduit** du
  code et des contrats Compose/Android, pas observé sur le Pixel 8.
- **Compose snapshot** : je n'affirme pas de crash ; la sûreté mémoire du snapshot
  n'est pas le problème. Le risque réel (ordre, mises à jour perdues) est déduit.
- **`rememberSaveable` à travers `AnimatedContent`** : le comportement exact de
  restauration après retour à SPLASH n'a pas été reproduit ; je le classe « perdu en
  pratique », pas « perdu par contrat ».
- **`singleTop` + consentement VPN** : scénario non reproduit ; P3 seulement.
- **Contrastes** : calculs, pas de capture ; le rendu réel dépend de l'écran et de
  l'anti-aliasing.
- **Grande police** : calcul des hauteurs de ligne, pas de test avec `fontScale=2`.
- **Comportement serveur** : la vérification de commande, l'activation et les
  codes d'erreur n'ont pas été rejoués ; les défauts sont côté client.
- **`OfflineBundle`/`VpnTunnelService`** : hors périmètre, non relus pour ce rapport
  (sauf `TunnelStateBus.since` et `ServerBus`, nécessaires à l'état UI).
- **`ApiClient` timeouts** : 10/20/20/30 s (`ApiClient.kt:89-92`), lus mais non
  mesurés sur réseau mobile.

---

## 10. Recommandations (ordre de mise en œuvre)

1. **État retenu** : déplacer `AppController` dans un `ViewModel` (ou un
   `AppStateHolder` retenu) + `SavedStateHandle` ; garder les effets `Platform`
   (consentement, navigateur, presse-papiers, sélecteur) dans la composition via un
   `Channel`/`SharedFlow` d'événements, pour ne pas capturer l'Activity. Utiliser
   `viewModelScope` pour les opérations qui doivent survivre à la rotation
   (inscription, commande, test de latence). Sauvegarder `screen`/`stack`,
   `selectedPlanId`, `custom*`, `nightWindow`, `sheet`, le formulaire **sans mot de
   passe** ; persister `orderId` dans `SecureStore`.
2. **Session** : ne plus déduire `signedIn` de `me != null`. Introduire un état
   explicite (`AUTHENTICATED`, `OFFLINE_PROFILE`, `SIGNED_OUT`) ; `logout` doit
   supprimer `cache.me`, `cache.quota`, `offline.pending_reg`, `PREF_SERVER`, les
   favoris (ou les namespacer par compte), remettre `quota`/`error`/`sheet`/
   `ServerBus` à zéro et annuler les jobs en vol. `pending_reg` doit utiliser `null`
   (jamais `""`) et être effacé après succès ; ne pas le rejouer si un autre compte
   est connecté ; gérer le 409.
3. **Paiement** : persister l'`orderId` et le `checkout.url` à la création ; sur
   deep link (y compris à froid), lire l'`orderId`, appeler `api.order(id, true)`,
   et n'afficher « Paiement vérifié » que si `activationStatus == "active"` ou
   `status == "paid"`. Ne jamais afficher un succès sur un lien non vérifié. Poller
   `ORDER_DONE` à l'`ON_RESUME` ou avec un `LaunchedEffect` borné.
4. **Navigation** : faire retourner un résultat à `NavBar` et le traiter comme
   `BackHandler` (ou faire passer le bouton par `onBackRequested`) ; garantir un
   retour AUTH depuis Forfaits déconnecté ; remplacer ORDER par ORDER_DONE dans la
   pile (`popUpTo`) ou faire revenir « Forfaits » à PLANS ; ne jamais laisser
   `startOrder` créer une seconde commande sans vérifier l'existante ; fermer les
   feuilles dans `go()`.
5. **Rafraîchissement** : un seul job de refresh (mutex/génération), `busy` par
   opération, `refreshPrivate` qui **retourne** un résultat au lieu d'avaler les
   erreurs, toast de succès conditionnel, `error` local à l'écran ou effacé à la
   navigation. Relever le `withTimeoutOrNull` global (ou le mettre par appel) et
   rethrow `CancellationException`. Recharger sur `ON_RESUME` (D129).
6. **Éviter les écritures Compose sous IO** : calculer sur IO, assigner sur Main ;
   ou un `StateFlow<UiState>` immuable mis à jour atomiquement. Si plusieurs champs
   changent ensemble, `Snapshot.withMutableSnapshot`.
7. **Serveurs** : `try/finally` autour de `testLatency` pour remettre les probes
   `TESTING` à `UNKNOWN`/`FAILED` ; `ServerBus.setServers` doit oublier les
   `TESTING` orphelins ; déduire `testing` d'un job, pas des lignes ; rendre
   `c.error` ; ne pas toaster « mise à jour » sans bundle réellement appliqué.
8. **Accessibilité** : ajouter `contentDescription` à `Icon`/`IconBtn`/power/
   favori/fermeture ; utiliser `Modifier.toggleable`/`selectable` et
   `semantics { selected = ... }` ; cibles ≥ 48 dp ; `liveRegion` sur le toast ;
   sémantique de dialogue pour `Sheet` ; associer les libellés de `FormRow` ;
   honorer `reduceMotion` partout.
9. **Contrastes** : foncer `danger` ou éclaircir `dangerSoft` pour le badge
   (4,28 → ≥ 4,5) ; remplacer `label3` par `label2` pour les textes informatifs ;
   revoir le blanc sur `gold` du Tag « NJI » (3,56).
10. **Tests** : le module n'a aucun test Android (audit #4). Ajouter au minimum :
    un test JVM de la machine à états (`ViewModel`), un test du `SharedFlow` de
    paiement (émission avant collecteur), un test Compose du retour Forfaits
    déconnecté et du retour Commande, un test de `ServerBus` après annulation de
    `testLatency`.

---

## 11. Fichiers écrits, questions ouvertes

**Fichiers écrits**
- `knowledge/agents/audit-android-ui-state/notes/audit.md` (ce rapport).
- `knowledge/agents/audit-android-ui-state/log.md` (journal, via la CLI).

**Aucun fichier de code modifié.** Aucun build, aucune exécution.

**Questions ouvertes**
1. Le retour de paiement Fapshi redirige-t-il réellement vers
   `cm.bouendji.vpn://pay?orderId=...`, ou l'utilisateur revient-il manuellement ?
   Cela change la gravité de S3 (le code ne le prouve pas).
2. `AuthForm` doit-il conserver le mot de passe hors ligne (D137) ou le retaper à la
   synchronisation ? Le stockage actuel (`offline.pending_reg` dans `SecureStore`)
   contient le mot de passe et survit au logout.
3. Faut-il rendre Forfaits accessible sans compte (choix commercial) ou exiger AUTH
   avant l'onglet pour supprimer l'impasse N1 ?
4. `singleTop` doit-il être complété par `FLAG_ACTIVITY_CLEAR_TOP`/un
   `onNewIntent` idempotent pour le consentement VPN ?
5. Le rafraîchissement au retour au premier plan (D129) doit-il être global ou
   seulement sur Serveurs/Home ?
6. Les caches `cache.me`/`cache.quota` doivent-ils être chiffrés séparément par
   compte, ou simplement effacés au logout ?

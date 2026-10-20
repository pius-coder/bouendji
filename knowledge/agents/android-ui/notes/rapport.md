# Rapport — couche UI Android (Compose)

Statut : **relu, non compilé**. Aucun JDK, aucun SDK, aucun Gradle sur cette
machine : rien dans ce lot n'a été exécuté. Ce qui est « vérifié » ci-dessous
l'est par script ou par lecture croisée avec le socle, jamais par build.

Périmètre respecté : `vpn/`, `crypto/`, `net/`, `config/`, `offline/`, `brand/`
ne sont pas modifiés (seulement importés). `AndroidManifest.xml` et les fichiers
Gradle ne sont pas modifiés — le bloc à insérer est plus bas.

## 1. Fichiers écrits

28 fichiers, 4 121 lignes, sous `apps/android/app/src/main/`.

```
java/cm/bouendji/vpn/
  MainActivity.kt                  74   activité unique : état, clair/sombre, racine
  ui/
    AppRoot.kt                     98   barre 1+3, bandeau, navigation (enum + when)
    AppState.kt                   418   état de l'UI : 4 états, dispo, compte, forfaits, actions
    UiPrefs.kt                     54   apparence, mouvement réduit, début de session
    Support.kt                     39   ouverture du contact de marque / réglages VPN système
    theme/
      Tokens.kt                   453   4 identités : palettes, formes, typographie, mouvement
      ColorMath.kt                 50   contraste WCAG, accent injecté recalé
      BrandTheme.kt               140   Material 3 + LocalBrandTheme + styles de texte
      Motion.kt                    28   tweens, rebond, rotation, dérivés des jetons
    components/
      PrimaryControl.kt           624   la commande unique, 4 rendus, 4 états
      Surfaces.kt                 559   fond, panneau, textes, pastilles, boutons, bandeaux
      TopBar.kt                   167   barre haute 1 + 3, marque à quatre traitements
      BrandIcons.kt               101   6 icônes en ImageVector (aucune dépendance)
      SupportAction.kt             51   bouton de contact, ou motif d'absence
      Format.kt                    35   durées tabulaires, dates FR
    screens/
      HomeScreen.kt               280   commande + carte sortie + 4 panneaux de panne
      AccountScreen.kt            277   connexion, compte, accès, appareil courant
      PlansScreen.kt              140   formule réelle, échéance, absence de catalogue
      SettingsScreen.kt           244   apparence, mouvement, notifications, contact, effacement
      HelpScreen.kt                57   quatre questions, contact
res/
  values/strings.xml              156   133 ressources (chaînes + 2 pluriels)
  values/colors.xml                10   fond de fenêtre clair, fond d'icône
  values-night/colors.xml           5   fond de fenêtre sombre
  values/themes.xml                16   `Theme.Bouendji` clair
  values-night/themes.xml          10   `Theme.Bouendji` sombre
  drawable/ic_launcher_foreground.xml  25   anneau dessiné (aucune image)
  mipmap-anydpi-v26/ic_launcher.xml      5   icône adaptative
  mipmap-anydpi-v26/ic_launcher_round.xml 5  icône ronde
```

Aucune dépendance ajoutée. Aucune bibliothèque d'icônes. Aucune image générée.

## 2. Contrat de la commande principale

`PrimaryControl` est **une seule cible cliquable** : l'état, la durée observée et
l'action vivent dans la même forme. Il n'y a pas de chronomètre séparé.

| État | Halo | Mono | Vector | Otaku |
|---|---|---|---|---|
| `Idle` | anneau ouvert (arc de 10°) | barre à zéro, bloc plein cadre | 20 segments éteints | pastille au repos, halo éteint |
| `Connecting` | arc de 96° qui parcourt l'anneau (24 s/tour) | barre qui balaie (1,6 s) | segments qui s'allument un par un (1,1 s) | halo pointillé qui tourne (18 s/tour) |
| `Connected` | anneau fermé, épaissi, halo radial | barre pleine, cadre 2,5 dp | 20 segments allumés, `● ON` | halo pointillé + battement (1,03×) |
| `Degraded` | anneau brisé en tirets, ambre | barre à 72 %, ambre | segments alternés ambre | halo ambre, pas de battement |

Le texte (état, « Durée de session », action) vient de `strings.xml` et ne change
pas d'une identité à l'autre : une marque change de forme, pas de discours.

## 3. Les quatre identités — ce qui les distingue réellement

Elles ne diffèrent pas par la teinte seule : rayons, épaisseurs, ombre,
typographie, cadence et géométrie du contrôle changent.

| | Halo | Mono | Vector | Otaku |
|---|---|---|---|---|
| Forme | verre : cercles, liseré 1 dp, `CircleShape` | éditorial : angles 2 dp, filets 1,5 dp | console : angles 0 dp, trait 2 dp, ombre pleine 4 dp | manga : cercle 3 dp, ombre pleine 5 dp, inclinaison −1,5° |
| Typo | sans, capitales, interlettrage 1,6 | titres sans / chiffres et corps monospace, capitales 1,8 | tout monospace, capitales 1,4 | sans graisse 900, capitales 1,2 |
| Mouvement | 160/280/900 ms, courbe douce, rotation 24 s | 120/200/700 ms, linéaire, aucune rotation | 90/140/600 ms, linéaire, appui enfoncé de 2 dp | 140/220/900 ms, ressort, rotation 18 s, battement |
| Fond | trois halos radiaux | grille à quatre colonnes | trame de balayage 4 dp | trame de points + éclat d'encre |
| Contrôle | anneau + disque 232 dp | bloc pleine largeur + barre | console + segments | pastille 236 dp + halo pointillé |
| Marque (barre) | disque de verre, initiale | carré à filet, carré d'accent | damier 3×3 | pastille jaune inclinée, étoile |
| Appui | échelle 0,985 | échelle 0,985 | décalage 2 dp, ombre réduite | décalage 2 dp + échelle 0,96 |

`LocalBrandTheme` est un `staticCompositionLocalOf` : l'identité est fixée au
build (`BrandTokens.theme`, D2), jamais tirée au sort, jamais lue sur le réseau.
Seule l'apparence clair/sombre bascule à l'exécution.

## 4. Contraste — mesuré, pas estimé

Script : `%TEMP%\contrast2.js` — il lit les valeurs **dans `Tokens.kt`**, pas une
copie, et applique la formule WCAG 2.1.

80 couples texte/fond (8 palettes × 10 couples) : **0 échec**, minimum 4,97:1
(`vector-light`, `onAccent/accent`). Extrêmes utiles :

| Palette | ink/surface | muted/surface | accentInk/surface | onAccent/accent |
|---|---|---|---|---|
| halo clair | 18,58 | 5,74 | 6,49 | 5,01 |
| halo sombre | 15,79 | 8,31 | 10,06 | 9,11 |
| mono clair | 17,34 | 6,64 | 6,68 | 6,43 |
| mono sombre | 15,88 | 7,60 | 8,65 | 7,48 |
| vector clair | 13,99 | 6,08 | 5,70 | 4,97 |
| vector sombre | 17,22 | 9,32 | 15,75 | 14,13 |
| otaku clair | 18,27 | 7,06 | 5,78 | 5,50 |
| otaku sombre | 15,55 | 8,58 | 7,99 | 6,56 |

Non-texte (1.4.11, cible 3:1) : `line/surface` est bas par construction (1,2 à
3,1) — c'est un filet décoratif, pas une frontière de contrôle. Deux corrections
en découlent, appliquées :

- le contour des boutons secondaires Halo utilise `muted` (≥ 5:1) et non le
  liseré de verre, invisible sur fond clair ;
- Vector clair garde `line` (3,14:1, au-dessus du seuil).

Un accent injecté au build (`BrandTokens.accent`) est recalé à l'exécution :
`readableInkOn()` choisit l'encre du bouton, `ensureReadable()` retombe sur
l'encre du thème si l'accent ne tient pas 4,5:1 en texte sur la surface.

## 5. Barre haute — 1 + 3

`BrandTopBar` : à gauche **un seul** élément — la marque (pastille + nom) sur
l'accueil, ou le retour + le titre de l'écran sur un sous-écran. À droite
**exactement trois** actions : compte, réglages, aide. Aucun menu, aucun badge,
aucune quatrième icône, aucun texte superflu.

Le titre des sous-écrans est pondéré (`weight(1f)`) pour qu'un titre long ne
pousse jamais les trois icônes hors de l'écran.

## 6. Quand rien ne fonctionne — et quand la marque ment

Quatre situations remplacent le contenu de l'accueil (la commande disparaît :
appuyer dessus ne changerait rien) :

| Situation | Déclencheur | Écran |
|---|---|---|
| Rien d'utilisable | `Availability.Blocked` : marque non injectée, moteur absent, appareil < Android 12, coffre vide | « Aucune connexion disponible » + motif exact + **Réessayer** + contact |
| Sortie perdue | `TunnelState.NO_CONNECTION` | même panneau, avec le détail du service |
| Abonnement expiré | `TunnelState.SUBSCRIPTION_EXPIRED` | « Accès expirés » + **Voir les forfaits** + contact |
| Appareil révoqué | `TunnelState.DEVICE_REVOKED` | « Appareil retiré » + contact |

Le motif affiché vient de `R.string.unavailable_reason_*` : marque, moteur,
version d'Android, coffre vide. Le détail technique n'est ajouté que s'il diffère
du motif.

**Contact honnête.** `BrandTokens.supportUrl` vaut `https://support.invalid` par
défaut. `supportConfigured()` traite tout hôte finissant par `.invalid` comme
« pas de contact » : le bouton n'est alors **pas dessiné**, et la phrase
« Aucun contact n'est configuré dans ce build. » prend sa place. Un bouton qui
n'ouvre rien serait pire que pas de bouton. Si le contact existe mais qu'aucun
navigateur ne répond, `openSupport()` renvoie `false` et l'écran le dit aussi.

Même logique pour l'API : `BrandTokens.isValid()` est faux avec `api.invalid`, et
`refreshAvailability()` place le motif « marque non injectée » **avant** le motif
« moteur absent » — l'utilisateur voit la cause de premier rang, pas la
conséquence.

## 7. Manifeste — bloc exact à insérer

Rien n'a été écrit dans `AndroidManifest.xml`. À insérer dans `<application>`,
au même niveau que `<service>` :

```xml
        <!-- Écran unique. `exported="true"` : c'est le point d'entrée LAUNCHER,
             et lui seul. `adjustResize` : le clavier ne doit pas masquer le
             champ mot de passe. Le thème évite le flash blanc avant Compose. -->
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:theme="@style/Theme.Bouendji"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
```

Et, sur `<application>` (facultatif mais l'icône existe déjà) :

```xml
        android:icon="@mipmap/ic_launcher"
        android:roundIcon="@mipmap/ic_launcher_round"
```

Notes :

- `Theme.Bouendji` existe déjà dans `res/values/themes.xml` et
  `res/values-night/themes.xml` ; il ne porte aucune couleur d'identité, seulement
  `windowBackground` et des barres système transparentes pour `enableEdgeToEdge()`.
- Ne pas ajouter `android:configChanges` : la rotation recrée l'activité, l'état
  d'écran est dans `rememberSaveable`, et le mot de passe est volontairement en
  `remember` simple (hors Bundle).
- `android:screenOrientation` n'est pas contraint : les quatre contrôles tiennent
  en portrait comme en paysage (le contrôle Halo fait 272 dp de côté au maximum).

## 8. Routes et écrans — ce qui existe, ce qui n'existe pas

| Besoin | Route | Traitement |
|---|---|---|
| Compte | `GET /v1/me` | affiché : nom, e-mail, formule, appareils utilisés/limite, appareil courant |
| Abonnement | `GET /v1/me/subscription` | affiché : formule, état, jours restants, début, fin, limite d'appareils |
| Appareils | `GET /v1/me/devices`, `POST /v1/me/devices/current/activate`, `DELETE …` | **non utilisé** : `activateCurrentDevice()` est branché (bandeau « activation en attente »), la liste et la révocation ne le sont pas — révoquer un appareil est une action destructive qui n'était pas au brief |
| Catalogue de formules / prix | **aucune route** | l'écran Forfaits dit que les formules et tarifs ne sont pas exposés et renvoie à l'administrateur ; pas de bouton « changer de formule » |
| Nœuds configurables | **aucune route** | le nœud affiché est un nom, une région, une échéance lus dans le bundle signé ; aucun choix, aucun URI, aucun UUID |
| Achat | `POST /v1/orders` existe côté API | non branché : aucun tunnel de paiement n'est exposé dans l'app, donc aucun bouton n'est dessiné |

Aucun écran ne fabrique d'endpoint. Deux écrans consomment une route absente et
le disent : Forfaits (catalogue) et Aide (pas de gestion de compte).

## 9. Vérifié ici / à vérifier au premier build

**Vérifié par script (sorties citées) :**

- `%TEMP%\check_ui.js` → `declared resources: 133 | referenced: 133`,
  `MISSING declarations: none`, `unused declarations: none`,
  aucun `TODO`/`FIXME` dans `ui/` ;
- `%TEMP%\ui_lint2.js` → 20 fichiers UI + `MainActivity`, `unbalanced: 0` ;
  chaque `BrandIcons.*` référencé une fois, aucun symbole supprimé encore appelé ;
- `%TEMP%\contrast2.js` → 80 couples, `AA failures: 0` ;
- `collectAsState()` n'est appelé que sur des `StateFlow` (18 sites, tous des
  propriétés `StateFlow` de `AppState` / `TunnelStateBus`) ;
- signatures du socle relues une par une : `VpnTunnelService.start/stop/
  consentIntent`, `TunnelStateBus.state/detail`, `AppContainer.api/vault/
  deviceAuth/tunnelEngine` (`api` paresseux, lève si la marque est invalide),
  `ApiClient.enroll/login/logout/me/subscription/devices/fetchBundle/
  activateCurrentDevice/hasSession`, `MeResponse`/`SubscriptionResponse` et leurs
  DTO, `BundleConfig.label/region/expiresAt/maxSessionSeconds`,
  `ConfigVault.read/save/clear`, `DeviceKeys.supportsAgreement()`,
  `BrandTokens.theme/appName/supportUrl/accent/appVersion/isValid()`.

**Non vérifiable sans JDK/SDK — à contrôler au premier build :**

1. Compilation réelle des 20 fichiers Kotlin UI (imports Compose 1.7.1 /
   Material3 1.3.0, `WindowInsets.safeDrawing`, `SwitchDefaults.colors`,
   `KeyboardOptions`, `rememberLauncherForActivityResult`).
2. `foundation` n'est pas déclaré explicitement : il vient de `material3`. Si le
   build échoue sur `androidx.compose.foundation.*`, ajouter
   `androidx.compose.foundation:foundation` (même BOM).
3. Rendu des quatre identités sur 320 dp et en paysage : le disque Halo (232 dp)
   et la pastille Otaku (236 dp) sont fixes ; vérifier qu'aucun texte de durée
   (`1:23:45`) ne déborde à 46 sp.
4. Ordre de lecture TalkBack : barre (marque/retour, compte, réglages, aide) →
   titre → commande → carte sortie. La commande expose `Role.Button` et un
   `onClickLabel` (l'action), mais **le libellé d'état n'est pas fusionné** :
   vérifier que TalkBack lit bien « Connecté, Durée de session, 00:12,
   Se déconnecter ».
5. `enableEdgeToEdge()` + `windowInsetsPadding(safeDrawing)` sur API 26 et 35,
   y compris avec le clavier ouvert (`adjustResize`).
6. Icône adaptative : `mipmap-anydpi-v26` seulement (minSdk 26), pas de PNG de
   repli — vérifier l'affichage dans le lanceur.
7. Permission `POST_NOTIFICATIONS` sur Android 13+ : le `Switch` de mouvement et
   le bouton de demande sont indépendants ; vérifier que le refus système ne
   laisse pas l'écran dans un état incohérent.
8. Pluriels `node_count` et `plan_days` : deux formes seulement (`one`/`other`),
   suffisant en français ; vérifier l'accord à 0.
9. `BrandTokens.isValid()` faux dans le build par défaut : l'accueil doit
   afficher « Ce build n'a pas reçu sa configuration de marque » **avant** toute
   tentative de connexion — c'est le comportement attendu, pas un bug.

## 10. Pièges et décisions à connaître

- **Minuterie** : `TunnelStateBus` n'expose pas l'horloge du service. L'UI
  horodate le passage à `CONNECTED` dans `UiPrefs.sessionStartedAt`, le conserve
  à travers une rotation, et l'efface sur `STOPPED`, `NO_CONNECTION`,
  `SUBSCRIPTION_EXPIRED`, `DEVICE_REVOKED`. Sur `RECONNECTING`, l'horodatage est
  conservé : la session n'a pas recommencé. C'est la durée observée par l'app,
  pas la vérité du moteur — le commentaire de `UiPrefs` le dit.
- **Renouvellement** : `reconnectAfterSeconds` du moteur vaut
  `min(maxSessionSeconds) - 60`, plancher 60 s, sur les sorties **utilisables**.
  `AppState` calcule la même chose (`minOf` sur les sorties non expirées,
  plancher de 120 s par sortie) : annoncer un renouvellement plus tardif serait
  un mensonge. La carte ne l'affiche que si le tunnel vit et s'il reste du temps.
- **Sélection automatique** : `SingBoxConfig` bascule sur `AUTO_TAG` dès deux
  sorties. L'accueil affiche alors « Sélection automatique » et « Région
  inconnue » plutôt que de nommer un nœud qui n'est pas celui qui porte le
  trafic.
- **Pas d'animation d'écran** : `androidx.compose.animation` (Crossfade,
  AnimatedContent) n'est pas déclaré ; `animation-core` suffit pour les tweens.
  La navigation est un `when` sur un enum `rememberSaveable` + `BackHandler`.
- **Aucun ViewModel** : `lifecycle-viewmodel-compose` n'est pas dans les
  dépendances. `AppState` est construit par l'activité avec `lifecycleScope`,
  toutes ses propriétés exposées sont des `StateFlow`.
- **Apparence forcée la nuit** : `SideEffect` ajuste les icônes de barre système
  sur le fond réellement dessiné ; le `windowBackground` de la ressource reste
  celui du mode système, d'où un flash possible d'une frame au lancement en
  « clair » forcé la nuit.

## 11. Journal

Entrées dans `knowledge/agents/android-ui/log.md` : lecture du socle, écriture
des jetons, des composants, des écrans, des ressources, vérifications statiques,
puis clôture. Une entrée par étape réelle, avec `--etat` et `--suite`.


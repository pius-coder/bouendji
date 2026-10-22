---
id: android-toolchain
title: Chaîne Android sur cette machine — état et pièges
tags: [android, jdk, gradle, sdk, emulator, reseau]
status: verified
updated: 2026-10-21
related: [android-app, brand-build, android-ui]
---

## Décision de méthode

**WSL sert de chemin réseau, Windows sert de machine.** Le réseau de cette
machine coupe les gros transferts côté Windows (`EOF`, `SSL unexpected eof`,
`Connection reset`) alors que le même fichier passe depuis WSL. Les fichiers
téléchargés dans WSL sont donc recopiés sur `C:` — l'émulateur, Gradle, `adb` et
la compilation restent **sous Windows** :

| Étape | Lieu |
|---|---|
| Téléchargement des archives | `tools/fetch-segmented.ps1`, **sous Windows** |
| Décompression | Windows |
| JDK | `C:\Users\HP\android-toolchain\jdk17` |
| Gradle | `C:\Users\HP\android-toolchain\gradle-8.7` |
| SDK | `%LOCALAPPDATA%\Android\Sdk` |
| Compilation, émulateur, `adb` | Windows |

L'émulateur ne peut pas tourner dans WSL : il lui faut la virtualisation Windows.

> WSL a été utilisé un temps comme chemin réseau, puis **abandonné** sur demande.
> Le téléchargement segmenté Windows (`tools/fetch-segmented.ps1`) le remplace :
> même résultat, une seule machine.

## Le téléchargeur qui marche : segmenté, avec reprises

`tools/fetch-segmented.ps1` — PowerShell 5.1 + `curl.exe`, aucune dépendance.

Principe :

1. taille demandée au serveur (le **plus grand** `content-length` rencontré, six
   essais, taille mesurée en secours) ;
2. découpage en **N plages contiguës** (8 par défaut) sur ce qui **reste** ;
3. chaque plage tirée par un processus worker, en sous-tranches de 2 Mo,
   chacune vérifiée à l'octet près ;
4. recollage dans l'ordre, contrôle de la taille totale, **ouverture du zip**,
   et seulement alors mise en place.

Deux propriétés qui ont compté :

- **Reprise sans perte de méthode.** Le `.part` d'un téléchargement à une seule
  connexion est un **préfixe valide** (écriture séquentielle). Le passage au
  segmenté ne retélécharge donc pas ce préfixe : il ne découpe que la suite.
  C'est ce qui a permis de récupérer 109 Mo de JDK et 100 Mo de Gradle déjà
  obtenus autrement.
- **Une plage complète n'est jamais retéléchargée.** Relancer la commande saute
  les plages dont la taille attendue est atteinte, et va directement au
  recollage.

### Mesures relevées

| Fichier | Taille réelle | Débit |
|---|---|---|
| JDK 17 (Temurin, Windows x64) | **190 817 615 o** | ~737 Ko/s (8 plages) |
| Gradle 8.7 bin | **134 184 980 o** | ~736 Ko/s (8 plages) |
| cmdline-tools win 16111833 | **154 957 218 o** | ~737 Ko/s (8 plages) |

Cumulé : **~1,47 Mo/s** avec deux fichiers en parallèle. Les workers font surtout
gagner en **résilience** : le plafond semble être la ligne, pas le nombre de
connexions. Ne pas monter au-delà de 8–16.

## Pièges PowerShell 5.1 (chacun a tué un téléchargement)

1. **`$ErrorActionPreference = 'Stop'` + sortie sur `stderr` d'une commande
   native = erreur fatale.** `curl.exe`, `java -version` et `sdkmanager` en
   produisent en permanence. Un simple avertissement TLS transitoire tuait tout.
   → `'Continue'`, et les échecs se jugent sur des faits (comptage d'octets,
   présence de fichier), jamais sur la préférence globale.
2. **`/* ... */` n'est pas un commentaire PowerShell.** C'est `<# ... #>`. Le
   bloc a été exécuté comme commande — bruyant, mais non fatal seulement parce
   que la préférence était `Continue`.
3. **`.ExitCode` est vide sur un processus lancé par
   `Start-Process -PassThru`** si l'on n'appelle pas `WaitForExit()`. Et même
   après, il reste peu fiable. → Ne pas juger sur le code de sortie : la taille
   des plages est la preuve.
4. **Un `Content-Length: 0` en réponse à un HEAD** fait conclure à tort que le
   fichier est vide si l'on prend le *dernier* en-tête. → Prendre le maximum.
5. **Un filtre `Get-CimInstance ... -match 'mon-script'` matche la commande qui
   l'exécute.** J'ai tué ma propre session deux fois. Exclure `$PID`.

## Piège majeur — une taille correcte ne veut pas dire une archive valide

Constaté : `temurin17.zip` faisait **211 994 339 octets** et le test de taille le
déclarait complet. Il était **illisible** :

```
Impossible de trouver l'enregistrement End of Central Directory
```

Cause : des reprises `curl --continue-at -` répétées après plusieurs coupures
recollaient des morceaux décalés. Preuve décisive : les fichiers corrompus
faisaient **208 725 327 et 211 994 339** octets, soit **plus longs** que le
fichier réel (190 817 615).

**Règle :** télécharger, **vérifier l'archive** (ouverture du zip), et seulement
ensuite la mettre en place. Une taille plancher n'est qu'un premier filtre.

Corollaire : **un seul écrivain par fichier.**

## Installer le SDK en 2026 — `sdkmanager` délègue, et le `;` casse tout

`sdkmanager` **est déprécié** (cmdline-tools 16111833, juillet 2026). Son `.bat`
ne gère plus rien : il avertit, puis appelle `android.exe --sdk=… sdk %*`. Au
premier appel il tente de télécharger `android-cli.exe`
(`https://dl.google.com/android/cli/latest/windows_x86_64/android-cli.exe`) ;
ici ce transfert a échoué (`unexpected end of file`) au premier essai, puis
l'installation embarquée s'est dépliée à l'essai suivant et tout a fonctionné.

**Le piège qui a coûté la soirée.** Les noms de paquets ne s'écrivent plus de la
même façon selon l'outil :

| Outil | Forme | Exemple |
|---|---|---|
| Ancien `sdkmanager` (Java) | `;` | `platforms;android-35` |
| Android CLI (2026) | `/` | `platforms/android-35` |
| `avdmanager -k` | `;` | `system-images;android-35;google_apis;x86_64` |

Passer `;` au nouveau CLI ne donne **pas** une erreur de syntaxe : **`cmd`
traite le point-virgule comme un séparateur d'arguments**, le CLI reçoit deux
arguments et répond

```
Package platforms not found.
Package android-35 not found.
```

ce qui ressemble à « paquet inexistant » et envoie chercher au mauvais endroit.
Le script garde donc **deux variables pour la même image** (`$ImageArg` en `/`
pour l'installation, `$ImagePkg` en `;` pour l'AVD).

Vérifié après installation (tailles lues, pas supposées) :

| Fichier | Taille |
|---|---|
| `platform-tools\adb.exe` | 8 273 560 o |
| `platforms\android-35\android.jar` | 27 092 450 o |
| `build-tools\35.0.0\aapt2.exe` | 4 740 896 o |

### Archives officielles (noms extraits de `repository2-3.xml`, pas devinés)

| Paquet | Fichier | Taille |
|---|---|---|
| `platform-tools` | `platform-tools_r37.0.1-win.zip` | 8 044 989 o |
| `platforms/android-35` | `platform-35_r02.zip` | 64 273 788 o |
| `build-tools/35.0.0` | `build-tools_r35_windows.zip` | 59 878 107 o |
| `emulator` | `emulator-windows_x64-16632760.zip` | 459 732 447 o |

Les images système ont **leur propre index**, absent de `repository2-3.xml` :

- `sys-img/google_apis/sys-img2-3.xml` → `x86_64-35_r09.zip`
  (c'est celle de `system-images;android-35;google_apis;x86_64`) ;
- `sys-img/android/sys-img2-3.xml` → `x86_64-35_r02.zip` (AOSP).

Ces archives sont téléchargeables avec `tools/fetch-segmented.ps1` et
installables à la main : c'est le **chemin de secours** si le CLI redevient
incapable de joindre son dépôt.

## Gradle et la ligne — la boucle de reprise

Premier `assembleDebug` lancé pour de vrai : **`BUILD FAILED in 3m41s`**, sur
deux artefacts seulement, avec la même signature que les gros transferts :

```
Could not download gradle-8.5.2.jar (com.android.tools.build:gradle)
Could not download compose-compiler-gradle-plugin-2.0.20-gradle85.jar
  > Remote host terminated the handshake
```

Ni un problème de code ni de version : le TLS est coupé en pleine poignée de
main, sur `dl.google.com` comme sur `repo.maven.apache.org`. Point capital :
**325 Mo étaient déjà en cache et 72 groupes résolus**. Gradle conserve chaque
artefact obtenu, donc relancer repart d'un cache plus complet — le progrès est
monotone, l'échec n'est pas un tirage au sort.

`tools/build-apk.ps1` exploite cette propriété : jusqu'à `-Attempts` reprises
(12 par défaut), avec des délais allongés et des reprises internes de Gradle :

```
-Dorg.gradle.internal.http.socketTimeout=180000
-Dorg.gradle.internal.http.connectionTimeout=90000
-Dorg.gradle.internal.repository.max.retries=12
-Dorg.gradle.internal.repository.retry.delay=4000
```

Le succès se juge sur **deux** faits : code de sortie 0 **et** présence de
`app-debug.apk`. Jamais sur l'absence de message d'erreur.

## Versions

`agp = 8.5.2`, `kotlin = 2.0.20`, `compileSdk = 35`, `minSdk = 26`,
`targetSdk = 35`, Gradle 8.7, JDK 17 (`openjdk 17.0.20.1 2026-08-18`, relevé par
`java -version`).

**Avertissement attendu, pas une erreur.** AGP 8.5.2 a été testé jusqu'à
`compileSdk 34` : compiler avec 35 produit « We recommend using a newer Android
Gradle plugin ». Le build continue. Si un jour ce message devient bloquant, le
remède est la propriété `android.suppressUnsupportedCompileSdk=35`, pas un
downgrade de la plateforme.

## Appareil de test réel

Un Pixel 8 est branché en USB et **autorisé** (empreinte acceptée sur le
téléphone) :

```
39141FDJH00GAV   device   product:shiba_beta   model:Pixel_8
Android 17 — API 37
```

L'app cible `targetSdk 35` : l'installation sur une API 37 reste **à prouver**
par un `adb install` réussi, pas par déduction.

Rappel de la séquence : `adb devices` doit afficher `device`, pas
`unauthorized`. `unauthorized` signifie « empreinte non acceptée à l'écran du
téléphone », jamais « câble ou pilote défaillant ».

## Ce qui n'a pas encore été prouvé

`assembleDebug` a été **exécuté** et a échoué sur le réseau, pas sur le code :
aucun `app-debug.apk` n'existe encore. La chaîne est **installée et vérifiée
pièce par pièce, mais pas prouvée de bout en bout**. Tant que l'APK n'existe pas,
les versions du catalogue sont résolues par Gradle mais jamais compilées.

## Le nœud reste faux sans `libbox`

Même une fois l'APK compilé, le tunnel ne s'établit pas : `TunnelEngine` n'a pas
d'adaptateur `libbox` branché. L'APK prouve la chaîne de compilation et l'écran,
pas le transport.

## Image système de l'émulateur installée à la main (2026-10-21)

L'utilisateur a fourni une archive locale au lieu de laisser Android Studio
télécharger :

```
source   C:\Users\HP\Downloads\Compressed\x86_64-37.0_r06.zip   2,33 Go
cible    %LOCALAPPDATA%\Android\Sdk\system-images\android-37.0\google_apis_playstore\x86_64\
```

`source.properties` de l'archive (lu avant extraction, pas deviné) :

```
SystemImage.TagId=google_apis_playstore,ai_glasses_compatible
AndroidVersion.ApiLevel=37.0      Pkg.Revision=6
AndroidVersion.ExtensionLevel=22  Pkg.Dependencies=emulator#36.5.11
```

Procédure réellement exécutée :

1. `tar -xf <zip> -C <cible>` — la racine de l'archive est déjà `x86_64/`, donc
   elle atterrit exactement sur le bon chemin. 27 s, 32 fichiers, 2,74 Go.
   `system.img` = 2 809 135 104 o, `vendor.img` = 72 351 744 o.
   **`userdata.img` est absent : c'est normal**, l'image le crée au premier boot.
2. Le zip **ne contient pas `package.xml`** : sans lui, `sdkmanager`,
   `avdmanager` et le Device Manager d'Android Studio ne voient pas l'image,
   même complète. Fichier écrit à la main dans le dossier `x86_64/`, avec
   `path="system-images;android-37.0;google_apis_playstore;x86_64"`,
   `type-details xsi:type="ns3:sysImgDetailsType"`, `api-level 37.0`,
   `extension-level 22`, `tag/id google_apis_playstore`, `abi x86_64`,
   `revision major 6`.
3. Preuve que le dépôt local l'accepte :
   `avdmanager create avd -n Pixel_8_API_37 -k "system-images;android-37.0;google_apis_playstore;x86_64" -d pixel_8`
   → `Auto-selecting single ABI x86_64`, AVD `Pixel_8_API_37` créé.

Émulateur présent : `37.2.12.0`, supérieur au minimum `36.5.11` exigé par
l'image. **Boot de l'AVD non encore exécuté** : l'image est reconnue, pas prouvée
démarrable. L'appareil de référence reste le Pixel 8 en USB.

## Piège Kotlin : commentaire imbriqué

`ApiClient.kt` ne compilait pas (`Syntax error: Unclosed comment`, ligne 713).
Cause : **Kotlin imbrique les commentaires bloc**. Un KDoc contenant `routes/*.ts`
ou `/v1/auth/*` ouvre un second commentaire qui ne se referme jamais. Correctif :
ne jamais écrire la séquence `/*` dans un commentaire ; nommer les fichiers
(`apps/api/src/routes`) ou un chemin réel (`/v1/auth/login`). Un `grep '/\*'`
qui ne regarde que les ouvertures ne suffit pas : il faut vérifier chaque ligne
qui contient `/*` sans `*/`.
## Premier APK réellement exécuté (2026-10-21)

Chaîne prouvée de bout en bout, pour la première fois :

```
:app:compileDebugKotlin   BUILD SUCCESSFUL  1 min 23 s
:app:assembleDebug        BUILD SUCCESSFUL  44 s
app-debug.apk             85,3 Mo
adb install -r            Success
am start                  Starting: Intent { cmp=cm.bouendji.vpn/.MainActivity }
```

**`compileDebugKotlin` a échoué jusque-là à cause d'un commentaire imbriqué**,
pas d'un problème d'outillage : voir la section « Piège Kotlin » plus haut.

**API 37 : installation prouvée sur émulateur**, pas encore sur le Pixel 8
(appareil absent au moment du test). L'APK cible `targetSdk 35` et s'installe
sur `android-37.0` sans avertissement de compatibilité.

### Émulateur

`Pixel_8_API_37` (image `google_apis_playstore` x86_64, API 37.0, révision 6).
WHPX est installé et utilisable (`emulator -accel-check` → `WHPX(10.0.22000) is
installed and usable`). `avdmanager` avait écrit `hw.gpu.enabled=no` et
`PlayStore.enabled=no` ; corrigé à la main en `hw.gpu.enabled=yes`,
`hw.gpu.mode=host`, `hw.ramSize=3072`, `PlayStore.enabled=yes`. Boot complet en
moins de 5 minutes, `sys.boot_completed=1`, appareil `emulator-5554`.

### Ce que l'écran montre, et ce qu'il ne prouve pas

Première capture réelle : barre 1 + 3 conforme, orbe central, cartes de verre,
état `Hors ligne`, mention « Le moteur sing-box n'est pas chargé dans cette
version. »

- **C'est normal sur l'émulateur** : `libbox.aar` est compilé **arm64-v8a
  uniquement**. Aucun `libbox.so` x86_64 n'existe, donc
  `TunnelEngine.isAvailable()` renvoie `false`. Le tunnel ne peut pas être
  prouvé sur émulateur ; il faut le Pixel 8 (arm64).
- **L'écran n'est pas encore l'atelier** : l'accent Halo du code Compose est
  `#7DE2D1` (menthe) alors que l'atelier impose `#0A7CFF` (bleu), et l'orbe
  n'affiche pas l'arc de progression à 6 px avec `drop-shadow`. Écart de
  matière à corriger avant de montrer l'app comme « finie ».
- **Aperçus Android Studio** : `ui/Previews.kt` déclare sept `@Preview`
  (Halo sombre/clair, Mono, Vector, Otaku, aucune sortie) pour juger la matière
  sans appareil. `ui-tooling-preview` et `ui-tooling` sont déjà au catalogue.


## Accent Halo aligné sur l'atelier (2026-10-21, vérifié)

L'atelier impose --accent:#0a7cff en clair comme en sombre (aucune surcharge
dark de l'accent, vérifié dans preview/halo/atelier.css:26 et :368-377).
Le code Compose utilisait #7DE2D1 (sombre) et #0FAE96 (clair) : corrigé
dans ui/theme/Identity.kt vers  xFF0A7CFF + ccentInk blanc + glow bleu
des deux côtés. Rebuild ssembleDebug 6 s, réinstall sur emulator-5554,
orce-stop + relance (l'instance chaude gardait l'ancien APK), capture
%TEMP%\opencode\android-4.png : pastille et bouton bleus, conforme.

## Orbe Halo fidèle à l'atelier (2026-10-21, vérifié)

Constat utilisateur : « l'aperçu est moche ». Écarts mesurés contre
preview/halo/atelier.css et corrigés dans ui/HomeScreen.kt (PowerControl)
et ui/Atmosphere.kt (haloBackdrop), ui/theme/Identity.kt :
- anneau 1 px + traits « lunette » inventés → piste 6u + arc 6u (u = largeur/210),
  traits et pulsations supprimés (absents de l'atelier) ;
- halo de l'arc en trois passes (14u @ 10 %, 10u @ 22 %, 6u @ 100 %), équivalent
  du drop-shadow(0 0 9px rgba(10,124,255,.42)) ;
- disque 0.62 → 0.90 de la taille (atelier : 186/210 = 0.886), dégradé radial
  verbatim .halo-orb-in (clair : #FFFFFF → #D1FFFFFF → #9EF0F7FF → #8CE2EEFF ;
  sombre : #22304A → #F0182236 → #F50E1522), reflet haut inset 0 1px 0,
  ombre portée 16 dp, bordure blanche .95 en clair ;
- aurore : blobs #A9CCFF/#CBB8FF/#BFE4FF aux alphas atelier (.65/.65/.50 clair,
  × .34 en sombre = opacité du conteneur), fond en dégradé vertical verbatim ;
- chrono Halo : display 42sp Light → 34sp/640/-0.7sp (halo-time) ; titre
  21sp → 27sp/640 (halo-h). Usages 	ype.display/	ype.title vérifiés :
  tous sont des chronos ou des titres, aucun détournement.
- anneau complet seulement si CONNECTED (tunnel établi = fait réel) ; STOPPED =
  piste seule, jamais de progression inventée.

Piège Kotlin rencontré : le paramètre size: Dp de PowerControl masque
DrawScope.size dans les lambdas Canvas{} → erreur Function invocation
'width(...)' expected. Correctif : qualifier 	his.size dans les blocs Canvas.
ssembleDebug BUILD SUCCESSFUL, réinstall + force-stop + relance sur
emulator-5554, capture %TEMP%\opencode\android-5.png.

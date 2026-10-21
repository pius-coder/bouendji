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
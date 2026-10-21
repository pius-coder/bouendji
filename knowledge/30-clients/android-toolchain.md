---
id: android-toolchain
title: Chaîne Android sur cette machine — état et pièges
tags: [android, jdk, gradle, sdk, emulator, reseau]
status: verified
updated: 2026-10-20
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

## Versions (à confirmer au premier build)

`agp = 8.5.2`, `kotlin = 2.0.20`, `compileSdk = 35`, `minSdk = 26`,
`targetSdk = 35`, Gradle 8.7, JDK 17.

**Avertissement attendu, pas une erreur.** AGP 8.5.2 a été testé jusqu'à
`compileSdk 34` : compiler avec 35 produit « We recommend using a newer Android
Gradle plugin ». Le build continue. Si un jour ce message devient bloquant, le
remède est la propriété `android.suppressUnsupportedCompileSdk=35`, pas un
downgrade de la plateforme.

## Ce qui n'a pas encore été prouvé

Aucun `gradlew assembleDebug` n'a été exécuté. Tant qu'il ne l'est pas, la
chaîne est **installée, pas prouvée** : les versions du catalogue sont celles que
Gradle n'a jamais résolues. Le premier build est le seul verdict.

## Le nœud reste faux sans `libbox`

Même une fois l'APK compilé, le tunnel ne s'établit pas : `TunnelEngine` n'a pas
d'adaptateur `libbox` branché. L'APK prouve la chaîne de compilation et l'écran,
pas le transport.
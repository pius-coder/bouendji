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
| Téléchargement des archives | WSL (`curl`) |
| Décompression | Windows |
| JDK | `C:\Users\HP\android-toolchain\jdk17` |
| Gradle | `C:\Users\HP\android-toolchain\gradle-8.7` |
| SDK | `%LOCALAPPDATA%\Android\Sdk` |
| Compilation, émulateur, `adb` | Windows |

L'émulateur ne peut pas tourner dans WSL : il lui faut la virtualisation Windows.

## Piège majeur — une taille correcte ne veut pas dire une archive valide

Constaté : `temurin17.zip` faisait **211 994 339 octets** et mon test de taille le
déclarait complet. Il était **illisible** :

```
Impossible de trouver l'enregistrement End of Central Directory
```

Cause : une reprise `curl --continue-at -` répétée après plusieurs coupures
recollé des morceaux décalés. L'en-tête `PK` est là, la fin non.

**Règle adoptée :** télécharger dans un fichier `.part`, **vérifier l'archive**
(`unzip -t`, sinon `python3 -c "import zipfile..."`), et seulement ensuite la
mettre en place. Une taille plancher n'est qu'un premier filtre, jamais une
preuve. Le script est `tools/fetch-android-archives.sh`.

Corollaire : **un seul écrivain par fichier.** Deux scripts lançant en parallèle
des reprises sur la même cible ont produit une archive tronquée à 44 Mo pendant
qu'un autre la reconstruisait.

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
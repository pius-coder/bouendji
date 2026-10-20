---
id: android-ui
title: Interface Compose — écrans, commande principale, manifeste
tags: [android, compose, ui, ecrans, identites, motion, manifeste]
status: decided
updated: 2026-10-20
related: [ui-identities, android-app, brand-build]
---

# Interface Compose

## Ce qui existe

| Dossier | Contenu |
|---|---|
| `ui/AppRoot.kt` | racine : fond d'identité, barre **1 + 3**, cinq écrans, `BackHandler` |
| `ui/AppState.kt` | état unique (flux), actions (connexion, accès, forfaits), traduction des erreurs en phrases |
| `ui/UiPrefs.kt` | apparence (`AUTO`/`LIGHT`/`DARK`), mouvement réduit, début de session |
| `ui/Support.kt` | ouverture du contact de marque et des réglages VPN système |
| `ui/theme/Tokens.kt` | `Palette`, `ShapeScale`, `TypeScale`, `MotionScale`, `BrandTheme`, `brandTheme()` |
| `ui/theme/BrandTheme.kt` | `BouendjiTheme` (Material 3), `LocalBrandTheme`, styles de texte |
| `ui/theme/Motion.kt`, `ColorMath.kt` | durées/ressorts par identité, contraste et encre lisible |
| `ui/components/` | `BrandTopBar`, `PrimaryControl`, `Surfaces` (panneau, pilule, action, notice), `BrandIcons` (SVG en code), `Format` |
| `ui/screens/` | `HomeScreen`, `AccountScreen`, `PlansScreen`, `SettingsScreen`, `HelpScreen` |
| `res/` | `strings.xml` (131 chaînes), `themes.xml`, `colors.xml` (+ nuit), icône adaptative en XML |

`MainActivity` construit `AppState` une seule fois avec le scope de l'activité,
choisit clair/sombre (système ou forçage), reconstruit le thème quand
l'apparence ou le mouvement changent, et aligne les icônes de barre système sur
le fond réellement dessiné.

## Barre supérieure : 1 + 3

Une action à gauche — retour quand on n'est pas à l'accueil, marque sinon —
et **trois** à droite : compte, réglages, aide. Jamais quatre, jamais un menu
« … » qui cacherait la moitié de la navigation.

## Commande principale

Quatre états seulement : `Idle`, `Connecting`, `Connected`, `Degraded`. Les
trois autres états du socle (`NO_CONNECTION`, `SUBSCRIPTION_EXPIRED`,
`DEVICE_REVOKED`) **remplacent l'écran** : appuyer sur un bouton n'y changerait
rien, donc il n'y a pas de bouton.

Le **temps de session est dessiné à l'intérieur** de la commande, dans les
quatre variantes d'identité : anneau (halo), bloc éditorial (mono), tube (CRT),
case (otaku). `PrimaryControl.kt` porte les quatre, choisies par
`BrandTokens.theme` — pas par une préférence utilisateur.

## Ce que l'écran ne montre jamais

Ni URI, ni UUID, ni tag interne, ni nom de sortie serveur. Une sortie est un
libellé court, une région et une échéance (`NodeSummary`). Les erreurs réseau
sont traduites (`notice_network`, `notice_unknown`) ; un message technique de
`BrandTokens.requireValid()` n'est jamais affiché tel quel.

## Manifeste

L'activité a été ajoutée par l'orchestrateur après la mort du sous-agent :

```xml
<activity android:name=".MainActivity" android:exported="true"
          android:launchMode="singleTop" android:theme="@style/Theme.Bouendji"
          android:windowSoftInputMode="adjustResize">
    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>
</activity>
```

`singleTop` évite qu'une réouverture depuis le lanceur crée un second
`AppState` et réabonne le bus d'état. Aucun schéma d'import, aucun lien profond
de configuration. `android:icon` / `roundIcon` pointent sur l'icône adaptative
en XML (`mipmap-anydpi-v26`), cohérente avec `minSdk = 26`.

## Vérifié ici

- Audit de ressources (script local, 31 fichiers Kotlin, 9 XML) : **160
  références `R.*`, 0 manquante** ; les 131 chaînes utilisées existent.
- Références du manifeste résolues : `@style/Theme.Bouendji`,
  `@mipmap/ic_launcher`, `@mipmap/ic_launcher_round`. XML valide, 1 activité.
- Budget de permissions inchangé : `INTERNET`, `ACCESS_NETWORK_STATE`,
  `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SPECIAL_USE`, `POST_NOTIFICATIONS`.
- Aucune API `Experimental*` utilisée sans `@OptIn` (aucune occurrence).
- Surface du socle recoupée à la main : `ApiClient` (`enroll`, `login`,
  `logout`, `me`, `subscription`, `activateCurrentDevice`, `hasSession`,
  `fetchBundle`), `BundleFetch`, `ApiException.status/isNetwork`,
  `ConfigVault.read/save/clear`, `BundleConfig` (`label`, `region`,
  `expiresAt`, `maxSessionSeconds`), `TunnelState` (7 valeurs),
  `TunnelStateBus.state/detail`, `parseInstant` — tout existe, signatures
  compatibles.

## Non vérifié

Aucune compilation : ni JDK, ni SDK, ni Gradle sur cette machine. Tout le lot
est **relu**, pas exécuté. Restent à confirmer au premier build :

- les versions du catalogue (`agp 8.5.2`, `kotlin 2.0.20`, BOM Compose
  `2024.09.00`, `compileSdk 35`) ;
- le rendu réel des quatre variantes (mesures, débordements, contraste) ;
- le comportement de `VpnService` (déjà non compilé au lot précédent) ;
- `libbox` n'est toujours pas branché : `UnavailableTunnelEngine` fait que
  l'app dit honnêtement qu'elle ne peut pas se connecter.

## Règles à ne pas casser

- Le thème vient de `BrandTokens` (build), jamais d'un réglage serveur ou d'un
  tirage aléatoire.
- Le timer reste **dans** la commande ; le poser au-dessus est un défaut déjà
  relevé dans `ui-identities`.
- Un écran sans bouton quand l'action n'aurait aucun effet.
- Aucune image binaire : icônes en `ImageVector` de code, icône adaptative en
  XML.

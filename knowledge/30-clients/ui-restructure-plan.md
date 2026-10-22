---
id: ui-restructure-plan
title: Plan de restructuration des interfaces Android
tags: [android,ui,parcours,compose]
status: decided
updated: 2026-10-21
related: [android-ui-research, ui-v2-html-audit, journeys, decisions]
---

# Plan de restructuration des interfaces — Android

Statut : **proposition de l'orchestrateur** (2026-10-21), à trancher par l'utilisateur.
Sources : `00-brief/decisions.md` (D1–D34), `30-clients/android-ui.md`,
`30-clients/ui-identities.md`, `20-backend/*`, `40-money/*`, `50-security/*`.
Références visuelles : `outputs/Atelier-identites-VPN-v2.html` (identités),
prototype partenaire `lelexxl2a2` (parcours uniquement).

## Principe directeur

On ne copie ni le prototype ni l'atelier. On prend :

- **la structure** décidée dans `android-ui.md` : **5 écrans**, barre 1 + 3 ;
- **les parcours** du prototype partenaire, seulement là où le serveur sait les servir ;
- **la matière** de l'atelier : 4 identités, injectées au build (D2, D30).

Tout écran du prototype qui n'a pas de route API ni de décision derrière lui
est **supprimé ou rétrogradé en état**, jamais recopié tel quel.

## Les 5 écrans officiels et ce qu'ils absorbent

| Écran officiel | Absorbe (prototype) | Contenu servi par | États obligatoires |
|---|---|---|---|
| **Accueil** (`HomeScreen`) | `home`, `servers` (en section), `vpn-auth` (étape) | bundle de configs (D6), mesure locale Clash | `Idle`, `Connecting`, `Connected`, `Degraded` (D18) |
| **Compte** (`AccountScreen`) | `login`, `profile`, `subscription` (statut), `devices` | `me`, `me/subscription`, `me/devices` | non connecté, connecté, appareil révoqué |
| **Forfaits** (`PlansScreen`) | `order`, `order-done`, `paywall` | offres + commandes API, Fapshi (D13–D15) | `payment_pending`, `payment_confirmed`, `access_active` — jamais confondus |
| **Réglages** (`SettingsScreen`) | `settings` | préférences locales uniquement | apparence AUTO/CLAIR/SOMBRE, mouvement réduit |
| **Aide** (`HelpScreen`) | `help`, `privacy` (en section) | contact de marque (D19), textes de marque | — |

## États qui remplacent l'écran (sans bouton, sans navigation)

Décidés dans `android-ui.md` : ils ne sont pas des pages, ils prennent tout l'écran.

| État | Déclencheur | Contenu exact |
|---|---|---|
| `NO_CONNECTION` | plus aucune config valide (D19) | « aucune connexion disponible » + contact direct de l'admin de la marque + reprise auto avec backoff |
| `SUBSCRIPTION_EXPIRED` | abonnement expiré | renvoi vers Forfaits, aucun bouton de connexion |
| `DEVICE_REVOKED` | appareil révoqué côté serveur | explication + contact marque ; aucune promesse de coupure immédiate (D23) |

## Sort des 15 écrans du prototype

| # | Écran prototype | Verdict | Raison |
|---|---|---|---|
| 1 | `splash` | **état de démarrage** | pas un écran navigable |
| 2 | `onboarding` | **flux d'entrée** du Compte | une fois, avant enrôlement (D4) |
| 3 | `login` | **Compte** (état non connecté) | routes `auth/*` existantes côté client |
| 4 | `vpn-auth` | **étape** de la connexion Accueil | la fenêtre système Android ne se dessine pas |
| 5 | `home` | **Accueil** | écran principal, commande à 4 états |
| 6 | `servers` | **section de l'Accueil** | D18 : choix = préférence, automatisme obligatoire ; une sortie = libellé + région + échéance, jamais d'UUID |
| 7 | `nji` (code d'accès) | **SUPPRIMÉ pour l'instant** | aucun système de codes côté serveur (`20-backend` : « aucun échange de code ») ; le réintroduire = décision produit + routes à créer |
| 8 | `order` | **Forfaits** | commande créée côté API, jamais chez Fapshi (D14) |
| 9 | `order-done` | **Forfaits** (état confirmé) | distinguer paiement confirmé et accès actif |
| 10 | `paywall` | **Forfaits** (état expiré) + état plein écran | pas d'écran marketing séparé |
| 11 | `subscription` | **Compte** (section statut) | échéance, appareils, reçus |
| 12 | `devices` | **Compte** (section) | révocation par appareil (D22, D23) |
| 13 | `invite` | **SUPPRIMÉ** | aucune mécanique de parrainage en mémoire ; D15 attache la commission à la commande, pas à un code d'invitation |
| 14 | `profile` | **Compte** | — |
| 15 | `settings` | **Réglages** | — |
| 16 | `help` | **Aide** | + contact marque obligatoire (D19) |
| 17 | `privacy` | **Aide** (section) | engagements vérifiables, pas de promesse non tenue |

## Règles qui s'imposent à chaque écran

- Barre **1 + 3** : retour/marque à gauche ; compte, réglages, aide à droite. Jamais 4 actions, jamais de menu « … » (`ui-identities.md`).
- Chrono **dans** la commande principale, dessiné selon l'identité : anneau (Halo), bloc (Mono), tube (Vector), case (Otaku).
- Jamais affichés : `vless://`, UUID, chemin WS, tag interne, nom de sortie serveur, débit non mesuré (`android-ui.md`, `threat-model.md`).
- Latence affichée seulement si mesurée localement ; appareils = compte réel renvoyé par l'API.
- Ne jamais écrire « protégé » si le tunnel ne passe pas.
- Prix : **O12 toujours ouverte** — le seed affiche des provisoires (5 000 / 13 500 / 48 000 XAF) signalés comme tels. Aucun prix inventé dans une maquette présentée comme finale.
- Nombre d'appareils par offre : **non décidé** en mémoire (seul le « 1 UUID par appareil » technique l'est). Le « 1 / 3 » du prototype n'a aucune source.

## Identités : comment elles portent les écrans

- Une seule structure de composants ; l'identité ne change que les jetons (`Palette`, `ShapeScale`, `TypeScale`, `MotionScale`) et le rendu du chrono.
- Identité figée **au build** par marque (D2, D30) : jamais de sélecteur dans l'app.
- La revue visuelle doit donc montrer : Accueil × 4 identités (atelier, verbatim) + les 4 autres écrans et les 3 états plein écran **dans une identité**, puis déclinaison des 4 autres écrans × 3 identités restantes seulement si l'utilisateur veut juger chaque matière sur chaque écran.

## Ordre de construction

1. Revue HTML restructurée selon ce plan (remplace `preview/app/` et `preview/halo/` actuels).
2. Correction `ApiClient.kt` (commentaires non fermés l. 27/30) → compilation.
3. Portage Compose écran par écran, dans l'ordre : Accueil, Compte, Forfaits, Réglages, Aide.
4. APK sur l'appareil de l'utilisateur à chaque écran terminé.
5. Dashboard (9 écrans décidés dans `admin-dashboard.md`, origine Vercel séparée, D32) : chantier séparé, bloqué par la route `POST /v1/admin/auth/login` absente.

## Décisions que ce plan exige de l'utilisateur

1. **Code d'accès (`nji`)** : supprimé, ou canal revendeurs à construire côté serveur d'abord ?
2. **Invitation (`invite`)** : supprimée, ou mécanique de parrainage à décider (crédit, plafond, anti-abus) ?
3. **Choix du serveur** : section dans l'Accueil (recommandé, D18) ou écran séparé comme le prototype ?
4. **Prix et nombre d'appareils** (O12) : provisoires affichés comme tels, ou valeurs réelles maintenant ?

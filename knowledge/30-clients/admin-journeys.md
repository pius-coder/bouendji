---
id: admin-journeys
title: Parcours administrateur, architecture des écrans et ordre des lots (refonte 2)
tags: [dashboard, ux, parcours, onboarding, cache, temps-reel, plan]
status: assumption
updated: 2026-10-26
related: [dashboard-plan, admin-access-flows, decisions, journeys, aura-vps-3x-ui]
---

# Parcours administrateur — refonte 2

> **Version 1 refusée par l'utilisateur (2026-10-26)** : trop simplifiée, sans
> diagrammes, sans composants par action, et fausse sur un point : ce n'est
> **pas l'owner** qui crée les marques. Chaque admin de communauté crée sa
> communauté et sa marque **pendant son onboarding** et **demande** son build ;
> l'owner **valide**, la pipeline construit et dépose l'APK sur R2. L'owner
> doit voir **qui est connecté**. Version 2 (diagrammes, rôles, chaque écran
> avec composants, clics et routes API) :
> https://claude.ai/artifact/Sxajm3C2zFFcdiyZaBrRPm — en attente de validation.
> Texte complet versionné : `docs/refonte-admin/parcours-admin-bouendji-v2.md`
> (copie du 2026-10-28, SHA-256 `85b20340…42da490426b2a1e08c`).
> Les sections ci-dessous (P1 en particulier) sont remplacées par cette page.

> **Pourquoi ce nœud.** Constat de l'utilisateur (2026-10-26) : la refonte 1 a
> posé un écran par route API (« des couches d'écran sur les API »), sans
> analyse des séquences d'un administrateur. Résultat : 3 pages pour créer un
> admin et sa communauté, aucun lien entre les données, une barre basse à plat,
> un skeleton à chaque navigation. Ce nœud part **des parcours**, puis en
> déduit les écrans. Statut `assumption` tant que l'utilisateur ne l'a pas validé.

## 1. Décisions de l'utilisateur intégrées (2026-10-26)

- Forfaits : **Limité** et **Limité + illimité de nuit** (20 h-24 h, 24 h-4 h,
  20 h-4 h) — D115. Limité piloté automatiquement dans 3x-ui — D113, D114.
- **Pas d'email** : WhatsApp (lien du groupe + numéro de l'admin) par
  communauté ; pop-up de bienvenue dans l'app — D116.
- Mot de passe admin : changement **forcé** à la première connexion pour tout
  admin créé avec un mot de passe temporaire, y compris les admins déjà en
  prod ; les autres sessions sont coupées après le changement ; écran
  « Mon compte » (profil, mot de passe, sessions, thème).
- Création d'une marque : **assistant**, puis **onboarding** de l'admin de
  communauté à sa première connexion (« Bienvenue dans ta communauté »).
- Peu de pages : une page par **sujet**, le détail et les actions en
  **tiroirs** (drawer) et **dialogues**, tous les composants shadcn.
- Cache : pas de skeleton à chaque visite, peu de charge serveur, données
  rafraîchies **sans sondage périodique** (pas de polling).
- Lien VLESS : le champ analyse le lien collé et remplit le reste.
- Noms de serveurs : génériques, tirés au hasard.
- App Android : « Activity » n'est pas une page mais un **bouton** qui ouvre
  une feuille (bottom sheet) : débit en direct, data reçue/envoyée, data
  restante.

## 2. Acteurs

| Rôle | Ce qu'il fait |
|---|---|
| `owner` (plateforme) | Crée les marques, les admins, gère le réseau et les versements |
| `community_admin` | Gère sa marque : forfaits, abonnés, appareils, APK, équipe |
| `support` | Aide les abonnés : recherche, appareils, fichiers de secours |
| `finance` | Commissions, prépare les versements |

## 3. Parcours

### P0 — Connexion et mot de passe temporaire
```
login → [must_change_password ?] → écran forcé (actuel / nouveau / confirmation)
      → sessions révoquées sauf la courante → [communauté non configurée ?] → onboarding
      → accueil
```
- Un admin déjà connecté avec un mot de passe temporaire est **redirigé** à sa
  prochaine requête (le BFF lit l'indicateur sur `/admin/me`). Aucune page
  n'est accessible tant que le mot de passe n'est pas changé.

### P1 — L'owner crée une marque (assistant, reprenable)
1. **Communauté** : nom, lien du groupe WhatsApp, numéro WhatsApp de l'admin, commission.
2. **Application** : nom affiché, couleur, logo ; identifiant de paquet déduit.
3. **Administrateur** : nom, identifiant ; mot de passe temporaire **généré**,
   montré une fois avec un bouton « Envoyer sur WhatsApp ».
4. **Forfaits** : préremplis à partir de modèles (Limité, Limité + nuit), prix à saisir.
5. **APK** : lancer le build ; le lien d'installation apparaît quand il est prêt.

Chaque étape écrit en base ; quitter l'assistant laisse une fiche communauté
avec la liste « ce qui reste à faire ».

### P2 — Première connexion d'un admin de communauté
P0, puis « Bienvenue dans <communauté> » : liste de contrôle (WhatsApp, forfaits
et prix, plages de nuit, APK, lien d'installation à partager). Chaque élément
ouvre le tiroir qui le règle. La liste disparaît quand tout est fait.

### P3 — Le quotidien (accueil = poste de pilotage)
- Chiffres du jour (ventes, abonnés actifs, data consommée).
- **À traiter** : paiements en attente, appareils en échec, demandes de secours,
  versements à approuver. Chaque ligne ouvre son tiroir.
- Activité récente. Tout nom (abonné, commande, appareil) est un lien vers son tiroir.

### P4 — Aider un abonné
Recherche globale (nom, téléphone, n° de commande) → **tiroir abonné** :
forfait, consommation (quota / reste), appareils, commandes → actions :
révoquer un appareil, émettre un fichier de secours, ouvrir WhatsApp.

### P5 — Offres
Une page : forfaits (liste + tiroir d'édition, options de plage de nuit et
leurs prix) et l'application (marque, builds APK, lien d'installation).

### P6 — Argent
Une page à onglets : commissions, versements (préparer, approuver, payer, confirmer).

### P7 — Réseau (owner)
Serveurs illimités par créneau (20 h, 24 h), serveurs limités 3x-ui, santé,
ajout par lien VLESS collé. Noms aléatoires.

### P8 — Mon compte
Profil, mot de passe, sessions ouvertes (révoquer), thème.

## 4. Architecture des écrans (proposée)

| Section (barre basse mobile / rail desktop) | Contenu | Rôles |
|---|---|---|
| Accueil | P3 | tous |
| Abonnés | onglets Abonnés · Appareils · Commandes · Secours ; tiroirs | admin, support |
| Offres | onglets Forfaits · Application | admin |
| Argent | onglets Commissions · Versements | admin, finance, owner |
| Plus | Communauté (WhatsApp, équipe, journal) · Plateforme (owner : communautés, admins, réseau) · Mon compte | selon rôle |

- Le header ne répète pas la navigation : titre, recherche globale,
  sélecteur de communauté (owner), compte.
- 5 sections au plus en bas, les onglets à l'intérieur de la page.

## 5. Données : cache et fraîcheur (proposé, à valider)

1. **Cache client** (TanStack Query) : une page déjà visitée s'affiche
   immédiatement depuis le cache, puis se met à jour en arrière-plan. Après une
   action, seules les données touchées sont invalidées. Retour sur l'onglet →
   rafraîchissement. Aucun sondage périodique.
2. **Push d'invalidation (SSE)** : l'API (Fastify sur le VPS, qui supporte les
   connexions longues) publie de petits événements « ce qui a changé »
   (`orders:<communauté>`, `devices:…`) déclenchés par Postgres
   `LISTEN/NOTIFY`. Le navigateur s'y abonne avec un **ticket court** émis par le
   BFF (les secrets restent côté serveur). À réception, le cache invalide la
   requête concernée. C'est le comportement « Convex » sans WebSocket ni polling.
   Vercel coupe les fonctions longues : le flux SSE ne passe donc **pas** par
   Vercel mais va directement à l'API.

## 6. Fichier de secours — état vérifié (2026-10-26)

Lu dans `apps/api/src/services/offlineBundles.ts` et
`apps/android/.../offline/OfflineBundle.kt` :
- contenu **scellé pour la clé d'accord de l'appareil** (ECDH P-256 → HKDF →
  AES-GCM, `lib/crypto.ts` `sealForDevice`), clé privée dans le Keystore,
  non exportable ;
- conteneur signé Ed25519, clé publique épinglée dans l'app ;
- `notAfter` court, usage unique (marqué consommé côté app et côté API).

Différence avec les fichiers de type NPV Tunnel : ceux-là sont chiffrés avec
une clé embarquée dans l'app, donc lisibles par quiconque l'extrait. Ici, sans
le Keystore de **l'appareil destinataire**, le fichier ne s'ouvre pas.
Risques restants : appareil rooté (la config est en mémoire pendant la
connexion) ; le fichier n'est pas effacé chez l'utilisateur (sans danger s'il
est consommé). Flux non testé de bout en bout sur appareil (relu).

## 7. Lots (ordre proposé)

| Lot | Contenu | Pourquoi d'abord |
|---|---|---|
| R1 | API + dashboard : `must_change_password`, écran forcé, révocation des sessions, Mon compte | admins déjà en prod avec mot de passe temporaire |
| R2 | Shell : 5 sections, onglets, header sans doublon, recherche globale, cache client | base de toutes les pages |
| R3 | Pages fusionnées + tiroirs liés (abonné, appareil, commande) | fin des pages creuses |
| R4 | Communauté : champs WhatsApp ; assistant P1 ; onboarding P2 | création d'une marque |
| R5 | Forfaits 2 familles (schéma, API, dashboard) + page de paiement app | modèle commercial |
| R6 | 3x-ui piloté par l'API (création client, quota, coupure, lecture conso) | forfait limité |
| R7 | Android : feuille Activity, pop-up de bienvenue WhatsApp, quota restant à l'accueil | app |
| R8 | Push SSE d'invalidation | temps réel |
| R9 | Réseau : noms aléatoires, champ VLESS, créneaux 20 h/24 h ; déploiement GCP ; pipeline APK testé | infra |

---
id: dashboard-launch-audit-2026-10-29
title: Audit de lancement du dashboard — 2026-10-29
tags: [dashboard, audit, lancement, qa]
status: verified
updated: 2026-10-29
related: [refonte-admin-artifact, ecarts-v2-2026-10-28, dashboard-architecture]
---

## Mission vérifiée

Le fichier racine `p` (16 372 octets, lu le 2026-10-29) demande l'audit,
la correction et la finalisation du dashboard existant, avec priorité aux P0
puis aux P1, sans refonte totale, sans déploiement et sans modification des
secrets.

## État initial vérifié

- `git status --short` ne montre que deux fichiers non suivis préexistants :
  `p` et `knowledge/10-infrastructure/codex-cli-daemon-windows.md`.
- Le dashboard actif est `apps/dashboard`, en Next.js 16.4.2, React 19.3,
  TypeScript 5, Tailwind 4, Radix UI, TanStack Query, zod et nuqs.
- Les scripts déclarés sont `dev`, `build`, `typecheck`, `test` et `lint`.
- L'API active est `apps/api`; ses scripts déclarés couvrent build,
  typecheck, OpenAPI, tests et seed.
- `apps/dashboard/AGENTS.md` impose de lire la documentation Next.js locale
  pertinente dans `node_modules/next/dist/docs/` avant toute modification.
- Le README du dashboard décrit une architecture server-first : lectures
  navigateur via le BFF GET en liste blanche, mutations via Server Actions,
  appels API via `BaseService`, session JWT en cookie `httpOnly`.

## Travail en cours

Cartographier les routes, composants, actions, services, contrats API et tests,
puis exécuter les validations initiales afin de classer les défauts P0/P1 avant
correction. Aucun résultat fonctionnel n'est encore revendiqué à ce stade.

## Contrôles initiaux

- `apps/dashboard`: `bun run typecheck` réussit sans sortie.
- `apps/api`: `bun run typecheck` réussit sans sortie.
- Les tests lancés dans le bac à sable échouent tous avant exécution avec
  `spawn EPERM`; ce résultat ne qualifie donc pas le code.
- Les tests dashboard relancés hors bac à sable exécutent 145 tests : 141
  réussissent et 4 échouent. Les quatre échecs concernent la même régression :
  le minimum de 12 caractères n'est plus appliqué à la force, aux erreurs, au
  schéma `passwordChangeBody` et au refus local avant appel réseau.
- `bun run lint` ne relève aucune erreur et un avertissement :
  `PASSWORD_MIN_LENGTH` est déclaré mais inutilisé dans
  `src/components/account/password-change-form.tsx:13`.

### Arbitrage par la source de vérité

Le commit `4793e8d` du 2026-10-29, intitulé explicitement « suppression
contrainte 8 caracteres mot de passe », a changé volontairement le minimum de
12 à 1 dans l'API et le dashboard, et a remplacé l'aide du formulaire par
« Mot de passe libre ». Le code de production concorde des deux côtés ; ce sont
les tests, le contrat OpenAPI et plusieurs textes qui sont devenus obsolètes.

Verdict corrigé : incohérence P1 de contrat et de tests, pas régression P0 du
code. Le choix autorise un mot de passe d'un seul caractère et constitue un
risque de sécurité à signaler, mais le rétablissement unilatéral d'un minimum
contredirait le dernier changement métier explicite.

Correction appliquée : tests dashboard et API, contrat OpenAPI source, aide de
la page et document de parcours alignés sur « non vide et différent de
l'actuel » ; import devenu inutilisé supprimé. `bun run test` du dashboard
réussit ensuite : **145/145** tests, 39 suites, 0 échec (30,5 s).

## Défauts P1 corrigés

1. Des lectures API de l'accueil, des versements, des builds, du réseau, des
   forfaits et de l'onboarding transformaient silencieusement les erreurs en
   listes vides, `null` ou `undefined`. Cela pouvait afficher « rien à traiter »,
   zéro franc ou « aucune demande » pendant une panne. Les `catch` concernés ont
   été retirés : l'erreur remonte désormais aux frontières d'erreur existantes
   (ou à l'erreur de route) et propose une reprise, sans fabriquer un état métier.
2. Une activité d'audit sans tiroir de détail produisait un lien `#`. `HomeRow`
   accepte désormais une ligne informative sans lien ni chevron ; seules les
   entités réellement ouvrables restent interactives.
3. Les deux derniers commits (`f4757e7`, `ee12984`) rendent l'accès réseau
   cumulatif pour `paid-gcp`/`owner-vip`, mais deux tests et plusieurs contrats
   décrivaient encore D45 exclusif. D141 a été enregistrée et les tests,
   commentaires et nœud de flux ont été alignés.

## Vérifications intermédiaires

- Dashboard après corrections : `bun run typecheck` sans sortie ; `bun run
  lint` sans sortie ; `bun run test` **145/145**.
- Build Next.js 16.4.2 : compilation, TypeScript, 22 pages statiques/partielles
  et finalisation réussis ; 20 routes applicatives plus le BFF sont émises.
- Suite API complète après alignement D141 : **354/354**, 0 échec, durée
  189,8 s. Le test ciblé `endpointsTier.test.ts` réussit aussi **8/8** ;
  typecheck API sans sortie et OpenAPI régénéré.
- Audit dépendances : 23 avis (8 élevés, 11 modérés, 4 faibles). Les avis élevés
  touchent Zod 3.25.76 et des transitifs de `@vercel/node`; `bun outdated` ne
  propose aucune mise à jour compatible. Migration majeure non tentée avant
  lancement.
- Playwright/Chrome : page login réelle, erreur de validation, redirection
  `/communities` → `/login?next=%2Fcommunities` et rendu 390×844 vérifiés.
  Parcours authentifiés non vérifiés : Next local 3000 et API locale 8080 sont
  déjà occupés ; l'API existante répond 503 (clé de sonde absente). Aucun
  processus utilisateur n'a été arrêté.
- Le répertoire PGlite de l'essai navigateur
  `data/audit-browser-20261029` est ignoré par Git et occupe environ 30 Mo. La
  politique d'exécution a refusé sa suppression ; aucun contournement n'a été
  tenté.
- Les README racine et dashboard ont été remis en cohérence avec l'architecture
  actuelle (`apps/dashboard` sur Vercel, commandes Bun, écrans réellement
  présents), sans modifier le déploiement.
- `node knowledge/cli.mjs check` est bloqué par le fichier préexistant non suivi
  `knowledge/10-infrastructure/codex-cli-daemon-windows.md`, qui n'a pas de
  front matter (`title` et `updated` absents). Ce fichier utilisateur n'a pas
  été modifié par l'audit.
- Garde-fou final du 2026-10-29 : dashboard `typecheck` et `lint` sans sortie,
  tests **145/145** (39 suites, 4,28 s) ; API `typecheck` sans erreur et suite
  complète **354/354** ; build dashboard exit 0 avec 22 routes ;
  `git diff --check` exit 0 (avertissements CRLF Windows uniquement).

Rapport détaillé : `docs/dashboard-audit-lancement-2026-10-29.md`.

## Reprise demandée après livraison de l'audit

Le 2026-10-29, l'utilisateur rejette la livraison parce que les changements
restent essentiellement techniques et que l'interface visible lui paraît
toujours legacy. L'objectif actif devient une **refonte visuelle réellement
perceptible, propre et professionnelle**, sans débrancher les parcours ni les
données réelles. La passe précédente ne doit donc pas être présentée comme la
refonte UI attendue.

### Refonte visuelle appliquée

- Fondations globales remplacées : palette claire plus contrastée, navigation
  en encre sombre, accent rose conservé et thèmes vert/rouge préservés, surfaces
  et ombres à plusieurs couches, rayon de base 16 px.
- Shell desktop refait : sidebar sombre en panneau autonome, marque et
  sélecteur de communauté intégrés, sélection lisible, bande de contexte et
  onglets de section en contrôle segmenté. Le shell mobile conserve la barre
  basse et les mêmes routes.
- Primitives partagées refaites : titres de page, sections, KPI, bandes de
  statistiques, tableaux, listes, champs, sélecteurs et boutons. Ces composants
  sont consommés par toutes les routes du dashboard ; le changement ne se
  limite donc pas à la connexion.
- Connexion entièrement recomposée en vue scindée sur desktop (promesse produit
  + formulaire) et en formulaire concentré sur mobile, sans nouvelle image ni
  donnée fictive.
- Vérification navigateur sur le vrai serveur Next : desktop 1440×960 clair et
  sombre, mobile 390×844 sans débordement horizontal, aucune erreur console.
  Une ancienne instance Next conservait le CSS précédent en cache ; seul ce
  serveur de développement a été redémarré, l'API et les données n'ont pas été
  touchées.
- `bun run typecheck` et `bun run lint` passent après cette première vague.
- Vérification finale de la vague visuelle : dashboard **145/145** tests,
  typecheck et lint sans erreur, build Next 16.4.2 exit 0 avec **22 routes**.
  `.playwright-cli/` a été ajouté à `.gitignore` pour que les captures locales
  de QA ne polluent pas l'état Git.

### Correction de direction visuelle demandée

Le retour utilisateur du 2026-10-29 rejette explicitement les marqueurs visuels
« Bootstrap » : typographie serif, fond et sidebar bleutés, ainsi que les
bordures colorées ajoutées pendant la première vague. La direction corrigée est
donc : **sans-serif uniquement**, neutres chauds/noir sans bleu, accent réservé
aux actions et états, aucune bordure décorative colorée.

Correction vérifiée : Aleo supprimée du chargement Next, `Host Grotesk` est la
police calculée du `h1`; fond `#f2f2ef`, sidebar `#1c1c1a`, anciens neutres
bleutés absents du code. Les liserés accent des titres, KPI, cartes de partage,
avatars et boutons teintés ont été supprimés. Chrome 1440×960 et 390×844 :
aucune erreur console ni débordement. Typecheck/lint réussissent, tests
dashboard **145/145**, build Next exit 0 avec **22 routes**.

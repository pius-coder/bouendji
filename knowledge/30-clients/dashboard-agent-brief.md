---
id: dashboard-agent-brief
title: Brief commun des sous-agents dashboard (2026-10-25)
tags: [dashboard, sous-agents, conventions]
status: decided
updated: 2026-10-25
related: [dashboard-plan, chariow-ui-analysis, decisions]
---

À lire en entier avant d'écrire une ligne. Racine du dashboard :
`apps/dashboard` (Next.js 16, React 19, Tailwind 4, bun). Lis aussi
`apps/dashboard/AGENTS.md` : cette version de Next a des ruptures ; la doc est
dans `apps/dashboard/node_modules/next/dist/docs/`.

## Ce qu'on attend

Aujourd'hui les écrans sont des **tableaux sans détail**. Chariow (référence,
`30-clients/chariow-ui-analysis`) : un clic sur une ligne ouvre un **tiroir de
détail à droite** (500 px), en-tête = identifiant + date + badge de statut +
rangée d'actions, puis sections « tuile d'icône 24 px + titre gras + filet »,
lignes « libellé gris / valeur à droite ». Chaque action possible dans l'API pour
cet objet doit être accessible depuis ce tiroir.

**Modèle à copier tel quel** : `src/components/payouts/payout-drawer.tsx`
(tiroir, `DrawerSection`, `Line`, actions par état et par rôle, toasts,
`useTransition`) et `src/components/payouts/payouts-columns.tsx` (colonne
`open` qui porte le bouton « Détails »).

## Règles (non négociables)

1. **D104 — Suspense granulaire** : titre de page, en-têtes de colonnes,
   libellés, titres de section = statiques (jamais dans un Suspense). Seule la
   donnée (lignes, valeurs) est suspendue. Patron : `src/app/(dashboard)/[communityId]/orders/page.tsx`
   (`PageContent`, `PageHeader`, `Toolbar`, `TableCard` + `TableRowsSkeleton`).
2. **Serveur par défaut** : `"use client"` seulement pour un composant
   interactif minimal (tiroir, bouton, filtre). Les lectures passent par
   `getServices()` dans des composants serveur async ; les écritures par une
   Server Action dans `src/server/actions/*.action.ts` qui rejoue un schéma zod
   puis appelle le service (voir `payouts.action.ts`). Si l'action ou le service
   n'existe pas : **tu peux créer** un fichier d'action dédié
   `src/server/actions/<ton-domaine>.action.ts` ; ne modifie pas ceux des autres.
3. **D108 — rendu** : neutres Chariow, bouton principal noir (`<Button>` par
   défaut), `variant="outline"` (contour), `variant="tinted"` (seul usage de la
   couleur du thème), `variant="destructive"`. Pas de couleur primaire en aplat,
   pas d'ombre sur les cartes (bordure `border-border`). Composants : `src/components/page/*`,
   `src/components/ui/*`, `StatusBadge` (`src/components/common/status-badge.tsx`),
   `Icon` (`src/components/common/icon.tsx`, noms disponibles listés dans le fichier).
4. **Fichiers partagés interdits** : `src/components/page/*`, `src/components/ui/*`,
   `src/components/common/*`, `src/components/shell/*`, `src/app/globals.css`,
   `src/lib/*`, `src/server/services/*`, `src/server/api/*`, les fichiers
   d'un autre agent. Besoin d'un changement là ? Écris-le en diff proposé dans
   `knowledge/agents/<ton-slug>/notes/proposition.md`.
5. Rôles : `can(me, capability, communityId)` de `src/lib/roles.ts` décide ce qui
   S'AFFICHE ; l'API reste l'autorité (403 affiché tel quel par toast).
6. Textes en français, phrases courtes, pas de jargon. Commentaires en français,
   même densité que le code autour. Jamais de lien `vless://` en clair.

## Vérification (et SEULEMENT celle-ci — 5 agents travaillent en même temps)

- `cd apps/dashboard && bun run typecheck` : ne corrige que les erreurs de TES
  fichiers ; une erreur ailleurs vient d'un autre agent, signale-la.
- `bun run test` (tests `node --test`) ; tu peux ajouter UN fichier de test à ton
  nom (voir ta charte), sur le modèle de `test/network-offline.test.ts`
  (fetch simulé, aucun réseau).
- `bun run lint`.
- **Interdit** : `bun run build`, `next dev`, `next start`, tout serveur, tout
  navigateur, `git commit`, `git push`, `bun add`. L'orchestrateur compile et
  teste dans le navigateur après intégration.

## Journal

Chaque étape : `node knowledge/cli.mjs agent log <slug> "<titre>" --fait "..." --etat ok|partiel|bloque --suite "..."`.
Fin : `node knowledge/cli.mjs agent close <slug> "<résumé>"`. Rapport final :
verdict, vérifié (sorties citées), incertain, fichiers écrits, propositions.

---
id: dashboard-build-sonnet
title: Construction du dashboard Next.js (blocs, pages, nuqs, shadcn)
kind: agent
status: active
updated: 2026-10-23
scope: "Construire apps/dashboard au patron dashboard-architecture : reprendre le socle de dashboard-base-sonnet (BaseService, services, session), ajouter shadcn new-york-v4, nuqs, shell, pages de composition, actions. Propose, n'intègre pas."
owns: []
---

# Charte — dashboard-build-sonnet

Lire : 30-clients/dashboard-architecture, dashboard-ux, agents/dashboard-ux-opus/notes/ux-system,
60-research/reference-middle-office-v1, 20-backend/admin-access-flows, 40-money/roles-and-commissions.

Écrit seulement dans apps/dashboard/ et knowledge/agents/dashboard-build-sonnet/.
Ne modifie ni apps/api, ni packages/contract, ni les nœuds partagés : il propose.
Journalise chaque étape : node knowledge/cli.mjs agent log dashboard-build-sonnet "<titre>" --fait ... --etat ok --suite ...

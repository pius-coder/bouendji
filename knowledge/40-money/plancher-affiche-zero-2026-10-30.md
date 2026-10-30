---
id: plancher-affiche-zero-2026-10-30
title: « Plancher 0 » dans le créateur de forfait — cause et correctif
tags: [pricing, plancher, dashboard, prix, bug]
status: verified
updated: 2026-10-30
related: [prix-plancher, decisions, deploiement-dashboard-api]
---

# Plancher affiché à 0 — cause et correctif

## Symptôme

Dans le créateur de forfait, `PriceIndicator` affichait
« Prix minimum (plancher) : 0 FCFA » alors que le coût du Go était saisi.

## Cause (vérifiée en prod)

`sélection` le 2026-10-30 :

```
cost_per_gb_xaf            | 150
night_window_cost_xaf      | {"20-04": 500, "20-24": 500, "24-04": 500}
platform_margin_bps        |            ← NULL
unlimited_cost_per_day_xaf | 150
```

La marge plateforme est **facultative** dans le formulaire. Laissée vide, elle
était envoyée `NULL`, et `baseFloorXaf()` / `unlimitedFloorXaf()` /
`nightOptionFloorXaf()` retournaient `null` dès que la marge était `null`.
`PriceIndicator` faisait `?? 0` : d'où le plancher à 0.

Ce n'était pas un problème d'affichage seul : sans marge, l'API ne calculait
aucun plancher et n'appliquait donc **aucun refus** sous le coût.

## Correctif

Une marge absente vaut désormais **0 %** (le plancher reste le coût, jamais 0) :

- `apps/api/src/services/pricing.ts` : les trois fonctions de plancher ne
  dépendent plus que du coût ; `settings.platformMarginBps ?? 0`.
- `apps/api/src/routes/pricing.ts` : `floorConfigured` et
  `unlimitedFloorConfigured` ne regardent plus la marge.
- `apps/dashboard/src/server/services/pricing/pricing.schema.ts` : mêmes
  formules côté client ; `pricingToFormValues` affiche `0` quand la marge est
  `NULL` ; `pricingFormToBody` enregistre `0` si le champ est vide.
- Le formulaire de tarifs affiche donc 0 % et le créateur affiche le coût
  comme plancher.

## Vérifié

- `tsc --noEmit` API : aucune sortie.
- `tsc --noEmit` dashboard : aucune sortie.
- Tests dashboard : **150/150**.
- Tests API ciblés : `r6` 19/19, `endpointsTier` 8/8, `brand` 21/21.
- Dashboard déployé en production (Vercel `READY`, alias
  `https://vpn-dashboard-seven.vercel.app`).

**Non vérifié** : rendu visuel authentifié du créateur après déploiement
(pas de session dashboard dans cette machine). La valeur prod
`platform_margin_bps` reste `NULL` ; le code la traite comme 0 %.

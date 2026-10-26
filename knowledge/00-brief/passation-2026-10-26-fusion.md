---
id: passation-2026-10-26-fusion
title: Passation — fusion de la vague 1 et écart plan / code
tags: [passation, fusion, api, dashboard, audit]
status: verified
updated: 2026-10-26
related: [dashboard-plan, handoff-2026-10-24, passation-2026-10-26, chantier-vague1]
---

# Passation — fusion de la vague 1 (2026-10-26, soir)

Complète `passation-2026-10-26` (même jour, déjà écrite : non écrasée).

## Fait et vérifié

- Les 10 branches `w1/*` sont ancêtres de `api/prod-hardening` :
  `git merge-base --is-ancestor w1/<lot> HEAD` → fusionné pour r0, r1-api,
  r1-dash, r2-dash, r3, r4, r5, r6, r7, r8. Arbre propre, **35 commits d'avance
  sur origin, rien poussé**.
- API : `tsc -p tsconfig.json --noEmit` sans sortie ; suite complète
  `node --test --import tsx test/*.test.ts` → **343 pass, 0 fail**.
- Dashboard : `npm test` → **135 pass, 0 fail**. `tsc` : erreurs seulement dans
  `.next/types` (artefact ignoré par git).
- Coutures faites : `test/xuiSchema.ts` supprimé (l'exécuteur R0 applique
  070-073) ; `builds.ts` utilise `notifyRecipients(db, …)` ; tests builds,
  manualVless, nightSlots, xui passent par `openAdminSession`.
- Bug page Forfaits (`AppPlansRows`) : l'API renvoie `revision` en nombre, le
  dashboard l'attendait en chaîne (`BAD_RESPONSE`, vu dans le terminal du
  dashboard). Schéma passé à `z.number().int()`, OpenAPI `str`→`int` (3 champs),
  test corrigé. Commit `ef4ef59`.
- `layout.tsx` : `Providers` enveloppé dans `<Suspense fallback={null}>`
  (`QueryClient` lit `Date.now()`, Next refusait le prérendu).

## Fait mais non vérifié

- Les deux correctifs du dashboard n'ont **pas** été rechargés dans le
  navigateur (tests unitaires seulement).
- Décision de code à confirmer : `toLimited` (`services/xui.ts`) ne traite comme
  forfait limité qu'un abonnement avec `quota_bytes` ou `night_window`, car la
  migration 060 met `family='limited'` à tous les anciens forfaits (sinon
  bundles vides pour les forfaits par tier).
- Aucun test sur vrai Postgres, `next build`, ni vrai 3x-ui.

## Bloqué ou en attente de l'utilisateur

- Pas de poussée de la branche tant que l'utilisateur ne le demande pas.
- Refontes post-fusion proposées, réponse « oui » donnée sur le principe : à
  lancer. La décision sur `|| anyRole(["finance"])` (admin.ts ~374-396) est à
  valider avec lui avant retrait.
- Inchangé : accord requis pour le téléchargement Gradle (`libbox.aar`),
  secrets de la pipeline APK, jeton et IDs Telegram.

## Écart plan / code (vérifié par recherches ciblées, app non lancée)

- **Fait côté API** : points 1, 2, 4, 5 (routes), 6, 8 du plan.
- **Dashboard** : mot de passe forcé et « Mon compte » faits ; charpente et
  cache (R2) faits. **Absents** : assistant d'onboarding, guide, page Tarifs et
  indicateur de prix, tiroirs métier, SSE et présence (aucun `LISTEN` ni
  `event-stream` dans l'API).
- **Android** : R10 non commencé (point 9).
- Fapshi `payout()` reste un simulacre ; la prod tourne en `mock`.

## Prochaines étapes

1. Recharger la page Forfaits et confirmer que la liste s'affiche.
2. Refontes post-fusion : `permitted()` à la place de `canRead` et des contrôles
   locaux ; `PASSWORD_CHANGE_REQUIRED` dans `packages/contract` ; décision
   finance ; vérifier la redirection de `runAction`.
3. Vague 2 dashboard : Offres et Tarifs d'abord, puis tiroirs, assistant,
   guide, Réseau.
4. SSE et présence (R9).
5. Android (R10) contre `/me/subscription` (R6) et `startsAt` (R7).
6. Avant tout déploiement : exécuteur de migrations R0 en prod.

## Points de sécurité

- Noms de secrets rencontrés : `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`
  (affichée à l'utilisateur à sa demande, valeur du `.env` local),
  `DASHBOARD_ACCESS_KEY`, `ENDPOINT_INGEST_SECRET`, `MASTER_KEY`,
  `TELEGRAM_BOT_TOKEN`, `GITHUB_TOKEN`.
- Prod : `NODE_ENV=development`, `PAYMENT_PROVIDER=mock` ; admins avec mot de
  passe temporaire, `must_change_password` pas déployé.
- Le lien `wa.me` d'invitation (R4) met le mot de passe temporaire dans l'URL.

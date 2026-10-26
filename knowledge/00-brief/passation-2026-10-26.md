---
id: passation-2026-10-26
title: Passation — refonte 2 cadrée, audit fait, vague 1 lancée, reprise sur Android
tags: [passation, refonte, audit, sous-agents, worktree, android, dashboard, api]
status: verified
updated: 2026-10-26
related: [dashboard-plan, handoff-2026-10-24, passation-2026-10-26-restauration, audit-synthese, chantier-vague1]
---

# Passation — 2026-10-26 (fin de journée)

La passation du matin (restauration du PC) est dans
`passation-2026-10-26-restauration`.

**Reprise** : l'orchestrateur travaille sur **l'app Android** (téléphone de
l'utilisateur branché). Pendant ce temps, 10 agents Haiku codent l'API et le
dashboard dans des worktrees. **Ne pas relire le code** déjà audité : partir des
rapports listés ci-dessous.

## À lire pour reprendre (dans cet ordre)

1. `30-clients/audit-synthese.md` : bugs, décisions, architecture R0-R10. **R10 = Android.**
2. `agents/audit-android-ui-haiku/notes/audit.md` et `agents/audit-android-core-haiku/notes/audit.md` : état réel de l'app, avec `fichier:ligne`.
3. `00-brief/decisions.md` de **D113 à D125** : modèle produit validé.
4. `30-clients/audit-brief.md` : le plan produit en une page (point 9 = app).
5. `30-clients/chantier-vague1.md` : règles des agents, schéma et contrats partagés.
6. Page des parcours (diagrammes) : https://claude.ai/artifact/Sxajm3C2zFFcdiyZaBrRPm

## Fait et vérifié

- Projet retrouvé dans `C:\Users\lenovo\Projects\bouendji`, branche `api/prod-hardening`, commit `1689199`.
- **Plan produit validé** par l'utilisateur, inscrit en D113-D125 :
  - forfaits Limité / Limité + nuit (20h-24h, 24h-4h, 20h-4h) ;
  - 3x-ui piloté par l'API ;
  - libre-service des marques, 1 admin = 1 app ;
  - WhatsApp, pas d'email ;
  - rôle Réseau ;
  - aucun tarif codé en dur ;
  - API sur Dokku ;
  - compte GCP durable pour le limité, Qwiklabs pour la nuit ;
  - clé de déploiement par créneau.
- Page de diagrammes : les 16 diagrammes s'affichent sans erreur, vérifié dans le navigateur local.
- **Audit en 14 tranches** (Haiku, lecture seule). Rapports dans `agents/audit-*-haiku/notes/audit.md`.
- Affirmations recontrôlées par lecture (preuves dans `audit-synthese` §1) :
  - `gh release view libbox-1.14.3` → `assets: []` ;
  - `apps/android/app/libs/libbox.aar` absent ;
  - `GITHUB_REF` vaut `main` par défaut (`config.ts:91`) ;
  - `subscriptions.order_id` sans UNIQUE (`schema.ts:167`) ;
  - webhook « pending » enregistré comme final (`payments.ts:602-614`) ;
  - le fichier de secours contient le credential partagé et n'est pas borné à la fin d'abonnement.
- `fapshi.md` corrigé : `payout` est bien appelé (`admin.ts:1498`).
- `@tanstack/react-query@5.62.0` installé (`bun add`, code 0) : `apps/dashboard/package.json` et `bun.lock` modifiés, **non commités**.
- **Worktrees** créés depuis `api/prod-hardening` dans `C:\Users\lenovo\Projects\bouendji-wt\<lot>`, branches `w1/<lot>` :
  - lots : r0, r1-api, r1-dash, r2-dash, r3, r4, r5, r6, r7, r8 ;
  - jonctions `node_modules` vers le dépôt principal ;
  - `apps/api` typecheck OK dans r0 ;
  - dashboard typecheck OK dans r1-dash et r2-dash, après `next typegen`.

## Fait mais non vérifié

- **10 agents Haiku de la vague 1 lancés en arrière-plan.** Chacun a une charte `agents/w1-*-haiku/` et un lot R0-R8 (voir `chantier-vague1` §2). Leurs rapports arriveront en notifications. Rien n'est vérifié tant qu'on n'a pas relancé leurs tests.
- Une première vague a été **annulée** : l'isolation automatique partait de `master`, une base périmée. Worktrees et branches supprimés, aucune trace dans le dépôt principal. Les journaux `w1-*` peuvent contenir des entrées de cette tentative.

## Bloqué ou en attente

- **Pipeline APK** : release libbox sans fichier ; secrets GitHub `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` et `BUILD_CALLBACK_TOKEN` manquants.
- **Build Android local** : `libbox.aar` est absent sur ce PC. Il faut le reconstruire (`tools/build-libbox.ps1`) ou le récupérer ailleurs. Gradle télécharge des dépendances sur un **forfait mobile limité** : **demander l'accord** avant de lancer.
- Bot Telegram : l'utilisateur doit fournir le jeton du bot et les ID Telegram (deux owners + Réseau).
- Encore ouvert :
  - affichage du prix de nuit dans l'app (supplément ou total) ;
  - erreur de la page Forfaits en prod, à envoyer par l'utilisateur.
- **Commit, push, fusion** : seulement sur demande de l'utilisateur.

## Prochaines étapes

1. Lire les fichiers de « À lire pour reprendre ». Pas de relecture du code de l'API ni du dashboard.
2. Android (R10), dans `apps/android`, dépôt principal (aucun agent n'y touche) :
   - pop-up de bienvenue au premier lancement ;
   - page de paiement avec plage et prix ;
   - jauge de quota et écran « Data épuisée » ;
   - feuille Activité, qui réutilise `LibboxTunnelEngine.kt:129-135` ;
   - bouton d'aide WhatsApp avec code d'appareil ;
   - connexion par numéro ;
   - bundle vide = coupure, re-tirage au début de plage, `startsAt` ;
   - `BrandTokens` + WhatsApp.
3. Coder Android contre les contrats annoncés : R6 (`/me/subscription` : `family`, `quotaBytes`, `usedBytes`, `remainingBytes`, `nightWindow`, `state`) et R7 (`startsAt` dans le bundle). Ils seront dans `apps/api/src/http/contracts.ts` des branches `w1/r6` et `w1/r7`.
4. Avant tout build : accord de l'utilisateur, `libbox.aar`, puis `tools/build-apk.ps1`, et test sur le Pixel 8 (`adb devices`).
5. À chaque rapport d'agent :
   - relancer typecheck et tests dans son worktree ;
   - contrôler 2 ou 3 `fichier:ligne` ;
   - noter le résultat dans `chantier-vague1`.
6. Fusion, quand l'utilisateur la demande :
   - ordre : r0 → r1-api → r6 → r4 → r3 → r5 → r7 → r8 → r1-dash → r2-dash ;
   - conflits attendus dans `app.ts`, `http/contracts.ts`, `config.ts`, `admin.ts` et `bun.lock` (garder celui du dépôt principal).
7. Vague 2 (après fusion) :
   - pages du dashboard (Abonnés, Offres, Argent, Communauté, Plateforme, Réseau, onboarding, guide, tarifs, 3x-ui) ;
   - SSE et présence (R9).

## Points de sécurité

- Secrets rencontrés, noms seulement, jamais de valeur :
  - `ENDPOINT_INGEST_SECRET`, `MASTER_KEY`, `DASHBOARD_ACCESS_KEY` ;
  - `FAPSHI_API_USER`, `FAPSHI_API_KEY`, `FAPSHI_WEBHOOK_SECRET` ;
  - `BUILD_CALLBACK_SECRET`, `TELEGRAM_BOT_TOKEN`, `GITHUB_TOKEN` ;
  - le jeton API 3x-ui est dans `/root/3x-ui-admin.txt` sur aura-vps.
- La prod (`vpn-api`) tourne avec `NODE_ENV=development` et `PAYMENT_PROVIDER=mock` : rien n'est encaissé. C'est à l'utilisateur de décider.
- Risques ouverts, à corriger par la vague 1 :
  - verrouillage de l'owner en 8 essais (R1) ;
  - versement rejouable (R0) ;
  - credential partagé dans les bundles et fichiers de secours (R7).
- Les admins en prod ont un mot de passe temporaire. `must_change_password` (R1) n'est pas encore déployé.

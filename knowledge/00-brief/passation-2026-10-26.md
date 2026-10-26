---
id: passation-2026-10-26
title: Passation — refonte 2, audit, vague 1 arrêtée, reprise dans OpenCode
tags: [passation, refonte, audit, sous-agents, worktree, android, dashboard, api, opencode]
status: verified
updated: 2026-10-26
related: [dashboard-plan, handoff-2026-10-24, passation-2026-10-26-restauration, audit-synthese, chantier-vague1]
---

# Passation — 2026-10-26 (fin de session Claude Code, reprise dans OpenCode)

La passation du matin, sur la restauration du PC, est dans
`passation-2026-10-26-restauration`.

**État** : tous les agents sont **arrêtés**. Rien n'est fusionné et rien n'est
poussé. 9 lots sont commités sur leur branche. **R7 n'est pas commité.**

## À lire pour reprendre (dans cet ordre)

1. `30-clients/chantier-vague1.md` :
   - règles des lots (propriété des fichiers, format des migrations, schéma et contrats partagés) ;
   - **§8 : suivi et points ouverts de chaque lot.**
2. `30-clients/audit-synthese.md` : bugs, décisions et architecture R0-R10 (R10 = Android).
3. `00-brief/decisions.md` de **D113 à D125** : le modèle produit validé.
4. `30-clients/audit-brief.md` : le plan produit en une page.
5. Reste à faire des lots arrêtés :
   - `agents/w1-api-r6-haiku/notes/reste-a-faire.md` ;
   - `agents/w1-api-r8-haiku/notes/reste-a-faire.md`.
6. Android :
   - `agents/audit-android-ui-haiku/notes/audit.md` ;
   - `agents/audit-android-core-haiku/notes/audit.md`.
7. Diagrammes des parcours : https://claude.ai/artifact/Sxajm3C2zFFcdiyZaBrRPm

## Fait et vérifié

- Dépôt principal `C:\Users\lenovo\Projects\bouendji`, branche `api/prod-hardening` : **commit `732690a`**. Il contient la base knowledge, les audits, la synthèse, le chantier et `@tanstack/react-query@5.62.0` (dans `package.json` et `bun.lock`).
- Worktrees dans `C:\Users\lenovo\Projects\bouendji-wt\<lot>`, branches `w1/<lot>`, tous partis de `1689199`. Leurs `node_modules` sont des jonctions vers le dépôt principal.
- Lots commités, contrôlés par l'orchestrateur (typecheck et tests nouveaux relancés) :

| Lot | Branche | Commit(s) | Contrôle |
|---|---|---|---|
| R0 fondations | `w1/r0` | `139d25c`, `c937f65` | tsc OK, 5/5 |
| R1 comptes (API) | `w1/r1-api` | `19bddca`, `771f79f` | tsc OK, 14/14 |
| R1 comptes (dashboard) | `w1/r1-dash` | `b559053`, `8088101` | tsc OK, 24/24 |
| R2 shell + cache | `w1/r2-dash` | `1941abb` | tsc OK, 111/111 |
| R3 fiches, recherche | `w1/r3` | `9016fae` | tsc OK, 23/23 |
| R4 onboarding | `w1/r4` | `1b2f616` | tsc OK, 21/21 |
| R5 builds validés | `w1/r5` | `cbf12e6`, `b2b130a` | tsc OK, 35/35 |
| R8 nuit, Telegram | `w1/r8` | `8708cdf` | tsc OK (orchestrateur) ; suite 217/217 selon l'agent |

## Fait mais non vérifié

- **R6** (forfaits, tarifs, paiement) : `w1/r6`, commit `de90dd8`.
  - Typecheck OK et `r6.test.ts` 18/18, selon l'agent.
  - **Suite complète jamais relancée avec R6.**
- **R7** (3x-ui, bundle à deux familles) : **non commité**, arrêté en cours.
  - 18 fichiers modifiés ou nouveaux dans `bouendji-wt\r7`, dont :
    - `routes/adminXui.ts`, `services/xui.ts`, `services/xuiWorker.ts` ;
    - les migrations ;
    - `bundle.ts`, `offlineBundles.ts`, `server.ts` ;
    - les tests `xui.test.ts` et `xuiSchema.ts`.
  - État inconnu : faire `git status` et `git diff`, puis le typecheck, avant de décider de garder ou de jeter.
- Aucun lot n'a été testé avec `next build`, dans un navigateur, ou contre un vrai Postgres (seulement PGlite).

## Bloqué ou en attente de l'utilisateur

- **Fusion** des branches dans `api/prod-hardening` : à faire sur demande de l'utilisateur.
- **Pipeline APK** :
  - release `libbox-1.14.3` sans fichier ;
  - secrets GitHub `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` et `BUILD_CALLBACK_TOKEN` manquants ;
  - variables API `GITHUB_TOKEN` et `GITHUB_REPO`.
- **Build Android local** : `libbox.aar` absent sur ce PC. Gradle télécharge sur un forfait mobile limité : **accord requis** avant de lancer.
- Bot Telegram : il manque le jeton et les ID (deux owners + Réseau).
- Questions ouvertes :
  - prix de nuit affiché en supplément ou en total ;
  - erreur de la page Forfaits en prod, à fournir par l'utilisateur.

## Prochaines étapes

1. R7 :
   - `cd bouendji-wt\r7`, puis `git status` et `git diff --stat` ;
   - typecheck API ;
   - selon le résultat : commiter (« suite non relancée ») ou jeter.
2. R6 : relancer `bun run --cwd apps/api test` dans `bouendji-wt\r6`.
3. Fusionner dans `api/prod-hardening`, dans cet ordre : r0 → r1-api → r6 → r4 → r3 → r5 → r7 → r8 → r1-dash → r2-dash.
4. Après chaque fusion : typecheck et tests. Conflits attendus dans `app.ts`, `http/contracts.ts`, `config.ts`, `routes/admin.ts`, `test/support.ts` et `bun.lock` (garder celui du dépôt principal).
5. Corrections post-fusion (détail au §8 du chantier) :
   - `test/support.ts` applique toutes les migrations via l'exécuteur R0 ;
   - retirer les `applyR6Migrations` et les applications manuelles de migrations dans les tests ;
   - remplacer `canRead` (R3) et les contrôles de rôle locaux (R4, R5, R6, R8) par `permitted()`, exporté par R1 ;
   - ajouter `PASSWORD_CHANGE_REQUIRED` à `API_ERROR_CODES` (`packages/contract`) ;
   - retirer `|| anyRole(["finance"])` de `permitted()` (lignes ~299 et ~301) ;
   - `adminPayouts.test.ts` : une seule app par communauté ;
   - vérifier que R1 (010-012) et R4 (044) donnent les mêmes défauts à `whatsapp_number` et `must_change_password` ;
   - `runAction` (dashboard) : rediriger sur 403 `PASSWORD_CHANGE_REQUIRED` ;
   - bundle à deux familles (R7) et `night_slot` (R8) à recoller.
6. Avant tout déploiement : la prod a besoin de l'exécuteur de migrations R0, sinon les routes admin R1 cassent.
7. Vague 2 :
   - pages du dashboard (Abonnés, Offres, Argent, Communauté, Plateforme, Réseau, onboarding, guide, tarifs, 3x-ui) passées sur `useAdminQuery` et `drawer-host` ;
   - SSE et présence (R9).
8. Android (R10), dans `apps/android`, contre les contrats R6 (`/me/subscription`) et R7 (`startsAt`) : voir `audit-synthese` R10.

## Points de sécurité

- Secrets rencontrés (noms seulement) :
  - `ENDPOINT_INGEST_SECRET`, `MASTER_KEY`, `DASHBOARD_ACCESS_KEY` ;
  - `FAPSHI_API_USER`, `FAPSHI_API_KEY`, `FAPSHI_WEBHOOK_SECRET` ;
  - `BUILD_CALLBACK_SECRET`, `TELEGRAM_BOT_TOKEN`, `GITHUB_TOKEN` ;
  - le jeton 3x-ui est dans `/root/3x-ui-admin.txt` sur aura-vps.
- La prod `vpn-api` tourne avec `NODE_ENV=development` et `PAYMENT_PROVIDER=mock` : rien n'est encaissé. C'est à l'utilisateur de décider.
- Les admins en prod ont un mot de passe temporaire. `must_change_password` (R1) n'est **pas déployé**.
- R4 : le lien `wa.me` d'invitation contient le mot de passe temporaire dans l'URL. Il reste dans l'historique du navigateur.
- R8 : le verrou anti-doublon Telegram passe par `alert_state`, pas par `pg_advisory_lock`. À confirmer.

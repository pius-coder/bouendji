---
id: chantier-vague1
title: Chantier vague 1 — 10 agents en worktree (API, dashboard, pipeline)
tags: [chantier, sous-agents, worktree, refonte, coordination]
status: decided
updated: 2026-10-26
related: [audit-synthese, audit-brief, admin-journeys, decisions]
---

# Chantier vague 1 — règles communes

Lis d'abord, dans le dépôt **principal** (chemins absolus) :
- `C:\Users\lenovo\Projects\bouendji\knowledge\30-clients\audit-synthese.md` —
  l'architecture cible, ton lot y est décrit (R0 à R8) ;
- `C:\Users\lenovo\Projects\bouendji\knowledge\30-clients\audit-brief.md` — le
  plan produit ;
- les rapports d'audit de ta tranche :
  `C:\Users\lenovo\Projects\bouendji\knowledge\agents\audit-*-haiku\notes\audit.md`
  (ta charte dit lesquels) ;
- `C:\Users\lenovo\Projects\bouendji\knowledge\00-brief\decisions.md`, de D113 à
  la fin.

## 1. Où tu travailles

- Ton **worktree git** est déjà créé par l'orchestrateur :
  `C:\Users\lenovo\Projects\bouendji-wt\<lot>` sur la branche `w1/<lot>`, partant
  de `api/prod-hardening` (`1689199`). Tu écris le **code** uniquement dans ce
  dossier : commence chaque commande shell par un `cd` vers lui, et utilise des
  chemins absolus sous lui pour Read/Edit/Write. **Ne touche jamais** au code du
  dépôt principal `C:\Users\lenovo\Projects\bouendji` ni aux autres worktrees.
- Les jonctions `node_modules` sont déjà faites. Dashboard : les types Next sont
  générés ; après avoir ajouté ou déplacé des routes, relance
  `apps\dashboard\node_modules\.bin\next.exe typegen` depuis `apps\dashboard`.
- Ton **journal** et tes notes vont dans le dépôt principal :
  `C:\Users\lenovo\Projects\bouendji\knowledge\agents\<ton-slug>\`, via
  `node C:\Users\lenovo\Projects\bouendji\knowledge\cli.mjs agent log <slug> "<titre>" --fait "..." --etat ok --suite "..."`
  (lance cette commande depuis `C:\Users\lenovo\Projects\bouendji`).
- (Déjà fait par l'orchestrateur, pour mémoire) relier les dépendances déjà
  installées, sans rien télécharger :

  ```powershell
  $M = "C:\Users\lenovo\Projects\bouendji"
  foreach ($d in "node_modules","apps\api\node_modules","apps\dashboard\node_modules","packages\contract\node_modules") {
    if (-not (Test-Path $d)) { cmd /c mklink /J $d "$M\$d" | Out-Null }
  }
  ```

- **Interdit** : `bun install`, `bun add`, `npm install`, tout téléchargement
  (forfait mobile limité). Une dépendance manque : tu t'arrêtes et tu le dis.
  Exception : `@tanstack/react-query@5.62.0` est installée par l'orchestrateur ;
  l'agent R2 ajoute seulement la ligne dans `apps/dashboard/package.json`.
- **Interdit** : toucher `apps/android/`, la prod, le VPS, Dokku, GitHub en
  écriture (`git push`, `gh` qui modifie), les fichiers `.env`, recopier un
  secret.

## 2. Propriété des fichiers (ne modifie que les tiens)

| Agent | Lot | Possède | Migrations |
|---|---|---|---|
| `w1-api-r0-haiku` | R0 fondations | `apps/api/src/db.ts`, dossier `apps/api/src/migrations/` (exécuteur + `000_baseline`), `apps/api/src/schema.ts` (gel), `admin.ts` bloc versements 1322-1726, `config.ts` ligne `GITHUB_REF` | 000-009 |
| `w1-api-r1-haiku` | R1 comptes admin (API) | `lib/auth.ts`, `routes/adminAuth.ts`, `lib/attempts.ts`, `admin.ts` 1-722 (schémas, `permitted()`, `/me`), nouveau `routes/adminAccount.ts`, garde dans `app.ts` | 010-019 |
| `w1-dash-r1-haiku` | R1 comptes admin (dashboard) | `src/app/(auth)/`, nouveau `src/app/(account)/` (mot de passe forcé, sans shell), nouvelle page `src/app/(dashboard)/compte/`, `src/server/services/admin-auth/`, `src/server/actions/auth*.ts`, `src/server/context.ts`, `src/components/auth/`, nouveau `src/components/account/` | — |
| `w1-dash-r2-haiku` | R2 shell + cache | `src/components/shell/`, `src/components/page/`, `src/components/ui/`, `src/components/common/`, nouveau `src/components/drawers/`, `src/app/layout.tsx`, `src/app/(dashboard)/layout.tsx`, `src/app/(dashboard)/kit/` (suppression), nouveau `src/app/providers.tsx`, nouveau `src/app/api/bff/`, `src/hooks/`, `src/lib/roles.ts`, `next.config.ts`, `apps/dashboard/README.md`, `apps/dashboard/package.json`, `components.json` | — |
| `w1-api-r3-haiku` | R3 fiches, recherche, résumé | `admin.ts` 1122-1321 (listes) et 1866-fin (journal), nouveau `routes/adminDetails.ts` | 030-039 |
| `w1-api-r4-haiku` | R4 onboarding libre-service | `admin.ts` 723-837 (communautés, apps) et 948-1121 (membres, admins), nouveau `routes/adminOnboarding.ts` | 040-049 |
| `w1-api-r5-haiku` | R5 builds demandés/validés | `routes/builds.ts`, `lib/brand.ts`, `.github/workflows/android-brand.yml`, `tools/inject-brand.mjs` | 050-059 |
| `w1-api-r6-haiku` | R6 forfaits, tarifs, paiement | `admin.ts` 838-947 (forfaits), `services/payments.ts`, `routes/orders.ts`, `routes/payments.ts`, `routes/catalog.ts`, `routes/me.ts`, nouveau `routes/pricing.ts` | 060-069 |
| `w1-api-r7-haiku` | R7 3x-ui + bundle | `routes/bundle.ts`, `services/offlineBundles.ts`, nouveaux `services/xui.ts`, `services/xuiWorker.ts`, `routes/adminXui.ts` | 070-079 |
| `w1-api-r8-haiku` | R8 nuit, Telegram, réseau | `admin.ts` 1727-1865 (pool, manuel, santé), `routes/internal.ts`, `services/endpoints.ts`, `services/health.ts`, `services/poolWatch.ts`, `services/telegram.ts`, `services/maintenance.ts`, `lib/vless.ts`, nouveaux `lib/names.ts`, `routes/adminNight.ts`, lignes Telegram de `config.ts` | 080-089 |

Fichiers partagés, modifications **minimales et ajoutées en fin de bloc**
seulement : `apps/api/src/app.ts` (une ligne d'enregistrement de tes routes),
`apps/api/src/http/contracts.ts` (ta section, ajoutée **à la fin**),
`apps/api/src/config.ts` (tes clés, groupées). Tout autre fichier : demande dans
ton rapport.

## 3. Migrations (format imposé, l'agent R0 écrit l'exécuteur)

- Un fichier par migration : `apps/api/src/migrations/<NNN>_<slug>.ts`, dans ta
  plage de numéros.
- Contenu :

  ```ts
  import type { Queryable } from "../db.js";

  export const id = "012_admin_sessions";

  export async function up(db: Queryable): Promise<void> {
    await db.query(`CREATE TABLE IF NOT EXISTS admin_sessions (...)`);
  }
  ```

- L'exécuteur (R0) lit le dossier, trie par nom, applique dans une transaction
  ce qui n'est pas dans `schema_migrations`, sous `pg_advisory_lock`. Il marche
  aussi sur PGlite (tests).
- Une migration ne modifie que **tes** tables/colonnes. Pas de `DROP` sur une
  donnée existante. Idempotente si possible (`IF NOT EXISTS`).
- Vérifie le nom exact du type (`Queryable`) dans `apps/api/src/db.ts` avant
  d'écrire ; si R0 ne l'a pas encore livré dans ta copie, écris quand même tes
  migrations à ce format et teste-les en appelant `up()` dans ton test.

## 4. Schéma partagé (noms imposés pour que les lots se recollent)

- **R1** : `admin_users.whatsapp_number text UNIQUE`,
  `admin_users.must_change_password boolean NOT NULL DEFAULT true`,
  `admin_users.telegram_chat_id text` ; `admin_sessions(id text PK, admin_id,
  created_at, last_seen_at, user_agent, revoked_at)` ;
  `admin_platform_roles(admin_id, role CHECK IN ('owner','reseau'), PK(admin_id, role))`.
- **R4** : `communities.whatsapp_group_url`, `communities.contact_whatsapp`,
  `communities.created_by` (UNIQUE quand non nul) ; `apps.community_id` UNIQUE ;
  `apps.logo_key` ; `admin_onboarding(admin_id PK, step int, completed_at,
  guide_step int, guide_done_at)`.
- **R5** : statuts de build + `draft`, `requested`, `rejected` ;
  `builds.reject_reason`, `builds.requested_by`, `builds.approved_by`.
- **R6** : `plans.family CHECK IN ('limited','limited_night')`,
  `plans.quota_bytes bigint` ; `plan_night_options(plan_id, night_window CHECK IN
  ('20-24','24-04','20-04'), price_xaf int, active bool, PK(plan_id, night_window))` ;
  `orders.night_window` ; `subscriptions.quota_bytes`, `subscriptions.night_window`,
  `subscriptions.exhausted_at`, `UNIQUE(subscriptions.order_id)` ;
  `pricing_settings(id text PK DEFAULT 'current', cost_per_gb_xaf int NULL,
  night_window_cost_xaf jsonb NULL, platform_margin_bps int NULL,
  max_commission_bps int NULL, updated_at, updated_by)` — **aucune valeur par
  défaut chiffrée** (D125).
- **R7** : `xui_servers(id, label, panel_url, api_token_sealed, inbound_id,
  capacity, active, created_by, created_at)` ; `subscriptions.xui_server_id`,
  `subscriptions.xui_client_email` ; `xui_jobs(id, kind, subscription_id, state,
  attempts, last_error, run_after, created_at)`.
- **R8** : `night_slots(id, day date, slot CHECK IN ('20','00'), starts_at,
  ends_at, state, deploy_key_hash, deploy_key_expires_at, deployed_by,
  endpoint_id, reminded_at, escalated_at, UNIQUE(day, slot))` ;
  `endpoints.night_slot_id`. Créneau `20` = 20:00-24:00, `00` = 00:00-04:00,
  heure `Africa/Douala`.

## 5. Permissions (R1 les crée toutes dans `permitted()`)

Rôles plateforme cumulables `owner`, `reseau`. Capacités à ajouter :
`account.self` (tout admin), `admin.invite` (owner), `onboarding.self` (admin
sans communauté ou admin de sa communauté), `build.request`
(community_admin), `build.approve` (owner), `pricing.read` (owner,
community_admin), `pricing.manage` (owner), `xui.manage` (owner),
`night_slot.manage` (owner, reseau), `presence.read` (owner). Le rôle `reseau`
reçoit aussi les capacités réseau existantes (lecture/écriture des nœuds,
santé) et **rien d'autre**. Le court-circuit « tout permis » reste réservé à
`owner`. Les autres agents **utilisent** ces noms sans modifier `permitted()` ;
si R1 n'est pas encore fusionné dans ta copie, garde l'appel et note-le.

## 6. Contrat R1 (pour que dashboard et API avancent en même temps)

- `POST /v1/admin/auth/login` `{ identifier, password }` (`email` encore accepté)
  → `{ token, expiresAt, mustChangePassword, admin }` ; `identifier` = email ou
  numéro WhatsApp (9 chiffres, préfixe `+237` facultatif).
- `POST /v1/admin/auth/logout` → 204 (révoque la session courante).
- `GET /v1/admin/me` → `{ id, email, name, whatsappNumber, platformRoles: ("owner"|"reseau")[],
  platformRole, mustChangePassword, memberships: [...], onboarding: { step, completedAt } | null }`.
- `PATCH /v1/admin/me` `{ name?, whatsappNumber?, telegramChatId? }` → `me`.
- `POST /v1/admin/me/password` `{ currentPassword, newPassword }` → `{ token, expiresAt }`
  (nouvelle session ; toutes les autres révoquées ; 12 caractères minimum).
- `GET /v1/admin/me/sessions` → `{ sessions: [{ id, createdAt, lastSeenAt, userAgent, current }] }`.
- `DELETE /v1/admin/me/sessions/:id` → 204 ; `DELETE /v1/admin/me/sessions?scope=others` → 204.
- Tant que `mustChangePassword` est vrai, toute autre route admin répond **403**
  avec le code d'erreur `PASSWORD_CHANGE_REQUIRED` (format d'erreur existant,
  `apps/api/src/lib/errors.ts`).

## 7. Définition de « fini »

1. Dans ton worktree : `bun run --cwd apps/api typecheck` et
   `bun run --cwd apps/api test` (ou les équivalents dashboard :
   `typecheck`, `test`, `lint`) **sans erreur**, sortie citée dans ton journal.
   Si `packages/contract/dist` manque : `bun run --cwd packages/contract build`.
2. Tests ajoutés pour chaque route ou règle nouvelle (patron existant de
   `apps/api/test/`).
3. `git add` de tes fichiers puis **un ou plusieurs commits** sur ta branche,
   message en français, terminé par la ligne
   `Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>`. Pas de push.
4. Rapport final (à l'orchestrateur, 30 lignes max) : branche, commits, ce qui
   est fait et **vérifié** (commande + résultat), ce qui ne l'est pas, fichiers
   partagés touchés, conflits probables avec d'autres lots.
5. `node ...\cli.mjs agent close <slug> "<résultat>"`.

Pas de `fichier:ligne`, pas d'affirmation. Ce qui n'est pas vérifié porte
`(non vérifié)`.

## 8. Suivi des livraisons (contrôle de l'orchestrateur)

| Lot | Branche / commit | Contrôle orchestrateur | Points ouverts |
|---|---|---|---|
| R3 | `w1/r3` `9016fae` | typecheck OK ; `adminDetails.test.ts` + `adminPagination.test.ts` : 23/23 (2026-10-26) ; 6 fichiers, `app.ts` +2 lignes | finance : retirer `\|\| anyRole(["finance"])` de `permitted()` (admin.ts ~299, ~301) dans R1 ; `canRead` duplique `permitted()` (à remplacer quand R1 l'exporte) ; pas de doc OpenAPI des nouvelles routes ; recherche `ILIKE` sans index trigram |
| R5 | `w1/r5` `cbf12e6`, `b2b130a` | typecheck OK ; `builds.test.ts` + `brand.test.ts` : 35/35 | contrôles de rôle à remplacer par `build.request`/`build.approve` après R1 ; pas de doc OpenAPI ; aucune route ne crée `draft` ; prérequis hors code : release libbox, secrets `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `BUILD_CALLBACK_TOKEN` (= `BUILD_CALLBACK_SECRET`), variables API `GITHUB_TOKEN`, `GITHUB_REPO` ; YAML relu seulement |
| R0 | `w1/r0` `139d25c`, `c937f65` | typecheck OK ; `migrations.test.ts` + `payoutReview.test.ts` : 5/5 | **non fait** : `UNIQUE(subscriptions.order_id)` et webhook pending → couverts par R6 ; Postgres réel non testé (PGlite seulement) ; `SCHEMA_SQL` toujours rejoué au boot (contraintes sorties en 001) |
| R1-dash | `w1/r1-dash` `b559053`, `8088101` | typecheck OK ; `admin-auth.test.ts` + `account-ui.test.ts` : 24/24 | lien « Mon compte » dans le menu (R2) ; `runAction` (`server/actions/action-result.ts`) ne redirige pas sur 403 `PASSWORD_CHANGE_REQUIRED` : une ligne à ajouter à la fusion ; non testé contre l'API réelle |
| R2-dash | `w1/r2-dash` `1941abb` | typecheck OK ; suite dashboard 111/111 ; 50 fichiers, −3679 lignes (nettoyage) | tiroirs métier pas encore rebranchés sur `drawer-host` ; pages encore en Suspense serveur (skeleton tant que la vague 2 ne passe pas sur `useAdminQuery`) ; doublons `common/button`, `states`, `confirm-*` non fusionnés ; `DetailPanel` en feuille dès 768 px (plus de colonne latérale à l'accueil) ; pas de `next build` ni de navigateur |
| R1-api | `w1/r1-api` `19bddca`, `771f79f` | typecheck OK ; `adminAccount.test.ts` 14/14 | **prod : migrations 010-012 obligatoires (exécuteur R0) sinon toutes les routes admin cassent** ; ajouter `PASSWORD_CHANGE_REQUIRED` à `API_ERROR_CODES` (packages/contract) ; `POST/GET /admins` (R4) doit écrire `admin_platform_roles` ; rétrograder un owner = vider table + `platform_role` ; compteur d'échecs en mémoire ; `permitted()` exporté → remplacer `canRead` (R3) et contrôles de rôle (R4, R5) |
| R4 | `w1/r4` `1b2f616` | typecheck OK ; `adminOnboarding.test.ts` 21/21 | migration 044 recrée `whatsapp_number` et `must_change_password` (doublon R1, vérifier défauts identiques) et retire `NOT NULL` de `admin_users.email` ; logo provisoire en table `app_logos` (JSON base64), pas R2 ; `adminPayouts.test.ts` met deux apps dans une communauté → casse avec `apps_community_id_uq` ; **le lien `wa.me` met le mot de passe temporaire dans l'URL** (historique navigateur) ; `test/support.ts` doit appliquer toutes les migrations via l'exécuteur R0 |
| R6 | `w1/r6` `de90dd8` | suite complète relancée par l'orchestrateur (OpenCode, 2026-10-26) : **191/191** (typecheck agent OK) | `pricing.read`/`pricing.manage` à basculer sur `permitted()` après R1 (r6 notes reste-à-faire) ; les 7 fichiers de test portent `applyR6Migrations(db)`, à retirer à la fusion ; `planDto` (`admin.ts` ~489) inutilisée, à supprimer par le lot qui possède le bloc (R1/R3) ; Postgres réel non testé (PGlite) ; à confirmer : Go décimal (10^9), quota limité+nuit sur toute la consommation node, état `expired` sans abonnement, anciens forfaits `family='limited'` quota NULL |
| R7 | `w1/r7` `77fa8de` | typecheck sans sortie et suite complète **184/184** (orchestrateur, OpenCode, 2026-10-26) avant commit `77fa8de` (21 fichiers) | bundle à deux familles et `night_slot` (R8) à recoller à la fusion ; migrations 070-073 écrites (le lot possède 070-079) ; Postgres réel non testé (PGlite) ; jeton 3x-ui sceauté et jamais renvoyé (testé), le réel reste à éprouver sur aura-vps |
| R8 | `w1/r8` `8708cdf` | typecheck OK (orchestrateur) ; suite complète 217/217 **relancée par le lot** (log scratch `test2.log`), pas par l'orchestrateur | `permitted()` n'a pas `night_slot.manage` (contrôle local owner/reseau, à basculer après R1) ; migrations 080/081 pas branchées sur l'exécuteur R0 ; verrou par ligne `alert_state` (pas `pg_advisory_lock`, à confirmer) ; relance toutes les 5 min dès T-15 (interprétation à confirmer) ; jour=paid-gcp, nuit=free-labs (mapping à confirmer) ; le bundle `startsAt` (R7) reste à recoller |

---
id: audit-synthese
title: Synthèse de l'audit du code et architecture cible de la refonte 2
tags: [audit, architecture, refonte, plan, lots]
status: assumption
updated: 2026-10-26
related: [audit-brief, admin-journeys, decisions, dashboard-plan]
---

# Synthèse de l'audit (2026-10-26) et architecture cible

14 auditeurs Haiku, une tranche chacun, lecture seule. Rapports :
`knowledge/agents/audit-*-haiku/notes/audit.md`. Plan cible : `audit-brief` et
la page https://claude.ai/artifact/Sxajm3C2zFFcdiyZaBrRPm.
Statut `assumption` jusqu'à validation par l'utilisateur.

## 1. Recontrôlé par l'orchestrateur (lecture du code, 2026-10-26)

| Affirmation | Preuve |
|---|---|
| La release `libbox-1.14.3` n'a aucun fichier, `libbox.aar` absent du dépôt | `gh release view libbox-1.14.3` → `assets: []` ; `apps/android/app/libs/libbox.aar` absent |
| Les builds visent `main`, la branche du dépôt est `master` | `apps/api/src/config.ts:91` ; `git branch -r` |
| `subscriptions.order_id` sans UNIQUE | `apps/api/src/schema.ts:167` (à comparer à `:249`) |
| Webhook « pending » enregistré comme final, un renvoi identique devient `duplicate` | `services/payments.ts:569-614` |
| Fichier de secours : contient le credential partagé du nœud, durée ≤ 24 h non bornée par la fin d'abonnement, usage unique non imposable côté serveur | `services/offlineBundles.ts:118-137`, `:192-212` |
| Bundle : en mode `shared`, le credential du nœud part dans l'enveloppe | `routes/bundle.ts:195-212` |
| L'API a un `vercel.json` (60 s max), alors que la prod tourne sur Dokku (`vpn-api`) | `apps/api/vercel.json` ; passation 2026-10-26 |
| `fapshi.md` disait « aucun appel payout » : faux | `routes/admin.ts:1498` ; nœud corrigé |

Tout le reste vient des rapports et n'a pas été recontrôlé ligne par ligne.

## 2. Bugs à corriger avant ou pendant la refonte

| Gravité | Bug | Où | Lot |
|---|---|---|---|
| Haute | Deux abonnements pour une même commande (course webhook / refresh) | `payments.ts:427`, `schema.ts:167` | R0 |
| Haute | Commande bloquée si le webhook arrive « pending » puis est renvoyé | `payments.ts:602-614` | R0 |
| Haute | Versement rejouable si l'écriture de la référence échoue après un virement réussi | `admin.ts:1512-1534` | R0 |
| Haute | Schéma rejoué à chaque démarrage avec DROP/ADD CONSTRAINT (verrou, `lock_timeout` 10 s) | `db.ts:73-81`, `schema.ts:452-482` | R0 |
| Haute | Pipeline APK : jamais réussie (libbox sans fichier, `main` inexistant, secrets R2 et callback absents, pas de callback d'échec) | `android-brand.yml`, `config.ts:91` | R5 |
| Moyenne | Callback de build sans garde de transition (`running` tardif écrase `succeeded`) | `builds.ts:317` | R5 |
| Moyenne | Verrouillage du compte owner par un tiers (8 essais), échecs non journalisés | `adminAuth.ts:77-83` | R1 |
| Moyenne | Finance : `permitted` autorise, `scopedCommunity` refuse (403) | `lib/auth.ts:261`, `admin.ts:1257`, `:1301` | R3 |
| Moyenne | App : bundle vide ignoré, accès coupé encore utilisable ; bundle jamais re-tiré en session | `AppController.kt:240-252` | R10 |
| Moyenne | Page Forfaits : une marque mal formée fait échouer la liste entière (cause probable de l'erreur prod) | `plans-section.tsx:30`, `plans.schema.ts:5-13` | R3 |
| Moyenne | Champ VLESS : Entrée soumet le formulaire, UUID en clair, tout éditable | `manual-endpoint-sheet.tsx:73-77` | R8 |
| Basse | Nœud `down` remis `healthy` sans probation | `health.ts:152-154` | R8 |
| Basse | `planRevision` ignore `endpoint_tier` | `payments.ts:160-175` | R6 |
| Basse | Retrait du dernier admin : course | `admin.ts:416-426` | R3 |

## 3. Décisions à prendre (avant le code concerné)

> Tranchées le 2026-10-26 : 1 (D122), 4 (D124), 6 et 7 (D123). Restent 2, 3, 5,
> 8, 9.

1. ~~Hébergement de l'API~~ : **Dokku** (D122).
2. **Amender D45** : un bundle peut porter deux familles de serveurs (jour 3x-ui
   limité, nuit illimitée) avec une fenêtre de validité (`startsAt`/`expiresAt`).
3. **Interdire le repli sur un credential partagé** pour le forfait limité
   (client 3x-ui dédié obligatoire).
4. ~~Clé de déploiement par créneau~~ : oui (D124).
5. **Chiffres de tarif** : coût du Go, coût par plage de nuit, marge plateforme.
6. ~~VM GCP permanente~~ : créée par les owners sur le compte GCP durable, lien
   du panneau enregistré dans le dashboard ; tests sur `aura-vps` d'ici là (D123).
7. ~~Compte des nœuds de nuit~~ : comptes Qwiklabs, réservés à l'illimité ;
   jamais de compte durable pour la nuit (D123).
8. **Règle du README du dashboard** qui interdit fetch client et Route Handlers :
   à amender pour le cache client et le ticket SSE.
9. Affichage du prix de la plage de nuit dans l'app (supplément ou total).

## 4. Architecture cible, lot par lot

Conventions relevées : routes Fastify + zod dans `apps/api/src/routes/*`,
permissions dans `permitted()` (`admin.ts:281`), journal par `appendAudit`
(`admin.ts:445`), services `BaseService` côté dashboard
(`src/server/services/*`), server actions dans `src/server/actions/*`.

### R0 — Fondations (préalable, sans changement visible)
- **Migrations versionnées** : table `schema_migrations(id, applied_at)` ;
  dossier `apps/api/src/migrations/NNN_nom.ts` exportant `up(db)` ; exécuteur
  dans `db.ts` sous `pg_advisory_lock`. `SCHEMA_SQL` gelé comme migration 000 ;
  les DROP/ADD CONSTRAINT sortent du rejeu.
- `subscriptions` : dédoublonnage puis `UNIQUE(order_id)` ; activation sous
  `SELECT … FOR UPDATE` de la commande.
- Webhook : `pending` n'est pas final (renvoi retraité).
- Versement : écrire la référence Fapshi avant de rendre la main ; ne jamais
  repasser `approved` après une réponse positive du fournisseur.
- Dashboard : schémas de réponse partagés depuis `packages/contract` (une seule
  source), validation tolérante par ligne pour les listes.

### R1 — Comptes admin (urgent : admins en prod)
- Migration : `admin_users` + `whatsapp_number text UNIQUE`,
  `must_change_password boolean NOT NULL DEFAULT true` (couvre les comptes
  existants), `telegram_chat_id text`.
- `admin_sessions(id, admin_id, created_at, last_seen_at, user_agent, revoked_at)`
  ; claim `sid` dans le JWT ; `requireAdmin` refuse une session révoquée.
- `admin_platform_roles(admin_id, role CHECK IN ('owner','reseau'))`, remplissage
  depuis `platform_role` ; `permitted()` : le court-circuit reste réservé à
  `owner`, `reseau` n'a que `network.*` et `night_slot.*`.
- Garde dans `app.ts` : si `must_change_password`, toute route admin sauf
  `/me`, `/me/password`, `/auth/*` répond `403 PASSWORD_CHANGE_REQUIRED`.
- Routes : `POST /admin/auth/login` (`identifier` = email ou numéro),
  `POST /admin/auth/logout`, `GET /admin/me` (corrige `id`, ajoute
  `mustChangePassword`, `platformRoles[]`, `onboarding`), `PATCH /admin/me`,
  `POST /admin/me/password`, `GET /admin/me/sessions`,
  `DELETE /admin/me/sessions/:id`, `DELETE /admin/me/sessions?others=1`.
- Compteur de connexion : par couple compte + IP, échecs journalisés.
- Dashboard : `(dashboard)/layout.tsx` lit `getMe()` (`server/context.ts:12`) et
  redirige vers `/compte/mot-de-passe` (groupe sans shell) ; page `/compte`
  (Profil · Mot de passe · Sessions · Apparence) ; champ « Email ou numéro
  WhatsApp » au login ; déconnexion qui révoque.

### R2 — Shell, navigation, cache client
- Dépendance `@tanstack/react-query` ; `app/providers.tsx` ;
  préchargement serveur + `HydrationBoundary` ; plus de Suspense de lignes à
  chaque visite.
- BFF : `app/api/bff/[...path]/route.ts`, GET seulement, liste blanche de
  chemins admin, ajoute jeton et clé côté serveur. Les mutations restent des
  server actions qui renvoient les clés de requête à invalider.
- `nav-model.ts` réécrit : Accueil, Abonnés, Offres, Argent, Communauté ;
  Plateforme (owner) ; Réseau (owner, reseau ; seul espace du rôle reseau).
  `bottom-bar.tsx` 5 entrées ; `top-bar.tsx` sans répétition ; suppression des
  puces de section de `shell-nav.tsx`.
- Tiroirs : un seul hôte `components/drawers/drawer-host.tsx` piloté par l'URL
  (`?abonne=`, `?appareil=`, `?commande=`, `?forfait=`, `?versement=`,
  `?build=`) ; un seul `ResponsiveSheet` (fusion `app-sheet` et `detail-panel`,
  seuil 768 px).
- `components/shell/command-palette.tsx` (Ctrl K) sur `ui/command.tsx`.
- Nettoyage du kit selon `audit-dash-ui-haiku` §5 (doublons bouton, état vide,
  tableau, confirmation, recherche) ; suppression de `/kit` ;
  `components.json` aligné sur les icônes réelles.

### R3 — Fiches, recherche, pages fusionnées
- API : `GET /admin/users/:id`, `/orders/:id`, `/devices/:id`, `/payouts/:id`,
  `GET /admin/communities/:id/summary`, `GET /admin/search?q=` ; pagination par
  curseur sur users, devices, commissions, payouts, audit-log ; correction finance.
- Routes dashboard : `/[c]/abonnes` (onglets abonnés, appareils, commandes,
  secours), `/[c]/offres` (forfaits, application), `/[c]/argent` (commissions,
  versements), `/[c]/communaute` (réglages, équipe, journal), `/plateforme`
  (admins, communautés, builds, tarifs, équipe), `/reseau` (ce soir, jour,
  historique), `/compte`.

### R4 — Onboarding en libre-service et guide
- Migration : `communities` + `whatsapp_group_url`, `contact_whatsapp`,
  `created_by UNIQUE` ; `apps.community_id UNIQUE` (une app par communauté) ;
  `apps.logo_key` (objet R2) ; `admin_onboarding(admin_id, step, completed_at,
  guide_step, guide_done_at)`.
- Routes : `POST /admin/onboarding/community`, `POST /admin/apps`,
  `PATCH /admin/apps/:id`, `POST /admin/apps/:id/logo`,
  `GET|PATCH /admin/onboarding` ; `POST /admin/admins` génère le mot de passe
  temporaire côté serveur et renvoie un lien `wa.me` prêt à envoyer.
- Dashboard : `app/(onboarding)/bienvenue/[etape]/page.tsx`,
  `components/onboarding/*`, nouveaux `Stepper`, `PhonePreview`, `Dropzone`,
  `Tour` ; contenu du guide dans `src/lib/guide/<role>.ts`.

### R5 — Demandes de build et pipeline
- Statuts de build + `draft`, `requested`, `rejected` (`reject_reason`) ;
  `POST /admin/apps/:id/build-requests` (admin), `POST /admin/builds/:id/approve`
  et `/reject` (owner) ; seul `approve` déclenche `workflow_dispatch`.
- Callback : gardes de transition, callback d'échec dans le workflow,
  `GITHUB_REF` par défaut `master`.
- Prérequis hors code : publier `libbox.aar` dans la release, secrets
  `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `BUILD_CALLBACK_TOKEN`.
- `buildBrandSpec` (`lib/brand.ts:273-296`) transmet WhatsApp et logo.
- Dashboard : lien d'installation et QR code.

### R6 — Forfaits, plancher, paiement
- Migration : `plans` + `family CHECK IN ('limited','limited_night')`,
  `quota_bytes bigint` ; `plan_night_options(plan_id, window CHECK IN
  ('20-24','24-04','20-04'), price_xaf, active)` ; `pricing_floor(id,
  cost_per_gb_xaf, night_window_cost_xaf jsonb, platform_margin_bps,
  effective_at, created_by)` ; `orders` + `night_window` ;
  `subscriptions` + `quota_bytes`, `night_window`, `exhausted_at`.
- `planRevision` inclut famille, quota, options et tier ; total calculé côté
  serveur ; contrôle du plancher à la création et à la modification.
- `GET /me/subscription` : `quotaBytes`, `usedBytes`, `remainingBytes`,
  `nightWindow`, `state` (`active`, `exhausted`, `expired`).
- Owner : `GET|PUT /admin/pricing/floor`.

### R7 — 3x-ui (forfait limité)
- Table `xui_servers(id, label, panel_url, api_token_sealed, inbound_id,
  capacity, active, created_by)` remplie par les owners depuis Plateforme ›
  Serveurs limités (jeton scellé avec `MASTER_KEY`, jamais renvoyé ; bouton
  « Tester la connexion ») ; abonnement limité rattaché à un serveur
  (`subscriptions.xui_server_id`, `xui_client_email`).
- `services/xui.ts` : `addClient`, `getClientTraffic`, `setClientEnabled`
  (API Bearer du panneau) ; table `xui_jobs` (outbox) ; activation → job de
  création hors transaction ; tâche toutes les 10 min : lecture du trafic →
  `usage` → épuisement → désactivation + `exhausted_at`.
- Bundle : client dédié pour le forfait limité ; plus de repli partagé.
- Hors code : VM GCP permanente avec 3x-ui, créée par un owner (D123) ; tests
  d'ici là sur le 3x-ui d'`aura-vps`.

### R8 — Nuit, Telegram, espace Réseau
- `night_slots(id, day, slot CHECK IN ('20','00'), state, deploy_key_hash,
  deployed_by, endpoint_id, reminded_at, escalated_at)` ; clé de déploiement par
  créneau (D124) : affichée au membre Réseau, à usage unique, valable jusqu'à la
  fin du créneau, échangée par `POST /internal/endpoints/register` ;
  `ENDPOINT_TTL=14400`. Les nœuds de nuit vivent dans des comptes Qwiklabs
  (D123) : la marche à suivre du dashboard le dit.
- Telegram : envoi à tous les `telegram_chat_id` des owners et reseau, message
  de test, rappel 15 min avant, relance toutes les 5 min, fuseau
  `Africa/Douala`, verrou consultatif contre les doublons, réessai.
- `lib/names.ts` : noms génériques aléatoires ; `POST /admin/endpoints/manual`
  accepte `vlessUri` et l'analyse côté serveur (`lib/vless.ts:48`).
- Bundle à deux familles avec `startsAt` (décision 2).

### R9 — Temps réel
- API sur Dokku : `POST /admin/events/ticket` (appelé par le BFF, ticket 60 s),
  `GET /admin/events?ticket=` en SSE (`reply.hijack()`), client `pg` dédié en
  `LISTEN`, helper `notifyChange(db, topic, communityId)` dans les mutations ;
  présence = connexions ouvertes + `last_seen_at`. nginx : `proxy_buffering off`
  sur ce chemin.
- Dashboard : `hooks/use-live-invalidation.ts` (EventSource → invalidation).

### R10 — App Android
- `ApiClient` : login par numéro, `EntitlementDto` avec quota et plage,
  `PlanDto` avec famille et options, `CreateOrderRequest` avec plage.
- `BundleConfig` + `startsAt` ; re-tirage du bundle au début de plage ; bundle
  vide = coupure.
- Écrans : pop-up de bienvenue au premier lancement, page de paiement native,
  jauge de quota, « Data épuisée », feuille Activité (réutilise
  `LibboxTunnelEngine.kt:129-135`), bouton d'aide WhatsApp avec code
  d'appareil ; `BrandTokens` + `supportWhatsappNumber`, `communityWhatsappUrl`.

## 5. Ordre et parallélisme

R0 → R1 (urgent) → R2 → R3, puis R4 et R6 en parallèle (fichiers distincts),
R5 dès que les prérequis hors code sont faits, R7 et R8 après les décisions 2 à
7, R9 après R2, R10 après R6 (contrat API).

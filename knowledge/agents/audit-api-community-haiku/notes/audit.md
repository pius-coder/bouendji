# Audit API - communautés, apps, forfaits, membres, builds

Lecture seule. Tranche : `apps/api/src/routes/admin.ts` 723-1073, `routes/builds.ts`, `lib/brand.ts`, tables `communities`, `apps`, `plans`, `builds`, `community_memberships` de `schema.ts`. Chaque affirmation cite `fichier:ligne`. Ce qui n'a pas été vérifié porte `(non vérifié)`.

## 1. Verdict

- Le CRUD communautés / forfaits / appartenances existe et est bien gardé : matrice de droits (`admin.ts:281-336`), périmètre par communauté (`lib/auth.ts:251-262`), audit systématique, garde du dernier `community_admin` (`admin.ts:416-426`).
- Le parcours libre-service n'est **pas** réalisable aujourd'hui : aucune route ne crée ni ne modifie une application (`apps` n'est inséré que par `seed.ts:68` et les tests). Une communauté ne peut être créée que par l'owner (`admin.ts:738-741`).
- Il n'existe ni champ WhatsApp (groupe, contact), ni stockage du logo, ni notion de famille de forfait, ni quota en octets, ni plage de nuit, ni prix plancher.
- Les builds partent **immédiatement** au `POST` (aucune validation owner, aucun refus, aucun brouillon). Le callback n'a pas de garde de transition d'état.
- Aucune contrainte SQL n'impose « une communauté et une application par admin ».

## 2. Inventaire

| Fichier | Rôle | Taille | État |
|---|---|---|---|
| `apps/api/src/routes/admin.ts` 723-1073 | communities GET/POST/PATCH, apps GET, plans GET/POST/PATCH, memberships GET/POST/PATCH/DELETE | ~350 lignes (fichier : 1891) | `partiel` : CRUD solide, pas de création d'app, pas de champs plan 2 familles |
| `apps/api/src/routes/builds.ts` | POST/GET builds admin, callback interne, dispatch GitHub | 346 lignes | `partiel` : pipeline présente, mais sans validation owner ni transitions |
| `apps/api/src/lib/brand.ts` | validation du manifeste de marque (422), `buildBrandSpec` | 296 lignes | `solide` : règles claires, réutilisables |
| `apps/api/src/schema.ts` table `communities` (6-14) | commission, statut, payout | 9 lignes | `partiel` : pas de lien WhatsApp ni contact |
| `apps/api/src/schema.ts` table `apps` (17-35) + ALTER `brand` (485) | identité de marque | 19 colonnes | `partiel` : `logo_url` (26) jamais lu ni écrit |
| `apps/api/src/schema.ts` table `plans` (123-137) + ALTER endpoint_tier (480-482) | forfaits | 15 colonnes | `partiel` : pas de famille, quota, plage, prix plancher |
| `apps/api/src/schema.ts` table `builds` (340-354) + ALTER (535-540) | file de builds | 13 colonnes | `partiel` : statuts techniques, pas de validation ni motif de refus |
| `apps/api/src/schema.ts` table `community_memberships` (397-405) | appartenances | 7 colonnes | `solide` (rôle sans CHECK, voir §4.5) |
| `apps/api/src/services/payments.ts:160-175` (hors tranche, lu) | `planRevision` | 16 lignes | `bug` : ne couvre pas `endpoint_tier` (§6) |

Preuves clés :
- `communities` : `slug` UNIQUE (`schema.ts:9`), `commission_bps` borné 0..3000 (`schema.ts:451-455`, `admin.ts:70-80`).
- `apps` : `slug` et `package_name` UNIQUE globaux (`schema.ts:20,22`), `theme` défaut `halo` (`schema.ts:23`), `accent` (`schema.ts:24`), `appearance` (`schema.ts:25`), `logo_url` (`schema.ts:26`), `support_email` (`schema.ts:27`), `support_url` (`schema.ts:28`), `brand jsonb` (`schema.ts:485`).
- Aucun `INSERT INTO apps` hors `seed.ts:68` et `apps/api/test/*.ts`. Aucun `PATCH` d'app. `contracts.ts:724` ne déclare que `GET /v1/admin/apps`.

## 3. Ce qui sert le plan

- **Matrice de droits** `permitted` (`admin.ts:281-336`) : `community.manage` owner seul ; `membership.*` et `plan.manage` pour le `community_admin` de la communauté. Réutilisable tel quel pour le point 2 (libre-service) et le point 4.
- **Périmètre** : `scopedCommunity` (`lib/auth.ts:251-262`) : le `community_id` vient de l'URL, un id hors périmètre renvoie 403. Bon socle.
- **Validation de marque** `validateBrandSpec` (`lib/brand.ts:108-`) : `appName` 2-40 (`brand.ts:113`), `packageName` (`brand.ts:121`), thème parmi 5 (`BRAND_THEMES`, en tête de `brand.ts`), `supportUrl` https/mailto/tel (`brand.ts:149-167`), `accent` `#RRGGBB` (`brand.ts:173`). À réutiliser pour l'étape « application » de l'onboarding, avec un aperçu (`validateBrandSpec` ne lit jamais `appId`/`apiBaseUrl`).
- **Verrou de build** : `SELECT ... FOR UPDATE` puis `max(version_code)+1` dans la transaction (`builds.ts:241-256`). Solide.
- **Callback** : secret distinct, comparaison à temps constant, 503 si vide (`builds.ts:117-`). Idempotence par `COALESCE` (`builds.ts:317-`).
- **Dernier admin protégé** `assertNotLastCommunityAdmin` (`admin.ts:416-426`), appliqué en `PATCH` (dans `PATCH` `admin.ts:1000-1040`) et `DELETE` (`admin.ts:1041-1073`).
- **Retrait logique** : `DELETE` passe en `status='disabled'` (`admin.ts:1041-1073`), audit conservé.
- **Forfait** : `planCreateSchema` strict (`admin.ts:199-213`), `planPatchSchema` sans `code` (`admin.ts:217-220`). `code` immuable, bon choix.

## 4. Écarts avec le plan

Numérotation = points du plan (brief). Points 1, 3, 6 à 9 : hors de ma tranche sauf mention.

### Point 1 (mot de passe forcé, rôle `reseau`) — touche la tranche
- Le rôle plateforme `reseau` n'existe pas : `PlatformRole = "none" | "owner"` (`lib/auth.ts:22`), `platform_role` (`schema.ts:118`, défaut `none`), création `z.enum(["none","owner"])` (`admin.ts:110`). Rôles de membership sans `reseau` non plus (`admin.ts:94,99`).
- Pas de drapeau « mot de passe à changer » dans `admin_users` (`schema.ts:111-119`). (Hors tranche : `POST /admins` à `admin.ts:1074`.)

### Point 2 (libre-service, 6 étapes) — écart majeur
- **Création de communauté** : owner seul (`admin.ts:738-741` → `permitted` renvoie faux pour non-owner, `admin.ts:290-291`). Un admin invité ne peut donc pas créer sa communauté.
- **Création d'application** : aucune route. `POST /v1/admin/apps` absent de `admin.ts` (seules `GET` à `admin.ts:817`) et de `contracts.ts`. Pas de `PATCH` d'app non plus.
- **Une seule communauté / une seule application par admin** : aucune contrainte.
  - `community_memberships` n'a que `UNIQUE (admin_user_id, community_id)` (`schema.ts:404`) ; un admin peut cumuler N appartenances (`POST` `admin.ts:959-`, aucun compteur).
  - `apps` n'a aucun lien à un administrateur (`schema.ts:17-35`). `admin_users.community_id` (`schema.ts:113`) existe encore (usage non vérifié).
  - `scopedCommunity` lève déjà « communauté requise » si plusieurs appartenances (`lib/auth.ts:251-262`) : le cumul est donc traité comme exception, pas interdit.
- **Champs WhatsApp** : absents de `communities` (`schema.ts:6-14`) et de `apps`. `communities.payout_phone` (`schema.ts:12`) est le numéro de versement, pas un contact.

### Point 2 — champs de marque
- **Logo** : `apps.logo_url` (`schema.ts:26`) est une colonne orpheline : aucun fichier ne la lit ou ne l'écrit (grep `logo` sur `apps/api/src` : seulement `schema.ts:26`). Absente de `validateBrandSpec` (`brand.ts`) et de `appDto` (`admin.ts:639-650`). Pas d'endpoint d'upload.
- **Couleur** : `apps.accent` (`schema.ts:24`) validée en `#RRGGBB` (`brand.ts:173`), mais non exposée par `appDto` et non modifiable (pas de `PATCH` d'app).
- **Stockage du logo** : la CI pousse l'APK sur R2 (`.github/workflows/android-brand.yml`, étape « Déposer dans R2 », ligne ~192). Le commentaire de `builds.ts:78` dit encore « Vercel Blob, D62 » : incohérence documentaire.

### Point 3 (guide par rôle) — hors tranche.

### Point 4 (forfaits, deux familles) — écart majeur
- **Famille** : absente. `endpoint_tier` (`schema.ts:480-482`, CHECK `free-labs`/`paid-gcp`) sert au choix du pool de nœuds, pas à la famille. Le commentaire `admin.ts:211-212` dit « illimité = free-labs, limité = paid-gcp », ce qui ne tient plus avec le plan : la famille (b) « limité + nuit » a besoin de **deux** pools (quota jour sur GCP permanent, nuit sur Cloud Run éphémère). Un seul `endpoint_tier` ne l'exprime pas.
- **Quota en octets** : absent de `plans` (`schema.ts:123-136`). Le trafic est compté ailleurs (`routes/account.ts:35`, `SUM(u.bytes_up)`) : la source existe, pas le plafond.
- **Plages de nuit** (20h-24h, 24h-4h, 20h-4h) : absentes. Aucune colonne, aucune enum, aucune table de prix par plage.
- **Champs actuels** (`admin.ts:199-213`) : `code` (`planCodeSchema`), `name` 2-80, `priceXaf` 1..10 000 000 (`admin.ts:204`), `durationDays` 1..3650, `deviceLimit` 1..10, `badge`, `featured`, `active`, `sortOrder` 0..1000, `endpointTier`. Le CHECK SQL manque sur `price_xaf` (`schema.ts:129` : `integer NOT NULL`, aucun `CHECK > 0`).
- **Révision** : pas de colonne. `planRevision` (`services/payments.ts:160-175`) hache `code|price|duration|device_limit|active` seulement.
- **Où ajouter** (proposition, §5).

### Point 5 (prix plancher) — écart majeur
- Aucun prix plancher, aucun coût du Go, aucun coût par plage, aucune marge n'existe en base (`grep` sur `floor|cost|marge` dans `apps/api/src` : rien dans la tranche) (non vérifié hors tranche).
- Le seul plafond existant concerne la commission : `commission_bps` 0..3000 (`schema.ts:451-455`, `services/payments.ts:190`). Ce n'est pas un prix plancher.

### Point 6, 7, 8, 9 — hors tranche.

### Points de la tranche non couverts ailleurs
- Pas d'endpoint de lecture « qui est connecté » ni de flux : hors tranche.

## 5. Structure de code proposée

### Communautés et apps (point 2)
- **Migration** (ajout seul, dans `schema.ts` après la ligne 554) :
  - `ALTER TABLE communities ADD COLUMN IF NOT EXISTS whatsapp_group_url text, ADD COLUMN IF NOT EXISTS contact_phone text, ADD COLUMN IF NOT EXISTS owner_admin_id text REFERENCES admin_users(id);`
  - `CREATE UNIQUE INDEX IF NOT EXISTS communities_one_per_owner ON communities(owner_admin_id) WHERE owner_admin_id IS NOT NULL;`
  - `ALTER TABLE apps ADD COLUMN IF NOT EXISTS owner_admin_id text REFERENCES admin_users(id);`
  - `CREATE UNIQUE INDEX IF NOT EXISTS apps_one_per_owner ON apps(owner_admin_id) WHERE owner_admin_id IS NOT NULL;`
  - `ALTER TABLE apps ADD COLUMN IF NOT EXISTS logo_key text;` (clé d'objet R2 ; `logo_url` reste l'URL publique dérivée).
- **Route** `POST /v1/admin/onboarding/community` (`admin.ts`, nouveau bloc près de `:738`) : `requireAdmin`, refus si `admin.platformRole !== "owner"` et si l'admin a déjà une communauté dont il est owner. Insertion de `communities` + `community_memberships(role='community_admin')` + audit, en une transaction avec `SELECT ... FOR UPDATE` sur `admin_users`.
- **Route** `POST /v1/admin/onboarding/app` : `createAppSchema = z.object({ name, packageName, theme, supportUrl, accent, supportEmail?, whatsappGroupUrl?, contactPhone? }).strict()`. Réutilise `validateBrandSpec` (`lib/brand.ts:108`) pour les règles ; `slug` dérivé du nom, `UNIQUE` existant (`schema.ts:20`).
- **Route** `PATCH /v1/admin/apps/:appId` : mêmes champs, interdit si un build est `running`.
- **Logo** : `POST /v1/admin/apps/:appId/logo` (multipart, PNG 512x512 ou 1024x1024, `sharp` non vérifié), écrit sur R2 (`R2_PUBLIC_BASE`, `android-brand.yml` ligne ~39), met à jour `apps.logo_url`.
- **Fichiers** : `routes/admin.ts` (ajout), `lib/brand.ts` (aucune règle nouvelle hormis `whatsapp`), `schema.ts` (migration), `http/contracts.ts` (nouvelles routes).
- **À supprimer** : rien. Le commentaire `builds.ts:78` (« Vercel Blob ») à corriger en « Cloudflare R2 ».

### Forfaits (points 4 et 5)
- **Migration** :
  - `ALTER TABLE plans ADD COLUMN IF NOT EXISTS plan_family text NOT NULL DEFAULT 'limited' CHECK (plan_family IN ('limited','limited_night'));`
  - `ALTER TABLE plans ADD COLUMN IF NOT EXISTS quota_bytes bigint CHECK (quota_bytes IS NULL OR quota_bytes > 0);`
  - `ALTER TABLE plans ADD CONSTRAINT plans_price_positive CHECK (price_xaf > 0);`
  - Nouvelle table `plan_night_prices (plan_id text REFERENCES plans(id), window text CHECK (window IN ('20-24','00-04','20-04')), price_xaf integer NOT NULL CHECK (price_xaf > 0), PRIMARY KEY (plan_id, window))`.
  - Nouvelle table `app_pricing (app_id text PRIMARY KEY REFERENCES apps(id), cost_per_gb_xaf integer NOT NULL, cost_per_night_window_xaf jsonb NOT NULL, margin_bps integer NOT NULL)`, saisie par l'owner.
- **Validation** : `planCreateSchema` (`admin.ts:199`) gagne `planFamily`, `quotaGb`, `nightWindows: ("20-24"|"00-04"|"20-04")[]`, `nightPrices`. `plans` ne peut pas être créé sans `quota_bytes` si `plan_family='limited'`.
- **Prix plancher** `function priceFloorXaf(app, plan): number` (nouveau fichier `services/pricing.ts`) : coût data `ceil(quota_gb * cost_per_gb)` + somme des coûts de plage choisies, puis `* (1 + margin)`. Contrôle au `POST` et au `PATCH` (`admin.ts:850`, `:897`) : `422` si `priceXaf < priceFloorXaf`. Formule exacte : **(non vérifié, à valider par l'owner)**.
- **Endpoint tier** : garder `endpoint_tier` pour le pool. `plan_family='limited_night'` implique deux pools ; exprimer par `endpoint_tier` de la famille, ou un tableau de pools (non tranché).
- **Révision** : `planRevision` (`services/payments.ts:160`) doit hacher `plan_family`, `quota_bytes`, `endpoint_tier` et les plages. Sinon `payments.ts:311-312` accepte une commande sur un catalogue modifié.
- **Fichiers** : `schema.ts` (migration), `routes/admin.ts:199-260` (schéma), `routes/admin.ts:850-` (POST), `:897-` (PATCH), `services/payments.ts:160` (révision), `services/pricing.ts` (nouveau), `http/contracts.ts:741-` (contrat).

### Builds (point 2 et point 4 du plan, validation owner)
- **Statuts cibles** : `draft`, `requested`, `refused`, `running`, `published`, `failed`. Mapping sur `queued`/`succeeded` existants : `queued`→`requested`, `succeeded`→`published`, `cancelled` retiré ou gardé en interne.
- **Migration** : `ALTER TABLE builds ADD COLUMN IF NOT EXISTS refusal_reason text CHECK (char_length(refusal_reason) <= 280), ADD COLUMN IF NOT EXISTS validated_by text, ADD COLUMN IF NOT EXISTS validated_at timestamptz;` et un `CHECK (status IN (...))` (aujourd'hui `status text NOT NULL DEFAULT 'queued'`, `schema.ts:345`, sans CHECK).
- **Routes** :
  - `POST /v1/admin/apps/:appId/builds` (`builds.ts:225`) : crée en `requested` **sans dispatch** pour un `community_admin`. Le dispatch vers GitHub est déplacé dans `POST /v1/admin/builds/:id/approve` (owner seul, `requireOwner`).
  - `POST /v1/admin/builds/:id/refuse` `{ reason }` : owner seul, `draft|requested` → `refused`.
  - `dispatchBuild` (`builds.ts:179`) inchangé, appelé depuis `approve`.
- **Callback** : `UPDATE builds ... WHERE id = $1 AND status IN ('requested','queued','running')` pour interdire la régression (voir §6).
- **Fichiers** : `builds.ts` (routes, `BUILD_STATUSES` `builds.ts:68`), `schema.ts:340-354`, `http/contracts.ts:605-626`.

### Memberships (point 1 et 2)
- Ajouter `reseau` au rôle plateforme : `PlatformRole = "none" | "owner" | "reseau"` (`lib/auth.ts:22`), `admin_users.platform_role` sans CHECK aujourd'hui (`schema.ts:118`) ; `permitted` (`admin.ts:281`) à compléter pour les seules routes `reseau`.
- Ajouter `CHECK (role IN ('community_admin','support','finance'))` sur `community_memberships.role` (`schema.ts:401`) et `CHECK (status IN ('active','disabled'))` sur `status` (`schema.ts:402`).
- Réactivation : `POST` renvoie 409 si la ligne `disabled` existe (`admin.ts:992`). Proposer un upsert qui repasse `status='active'` (route `PATCH` existe déjà, `admin.ts:1000`).

## 6. Bugs et risques

1. **Callback sans garde de transition** — `builds.ts:317-` : `SET status = $2` sans condition. Scénario : `succeeded` arrive, puis une livraison retardée `running` la ramène à `running` (`completed_at` reste, statut faux). Correction : `AND status NOT IN ('succeeded','failed','cancelled')` ou matrice de transitions.
2. **Callback accepte `succeeded` sans APK** — `builds.ts:70-95` : `apkUrl` et `sha256` optionnels. Scénario : `published` sans fichier. Correction : exiger `apkUrl` + `sha256` quand `status='succeeded'`.
3. **Mode mock laisse le build en `queued`** — `builds.ts:269`, `config.ts:87` : `MOCK_BUILDS` vaut `true` hors production. Aucun callback ne vient : la console attend indéfiniment. Scénario : toute instance non prod.
4. **Révision de forfait incomplète** — `services/payments.ts:160-175` : `endpoint_tier`, `name`, `description`, `featured`, `sort_order` absents du hachage. Scénario : un owner passe un forfait de `free-labs` à `paid-gcp` au même prix ; la révision ne change pas, la commande se fait sur un pool différent de celui affiché. Correction : hacher `endpoint_tier` au minimum (et les champs de famille du §5).
5. **Dernier admin : course** — `admin.ts:416-426` : `count` puis `UPDATE` sans verrou. Scénario : deux `PATCH` concurrents rétrogradent les deux derniers `community_admin` ; la communauté n'a plus d'admin. Correction : `SELECT ... FOR UPDATE` sur les lignes `community_memberships` de la communauté dans la transaction.
6. **`PATCH` de forfait : perte de mise à jour** — `admin.ts:897-902` (lecture `before` hors transaction) et `:920-925` (réécriture de tous les champs depuis `before`). Scénario : deux PATCH concurrents ; le second réécrit les champs du premier avec ses valeurs stales. Correction : lire et écrire dans la même transaction, `FOR UPDATE`.
7. **Prix : aucune borne en base** — `schema.ts:129` : `price_xaf integer NOT NULL`. Seul `admin.ts:204` (`min(1)`) protège. Un `UPDATE` direct ou un autre chemin peut poser `0` ou négatif.
8. **Builds déclenchés sans validation** — `builds.ts:140-144` : `community_admin` déclenche une CI et un APK signé seul. Conflit avec le plan (validation owner). Scénario : un admin lance des builds en boucle (aucune limite de fréquence dans la route (non vérifié pour un rate limit global)).
9. **Liste des builds tronquée** — `builds.ts:296` : `LIMIT 100`, sans pagination. Mineur.
10. **Brand : deux sources pour `supportUrl`** — `buildBrandSpec` (`brand.ts:273`) lit `support_url` puis `apps.brand` ; `brandReadiness` (`admin.ts:619-636`) lit `brand.supportUrl` puis `support_url`. Ordre inversé d'une route à l'autre : risque de divergence entre la console et la CI.

## 7. Dépendances hors tranche

- `services/payments.ts:160-175` (révision) et `:190` (`MAX_COMMISSION_BPS`), `:311-312` (contrôle de révision à la commande).
- `seed.ts:68` (seul INSERT d'app hors tests) : à conserver pour l'owner, à doubler par une route.
- `lib/auth.ts:22` (`PlatformRole`), `:198` (`requireAdmin`), `:251-262` (`scopedCommunity`).
- `admin.ts:1074` (`POST /admins`, mot de passe fourni par l'owner, pas de flag de changement) : point 1.
- `routes/account.ts:35` (source des octets consommés) : pour le quota.
- `config.ts:86-95` (variables `GITHUB_*`, `MOCK_BUILDS`, `BUILD_CALLBACK_SECRET`) : vérifier la prod.
- `.github/workflows/android-brand.yml` : `workflow_dispatch` (entrées `spec`, `build_callback_url`, lignes 14-20), dépôt R2 (~192-206). Appel effectif du callback en fin de job **non vérifié** (ma lecture ciblée ne l'a pas trouvé).
- `apps/api/tools/inject-brand.mjs` : non lu (hors tranche). `brand.ts` s'y réfère (exit 78).
- `http/contracts.ts:605-626` (builds), `:688-714` (communities), `:724-741` (apps/plans) : contrats OpenAPI à mettre à jour.
- Garde-fou `app.ts:210` pour `/v1/internal` : non lu.

## 8. Non vérifié

- Que `admin_users.community_id` (`schema.ts:113`) soit encore lu par une route (non vérifié, hors tranche).
- Le rate limit global de l'API (je n'ai pas lu les plugins Fastify).
- Le coût réel du Go, des nuits et la formule de marge : aucune source dans le dépôt (la décision owner n'est pas écrite ici).
- L'appel du callback en fin de workflow `android-brand.yml` (lecture ciblée seulement).
- Le contenu de `apps/api/tools/brands/` (dossier absent à ce chemin : pas trouvé à `apps/api/tools/brands`).
- La durée de vie des builds `queued` en prod (pas de job de purge vu dans la tranche).

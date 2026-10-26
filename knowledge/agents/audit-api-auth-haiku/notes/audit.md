# Audit — authentification admin et rôles (API)

Tranche lue en lecture seule : `apps/api/src/routes/admin.ts` 1-722 et 1074-1121, `routes/adminAuth.ts`, `lib/auth.ts`, `lib/attempts.ts`, tables `admin_users` / `community_memberships` / `audit_log` de `schema.ts`. Date : 2026-10-26.

## 1. Verdict

Le socle est sain : le rôle et les appartenances sont relus en base à chaque requête (`lib/auth.ts:198-232`), le périmètre vient du chemin, la matrice de capacités est explicite (`routes/admin.ts:257-339`), et le login ne révèle pas quels courriels existent (`routes/adminAuth.ts:82-84`). En revanche, rien du plan n'existe côté admin : pas de `must_change_password`, pas de session admin révocable (le JWT vit 8 h sans `sid`), pas de routes `/me/password`, `/me/sessions`, `PATCH /me`, pas de logout admin, pas de téléphone sur `admin_users`, et `platform_role` est un texte unique (`owner` ou `none`) qui ne peut pas porter `reseau` en cumul. Le login n'accepte que l'email (`adminAuth.ts:26`). Le contrat OpenAPI de `/me` ne correspond pas à la réponse réelle (`http/contracts.ts:685` vs `admin.ts:713`).

## 2. Inventaire

| Fichier (lignes) | Rôle | Taille approx. | État |
|---|---|---|---|
| `routes/admin.ts:1-44` | En-tête, invariants (périmètre session, rôle relu en base, audit, transitions conditionnelles) | 45 lignes | solide |
| `routes/admin.ts:45-183` | Helpers `parseBody` (`:49`), schémas zod : `communityCreateSchema` (`:70`), `membershipCreateSchema` (`:92`, enum rôles `:94`), `adminCreateSchema` (`:105-112`, `platformRole` enum `none|owner` `:110`, mot de passe min 12 `:109`) | 140 lignes | solide, mais `adminCreateSchema` sans téléphone ni rôles multiples |
| `routes/admin.ts:235-339` | `Capability` (`:237-255`), `permitted()` (`:281-339`), matrice documentée (`:257-280`) | 105 lignes | solide ; court-circuit `owner` en `:282` |
| `routes/admin.ts:341-352` | `authorize()` (`:341`), `seesMoney()` (`:348`) | 12 lignes | solide |
| `routes/admin.ts:445-471` | `appendAudit()` : une ligne `audit_log` par action, `before_state`/`after_state` | 27 lignes | solide |
| `routes/admin.ts:652-660` | `adminDirectoryDto()` : `platformRole` réduit à `owner|none` (`:657`) | 9 lignes | à refaire pour les rôles cumulables |
| `routes/admin.ts:707-719` | `GET /v1/admin/me` | 13 lignes | partiel (voir §4 point 5) |
| `routes/admin.ts:1074-1101` | `POST /v1/admin/admins` : crée un compte avec mot de passe choisi, `active=true` (`:1085-1087`), rôle legacy mis en miroir (`:1087`) | 28 lignes | partiel : pas de téléphone, pas de `must_change` |
| `routes/admin.ts:1109-1118` | `GET /v1/admin/admins` (annuaire, owner `:1113`), `LIMIT 500` | 10 lignes | solide |
| `routes/adminAuth.ts:24-29` | `LoginBody` : `email` seul, `.email()` (`:26`) | 6 lignes | bloque WhatsApp |
| `routes/adminAuth.ts:31-67` | Limiteur en mémoire, fenêtre 15 min (`:31`), 20 par IP (`:32`), 8 par compte (`:33`) | 37 lignes | partiel (voir §6) |
| `routes/adminAuth.ts:72-141` | `POST /v1/admin/auth/login` : vérif. mot de passe (`:82`), `active` (`:85`), jeton (`:90-94`), audit du succès seulement (`:117-122`) | 70 lignes | solide mais sans session ni audit d'échec |
| `lib/auth.ts:22-25` | `PlatformRole = "none" | "owner"`, `StaffRole` | 4 lignes | à élargir |
| `lib/auth.ts:42-48` | `AdminContext` (`platformRole` scalaire, `memberships`, `admin: Row`) | 7 lignes | à élargir ; `admin` expose `password_hash` (`:47`) |
| `lib/auth.ts:87-106` | `issueAdminToken()` : TTL 8 h codé en dur (`:92`), claims `role`, `cid`, `typ` ; **pas de `sid`** | 20 lignes | partiel |
| `lib/auth.ts:198-232` | `requireAdmin()` : jeton vérifié (`:203`), `typ` (`:208`), compte actif relu (`:209`), appartenances (`:212-222`), rôle plateforme (`:224`) | 35 lignes | solide mais aucun contrôle de session ni de `must_change` |
| `lib/auth.ts:235-263` | `roleInCommunity()`, `scopedCommunity()` (owner non borné `:252`, 403 hors périmètre `:261`) | 29 lignes | solide |
| `lib/attempts.ts:47-107` | `AttemptCounter`, fenêtre fixe, en mémoire | 61 lignes | utilisé par la connexion mobile seulement (`routes/auth.ts:390`), **pas** par l'admin |
| `schema.ts:111-121` | `admin_users` : id, email UNIQUE, password_hash, name, role (legacy), platform_role, active | 11 lignes | partiel : aucun téléphone, aucun `must_change`, aucun session |
| `schema.ts:390-393` | Migration legacy `role`→`platform_role` (idempotente) | 4 lignes | solide |
| `schema.ts:397-407` | `community_memberships` (UNIQUE admin+communauté, `status` défaut `active`) | 11 lignes | solide ; `role` sans CHECK SQL (filtré en `lib/auth.ts:220-221`) |
| `schema.ts:85-95`, `442-446` | `auth_sessions` : **mobile seulement** (FK `users`/`devices`) | — | n'existe pas pour l'admin |
| `schema.ts:366-374`, `425-434`, `460-463` | `audit_log` + règles anti UPDATE/DELETE | 30 lignes | solide |
| `app.ts:177-199` | Garde `X-Access-Key` sur tout `/v1/admin*` (préHandler) | 23 lignes | solide (vide = non vérifié en dev) |

## 3. Ce qui sert le plan

- Relecture du rôle en base à chaque requête : `lib/auth.ts:209-224`, déjà le bon mécanisme pour un changement de rôle ou une désactivation immédiate. À garder.
- Matrice par capacité `permitted(admin, capability, communityId)` (`routes/admin.ts:281-339`) : le bon point d'extension pour `reseau` (une branche de plus, voir §5).
- Périmètre session, 403 hors périmètre : `lib/auth.ts:251-263`, `routes/admin.ts:1124`.
- Réponse de login uniforme pour compte inconnu et mot de passe faux : `routes/adminAuth.ts:80-84`. À reprendre pour l'identifiant email ou téléphone.
- Hachage scrypt NFKC : `lib/crypto.ts:59-62` ; vérification `:65`. Réutilisable tel quel pour `POST /me/password`.
- Conventions de migration : `schema.ts:379-385` (ADD COLUMN IF NOT EXISTS, rejeu à chaque démarrage) et le miroir legacy `role`↔`platform_role` (`schema.ts:107-110`, `390-393`). À suivre pour `must_change_password` et `admin_platform_roles`.
- Normalisation téléphone déjà présente pour les paiements : `routes/admin.ts:1447-1448` (`/[\s.-]/g` puis `^\+?[0-9]{8,15}$`). À réutiliser pour le login WhatsApp.
- Unicité traduite en 409 : `routes/admin.ts:758`, `:1097` (`isUniqueViolation`). À reprendre pour email/téléphone déjà pris.
- Audit des actions : `routes/admin.ts:445-471`.

## 4. Écarts avec le plan

**Point 1 — mot de passe forcé, sessions, connexion email ou WhatsApp, « Mon compte »**

- 1a. Pas de `must_change_password`. `schema.ts:111-121` ne le contient pas ; aucune route ne le lit. Il faut une colonne ; la valeur par défaut doit être `true` pour couvrir les comptes déjà en prod (voir §5, migration).
- 1b. Pas de refus des autres routes tant que le drapeau est vrai. `requireAdmin` (`lib/auth.ts:198-232`) est appelé dans 35 endroits (`lib/auth.ts`, `routes/admin.ts`, `routes/builds.ts`, `routes/offline.ts`, non vérifié hors tranche pour les deux derniers). Il faut une garde centrale, pas une par route.
- 1c. Pas de révocation des autres sessions. Le JWT admin (`lib/auth.ts:87-106`) n'a ni `sid` ni version ; `requireAdmin` ne vérifie que `active` (`:209`). Un jeton volé reste valide 8 h, même après changement de mot de passe. Il n'existe **aucune** table de session admin : `auth_sessions` (`schema.ts:85-95`) est liée à `users` et `devices`.
- 1d. Routes absentes (vérifié : aucune occurrence de `me/password`, `me/sessions`, `PATCH .../me`, `auth/logout` côté admin dans `routes/admin.ts` et `routes/adminAuth.ts`). Il n'y a même pas de déconnexion admin.
- 1e. Login email seulement : `routes/adminAuth.ts:26` (`.email()`) et `:79` (`WHERE email = $1`). Aucune colonne téléphone sur `admin_users` (`schema.ts:111-121`). `adminCreateSchema` (`routes/admin.ts:105-112`) n'accepte pas de téléphone.
- 1f. Connexion par email ou WhatsApp : aujourd'hui un identifiant non-email est refusé en 400 par zod. Le compteur par compte est indexé sur l'email saisi (`routes/adminAuth.ts:76`).
- 1g. « Mon compte » : profil (`name`, `email`) non modifiable (pas de `PATCH`), pas de liste de sessions, pas de changement de mot de passe. Le thème est hors API (non vérifié).

**Point 2 — invitation de l'admin par l'owner (mot de passe temporaire sur WhatsApp)**

- 2a. `POST /v1/admin/admins` (`routes/admin.ts:1074-1101`) crée le compte avec le mot de passe fourni (`:1087`, `hashPassword`), `active=true`, sans drapeau de changement et sans téléphone. Il ne doit pas exposer le mot de passe dans la réponse, et il ne le fait pas (`:1100`). Correct, mais incomplet pour le plan.
- 2b. Pas d'envoi WhatsApp ni de notion d'invitation en attente : rien à faire côté API pour l'envoi (hors tranche, non vérifié : l'envoi serait un service à part), mais il manque le champ téléphone obligatoire pour l'invitation.
- 2c. Onboarding (6 étapes, validation owner) : hors tranche pour les tables communauté et application, mais l'état d'étape doit être lisible dans `GET /me` (voir point 3).

**Point 3 — guide par rôle, avancement côté serveur**

- 3a. Aucun champ d'avancement ni d'étape sur `admin_users` (`schema.ts:111-121`). `GET /me` (`routes/admin.ts:710-719`) ne renvoie aucune information d'onboarding.

**Rôles réseau cumulables (transverse)**

- R1. `platform_role` est un texte unique à deux valeurs : `schema.ts:118` (`DEFAULT 'none'`, aucun CHECK), `adminCreateSchema` enum `none|owner` (`routes/admin.ts:110`), `PlatformRole = "none" | "owner"` (`lib/auth.ts:22`). Un compte ne peut pas être `owner` ET `reseau`.
- R2. Le court-circuit `if (admin.platformRole === "owner") return true;` (`routes/admin.ts:282`) et `scopedCommunity` (`lib/auth.ts:252`), `seesMoney` (`routes/admin.ts:349`), `GET /communities` (`routes/admin.ts:726`) supposent que tout `owner` est sans restriction. Ajouter `reseau` à un scalaire casserait cette hypothèse : `reseau` ne doit **pas** hériter de la liberté de l'owner.
- R3. `endpoint.write` est refusé à tout le monde sauf owner (`routes/admin.ts:328-330`) : `reseau` devra l'obtenir, ce qui est un changement de matrice à valider.

**Point 5 du plan — ce que `/me` renvoie et doit renvoyer** (voir §1 et §5)

- 5a. Renvoie aujourd'hui : `adminId`, `email`, `name`, `platformRole`, `memberships[{communityId, role}]` (`routes/admin.ts:712-718`).
- 5b. Contrat OpenAPI incohérent : `http/contracts.ts:685` déclare `id` et non `adminId`, et `platformRole` string seulement. Le client généré lira `id` = absent.
- 5c. Manque : `mustChangePassword`, `onboarding` (étape courante, terminé), `platformRoles` (tableau), `phone`, `theme` (non vérifié : hors API).
- 5d. La réponse de connexion (`routes/adminAuth.ts:124-139`) ne porte pas non plus `mustChangePassword`, ce qui oblige le client à appeler `/me` juste après le login.

## 5. Structure de code proposée

**Migrations** (à ajouter à la fin de `schema.ts`, après `:446`, idempotentes) :

```sql
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS onboarding_step text;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS onboarding_done_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_phone_idx ON admin_users(phone) WHERE phone IS NOT NULL;

CREATE TABLE IF NOT EXISTS admin_sessions (
  id           text PRIMARY KEY,
  admin_user_id text NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  ip           text,
  user_agent   text
);
CREATE INDEX IF NOT EXISTS admin_sessions_user_idx ON admin_sessions(admin_user_id);

CREATE TABLE IF NOT EXISTS admin_platform_roles (
  admin_user_id text NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('owner', 'reseau')),
  granted_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (admin_user_id, role)
);
INSERT INTO admin_platform_roles (admin_user_id, role)
SELECT id, 'owner' FROM admin_users WHERE platform_role = 'owner'
ON CONFLICT DO NOTHING;
```

Point d'attention : `DEFAULT true` sur `must_change_password` ne touche que les lignes existantes au premier passage. Le rejeu au démarrage (`schema.ts:379-385`) ne réécrit pas la valeur, donc aucune `UPDATE` ponctuelle n'est nécessaire et aucune n'est sûre (elle se répéterait à chaque boot). `POST /admins` doit écrire `must_change_password = true` explicitement.

Le compte `owner` lui-même passe par le changement de mot de passe au premier login : c'est voulu par le plan (« y compris ceux déjà en prod »).

**`lib/auth.ts`**

- `PlatformRole = "owner" | "reseau"` ; `AdminContext` devient `{ adminId; platformRoles: ReadonlySet<PlatformRole>; memberships; admin; sessionId: string }`, avec `hasPlatformRole(ctx, r)`.
- `issueAdminToken(input: { adminId: string; sessionId: string }): Promise<{ token: string; expiresAt: Date }>` : ajoute `sid`, TTL lu depuis `env` (remplace `:92`, défaut 8 h).
- `requireAdmin(db, req, opts?: { allowPasswordChange?: boolean })` : après `:209`, lit `admin_sessions WHERE id=$sid AND admin_user_id=$sub AND revoked_at IS NULL AND expires_at > now()` ; refuse si absent (401 `UNAUTHENTICATED`, message « Session révoquée. ») ; si `admin.must_change_password` et non `allowPasswordChange`, lève `new ApiFailure(403, "PASSWORD_CHANGE_REQUIRED", "Changez votre mot de passe.")`. Ce code doit être ajouté à `API_ERROR_CODES` (`packages/contract/src/index.ts`, dist aussi) : hors tranche, à confirmer.
- Option pour ne pas toucher les 35 appels : garde dans `app.ts:177` (préHandler) qui lit le jeton et la liste blanche `/v1/admin/me`, `/v1/admin/me/password`, `/v1/admin/me/sessions*`, `/v1/admin/auth/logout`.
- `revokeOtherSessions(q, adminId, keepSessionId)` : `UPDATE admin_sessions SET revoked_at = now() WHERE admin_user_id = $1 AND id <> $2 AND revoked_at IS NULL RETURNING id`.
- `permitted()` (`routes/admin.ts:281`) : remplacer le `if (owner)` par `if (has("owner")) return true;` et ajouter avant le `switch`, pour `reseau` seul : `endpoint.read`, `endpoint.write`, `offline_bundle.issue` (à valider), et `return false` pour tout le reste. Aucune capacité argent, aucune communauté.

**`routes/adminAuth.ts`**

- `LoginBody` : `identifier: z.string().trim().min(3).max(190)` à la place de `email` ; garder `email` en alias transitoire (non vérifié : le dashboard actuel envoie-t-il `email`).
- Normalisation : si `identifier.includes("@")` → `toLowerCase()` et `z.string().email()` ; sinon → `replace(/[\s.-]/g, "")` puis `^\+?[0-9]{8,15}$` (même règle que `routes/admin.ts:1447-1448`). Question ouverte : un numéro à 9 chiffres sans indicatif doit-il recevoir `+237` ? (non vérifié : pas d'indicatif par défaut dans le dépôt).
- Requête : `SELECT * FROM admin_users WHERE email = $1 OR phone = $1` (les deux formats sont disjoints).
- Clé de compte : `account:${normalized}`.
- Création de session : `INSERT INTO admin_sessions (id, admin_user_id, expires_at, ip, user_agent)` puis `issueAdminToken({ adminId, sessionId })`.
- Réponse : ajouter `mustChangePassword`, `onboardingStep`, `platformRoles` dans `admin`.
- Audit d'échec : `appendAudit` avec `action: "admin.login_failed"` (sans `communityId`), sans révéler si le compte existe dans le message.
- Nouveau : `POST /v1/admin/auth/logout` (révoque la session courante).

**`routes/admin.ts`** (nouvelles routes, regroupées sous « moi », après `:719`)

- `GET /v1/admin/me` : `{ id, email, name, phone, platformRoles, memberships, mustChangePassword, onboarding: { step, doneAt } }`. Corriger `contracts.ts:685` pour `id`.
- `PATCH /v1/admin/me` : schéma `{ name?, phone?, email? }` strict, refine « au moins un champ » (même patron que `:97-103`) ; unicité → 409 (patron `:758`).
- `POST /v1/admin/me/password` : `{ currentPassword, newPassword (min 12), confirmPassword }` strict ; `verifyPassword(current, hash)` (`lib/crypto.ts:65`) ; refuser `newPassword === currentPassword` ; transaction : `UPDATE admin_users SET password_hash = $2, must_change_password = false WHERE id = $1`, `revokeOtherSessions`, `appendAudit("admin.password_change")`. Ce chemin doit partager le limiteur de `adminAuth.ts:31-67` (sinon un jeton volé devine le mot de passe actuel sans limite).
- `GET /v1/admin/me/sessions` : liste `{ id, createdAt, lastSeenAt, ip, userAgent, current: boolean }` (jamais de jeton).
- `DELETE /v1/admin/me/sessions/:sessionId` et `DELETE /v1/admin/me/sessions` (toutes sauf la courante).
- `POST /v1/admin/me/onboarding` (ou `PATCH /v1/admin/me/onboarding`) : enregistre l'étape courante, la validation des étapes reste hors tranche.
- `POST /v1/admin/admins` (`:1074-1101`) : `phone` requis à l'invitation (WhatsApp), `must_change_password: true` explicite, `platformRoles` tableau d'enum `owner|reseau`. Réponse inchangée (pas de mot de passe).
- `GET /v1/admin/admins` (`:1109-1118`) : `SELECT ... platform_role, phone` puis agrégation de `admin_platform_roles` ; remplacer `adminDirectoryDto` (`:652-660`) par `platformRoles: string[]`.

**`lib/attempts.ts`** : réutiliser `AttemptCounter` (`:47-107`) pour le login admin au lieu de `newLimiter` (`routes/adminAuth.ts:35-67`) : même comportement, une seule implémentation.

**Fichiers à créer** : aucun obligatoire. Optionnel : `apps/api/src/lib/adminSessions.ts` (création, révocation, liste) pour garder `auth.ts` lisible.

**Fichiers à modifier** : `schema.ts`, `lib/auth.ts`, `routes/adminAuth.ts`, `routes/admin.ts`, `http/contracts.ts` (`:668-686`, nouvelles routes), `packages/contract/src/index.ts` (code `PASSWORD_CHANGE_REQUIRED`).

## 6. Bugs et risques

1. **Un tiers peut verrouiller le propriétaire.** `routes/adminAuth.ts:14-17` affirme qu'un compteur par compte seul « laisserait verrouiller le propriétaire depuis un réseau tiers ». Or `:77` applique le compteur par compte sans restriction d'IP : 8 mots de passe faux depuis n'importe où bloquent `owner@…` pendant 15 min (`:33`, `:54-60`). Le commentaire décrit une protection que le code n'assure pas.
2. **Pas de trace des échecs.** `routes/adminAuth.ts:82-83` lève `invalidCredentials` sans `appendAudit`. Seul le succès est journalisé (`:117-122`). Une attaque par mot de passe est invisible dans `audit_log`.
3. **Un jeton survit à tout.** `lib/auth.ts:92` (8 h) et `:209` (contrôle du seul `active`) : changer le mot de passe, retirer un rôle ou ouvrir une session ailleurs ne coupe pas les jetons déjà émis (le rôle, lui, est bien relu). Scénario : un poste partagé reste connecté 8 h après « déconnexion » car il n'existe pas de logout admin.
4. **Limiteur IP derrière proxy.** `app.ts:52` `trustProxy: true` fait prendre à `req.ip` le premier saut de `X-Forwarded-For`. Si le frontal ne réécrit pas cet en-tête, un client change d'IP à chaque essai (non vérifié : dépend du frontal de production). À l'inverse, si le BFF Next.js appelle l'API depuis un serveur unique, les 20 essais par IP (`:32`) sont partagés par tous les admins (non vérifié : topologie de déploiement).
5. **Limiteur en mémoire, par instance.** `adminAuth.ts:31-67` : le plafond est N × 8 par compte sur N instances et repart à zéro au redémarrage. Déjà assumé dans le commentaire `:19-21`, mais à rappeler pour le libre-service (un admin invité peut être bloqué par un redéploiement).
6. **Contrat et réponse divergents.** `http/contracts.ts:685` déclare `id` ; `routes/admin.ts:713` renvoie `adminId`. Toute génération de client depuis `openapi.json` lit un champ absent.
7. **Mot de passe haché exposé dans le contexte.** `lib/auth.ts:47` et `:230` placent la ligne complète `admin` (dont `password_hash`) dans `AdminContext`. Aujourd'hui rien ne la sérialise, mais une future `res.send(ctx.admin)` fuirait le hachage. Risque faible.
8. **Claim `role` mort.** `lib/auth.ts:93-96` et `routes/adminAuth.ts:92` écrivent `role: platform|partner` dans le jeton ; `requireAdmin` ne le lit jamais (`lib/auth.ts:198-232`). Ne pas s'y fier lors de la migration vers des rôles multiples : le claim doit disparaître ou être remplacé par `sid`.
9. **Mot de passe initial faible en pratique.** `routes/admin.ts:109` impose 12 caractères, mais le mot de passe temporaire est choisi par l'owner et transmis hors bande. Sans `must_change_password` (§5), il reste valable indéfiniment (`routes/adminAuth.ts:82`).
10. **Rôle `reseau` dangereux si mal branché.** Si `reseau` est ajouté au scalaire `platform_role` sans toucher `routes/admin.ts:282` ni `lib/auth.ts:252`, il hérite de la liberté de l'owner (argent, communautés, `POST /admins`).
11. **Pas de CHECK sur `platform_role` ni sur `community_memberships.role`/`status`.** `schema.ts:118` et `:401-402` acceptent n'importe quel texte ; seul le filtre `lib/auth.ts:220-221` protège. Une écriture SQL directe peut créer un rôle inconnu qui ne donne rien (sûr), mais ne sera pas visible.
12. **Liste d'annuaire sans pagination réelle.** `routes/admin.ts:1115` `LIMIT 500` sans curseur : au-delà, les admins récents disparaissent silencieusement.

## 7. Dépendances hors tranche

- `routes/builds.ts` et `routes/offline.ts` appellent aussi `requireAdmin` (vérifié par grep) : leur comportement change si la garde `must_change` est placée dans `requireAdmin`. Choisir l'option « préHandler dans `app.ts:177` » évite de toucher ces fichiers.
- `app.ts:177-199` : garde `X-Access-Key` ; à vérifier si la liste blanche `must_change` doit s'y greffer.
- `packages/contract/src/index.ts` (et `dist/index.d.ts`) : liste `API_ERROR_CODES` ; ajouter `PASSWORD_CHANGE_REQUIRED`.
- `http/contracts.ts` et `openapi.ts` : génération de la référence API (routes `/me`, `/auth/login`, nouvelles routes).
- Table `apps` / `communities` pour l'étape « application » et « communauté » de l'onboarding (non vérifié : schéma `apps` lu partiellement, `schema.ts:17-27`).
- Le dashboard Next.js (BFF) : quel champ envoie-t-il au login (`email` ou `identifier`), et s'il conserve un jeton côté serveur (non vérifié : dépôt `apps/` non lu hors API).
- Envoi du mot de passe temporaire par WhatsApp : service externe, non trouvé dans l'API (non vérifié).

## 8. Non vérifié

- Comportement réel de `X-Forwarded-For` en production (frontal, Cloud Run, Vercel) : impact sur le limiteur IP (§6.4).
- Présence ou absence d'un `X-Access-Key` en production : `config.ts` le rend obligatoire, mais le déploiement réel n'a pas été lu.
- Valeur de `ACCESS_TOKEN_TTL` côté admin : non lue, le TTL admin est codé en dur à 8 h (`lib/auth.ts:92`).
- Existence d'un téléphone dans les données actuelles des admins : aucune colonne, donc aucune donnée.
- Le suffixe pays à appliquer aux numéros à 9 chiffres : décision produit, pas dans le dépôt.
- Tests de `permitted()` et de `scopedCommunity` : non lus (`apps/api/test` hors tranche).
- Compatibilité du `DEFAULT true` de `must_change_password` avec les tests d'intégration : non exécuté (lecture seule, aucune commande de test lancée).

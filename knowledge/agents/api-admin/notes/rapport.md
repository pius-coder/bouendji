# api-admin — rapport

Statut : **terminé, vérifié par exécution**.
Fichiers écrits : `apps/api/src/routes/admin.ts`, `apps/api/test/admin.test.ts`,
`apps/api/src/schema.ts` (ajouts seulement), `apps/api/src/lib/auth.ts`
(`AdminContext` + `requireAdmin` + `scopedCommunity`).

## Verdict

L'administration est en place : rôles globaux/locaux réellement relus en base à
chaque requête, périmètre communautaire qui vient du chemin ou de l'appartenance
(jamais du corps), audit append-only d'une ligne par action, et pool qui ne peut
pas servir à ouvrir un tunnel.

Deux points méritent une décision de l'orchestrateur (§ « Décisions à valider ») :
`finance` lit les commandes de **toutes** les communautés (application littérale
de la table `roles-and-commissions`), et `support` ne voit pas les montants.

## 1. Schéma ajouté (`apps/api/src/schema.ts`)

Tout est additif : `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
`CREATE INDEX IF NOT EXISTS`. Aucun `DROP`, aucun `RENAME`, aucune contrainte
destructrice — le fichier est rejoué à chaque démarrage (`db.ts`).

```sql
-- admin_users : identité globale
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS platform_role text NOT NULL DEFAULT 'none';
UPDATE admin_users SET platform_role = 'owner'
 WHERE platform_role = 'none' AND role = 'platform';   -- platform -> owner, partner -> none

CREATE TABLE IF NOT EXISTS community_memberships (
  id            text PRIMARY KEY,
  admin_user_id text NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  community_id  text NOT NULL REFERENCES communities(id),
  role          text NOT NULL,                  -- community_admin | support | finance
  status        text NOT NULL DEFAULT 'active', -- active | disabled
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (admin_user_id, community_id)
);

CREATE TABLE IF NOT EXISTS offline_bundles (
  id          text PRIMARY KEY,
  device_id   text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by  text,
  not_after   timestamptz NOT NULL,
  consumed_at timestamptz,        -- usage unique : posé une fois par le consommateur
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- audit_log : colonnes manquantes pour la piste complète
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_role   text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS target_type  text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS target_id    text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS community_id text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS ip           text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_agent   text;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS before_state jsonb;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS after_state  jsonb;

-- append-only au niveau PostgreSQL
CREATE OR REPLACE RULE audit_log_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE OR REPLACE RULE audit_log_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;
```

Trois écarts assumés par rapport au nœud `schema` :

1. **`before` / `after` → `before_state` / `after_state`** : `BEFORE` est un
   mot-clé SQL, un nom de colonne non quoté est un piège à requêtes. Le contenu
   est identique (jsonb).
2. **Pas de `token_version` sur `admin_users`.** Il est inutile ici : `active` est
   relu à **chaque** requête par `requireAdmin` (`SELECT ... WHERE id = $1 AND
   active = true`), donc une désactivation coupe l'accès au prochain appel, sans
   attendre les 8 h du jeton. Même raison pour les appartenances : la liste des
   `memberships` actifs est relue à chaque requête, un retrait est immédiat.
   Testé (`désactiver un compte coupe l'accès au prochain appel, pas dans 8 h`).
3. **`offline_bundles` sans `community_id`** : la mission fixait les colonnes ; la
   communauté se déduit de `user_id`. Le chemin existe quand même
   (`api-bundle` le consommera via `users.community_id`).

### Migration vérifiée (exécution réelle, pas relecture)

Script jetable sur PGlite (`SCHEMA_SQL` exécuté trois fois) :

```
colonne absente au depart ? none
apres 1er replay (role=platform) : owner
apres retrogradation puis replay : none
regles audit_log : audit_log_no_delete, audit_log_no_update
```

C'est la preuve que le rejeu au démarrage est sûr : il promeut une fois les
anciens comptes `platform`, et **ne re-promeut pas** un compte rétrogradé via
l'API. La colonne héritée `role` reste en place et est maintenue en miroir
(`owner` → `'platform'`, `none` → `'partner'`) par `POST /v1/admin/admins`, sinon
le `UPDATE` de migration annulerait une rétrogradation à chaque redémarrage.
Elle n'est **plus lue** par le code.

## 2. `lib/auth.ts` — ce qui a changé, et pourquoi

```ts
export interface AdminContext {
  adminId: string;                 // exigé par la mission
  platformRole: "none" | "owner";  // exigé
  memberships: AdminMembership[];  // exigé : { id, communityId, role } actifs seulement
  admin: Row;                      // conservé (email, nom pour /me)
}
```

- `requireAdmin` renvoie exactement `{ adminId, platformRole, memberships[] }`
  (+ `admin` pour l'affichage). Le jeton **n'est pas** source de droits : seuls
  `sub` et `typ` sont lus, puis la base tranche. Un `role` inconnu en base est
  filtré par liste blanche (`STAFF_ROLES`), il ne donne rien.
- `scopedCommunity` est conservé et réécrit : owner → communauté demandée (ou
  `null`) ; sinon la communauté demandée doit être dans les appartenances, et
  une communauté étrangère est **403** (avant : `notFound()` sur `admin.role`).
  Vérifié : aucun autre appelant dans `apps/api` (recherche
  `requireAdmin|scopedCommunity|AdminContext` → seulement `admin.ts`).
- `issueAdminToken` **inchangé** (format du jeton, claim `role` hérité conservé,
  expiration 8 h). Le test le signe avec `role: "platform"|"partner"` pour
  prouver que ces claims ne sont pas crus.
- Ajouts : `PlatformRole`, `StaffRole`, `STAFF_ROLES`, `AdminMembership`,
  `roleInCommunity(admin, communityId)`.

## 3. Matrice de permissions **réellement appliquée**

Fonction `permitted()` dans `routes/admin.ts`, source unique (aucun `if (role)`
dispersé dans les handlers).

| Capacité | owner | community_admin | support | finance |
|---|---|---|---|---|
| `community.manage` (créer, modifier, suspendre) | ✅ | ❌ 403 | ❌ 403 | ❌ 403 |
| `community.read` | ✅ toutes | ✅ la sienne | ✅ la sienne | ✅ la sienne |
| `membership.read` (personnel) | ✅ | ✅ la sienne | ❌ | ❌ |
| `membership.write` (ajouter/rôle/retirer) | ✅ | ✅ la sienne, jamais soi-même, jamais le dernier admin | ❌ | ❌ |
| `member.read` (abonnés + appareils) | ✅ | ✅ la sienne | ✅ la sienne (lecture) | ❌ |
| `order.read` | ✅ | ✅ la sienne | ✅ la sienne | ✅ **toutes** |
| `commission.read` | ✅ | ✅ la sienne | ❌ | ✅ **toutes** |
| `payout.create` | ✅ | ❌ | ❌ | ✅ la sienne |
| `payout.approve` | ✅ | ❌ | ❌ | ❌ |
| `endpoint.read` (pool) | ✅ | ✅ | ✅ | ❌ |
| `device.revoke` | ✅ | ✅ la sienne | ✅ la sienne | ❌ |
| `offline_bundle.issue` | ✅ | ✅ la sienne | ✅ la sienne | ❌ |
| `audit.read` | ✅ toutes | ✅ la sienne | ❌ | ❌ |

Garde-fous supplémentaires, testés ou actifs :

- un non-owner ne peut pas modifier **sa propre** appartenance
  (`Vous ne pouvez pas modifier votre propre appartenance.`) ;
- impossible de retirer le **dernier** `community_admin` actif d'une communauté
  (`409`, cause du premier échec de test corrigé plus bas) ;
- les montants (`amountXaf`, `commissionBps`, `commissionXaf`) sont **omis** de la
  réponse `/orders` pour `support` (seuls owner, community_admin, finance les
  voient) ;
- l'autorisation est évaluée **avant** la validation du corps : un rôle non
  autorisé n'obtient pas de retour sur la forme du payload.

## 4. Routes

Toutes sous `/v1/admin`, bearer admin (`requireAdmin`).

| Méthode | Chemin | Rôles |
|---|---|---|
| GET | `/me` | tout admin actif |
| GET | `/communities` | owner (toutes) / staff (les siennes) |
| POST | `/communities` | owner |
| GET | `/communities/:communityId` | owner / staff de la communauté |
| PATCH | `/communities/:communityId` | owner (`name`, `commissionBps`, `status`) |
| GET | `/communities/:communityId/memberships` | owner / community_admin |
| POST | `/communities/:communityId/memberships` | owner / community_admin |
| PATCH | `/memberships/:membershipId` | owner / community_admin |
| DELETE | `/memberships/:membershipId` | owner / community_admin (soft delete) |
| POST | `/admins` | owner (provisionnement d'un compte) |
| GET | `/communities/:communityId/users` | owner / community_admin / support |
| GET | `/communities/:communityId/devices` | owner / community_admin / support |
| POST | `/devices/:deviceId/revoke` | owner / community_admin / support |
| POST | `/devices/:deviceId/offline-bundles` | owner / community_admin / support |
| GET | `/communities/:communityId/orders` | owner / community_admin / support / finance |
| GET | `/communities/:communityId/commissions` | owner / community_admin / finance |
| POST | `/communities/:communityId/payouts` | owner / finance |
| POST | `/payouts/:payoutId/approve` | owner |
| GET | `/pool` | owner / community_admin / support |
| GET | `/audit-log` | owner / community_admin |

Décisions de conception utiles à relire :

- **`community_id` jamais dans le corps.** Les corps sont filtrés par zod : un
  `communityId` / `community_id` envoyé dans le corps est **jeté**, le chemin
  fait foi. Seul `/audit-log` accepte le sélecteur en query, et il est confronté
  aux appartenances (403 sinon). Le corps de `POST .../memberships` est
  volontairement non strict *pour cette raison* : il absorbe et ignore le champ
  au lieu de le promouvoir ou de renvoyer une erreur qui ferait croire qu'il sert.
- **Pool global.** `endpoints` n'a pas de `community_id` : la route ne filtre pas
  par communauté, elle exige seulement `endpoint.read`. Le DTO ne contient que
  `endpointId, label, host, port, protocol, transport, security, region,
  capacity, inUse, status, health, latencyMs, lastSeenAt, expiresAt` — jamais
  `uuid`, `ws_path`, `credential`, `deployment_key`.
- **Argent calculé.** `POST .../payouts` n'accepte **que** `note`. Le montant est
  `SUM(amount_xaf)` des commissions `pending`, non attachées, `available_at <=
  now()`, marquées `payout_id` dans la même transaction ; si le `UPDATE ...
  RETURNING` ne ramène pas exactement le compte attendu, la transaction est
  annulée (`409`) plutôt que de payer deux fois. Approbation ≠ paiement :
  `status='approved'`, `paid_at` reste `null` (le décaissement Fapshi appartient
  à `api-money`).
- **Révocation d'appareil** : `devices.status='revoked'`, `revoked_at`, plus
  révocation de toutes les `auth_sessions` de l'appareil (compte retourné :
  `sessionsRevoked`).
- **Bundle hors-ligne** : `POST /devices/:id/offline-bundles { ttlHours? }`
  (1..72, défaut 24) → `{ bundleId, deviceId, notAfter, createdAt, singleUse }`.
  Aucune configuration, aucun UUID, aucun chemin dans la réponse. Le `not_after`
  est calculé côté serveur (le client ne choisit pas une échéance arbitraire).
  La **consommation** (poser `consumed_at` une seule fois) est hors périmètre :
  elle appartient à `api-bundle` ; la ligne et l'index sont prêts.

## 5. Audit

Une ligne par action, **dans la transaction de la mutation** : si la mutation
échoue, l'audit disparaît avec elle. Actions écrites :
`community.create`, `community.update`, `community.suspend`, `community.resume`,
`admin.create`, `membership.create`, `membership.update`, `membership.disable`,
`device.revoke`, `offline_bundle.issue`, `payout.create`, `payout.approve`.
Les lectures ne sont pas auditées (ce ne sont pas des actions privilégiées).

Colonnes remplies : `actor_id`, `actor_type='admin'`, `actor_role` (rôle
**exercé** : `owner`, ou le rôle local), `action`, `target` (`type:id`, compatibilité
`services/payments.ts`), `target_type`, `target_id`, `community_id`, `ip`,
`user_agent`, `before_state`, `after_state`, `meta`. `audit_log` refuse UPDATE et
DELETE (règles PostgreSQL) — testé en SQL direct : une tentative de falsification
et un `DELETE` ne changent rien.

## 6. Tests — sortie exacte

Commande (depuis `apps/api`, sans `pnpm install`) :

```
node --test --import tsx test/admin.test.ts
```

```
✔ le jeton ne porte pas les droits : ils sont relus en base (140.4551ms)
✔ cross-community : 403, jamais 404 (59.8648ms)
✔ support : lecture et révocation d'appareil, jamais un changement de rôle (54.9333ms)
✔ finance : commandes, commissions, versement — mais aucun membre (51.7116ms)
✔ owner : création, rôle, suspension, révocation, pool, audit (262.4419ms)
✔ une ligne d'audit par action privilégiée, ni plus ni moins (76.4804ms)
✔ un community_id du corps est ignoré : le chemin fait foi (22.4805ms)
✔ le pool ne contient ni UUID, ni chemin WS, ni credential (21.2525ms)
✔ versement : finance prépare, owner approuve, personne d'autre (78.2829ms)
✔ bundle hors-ligne : support de sa communauté, jamais de configuration (41.2233ms)
✔ audit_log est append-only, même en SQL direct (9.205ms)
✔ audit-log : owner voit tout, community_admin sa communauté, support rien (27.6419ms)
✔ support lit les commandes de sa communauté sans les montants (22.3755ms)
✔ désactiver un compte coupe l'accès au prochain appel, pas dans 8 h (5.5713ms)
✔ validation : corps strict, valeurs bornées (30.3422ms)

ℹ tests 15
ℹ suites 0
ℹ pass 15
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 6347.2335
```

Couverture des exigences de la mission :

| Exigence | Test |
|---|---|
| cross-community → 403 | `cross-community : 403, jamais 404` (+ query `audit-log?community_id=`) |
| `support` ne change pas un rôle | `support : ... jamais un changement de rôle` (rôle relu en base après refus) |
| `finance` ne crée pas de membre | `finance : ... mais aucun membre` (compte de lignes avant/après) |
| owner peut tout | `owner : création, rôle, suspension, révocation, pool, audit` |
| une ligne d'audit par action | `une ligne d'audit par action privilégiée, ni plus ni moins` (delta total = 3, delta par action = 1) |
| pool sans UUID / `ws_path` | `le pool ne contient ni UUID, ni chemin WS, ni credential` (clés + absence des valeurs semées + regex UUID) |
| `community_id` du corps ignoré | `un community_id du corps est ignoré : le chemin fait foi` |
| append-only | `audit_log est append-only, même en SQL direct` |

Non-régression : les cinq suites passent ensemble.

```
node --test --import tsx test/admin.test.ts test/ingest.test.ts test/payments.test.ts test/auth.test.ts test/bundle.test.ts
ℹ tests 64
ℹ pass 64
ℹ fail 0
```

`app.ts` a été câblé par l'orchestrateur pendant le travail (`registerAdminRoutes`
y figure) : le test utilise `buildApp` seul, **sans** ré-enregistrer les routes.

## 7. Les deux échecs du premier passage — cause réelle, pas assertion ajustée

1. **`owner : ...` attendait 200, recevait 409.** Le test créait un
   `community_admin` puis le rétrogradait en `finance` : c'était le **dernier**
   `community_admin` de la communauté C, et la garde
   `assertNotLastCommunityAdmin` a refusé (409). La garde est correcte (elle
   empêche de verrouiller une communauté) ; le scénario de test était faux. Il
   crée maintenant un `support` puis le promeut en `finance` — le contrôle de
   changement de rôle est conservé, avec un acteur qui n'est pas le dernier
   administrateur.
2. **`membership.create` attendait 1, recevait 2.** Les compteurs étaient
   absolus alors que le test `owner` (exécuté avant) avait déjà écrit une ligne
   `membership.create`. Le contrôle devient un **delta** (`avant + 1`) par action,
   plus le delta total (`après - avant === 3`). Rien n'est supprimé : le test
   vérifie désormais qu'une action écrit exactement une ligne, ce qui est la
   propriété voulue.

## 8. Vérifié / incertain

Vérifié par exécution : `tsc --noEmit` (0 erreur), 15/15 tests admin, 64/64
tests de toutes les suites, rejeu de `SCHEMA_SQL` (migration idempotente, règles
append-only présentes).

Incertain / à arbitrer :

1. **`finance` lit les commandes de toutes les communautés.** C'est la lettre de
   la table `roles-and-commissions` (« Voir les commandes : toutes … finance :
   toutes, montants »). Si la finance doit être rattachée à une seule
   communauté, c'est une ligne à changer dans `permitted()` (`order.read` et
   `commission.read`).
2. **`support` ne voit pas les montants** (déduction du qualificatif « montants »
   réservé à finance). Si le support doit voir les montants, retirer
   `seesMoney()` de la projection.
3. **Consommation d'un `offline_bundle`** non implémentée ici (hors périmètre) :
   le consommateur doit faire `UPDATE ... SET consumed_at = now() WHERE id = $1
   AND consumed_at IS NULL` et vérifier le nombre de lignes.
4. **`POST /v1/admin/admins`** (provisionnement d'un compte) n'était pas demandé
   explicitement ; il est nécessaire pour que l'écran « ajouter un membre »
   puisse fonctionner sans SQL. À déplacer vers `api-core` si l'orchestrateur
   préfère un flux d'invitation.
5. **Remboursement après versement approuvé** : la commission passe `reversed`
   mais un payout déjà approuvé n'est pas corrigé. À traiter côté `api-money`
   (rapprochement), pas ici.
6. **`admin_users.community_id`** (ancienne colonne mono-communauté) n'est plus
   lue. Non supprimée, conformément à la consigne de migration non destructive.

# Rapport — api-hardening

Sous-agent `api-hardening`, périmètre `apps/api`. Quatre points, rien de plus.
Aucune dépendance ajoutée, aucun `pnpm install`, migrations additives seulement.
`routes/{orders,payments,admin,devices,me,internal}.ts` non touchés.

Date : 2026-10-20.

---

## 1. Audiences de jeton (D17)

**Émission** — `lib/auth.ts` définit deux constantes et les applique sur les
deux émetteurs :

- `MOBILE_AUDIENCE = "vpn-mobile"` → jetons utilisateur (`requireUser`).
- `ADMIN_AUDIENCE = "vpn-admin"` → jetons administrateur (`requireAdmin`).

Chaque émetteur fait `.setAudience(...)` sur le JWT signé.

**Vérification** — `requireUser` et `requireAdmin` passent désormais
`{ audience }` à `jwtVerify`. Un jeton mobile présenté sur une route admin est
rejeté, et inversement. Le rejet ne dépend pas de la revendication `typ` : il
vient de la vérification cryptographique de `aud`.

**Tests** (`test/hardening.test.ts`) :

- jeton mobile → route admin = 401 ;
- jeton admin → route mobile = 401 ;
- jeton dont on a **réécrit** `aud` à la main, signé avec la même clé = 401
  (c'est la vérification d'audience qui tient, pas seulement la forme).

## 2. Tolérance de rejeu du refresh

**Schéma** (`schema.ts`, additif) :

```sql
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS replaced_by_id text;
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS replaced_at timestamptz;
CREATE INDEX IF NOT EXISTS sessions_replaced_by_idx ON auth_sessions (replaced_by_id);
```

`replaced_by_id` chaîne les rotations, `replaced_at` date la rotation
d'origine. L'index permet de remonter la chaîne en sens inverse.

**Fenêtre de 5 minutes** — `REFRESH_REPLAY_WINDOW_MS = 5 * 60 * 1000`,
ancrée sur `replaced_at` et non sur l'heure du rejeu : la tolérance expire donc
5 minutes après la rotation d'origine, pas 5 minutes après le dernier rejeu.
Un rejeu ne repousse pas la fenêtre. Le chiffre de 5 minutes est celui du
contrat mobile (§4).

**Rejeu dans la fenêtre, même appareil** → nouveau couple de jetons **sur la
session courante**, en place :

```sql
UPDATE auth_sessions SET refresh_hash = $1 WHERE id = $2
```

Aucune session n'est créée : pas de prolifération. Conséquence assumée et
documentée : le jeton du gagnant de la rotation devient invalide (le
`refresh_hash` a bougé). C'est un coût qui se répare tout seul au refresh
suivant.

**Rejeu hors fenêtre, ou depuis un autre appareil** → révocation de toute la
chaîne + 401. `revokeChain` remonte via `replaced_by_id` et redescend via
`idx sessions_replaced_by_idx`, borné à 200 itérations pour qu'une chaîne
corrompue ne puisse pas boucler. La présentation depuis un autre appareil
passe par `revokeDeviceFamily`, qui est un sur-ensemble.

**Dérive d'horloge** — `CLOCK_SKEW_TOLERANCE_MS = 60_000`. Sans cette marge,
60 secondes d'écart entre l'instance et Postgres transforment une reprise
légitime en détection de vol.

**Tests** :

- rejeu immédiat, même appareil → 200, même `session_id`, pas de nouvelle
  session en base ;
- rejeu à +6 minutes → 401, et la session courante est morte ensuite
  (le refresh suivant échoue aussi) ;
- `test/auth.test.ts` test 5 a été réécrit : l'ancienne assertion contredisait
  la nouvelle spécification. Il vérifie maintenant le rejeu depuis un **autre**
  appareil → 401 + famille révoquée, et que `replaced_by_id` / `replaced_at`
  sont bien écrits.

## 3. Limites de débit par route

| Route | Budget | Clé |
|---|---|---|
| `/v1/auth/login`, `/v1/auth/register` | 10 / 15 min | IP **et** compteur par e-mail |
| `/v1/bundle`, `/v1/bundle/*` | 30 / min | appareil (`dev:<sha256(token)[:24]>`), sinon IP |
| `/v1/payments/webhook/*` | illimité | allowList, la journalisation existante est conservée |

**Enveloppe d'erreur** — `@fastify/rate-limit` **lève** la valeur retournée par
`errorResponseBuilder`. Un objet nu sans `statusCode` devenait un 500.
`lib/attempts.ts` expose donc `rateLimitError`, qui retourne un `ApiFailure`
(vraie `Error`), et `lib/errors.ts` ajoute `fail.rateLimited(retryAfterSeconds,
message)` → 429 `RATE_LIMITED`. Le corps 429 est donc l'enveloppe du projet, pas
celle de Fastify par défaut. `RATE_LIMITED` existait déjà dans
`API_ERROR_CODES` de `@vpn/contract`.

**Compteur par e-mail** — `AttemptCounter`, fenêtre fixe, capacité 10 000
entrées avec éviction. Les clés sont `hashToken("auth-attempts:" + email)` :
aucun e-mail en clair n'est gardé en mémoire. Un succès remet le compteur à
zéro, sinon un utilisateur qui se trompe 9 fois puis réussit resterait bloqué.

**Interrupteur** — `env.rateLimit.enforce = bool(RATE_LIMIT_ENFORCE, !isTest)`.
Les suites existantes font des dizaines de logins et de tirages de bundle
depuis une seule IP injectée ; des budgets stricts les auraient rendues rouges
sans rien prouver. `test/hardening.test.ts` met `RATE_LIMIT_ENFORCE=1` **avant**
d'importer `./support.js`, ce qui rend les tests de débit réels et non
théoriques.

**Tests** :

- login : 11 tentatives depuis une IP → 429 avec l'enveloppe du projet ;
- même e-mail depuis des IP différentes → 429 (le compteur par e-mail tient) ;
- bundle au-delà de 30/min sur le même appareil → 429 ;
- 305 rejeux de webhook → jamais de 429.

## 4. Purge

`services/maintenance.ts` expose `purgeExpired(db)` qui supprime :

- les `bundles` expirés ;
- les `device_nonces` de plus de 10 minutes ;
- les `enroll_challenges` expirés ;
- les `auth_sessions` expirées ou révoquées depuis plus de 7 jours.

Il retourne les compteurs par table plus `purgedTotal`.

`server.ts` l'appelle dans le **même** tick de 60 secondes que le balayage
existant, dans son propre `try/catch` pour qu'un échec de purge ne tue pas le
reste du tick. `timer.unref()` est conservé : le processus ne reste pas en vie
à cause de la purge.

**Test** : seules les lignes expirées partent, les lignes vivantes restent ;
une seconde exécution retourne 0 (idempotent).

---

## Vérifications

Depuis `apps/api` :

```
npx tsc -p tsconfig.json --noEmit          → exit 0
node --test --import tsx test/hardening.test.ts
                                            → 10 tests, 10 pass, 0 fail (~7,3 s)
node --test --import tsx test/auth.test.ts  → 9 tests, 9 pass
node --test --import tsx test/*.test.ts     → 94 tests, 93 pass, 1 fail
```

### L'échec unique, hors périmètre

`test/admin.test.ts` — « bundle hors-ligne : support de sa communauté, jamais
de configuration » (ligne 492, `POST /v1/admin/devices/dev_a2/offline-bundles`)
→ `500 !== 201`.

Ce test appartient à la vague « bundle hors-ligne » d'un autre sous-agent, en
cours d'écriture pendant ma session (`services/offlineBundles.ts`,
`routes/offline.ts`, `routes/adminAuth.ts`, `test/offline.test.ts`,
`test/adminAuth.test.ts` sont apparus en concurrence). Il ne fait pas partie
des 71 tests de départ et aucun de mes fichiers ne touche ce chemin.

Cause probable, non investiguée plus loin : le test d'admin insère ses
appareils avec des clés factices (`'signing-key'`, `'agreement-key'`, ligne
134), donc `sealForDevice(device.agreement_key)` lève dans
`services/offlineBundles.ts` ; `OFFLINE_BUNDLE_SIGNING_KEY` est également absent
de ce test. C'est un problème de fixture chez eux, pas une régression de mon
périmètre.

---

## Ce qui n'est pas vérifié

- **Compteur par e-mail et compteurs IP : en mémoire, donc par processus.**
  Avec plusieurs instances derrière un load balancer, le budget effectif est
  multiplié par le nombre d'instances. Une correction demanderait un store
  partagé (Redis ou une table) — hors périmètre de cette passe, écrit ici pour
  ne pas laisser croire que la limite est globale.
- **Postgres réel non exercé.** Tous les tests tournent sur PGlite
  (`DATABASE_URL=memory://`). Les `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` et
  l'index sont valides en SQL standard, mais n'ont pas été rejoués contre un
  serveur Postgres.
- **Câblage de la purge dans `server.ts` : vérifié au type-check seulement.**
  Le tick de 60 s n'est pas déclenché par les tests (`unref`), donc
  `purgeExpired` est testé directement et non via le timer.
- **Fenêtre de 5 minutes non testée en conditions réelles de latence mobile** :
  seule la borne (+6 min → 401) est testée, par déplacement artificiel de
  `replaced_at`.

## Questions laissées ouvertes

1. Faut-il un store partagé pour les compteurs de débit, ou assume-t-on le
   facteur « nombre d'instances » ?
2. Le coût « le gagnant de la rotation perd son jeton » (rejeu dans la fenêtre)
   est-il acceptable côté mobile, ou faut-il deux hash valides simultanément ?
3. La purge des sessions révoquées à 7 jours est-elle alignée sur la durée de
   conservation attendue par l'audit ?

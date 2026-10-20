# api-core — rapport d'exécution

Date : 2026-10-20 · agent : `api-core` · état : **ok** (16/16 tests verts)

## Verdict

Les quatre fichiers demandés existent et passent : routes d'ingestion, `app.ts`,
`server.ts`, `test/ingest.test.ts`. `pnpm --filter @vpn/api test` sort en **code 0**
avec **16 tests, 16 pass, 0 fail**. Le serveur démarre réellement sur `$PORT` et
répond en HTTP (vérifié hors test runner).

Ce qui n'est **pas** prouvé : l'arrêt propre sur `SIGTERM`/`SIGINT` (non
délivrable sous Windows — voir § 5), le chemin Postgres/`pg` (seul PGlite a été
exercé), et le balayage réel toutes les 60 s (seule la fonction de balayage a
été testée, avec des dates injectées).

## 1. Fichiers écrits

| Fichier | Rôle |
|---|---|
| `apps/api/src/routes/internal.ts` | `POST /v1/internal/endpoints/{register,ready,heartbeat}`, `GET /v1/internal/pool` |
| `apps/api/src/app.ts` | parseur JSON avec `req.rawBody`, enveloppe d'erreur, `/healthz`, `/readyz` |
| `apps/api/src/server.ts` | écoute `PORT`/`HOST`, balayage 60 s, arrêt propre |
| `apps/api/test/ingest.test.ts` | 16 tests |

Corrections hors de ces quatre fichiers (détaillées § 3) :
`apps/api/src/db.ts` (2 annotations de type).

## 2. Contrat exposé

```
POST /v1/internal/endpoints/register
  { deployment_key, public_host, port?, sni?, region?, label?, capacity?,
    ttl_seconds?, agent_version? }
  -> 200 { endpoint_id, uuid, ws_path, expires_at, status, pool_revision }

POST /v1/internal/endpoints/ready      { deployment_key }
  -> 200 { status, pool_revision }

POST /v1/internal/endpoints/heartbeat  { deployment_key, latency_ms?, healthy?, agent_version? }
  -> 200 { status, expires_at }

GET  /v1/internal/pool                 (diagnostic, secret requis)
  -> 200 { pool_revision, count, endpoints[] }   # ni credential, ni deployment_key
```

Choix qui ne tranchent aucune question ouverte :

- **Aucune valeur de TTL n'est fixée ici.** `ttl_seconds` est optionnel et
  `services/endpoints.ts` le borne par `ENDPOINT_MIN_TTL`/`ENDPOINT_MAX_TTL` et
  retombe sur `ENDPOINT_DEFAULT_TTL` (14 400 s aujourd'hui). O1 reste ouverte.
- **Un seul mode d'authentification** : le jeton porteur statique existant.
  Rien de HMAC ni d'OIDC n'est codé : O4 reste ouverte.
- **`ws_path` n'est pas accepté en entrée**, conformément à
  `api-routes.md` (« Pièges »). Le service le génère (`randomWsPath`). Un test
  le vérifie : un `ws_path` envoyé par le client est ignoré.
- `register` renvoie **200 dans les deux cas** (création et rejeu) : c'est la
  même ressource, pas une nouvelle.

## 3. Corrections apportées au code existant

### 3.1 Bug bloquant : hook Fastify synchrone → requête suspendue

Symptôme : `POST /v1/internal/endpoints/register` ne répondait **jamais**
(`app.inject` restait en attente indéfiniment, sans erreur ni réponse).

Cause : `requireIngestSecret` était un `preHandler` **synchrone** qui ne
retournait rien. Fastify 5.12.7, `node_modules/fastify/lib/hooks.js:242-249` :

```js
result = iterator(functions[i++], request, reply, next)
...
if (result && typeof result.then === 'function') { result.then(handleResolve, handleReject) }
```

`next` n'est appelé que si le hook rend une promesse ou appelle `done`. Un hook
sync qui ne fait ni l'un ni l'autre laisse la requête en plan. Reproduit avec un
Fastify nu (aucun code du projet) pour écarter une cause applicative.

Correction : `async function requireIngestSecret(): Promise<void>`. Commentaire
laissé sur place pour que personne ne la « simplifie » en sync.

### 3.2 `db.ts` — deux erreurs de typage (aucun changement de comportement)

| Ligne | Erreur | Correction |
|---|---|---|
| 22 | `TS2322` : `one()` rend `Promise<Row\|null>`, l'interface exige `Promise<T\|null>` | signature `one<T = Row>(sql, params): Promise<T \| null>` + `as T \| null` |
| 78 | `TS2304` : `Cannot find name 'T'` dans `tx` côté PGlite | `async tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>` |

Le code exécuté est identique ; seul le contrat de type est respecté.

### 3.3 Ce qui n'a **pas** été modifié

- `schema.ts` : intact. Aucune colonne manquante n'a été trouvée.
- `services/endpoints.ts` : intact. Les routes réutilisent
  `registerEndpoint`, `markReady`, `heartbeat`, `listPool`, `poolRevision`.
  Aucune logique de cycle de vie dupliquée.
- `lib/errors.ts` : intact. Le 503 est construit localement avec `ApiFailure`
  (aucun code `SERVICE_UNAVAILABLE` n'existe dans `ApiErrorCode`, et en inventer
  un aurait modifié le contrat partagé).

## 4. Sortie exacte des tests

`pnpm --filter @vpn/api test` → **EXIT=0**

```
✔ register est idempotent : même clé, même identité, même expiration (93.6979ms)
✔ un second register n'étend pas expires_at (47.9485ms)
✔ register sur une clé expirée renvoie 409, jamais une résurrection (19.238ms)
✔ ready passe en active et ne bump la révision qu'une fois (35.6684ms)
✔ heartbeat met à jour sans bump de révision et sans prolonger la vie (28.2086ms)
✔ sans jeton : 401 ; avec un mauvais jeton : 401 (2.7034ms)
✔ secret vide : 503, même avec un jeton (1.2877ms)
✔ balayage : draining à expires_at - 900 s, expired après (31.5352ms)
✔ diagnostic /pool : jamais de credential, jamais d'UUID (13.3028ms)
✔ aller-retour buildVlessUri / parseVlessUri (2.0727ms)
✔ enveloppe scellée : sealForDevice puis openEnvelope rend la même chose (11.0706ms)
✔ le parseur JSON conserve le corps brut octet pour octet (4.7637ms)
✔ JSON invalide : enveloppe d'erreur, pas de trace (2.4851ms)
✔ validation : public_host obligatoire, ws_path jamais accepté (10.3206ms)
✔ /healthz ne touche pas la base, /readyz la vérifie (1438.6965ms)
✔ route inconnue : 404 dans l'enveloppe (0.9764ms)
ℹ tests 16
ℹ pass 16
ℹ fail 0
ℹ duration_ms 5226.251
```

Détail de ce que chaque test prouve :

1. **Idempotence** : deux `register` même `deployment_key` → même `endpoint_id`,
   même `uuid`, même `ws_path`, même `expires_at` ; une seule ligne en base.
2. **Pas d'extension du TTL** : après 25 ms, `expires_at` identique en réponse
   *et* en base.
3. **Clé expirée** : `expires_at` reculé en base → `register` renvoie **409**
   `CONFLICT`.
4. **`ready`** : `pending` → `active`, révision `+1`, second `ready` → révision
   inchangée.
5. **Heartbeat** : révision inchangée, `expires_at` inchangé, `latency_ms`,
   `health` et `agent_version` écrits.
6. **401** sans jeton, avec mauvais jeton, et sur `GET /pool`.
7. **503** quand `ENDPOINT_INGEST_SECRET` est vide — *même avec un jeton
   valide* (le secret est lu à chaque requête, pas au démarrage).
8. **Balayage** : à `expires_at − 901 s` la ligne reste `active` ; à
   `expires_at − 900 s` elle passe `draining` ; à `expires_at + 1 s` elle passe
   `expired`.
9. **`/pool`** : la réponse ne contient ni `credential` ni `deployment_key`.
10. **VLESS** : aller-retour `buildVlessUri`/`parseVlessUri` (id, hôte, port,
    `type=ws`, `security=tls`, `sni`, `path`, libellé UTF-8). Aucun `vless://`
    littéral dans le fichier de test (vérifié par `rg`).
11. **Enveloppe** : `sealForDevice` → `openEnvelope` rend le même plaintext ;
    un `revision` différent fait échouer le tag GCM (contexte lié).
12. **`rawBody`** : le corps brut est conservé **octet pour octet**
    (`'{ "b": 1,  "a": [2, 3] }'`), ce qui est la condition de la signature
    d'appareil.
13. **JSON invalide** : 400 `VALIDATION_FAILED`, pas de pile d'appels.
14. **Validation** : `public_host` manquant → 400 ; `ws_path` client ignoré.
15. **Sondes** : `/healthz` 200 ; `/readyz` 200 ; base fermée → `/readyz` 503 et
    `/healthz` toujours 200 (liveness ≠ readiness).
16. **404** dans la même enveloppe d'erreur.

Vérification hors test runner (vrai socket HTTP, `node --import tsx src/server.ts`) :

```
healthz 200 {"status":"ok","uptime":9}
readyz 200 {"status":"ready"}
register 200 {"endpoint_id":"cebdf820-...","uuid":"...","ws_path":"/ws/yGkIVJGnn2yp",
              "expires_at":"2026-10-20T17:54:40.928Z","status":"pending","pool_revision":2}
pool(noauth) 401
```

Les logs du serveur ne contiennent ni UUID ni URI (vérifié sur la sortie de ce
lancement).

## 5. Non vérifié / incertain

1. **Arrêt propre** : `SIGTERM`/`SIGINT` ne peuvent pas être délivrés à un
   process Windows depuis ce shell. Le code est écrit (arrêt de l'acceptation
   via `app.close()`, `clearInterval`, `db.close()`, sortie 0, minuterie de
   secours de 15 s en `unref`), mais **il n'a pas été observé**. À rejouer sous
   Linux/Cloud Run.
2. **Chemin Postgres (`pg`)** : tous les tests tournent sur PGlite en mémoire
   (`DATABASE_URL=memory://`). Les types `bigint`/`timestamptz` et le paramètre
   `Date` de `sweepEndpoints` sont validés sur PGlite seulement.
3. **Balayage périodique** : l'intervalle de 60 s n'a pas été attendu. Seule
   `sweepEndpoints(db, now)` est testée, à dates injectées.
4. **`typecheck` n'est pas vert à 100 %** : une seule erreur reste, hors
   périmètre —
   `src/lib/fapshi.ts(49,51): TS2307: Cannot find module '../services/mockPayments.js'`.
   Ce fichier appartient au lot paiements et n'existe pas encore ; l'inventer
   ici aurait été hors mission. `app.ts`, `server.ts`, `routes/internal.ts` et
   `db.ts` ne produisent aucune erreur.
5. **`pnpm install`** a d'abord échoué en `ERR_PNPM_IGNORED_BUILDS` (scripts
   d'esbuild bloqués par pnpm 12). Rejoué avec
   `pnpm install --config.strict-dep-builds=false` : installation complète
   (108 paquets), `tsx` fonctionnel. Aucun fichier de configuration modifié.
6. **`@vpn/contract`** devait être compilé (`pnpm --filter @vpn/contract build`)
   pour que `tsc` résolve `dist/index.d.ts`. Artefact de build uniquement,
   aucune source touchée.
7. **`GET /v1/internal/pool` est plafonné** à 500 lignes par `listPool` ; `count`
   reflète la page, pas le total. Acceptable pour un diagnostic.
8. **Le `ready` reste déclaratif** (angle mort déjà noté dans
   `endpoint-lifecycle`) : rien ne prouve qu'un endpoint `active` répond.

## 6. Questions laissées ouvertes (non tranchées)

- **O1** : durée de vie par défaut (4 h ou 4 h 30) — le code suit
  `ENDPOINT_DEFAULT_TTL`, inchangé.
- **O4** : mode d'authentification de l'ingestion (statique, statique + HMAC,
  OIDC) — seul le jeton statique existant est branché.
- Faut-il un `label` par défaut = `public_host` (choix actuel) ou un libellé
  fourni obligatoirement par le déploiement ?
- `healthy: false` est traduit en `health = "degraded"` (pas `"down"`), faute de
  sémantique définie dans les nœuds. À confirmer.

# api-bundle — rapport

Statut : **terminé**. `tsc --noEmit` propre, **18 tests écrits, 18 verts, 0 échec**.

Fichiers écrits (7) :

- `apps/api/src/routes/me.ts` — gardes partagées, `/v1/me*`
- `apps/api/src/routes/auth.ts` — inscription, connexion, rotation, déconnexion
- `apps/api/src/routes/devices.ts` — challenge, enrôlement, liste, révocation, activation
- `apps/api/src/routes/bundle.ts` — bundle scellé, ETag/304, cache `bundles`
- `apps/api/test/support.ts` — harnais partagé des deux fichiers de test
- `apps/api/test/auth.test.ts` — 9 tests
- `apps/api/test/bundle.test.ts` — 9 tests

Non modifiés : `app.ts`, `schema.ts`, `package.json`, `lib/*`, `services/*`, les
fichiers des autres agents. Aucune dépendance ajoutée, aucun `pnpm install`.

## Vérification

```
$ cd apps/api
$ npx tsc -p tsconfig.json --noEmit
TSC_EXIT=0

$ node --test --import tsx test/auth.test.ts test/bundle.test.ts
ℹ tests 18
ℹ pass 18
ℹ fail 0
ℹ duration_ms 5500.8584
```

Les deux suites passent **ensemble** dans le même processus : c'est le cas qui
casse quand `app.ts` et les tests enregistrent deux fois les mêmes routes.

## Câblage — à lire avant de toucher aux tests

`app.ts` enregistre désormais les quatre modules lui-même (lignes 146-149) :

```ts
registerInternalRoutes(app, db);
registerAuthRoutes(app, db);
registerDeviceRoutes(app, db);
registerBundleRoutes(app, db);
registerMeRoutes(app, db);
```

**`test/support.ts` ne doit enregistrer aucune route.** Il appelle seulement
`buildApp({ db })`. Un `register*Routes(app, db)` ajouté dans un support de test
— ou dans n'importe quel `test/*.test.ts` — provoque immédiatement
`FST_ERR_DUPLICATED_ROUTE`, puisque `buildApp` les a déjà posées. C'est la
correction appliquée à `test/support.ts` et à `test/payments.test.ts` ; la règle
vaut pour tous les tests à venir.

Le `db` est `memory://` en test (fake Postgres en mémoire de `db.ts`), donc les
tests exercent les vraies requêtes SQL, pas des doublures de repository.

## Routes

| Méthode | Chemin | Accès | Réponse |
|---|---|---|---|
| POST | `/v1/devices/challenges` | public | `{ challengeId, nonce, expiresAt, serverTime }` |
| POST | `/v1/devices/enroll` | preuve (clé du corps) | 201 `{ deviceId, deviceToken, serverTime, status: "enrolled" }` |
| POST | `/v1/auth/register` | preuve | 201 `AuthSession` |
| POST | `/v1/auth/login` | preuve | `AuthSession` |
| POST | `/v1/auth/refresh` | preuve | `AuthSession` (rotation) |
| POST | `/v1/auth/logout` | session | 204 |
| GET | `/v1/me` | session | `Me` |
| PATCH | `/v1/me` | session | `User` |
| GET | `/v1/me/subscription` | session | `{ entitlement, subscription }` |
| GET | `/v1/me/devices` | session | `{ items: Device[] }` |
| DELETE | `/v1/me/devices/:deviceId` | session | 204 |
| POST | `/v1/me/devices/current/activate` | session | `Device`, ou 409 `DEVICE_LIMIT_REACHED` |
| GET | `/v1/configuration-bundles/current` | session | `BundleResponse`, ou 304 |

« preuve » = `x-device-token` + `x-device-timestamp` + `x-device-nonce` +
`x-device-signature` sur la forme canonique (`canonicalProof`).
« session » = bearer **et** preuve : `requireSession` vérifie le jeton, consomme
le nonce, puis contrôle que l'appareil de la session appartient bien à
l'utilisateur de la session (403 sinon). Rien d'autre dans le dépôt ne fait ce
dernier contrôle : c'est la garde qui empêche de presenter le bearer d'un compte
avec l'appareil d'un autre.

## Corps de requête (stricts, `z.strict()`)

```jsonc
// challenges
{ "installationId": "…8-190…", "purpose": "enroll" | "login" | "refresh" }

// enroll — clés = SPKI base64, EC P-256 obligatoire (prime256v1/secp256r1)
{ "challengeId": "…", "installationId": "…", "deviceName": "…",
  "platform": "android" | "ios",           // optionnel, défaut android
  "signingKey": "…", "agreementKey": "…",
  "appVersion": "1.2.3", "androidVersion": 34,
  "integrityToken": "…" }                  // optionnel, stocké seulement

// register — appId est obligatoire (voir écarts)
{ "appId": "…", "email": "…", "password": "…8-200…",
  "name": "…2-60…", "locale": "fr" }       // locale optionnel

// login
{ "email": "…", "password": "…" }

// refresh
{ "refreshToken": "…20-200…" }

// PATCH /v1/me — au moins un des deux
{ "name": "…2-60…", "locale": "xx" }
```

Toute clé inconnue est rejetée (`strict`), un email est normalisé en minuscules,
et une clé RSA est refusée **avant** toute écriture (test dédié).

## Formes exactes des réponses

### `AuthSession` (register, login, refresh)

```jsonc
{
  "accessToken": "…",
  "refreshToken": "…",
  "accessExpiresAt": "2026-10-20T16:15:00.000Z",
  "refreshExpiresAt": "2026-12-04T16:00:00.000Z",
  "user": {
    "id": "…", "email": "…", "name": "…", "locale": "fr",
    "emailVerified": false, "communityId": "…", "createdAt": "…"
  },
  "device": {
    "id": "…", "name": "…", "platform": "android", "status": "active",
    "current": true, "lastSeenAt": "…", "createdAt": "…"
  }
}
```

Aucun droit, aucun rôle, aucune limite d'appareil dans le jeton ou dans cette
réponse : l'app lit l'abonnement par `/v1/me` ou `/v1/me/subscription`.

### `Me`

```jsonc
{
  "user": { … },
  "community": { "id": "…", "slug": "…", "name": "…" },
  "entitlement": {
    "active": true, "planCode": "…", "planName": "…",
    "startsAt": "…", "endsAt": "…", "daysRemaining": 30,
    "deviceLimit": 1, "activationPending": false
  },
  "subscription": {
    "id": "…", "planId": "…", "planCode": "…", "planName": "…",
    "startsAt": "…", "endsAt": "…", "deviceLimit": 1
  },
  "device": { … },
  "devicesUsed": 1,
  "devicesLimit": 1
}
```

`community` vient **de la session**, jamais du corps. `subscription` vaut `null`
sans abonnement actif ; `activationPending` signale une commande payée non
encore activée (l'app doit renvoyer vers l'attente, pas vers le paiement).

### Bundle — la partie qui compte

```jsonc
{
  "revision": 7,
  "issuedAt": "2026-10-20T16:00:00.000Z",
  "expiresAt": "2026-11-19T16:00:00.000Z",
  "configCount": 3,
  "envelope": {
    "version": 1,
    "ephemeralKey": "…base64 SPKI P-256…",
    "salt": "…base64 16 o…",
    "iv": "…base64 12 o…",
    "ciphertext": "…base64…",
    "tag": "…base64 16 o…",
    "digest": "…base64 sha256 du clair…"
  }
}
```

**Rien en clair** : ni URI, ni UUID, ni hôte, ni credential. La réponse ne porte
que l'enveloppe et des métadonnées de version. Le tableau de configurations
n'existe qu'à l'intérieur du chiffré.

Clair scellé (après `openEnvelope`) :

```jsonc
{
  "revision": 7,
  "issuedAt": "2026-10-20T16:00:00.000Z",
  "expiresAt": "2026-11-19T16:00:00.000Z",
  "configs": [{
    "id": "…", "label": "…", "uri": "vless:…",   // URI complète, jamais sortie en clair
    "expiresAt": "…", "region": "…",
    "maxSessionSeconds": 3300
  }]
}
```

Crypto réellement employée (`lib/crypto.ts:127-165`, non modifié) : ECDH P-256
(clé éphémère serveur ↔ `agreementKey` de l'appareil) → HKDF-SHA256 avec
`salt` aléatoire et `info = "vpn-bundle-v1|<deviceId>|<revision>"` → AES-256-GCM.
Le `info` lie le chiffré à **cet** appareil et à **cette** révision : une
enveloppe rejouée sur un autre appareil ou une autre révision ne s'ouvre pas.
`ephemeralKey`/`iv`/`salt` changent à chaque scellement, ce qui est précisément
pourquoi l'ETag ne peut pas être un hash du corps (voir plus bas).

Le test de bout en bout déchiffre avec la clé privée de test via `openEnvelope`,
puis vérifie `revision`, `expiresAt`, `maxSessionSeconds` et `parseVlessUri(uri)`
— jamais une chaîne de schéma écrite à la main dans le test.

### Sémantique du bundle

- **Révision** = `poolRevision(db)`. Elle bouge quand un endpoint apparaît,
  devient actif, draine ou expire ; pas sur un heartbeat (D10).
- **ETag** = `"b<revision>-<sha256(deviceId:revision).slice(0,16)>"` —
  indépendant des octets du chiffré, donc un 304 est possible.
- **`If-None-Match`** → 304 sans corps, sans repousser `expiresAt`, avec
  `cache-control: no-store` sur les réponses 200 comme 304.
- **Expiration** = la plus tôt entre la fin des droits et la première
  configuration servie ; pool vide ⇒ le bundle naît expiré (`expiresAt =
  issuedAt`), ce qui est un retrait valide, pas une panne muette.
- **Cache** : l'enveloppe scellée est mémorisée dans `bundles` (une ligne par
  appareil, `UNIQUE device_id`) et réutilisée seulement si la révision **et**
  l'expiration calculée sont inchangées. Un renouvellement d'abonnement produit
  donc une nouvelle enveloppe au lieu de servir l'ancienne.
- **`config_grants` n'est pas écrit** : pour un endpoint partagé, cela
  recopierait le credential en clair dans une seconde table. À trancher par
  l'orchestrateur si un besoin d'audit par configuration apparaît.

## Refresh, quota, erreurs

**Refresh rotatif.** L'ancienne ligne est révoquée et une nouvelle insérée avec
la **même échéance absolue** : une rotation ne prolonge pas la session, elle
remplace le secret porteur. Rejouer un jeton déjà tourné révoque toute la
famille (user + appareil) et renvoie 401. Deux refresh concurrents : la
révocation conditionnelle (`UPDATE … WHERE revoked_at IS NULL RETURNING id`)
laisse passer un seul gagnant, le perdant reçoit un 401 simple **sans**
révocation de famille — c'est une course, pas un rejeu, il n'a pas fait avancer
l'état. Présenter le jeton d'un autre appareil révoque la famille et renvoie 401
(on ne sait pas lequel des deux est légitime).

**Quota.** Limite = `plans.device_limit` de l'abonnement actif, défaut 1
(`schema.ts`). `ensureDeviceSlot` verrouille les lignes (`SELECT … FOR UPDATE`)
dans `db.tx` avant de compter : deux connexions simultanées ne consomment pas
la même place. Un appareil au-delà du quota reste `enrolled` : il gère son
compte, mais le bundle le refuse. La promotion en `active` se fait à la
connexion, au tirage du bundle, ou explicitement par
`POST /v1/me/devices/current/activate`.

**Répondre 403, pas 404, sur l'appareil d'autrui.** Un identifiant existant qui
appartient à un autre compte renvoie 403 : un 404 laisserait croire à une
suppression silencieuse. Un identifiant réellement inexistant renvoie 404.

**Cohérence des statuts observés en test** : 400 `VALIDATION_FAILED`,
401 `UNAUTHENTICATED` / `INVALID_CREDENTIALS` / `DEVICE_PROOF_INVALID`,
402 `SUBSCRIPTION_REQUIRED`, 403 `FORBIDDEN` / `DEVICE_REVOKED`,
404 `NOT_FOUND`, 409 `CONFLICT` / `DEVICE_LIMIT_REACHED`.

## Tests (18)

`test/auth.test.ts` (9) :

1. enrôlement : challenge court, deux clés EC P-256, jeton d'appareil
2. enrôlement : une clé RSA est refusée avant toute écriture
3. inscription : 201, email normalisé, puis 409 sur doublon
4. connexion : mauvais mot de passe et email inconnu donnent le même 401
5. refresh rotatif : l'ancien jeton meurt, le rejouer révoque la famille
6. preuve d'appareil : absente, fausse ou rejouée → 401
7. déconnexion : 204, puis la session ne vaut plus rien
8. un appareil rattaché à un autre compte ne peut pas se connecter
9. le profil se lit et se met à jour, la communauté vient de la session

`test/bundle.test.ts` (9) :

10. le bundle est une enveloppe scellée qui se déchiffre avec la clé AGREE
11. la révision et le chiffré sont stables tant que le pool ne bouge pas
12. `If-None-Match` renvoie 304 sans corps et sans repousser de date
13. un nouvel endpoint dans le pool change la révision et le contenu
14. preuve d'appareil invalide → 401, jamais de bundle
15. bundle d'un appareil appartenant à un autre compte → 403
16. appareil révoqué → 403 `DEVICE_REVOKED`
17. sans abonnement actif → 402 `SUBSCRIPTION_REQUIRED`
18. quota : le 2e appareil reste `enrolled`, puis la place libérée est reprise

Le test 16 couvre les trois chemins : session existante → 401 (la session est
morte avec l'appareil), reconnexion → 403 `DEVICE_REVOKED`, session vivante
insérée à la main → 403 `DEVICE_REVOKED`.

## Écarts avec `Contrat-API-mobile.md`

Ces écarts sont volontaires ou hérités, mais **non tranchés par
l'orchestrateur** : chacun a un impact côté Android.

| Contrat | Écrit | Pourquoi / impact |
|---|---|---|
| `POST /v1/device-challenges` | `POST /v1/devices/challenges` | chemin différent ; `purpose` obligatoire. À aligner côté `android-core` ou dans la route. |
| Corps `{installationId, purpose}` non spécifié | ajouté | le challenge sert trois usages, mais le `purpose` n'est pas stocké. |
| Inscription → `AuthChallenge`, puis `verify-email` → `AuthSession` | inscription → **`AuthSession` 201** directement | pas de route `verify-email`/`resend-verification` dans ce lot ; `email_verified_at` reste NULL et la connexion ne l'exige pas. |
| Enveloppe = JWS ES256 puis JWE compact (`RSA-OAEP-256`, `A256GCM`, `kid` RSA) | `SealedEnvelope` ECDH P-256 + HKDF-SHA256 + AES-256-GCM | D4 impose **deux clés EC P-256**, pas de RSA ; `jweCompact` ne peut pas porter un ECDH. Android doit implémenter la forme ci-dessus, pas la JWE du contrat. |
| `BundlePlaintext` riche (`bundleId`, `listVersion`, `entitlement`, `recoveryPolicy`, `revokedConfigurationIds`…) | `{ revision, issuedAt, expiresAt, configs[] }` | le contrat décrit une cible ; le lot livre le minimum vérifiable. `configs[]` porte `id/label/uri/expiresAt/region/maxSessionSeconds`. |
| Objet étranger → **404** (§5) | appareil d'autrui → **403** | consigne de mission, et 403 évite de simuler une suppression. Divergence assumée, à documenter dans l'OpenAPI. |
| `403 SUBSCRIPTION_REQUIRED` | **402** `SUBSCRIPTION_REQUIRED` (`lib/errors.ts:29`) | hérité de `api-core`, non modifié par ce lot (fichier d'un autre agent). Un client qui teste `403` cassera. |
| Rotation rejouable 5 min avec la même clé et le même corps (§4) | **non implémenté** : rejeu = révocation de famille | perte de réponse réseau = reconnexion obligatoire. C'est le manque le plus visible côté UX. |
| `maxSessionSeconds` = délai réel du nœud, 3600 recommandé (D25) | `env.ingest.reconnectAfterSeconds` (= 3300 en test) | consigne de mission, plus prudente que 3600 ; à confronter à D25 avant mise en production. |
| `GET /sync`, `push-token`, `deletion-requests`, `plans`, support, diagnostics | absents | hors lot. |
| `POST /v1/me/devices/current/activate` → 409 `DEVICE_LIMIT_REACHED` | conforme | — |

## Non vérifié / limites

- **Postgres réel non exercé** : la base de test est `memory://`. Les
  `FOR UPDATE`, `ON CONFLICT`, les index UNIQUE partiels et les conversions
  `jsonb` sont relus, pas prouvés sur un vrai serveur. À rejouer sur Postgres
  avant production.
- **Play Integrity** : `integrityToken` est accepté et stocké dans
  `integrity_ok` comme simple corroboration ; aucune vérification de signature
  côté Google. `integrity.enforce` n'existe pas encore.
- **Aucune limitation de débit** sur `login`, `register` et `refresh` dans ces
  modules : seul le `rateLimit` global d'`app.ts` s'applique. Un attaquant peut
  marteler `login` dans la limite globale.
- **Émission d'email** absente (vérification, réinitialisation) : les routes
  correspondantes n'existent pas.
- **Expiration des bundles en base** : la ligne `bundles` n'est jamais purgée ;
  à faire par un balayage (comme `ingest` le fait pour les nonces).
- **Révocation VPN côté serveur** : révoquer un appareil coupe la session et le
  bundle, mais ne peut pas joindre l'intérieur d'un conteneur (question ouverte
  `revocation`). Le bundle suivant retire la configuration ; une session Xray
  déjà établie survit jusqu'à son `maxSessionSeconds`.
- **Comportement Android** de l'enveloppe et du refresh : relu, non exécuté
  (pas de JDK/Android SDK sur cette machine).

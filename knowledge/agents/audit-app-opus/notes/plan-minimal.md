---
id: audit-app-opus-plan
title: Plan minimal — combler les manques, du plus bloquant au moins bloquant
kind: note
status: assumption
updated: 2026-10-23
---

# Plan minimal (partie D)

Une seule solution par manque : la plus simple qui marche. Chaque solution est
justifiée par la pratique courante, avec la source consultée. La section « Ce
que je ne fais pas » explique ce qui est écarté.

Ordre : d'abord ce qui empêche **un premier utilisateur payant d'obtenir un
tunnel** (P1-P8), ensuite ce qui fausse la liste dans la durée (P9-P13), enfin
l'exploitation (P14-P20).

## Bloc 1 — chaîne bloquée aujourd'hui

| # | Manque | Solution unique | Pourquoi celle-ci | Effort |
|---|---|---|---|---|
| **P1** | M1 : le conteneur n'envoie pas `X-Ingest-Timestamp` | Dans `post_json` (`entrypoint.sh`), ajouter `-H "X-Ingest-Timestamp: $(date +%s)"`. Ajouter un test d'ingestion qui pose `NODE_ENV=development` sur ce seul en-tête, ou une variante de `ingest.test.ts` qui l'exige. | D56 a choisi bearer + horodatage. Un en-tête calculé par requête suffit. | 1 ligne + 1 test |
| **P2** | M16 : login sans `appId`, inscription sans `phone` | Ajouter `appId = BrandTokens.appId` à `LoginRequest`, et un champ `phone` (saisi, obligatoire) à `RegisterRequest` et à l'écran d'inscription. | D53 est tranché côté serveur ; seul le client est en retard. | petit |
| **P3** | M10 : nom d'en-tête du webhook | Lire `x-wh-secret` (`payments.ts` l.155). Mettre à jour `admin-access-flows`, `api-routes` et `contracts.ts`. | La doc Fapshi nomme l'en-tête `x-wh-secret`, et Fapshi n'envoie qu'une requête par événement : une erreur ici n'est jamais rattrapée par un rejeu. | 1 ligne |
| **P4** | M11 : page de retour absente en production | Sortir `GET /pay/return/:orderId` du bloc `if (paymentProvider !== "mock") return`, et l'ajouter à `BYPASS_RE` de `lib/decoy.ts`. | La page est déjà générique et sans donnée. Il suffit de l'enregistrer dans tous les modes. | 2 lignes |
| **P5** | M4 : approbation automatique désactivée par défaut en production | Défaut `true` pour `ENDPOINT_AUTO_APPROVE` (`config.ts` l.169), et `.env.example` aligné. | D46 l'a décidé ; un défaut sûr évite un pool vide silencieux. | 1 ligne |
| **P6** | M12 : corps brut sous Vercel | Poser `NODEJS_HELPERS=0` dans les variables du projet Vercel de l'API, retirer l'export `config.api.bodyParser` (convention Next.js), puis un appel signé réel en Preview. | Option documentée par Vercel (« Advanced Node.js Usage » : *Disabling helpers*). Le pattern `app.server.emit("request")` est déjà celui d'`api/index.ts`. | variable + 1 essai |
| **P7** | M7 : Postgres sous Vercel | Deux URL. `DATABASE_URL` = URL **poolée** du fournisseur, avec `max: 1` dans `pg.Pool` sous Vercel. `DIRECT_DATABASE_URL` = URL directe, utilisée seulement par un script `migrate` (le `SCHEMA_SQL` actuel, sous verrou consultatif) lancé une fois par déploiement. Le démarrage à froid ne rejoue plus le schéma. | Pratique documentée par Vercel (guide « connection pooling with functions ») et par les fournisseurs Postgres : URL poolée pour les requêtes, URL directe pour les migrations. | petit |
| **P8** | M13 + M14 : CI de marque | (a) Étape `gh release download <tag-libbox> -p libbox.aar -D apps/android/app/libs` avant `Compiler`. (b) Défaut `GITHUB_REF=master`. | `gh` est déjà utilisé par le workflow (release). D62 a choisi la Release GitHub ; le premier run révélera le reste. | 5 lignes |

À la fin du bloc 1, un premier essai réel est possible : nœud → API → paiement
→ bundle → tunnel sur le Pixel 8 (arm64 seulement, `libbox.so` est arm64-v8a).

## Bloc 2 — une liste juste dans la durée

| # | Manque | Solution unique | Pourquoi celle-ci |
|---|---|---|---|
| **P9** | M18 : l'app coupe au premier nœud mort | Dans `SingBoxConfig.build`, renvoyer deux dates : `rightsExpiresAtMs = payload.expiresAt` (seule à déclencher « expiré » et `vault.clear()`) et `nextConfigExpiryMs = min(configs)` (qui déclenche un nouveau tirage de bundle, sans vider le coffre). Les configs mortes sont filtrées, comme aujourd'hui. | C'est exactement D67, déjà décidé. Aucun nouveau mécanisme. |
| **P10** | M5 : entretien incomplet sous Vercel | Dans le hook `onRequest` existant (60 s par instance), remplacer les deux `UPDATE endpoints` par `sweepEndpoints(db)` (qui bumpe la révision), puis appeler `checkPoolExpiry` et `purgeExpired`. Supprimer le tick de `server.ts`, qui fait double emploi. | D51 a choisi l'entretien paresseux. On y met tout, au lieu d'ajouter un cron. Un cron Hobby ne passe qu'une fois par jour (`vercel`). |
| **P11** | M6 : `cachedBundle` sert un corps périmé | Mémoriser l'ETag dans `bundles` (nouvelle colonne `etag`) et ne réutiliser le chiffré que si l'ETag calculé est identique. | L'ETag contient déjà le jeu servi (`bundleEtag`). Comparer la même empreinte supprime la divergence entre ETag et corps. |
| **P12** | M15 : `minSdk` 26 contre déchiffrement API 31 | `minSdk = 31` dans `libs.versions.toml`. | Le Keystore ECDH requis l'impose déjà. Mieux vaut refuser l'installation qu'installer une app qui ne peut rien ouvrir. |
| **P13** | M20 : un bundle vide écrase la liste | Dans `AppRoot.refreshPrivate`, ne pas appeler `vault.save` si `configs` est vide ; afficher le bandeau `NO_CONNECTION`. | Règle D61 telle qu'écrite. |

## Bloc 3 — exploitation et observation

| # | Manque | Solution unique | Pourquoi celle-ci |
|---|---|---|---|
| **P14** | M17 + M19 : aucune télémétrie, aucune sonde | Dans `VpnTunnelService`, une coroutine de 60 s : `measureDelayMs` sur la sortie active ; deux échecs consécutifs → `selectOutbound` vers la suivante ; chaque résultat est ajouté à une file locale (`SecureStore`) vidée par lots de 20 vers `POST /v1/me/telemetry`, avec le backoff de D64. | Les deux méthodes moteur existent déjà (`LibboxTunnelEngine`). C'est le producteur décrit par D70, sans nouveau composant. |
| **P15** | M2 + M3 : nœud `paid-gcp` impossible | Variables du conteneur `ENDPOINT_TIER` et `ENDPOINT_IDENTITY_MODE`, passées dans `REGISTER_PAYLOAD`. En `per_device`, écrire les 200 UUID de `client_pool` comme clients Xray (`email` = l'UUID). `ENDPOINT_TTL` explicite (≤ 30 j). Heartbeat : `xray api statsquery --pattern "user>>>"` vers `usage`. | Le serveur accepte déjà tout cela (D68/D69). Seul le conteneur manque. Ce chantier est à faire seulement quand un forfait `paid-gcp` est vendu. |
| **P16** | M21 : pas de création d'app | `POST /v1/admin/communities/:id/apps` (owner), qui insère `apps` avec les règles de `buildBrandSpec`, audité. | Même forme que les autres créations admin. |
| **P17** | M8 + M9 : fichier hors-ligne | `authorize(admin, "offline_bundle.issue", communityId)` sur la liste. À l'émission : `loadEntitlement` (refus si inactif) puis `servedEndpoints(db, entitlement.endpointTier)`. Schéma et OpenAPI `ttlHours ≤ 24`, et `bundleId` dans le 201. | Réutilise les gardes déjà présentes ailleurs. Aligne contrat et code (C6, C7). |
| **P18** | Callback CI incomplet | Étape finale `if: always()` qui envoie `status: ${{ job.status == 'success' && 'succeeded' || 'failed' }}`. Ajouter `versionCode`. `apkUrl` plus tard, avec l'upload Blob. | Un build échoué doit sortir de `queued`. `always()` est la construction standard de GitHub Actions. |
| **P19** | Révocation `per_device` sans effet | À la révocation d'un appareil, `UPDATE config_grants SET revoked_at = now() WHERE device_id = $1`. | Libère l'UUID du pool. Le nœud ne coupe pas (D23), mais l'identité n'est plus resservie. |
| **P20** | Nœuds périmés (`coherence-noeuds.md`) | L'orchestrateur applique les 34 corrections de texte ; `telegram-bot` et `traffic-stats` passent en `stale`. | Règle « la mémoire écrite prime ». |

## Ce que je ne fais pas, et pourquoi

- **Pas de cron Vercel ni de déclencheur externe** : D51 a choisi l'entretien paresseux et Hobby limite le cron à une exécution par jour. P10 complète le hook existant.
- **Pas de HMAC d'ingestion** : D56 l'a écarté ; P1 ajoute seulement l'horodatage déjà exigé.
- **Pas de réécriture de l'API en fonctions Vercel natives** : l'adaptateur garde les 162 tests ; P6 règle le seul point connu (helpers).
- **Pas de 3x-ui ni d'ordre de révocation vers les nœuds** : D39 et D23 ; le nœud reste strictement sortant (D34).
- **Pas de `minSdk` 26 avec repli logiciel ECDH** : la clé AGREE doit rester dans le Keystore (D4/D5).
- **Pas de page de retour riche** : la page doit rester générique ; c'est l'app qui réconcilie (`?refresh=1`).
- **Pas de nouvelles alertes** (`endpointDown`, `poolSuspicion`, `payoutReview`) avant que P14 produise des rapports : sans producteur, elles ne se déclencheraient jamais.
- **Pas de refonte de `packages/contract`** : le contrat vivant est `openapi.json`. On le déclare, on ne le duplique pas (C34).

## Sources consultées

- Doc Fapshi, page « Webhook Integration » : en-tête `x-wh-secret`, un envoi par événement, URL par service.
- Doc Vercel, « Using the Node.js Runtime » et « Advanced Node.js Usage » : helpers `request.body` (getter paresseux), désactivation par `NODEJS_HELPERS=0`.
- Guide Vercel, « connection pooling with functions » : pool en portée globale, URL poolée pour les requêtes ; URL directe pour les migrations (pratique des fournisseurs Postgres).

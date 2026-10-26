# Audit API - endpoints, pool, Telegram, bundle, telemetrie

Date : 2026-10-26. Lecture seule. Chemins relatifs à `apps/api/src/` sauf mention.

## 1. Verdict

- Le socle de pool est solide : cycle de vie, idempotence de `register`, drain, purge, santé par quorum, télémétrie bornée. Ce qu'on garde tel quel est nommé en section 3.
- Les trois sujets nouveaux du plan ne sont **pas** là : aucune notion de créneau (20 h / minuit), aucune notion de plage de nuit par abonnement, aucun client 3x-ui. Telegram est mono-destinataire, sans message de test, et son planning ne correspond pas au brief (30 min / 15 min, pas 15 min / 5 min).
- Deux écarts de fond contredisent D69 et D45 : un nœud `per_device` retombe sur le credential partagé (`routes/bundle.ts:203-212`) et un bundle ne peut pas mélanger deux tiers (`routes/bundle.ts:323`).
- Le fichier de secours hors-ligne expose le credential partagé du nœud, ne plafonne pas l'échéance aux droits, ne tient que sur le tier gratuit, et l'usage unique n'est pas imposé (section 6).
- Verdict global : **base saine, plan à implémenter sur ~6 points nouveaux, avec deux décisions d'architecture à trancher** (tier mixte de nuit, identité 3x-ui).

## 2. Inventaire

| Fichier | Lignes | Rôle | État |
|---|---|---|---|
| `routes/internal.ts` | 308 | Ingestion nœuds : register, ready, heartbeat, pool. Bearer constant-time (`internal.ts:26-53`). | solide |
| `services/endpoints.ts` | 576 | Cycle de vie, idempotence, revive, drain, `servedEndpoints`, `endpointToConfig`. | solide (rien pour créneaux ni plages) |
| `services/health.ts` | 197 | Quorum de santé D48/D50/D63 (`health.ts:117-160`). | partiel (voir §6, bug 3) |
| `services/poolWatch.ts` | 81 | Rappel de déploiement sur l'endpoint le plus jeune (`poolWatch.ts:34-81`). | partiel (planning faux, état en mémoire) |
| `services/telegram.ts` | 139 | Envoi file d'attente, scrub des secrets (`telegram.ts:96-106`), messages. | solide, mono-destinataire |
| `services/maintenance.ts` | 69 | Purge bundles, nonces, challenges, sessions (`maintenance.ts:40-64`). | solide |
| `lib/vless.ts` | 72 | Construction de l'URI VLESS (`vless.ts:24-45`), chemin WS aléatoire (`vless.ts:70-72`). | solide |
| `routes/bundle.ts` | 360 | Tirage du bundle scellé, ETag, expiration (`bundle.ts:105-110`), grants per-device (`bundle.ts:135-174`). | partiel (un tier, pas de plage, repli partagé) |
| `routes/telemetry.ts` | 183 | `POST /v1/me/telemetry` : usage device (`telemetry.ts:129-138`), rapports santé (`telemetry.ts:149-178`). | solide |
| `services/offlineBundles.ts` | 232 | Émission du fichier de secours, signature Ed25519, consommation. | bug (§6) |
| `config.ts` 145-151 | - | Bloc Telegram : `enabled`, `botToken`, `chatId` (une seule chaîne), `deployWarnMinutes` défaut 30. | mono-destinataire |
| `schema.ts` 222-233, 480-482, 506-515, 518-521 | - | `config_grants`, `plans.endpoint_tier`, `usage_daily`, `alert_state` (table présente, non utilisée dans `apps/api/src`). | dépendance |

Dépendances en lecture (hors tranche, citées pour compréhension) : `routes/me.ts:168-230` (`loadEntitlement`, `endpointTier`), `routes/me.ts:248` (`ensureDeviceSlot`, note : « slot » = place d'appareil, sans rapport avec un créneau de nuit), `app.ts:237-238` (probation 30 min).

## 3. Ce qui sert le plan

- **Cycle de vie et idempotence** : `registerEndpoint` crée `pending` avec TTL borné (`endpoints.ts:213-217`, défaut `ENDPOINT_DEFAULT_TTL` = 16 200 s, `config.ts:177`) ; même clé = même ligne, même expiration (`endpoints.ts:198-210`, `revive` `endpoints.ts:349-427`) ; clé expirée = 409 (`endpoints.ts:365-367`). C'est le socle des nœuds éphémères de nuit.
- **Heartbeat sans effet sur la révision ni l'échéance** (`endpoints.ts:466-484`), conforme à `endpoint-lifecycle.md`.
- **Drain avant expiration** : `sweepEndpoints` (`endpoints.ts:528-555`) et filtre de lecture `servedEndpoints` (`endpoints.ts:499-518`), piloté par `ENDPOINT_DRAIN_LEAD` = 900 s (`config.ts:179`). Réutilisable tel quel pour les nœuds de nuit.
- **Balayage 60 s** : `server.ts:19` (`SWEEP_INTERVAL_MS`), `server.ts:77-79` (`setInterval`, `unref`). Même tick pour le rappel (`server.ts:51`).
- **Scrub Telegram** : `telegram.ts:96-106` (VLESS, UUID, Bearer masqués), file d'attente `telegram.ts:120-175`, timeout `telegram.ts:93`, limite de taille `telegram.ts:94`. À garder.
- **Purge** : `maintenance.ts:40-64`, bornée par `now()` en base. Le « bundles » purgé est le cache par appareil (`maintenance.ts:41`).
- **URI VLESS** : `vless.ts:24-45` ; `hostHeader` gère le domain fronting (`vless.ts:34-35`). Réutilisable pour le client 3x-ui (même format, autre hôte).
- **Télémétrie** : schéma strict, `reported_at = now()` (`telemetry.ts:155-160`), `day` borné à ±1 jour (`telemetry.ts:83-97`), GREATEST monotone (`telemetry.ts:129-136`), identité du corps refusée (`telemetry.ts:44-71`). Base correcte pour la lecture de consommation par appareil.
- **Grants par appareil** : table `config_grants` avec index unique `(device_id, endpoint_id)` (`schema.ts:222-233`, `schema.ts:533`) et `allocateGrant` (`bundle.ts:135-174`). C'est le bon mécanisme pour rattacher un UUID à un appareil, y compris un client 3x-ui.

## 4. Écarts avec le plan

Numérotation = points du brief (`audit-brief.md`).

**Point 4 (forfaits, 3x-ui, nuit)**
- Aucun client 3x-ui n'est créé ni lu côté API. Seul trace : commentaire `routes/catalog.ts:45` (`paid-gcp` = « limité (3x-ui, quota) »). Aucune table de quota. Aucune route d'activation au paiement. `grep 3x-ui` dans `apps/api/src` ne renvoie que ce commentaire.
- Aucune fenêtre de validité : `bundleExpiry` (`bundle.ts:105-110`) ne connaît que `subscriptionEndsAt` et l'expiration des nœuds. `plans` n'a que `endpoint_tier` (`schema.ts:480-482`). Les plages 20h-24h / 24h-4h / 20h-4h n'existent nulle part.
- Pas de notion de créneau. `endpoints` (`endpoints.ts:23-55`) n'a ni `slot_id`, ni `deployer`, ni `night_window`. Les mots « créneau », « nuit », « minuit » ne figurent pas dans `apps/api/src` (grep négatif).
- **Conflit de règle** : `bundle.ts:22-23` et `endpoints.ts:12-16` imposent un seul tier par bundle (D45). Le forfait « limité + nuit » exige paid-gcp le jour et free-labs la nuit dans le même bundle. Décision à trancher avant implémentation (voir §5).
- Incohérence de durée : `config.ts:172-173` commente « Cloud Run vit 4 h », `config.ts:177` fixe 16 200 s (4 h 30), et `telegram.ts:200` affiche « 4 h 30 ». Le brief dit 4 h.

**Point 6 (Telegram)**
- Un seul destinataire : `config.ts:148` (`chatId` string), `telegram.ts:131` (`chat_id: env.telegram.chatId`). Aucune liste.
- Aucun message de test : aucun appel à `notify` hors `poolWatch.ts:3` et `server.ts:51`. Pas de route admin de test.
- Planning actuel : `poolWatch.ts:61-64`, rappel quand `minutesLeft <= deployWarnMinutes`, défaut **30 min** (`config.ts:150`), pas 15 min. Relance : `poolWatch.ts:14` `REPEAT_AFTER_MS = 15 min`, pas 5 min. Déclencheur : `setInterval` 60 s (`server.ts:77-79`), pas de créneau absolu.
- Pas de fuseau : aucune référence à Douala ou UTC+1 dans `poolWatch.ts` ni `telegram.ts`. Les heures de rappel (20 h et minuit locales) n'existent pas.
- Message `paymentReceived` défini (`telegram.ts:213-220`) mais jamais appelé : code mort, à brancher ou supprimer.

**Point 8 (réseau : noms génériques, ajout par VLESS)**
- Libellé nœud = `input.label ?? input.public_host` (`internal.ts:229`) : le nom est l'hôte, pas un nom générique. Le conteneur passe `ENDPOINT_LABEL` (`infra/endpoint/entrypoint.sh:60`, `:197`), vide par défaut (non vérifié : omis ou envoyé vide).
- Aucun générateur de nom aléatoire dans `apps/api/src` (grep `random|pick|shuffle` négatif hors UUID et chemin WS). Le seul aléa existant est `randomWsPath` (`vless.ts:70-72`) et `randomUUID` (`endpoints.ts:218`).
- Ajout d'un nœud par lien VLESS : aucun parseur côté API. `parseVlessUri` (`vless.ts:48-67`) est explicitement « test/tooling helper ». À réutiliser pour le pré-remplissage.

**Point 1 et 2 (admin, approbation)**
- `markReady` ne passe `active` que si `autoApprove` (`endpoints.ts:444`, `config.ts:169`, défaut = hors production). En production, un nœud reste `pending` et n'est jamais servi, sauf par une route admin (`admin.ts:1771` pose `status = 'active'`, hors tranche, non vérifié qui l'appelle).

**Point 5 (prix plancher)** : rien dans la tranche.

**Point 7 (dashboard, SSE)** : aucun `LISTEN/NOTIFY` dans la tranche. `alert_state` (`schema.ts:518-521`) n'est utilisé nulle part dans `apps/api/src` : utile pour l'anti-doublon Telegram multi-instances (voir §5).

**Point 9 (Android)** : rien dans la tranche (`bundle.ts:298-359` renvoie l'enveloppe ; le consommateur est hors tranche).

## 5. Structure de code proposée

Concrète, à valider par l'orchestrateur. Les conventions reprennent celles de `services/endpoints.ts` (fonctions `async` avec `Queryable`, erreurs via `fail.*`).

**Telegram (point 6)**
- `config.ts:148` : remplacer `chatId` par `chatIds: string[]` lu depuis `TELEGRAM_CHAT_IDS` (liste séparée par virgules). Garder `TELEGRAM_CHAT_ID` en repli.
- `services/telegram.ts:131` : `sendOnce(text, chatId)` ; `notify(text, { chatIds? })` boucle sur les destinataires dans la même file (`telegram.ts:158-171`). Respecter `QUEUE_GAP_MS` par message.
- `routes/admin.ts` (hors tranche) : `POST /v1/admin/telegram/test` (rôle owner) qui appelle `notify(testMessage())`. Ajouter `testMessage()` dans `telegram.ts` à côté de `noEndpoint()` (`telegram.ts:204`).
- Destinataires depuis la base (owners et rôle `reseau`) : table `telegram_recipients(user_id, chat_id, enabled)`. À trancher : env ou base.

**Créneaux de nuit (point 2)**
- Nouveau `services/deploySlots.ts` :
  - `export function slotsForDay(day: Date): Array<{ startsAt: Date; label: "20h" | "minuit" }>` : 20 h Douala = 19:00 UTC, minuit = 23:00 UTC (UTC+1 fixe, pas d'heure d'été au Cameroun, non vérifié).
  - `export async function checkDeploySlots(db, now, send)` : pour chaque créneau à `startsAt - 15 min <= now` et non déployé, rappel une fois ; après `startsAt`, relance toutes les 5 min tant que `status <> 'deployed'`.
- Table additive dans `schema.ts` (bloc `ALTER`/`CREATE IF NOT EXISTS` en bas, comme `schema.ts:480`) :
  `deploy_slots(id text PK, starts_at timestamptz UNIQUE, status text CHECK (status IN ('planned','reminded','deployed','missed')), deployer_user_id text NULL, endpoint_id text NULL REFERENCES endpoints(id), reminded_at timestamptz NULL, last_nag_at timestamptz NULL)`.
- `endpoints` : ajouter `slot_id text NULL REFERENCES deploy_slots(id)`. `registerEndpoint` (`endpoints.ts:57-73`) reçoit `slotId?: string` ; `RegisterEndpointInput` l'écrit dans l'INSERT (`endpoints.ts:224-250`).
- Anti-doublon multi-instance : utiliser `alert_state` (`schema.ts:518-521`) à la place de l'état en mémoire `poolWatch.ts:30`.

**Plages par abonnement (point 4)**
- Table `subscription_windows(subscription_id text, start_hour smallint, end_hour smallint, PRIMARY KEY (subscription_id, start_hour))`, valeurs possibles 20-24, 0-4, 20-4 (fenêtre de nuit en UTC+1, convertie en UTC côté requête).
- `endpoints.ts:499-518` : nouvelle fonction `servedForEntitlement(db, { tier, windows, now })`. Si le forfait est limité + nuit : renvoie les nœuds `paid-gcp` actifs le jour (quota), plus les nœuds `free-labs` `active` dont `slot` couvre `now`, à l'intérieur de la plage. Décision D45 à amender (un bundle à deux tiers) : **décision à prendre**.
- `bundle.ts:323` : remplacer `servedEndpoints(db, entitlement.endpointTier)` par la nouvelle fonction. `bundle.ts:105` (`bundleExpiry`) : plafonner aussi à la fin de la fenêtre courante, sinon le bundle survit à la plage. Changer l'ETag (`bundle.ts:90-96`) pour inclure la fenêtre.

**3x-ui (point 4)**
- `services/xuiClients.ts` :
  - `provisionXuiClient(db, { userId, deviceId, quotaBytes, validUntil }): Promise<{ identity: string; grantId: string }>` : crée une ligne `config_grants` (`schema.ts:222-233`) avec `endpoint_id` = un endpoint `paid-gcp` de type 3x-ui, `identity` = UUID neuf, et une ligne `xui_clients(grant_id PK, quota_bytes bigint, used_up bigint, used_down bigint, status 'active'|'exhausted'|'revoked', updated_at)`.
  - `readXuiTraffic(...)` : interroge l'API 3x-ui (non vérifié : endpoint et auth, voir `knowledge/10-infrastructure/aura-vps-3x-ui.md`) et met à jour `used_*` par GREATEST.
  - `enforceQuota(...)` : passe `status = 'exhausted'` et retire le client côté 3x-ui. Aucun code de révocation côté Xray n'existe dans la tranche.
- `routes/bundle.ts:298-359` : l'accès au client 3x-ui n'est servi que si `status = 'active'`.

**Consommation (point 5)**
- Garder `usage_daily` (`schema.ts:506-515`) pour l'appareil. Ajouter `endpoint_id text NULL` à la clé pour les totaux par nœud (option A de `traffic-stats.md`), ou table séparée `node_usage_counters(endpoint_id, day, bytes_up, bytes_down)`.
- Pour le 3x-ui : `usage_daily` (device) alimenté par `xui_clients.used_*` via `grant_id -> device_id`. Pas de nouvelle source à inventer.

**Hors-ligne (point 6 du plan = fichiers de secours)**
- `services/offlineBundles.ts:118` : appeler `loadEntitlement` pour le tier réel, pas `servedEndpoints(db, 12)` (tier libre par défaut, `endpoints.ts:503`).
- `offlineBundles.ts:123-124` : `endpointToConfig(row, identity)` avec l'identité de grant de l'appareil ; refuser (409) si l'identité n'est pas attribuée.
- `offlineBundles.ts:137` : `notAfter = min(now + ttl, subscriptionEndsAt)`.
- `offlineBundles.ts:106-111` : refuser l'émission si une précédente ligne `offline_bundles` du même appareil a `consumed_at` NULL et `not_after` futur (une seule enveloppe vivante par appareil).

## 6. Bugs et risques

1. **Repli sur le credential partagé** — `routes/bundle.ts:203-212`. Si `allocateGrant` renvoie `null` (pool de 200 épuisé), `endpointToConfig(row, null)` (`endpoints.ts:559`) sert `decryptSecret(row.credential)` : le credential partagé du nœud part à l'appareil. Scénario : pool plein → un appareil de plus reçoit un UUID non attribuable, et le revoke par grant ne le coupe pas. Commentaire `bundle.ts:131-133` dit le contraire (« plutôt que d'inventer »). Non conforme à D69.
2. **Un nœud `per_device` n'a pas de clients Xray par appareil** — `endpoints.ts:222` génère le pool et `internal.ts:254` le renvoie, mais `infra/endpoint/entrypoint.sh:303` ne écrit que `clients: [{id: $uuid, email: "shared"}]`. Grep `client_pool|per_device` dans `infra/endpoint` : négatif. Les grants sont donc sans effet côté Xray (à confirmer par l'auditeur infra).
3. **Recouvrement d'un nœud `down` sans probation** — `services/health.ts:152-154` : `successes >= 3` pose `healthy` sans regarder l'état courant. Le commentaire `health.ts:36` et `endpoints.ts:431` disent qu'un `down` ne revient que par probation (`app.ts:237-238`, 30 min). Scénario : trois succès télémétrie sur un nœud `down` dans les 10 min le remettent `healthy` avant la probation. Limité par le filtre `servedEndpoints` (`endpoints.ts:508-510`), mais les clients à config en cache peuvent encore rapporter.
4. **Rappel Telegram perdu** — `poolWatch.ts:55-56` et `:71-72` : `lastKey` et `lastAt` sont posés avant l'envoi. Un envoi échoué (`telegram.ts:154-175` renvoie `false`) n'est jamais retenté avant 15 min.
5. **Rappels dupliqués multi-instance** — `poolWatch.ts:30` et `server.ts:38` : état en mémoire par instance. Plusieurs instances Cloud Run envoient chacune le rappel (non vérifié : nombre d'instances en prod).
6. **Hors-ligne : credential partagé exposé** — `offlineBundles.ts:123-124` appelle `endpointToConfig(row)` sans identité. Le fichier contient le credential partagé du nœud, déchiffré à la lecture par l'appareil. La promesse « mort des UUID contenus » (`offlineBundles.ts:14-16`) est fausse pour un nœud `shared`.
7. **Hors-ligne : usage unique non appliqué** — `offlineBundles.ts:196-212` : `markConsumed` pose `consumed_at` mais aucun contrôle en lecture ni à l'émission. Le fichier reste utilisable jusqu'à `notAfter` (`offlineBundles.ts:137`, défaut `OFFLINE_BUNDLE_TTL_MINUTES` = 60, `config.ts:159`). Le serveur ne peut pas imposer ; la protection réelle dépend de l'app (hors tranche).
8. **Hors-ligne : droits non plafonnés et mauvais tier** — `offlineBundles.ts:137` (pas de `subscriptionEndsAt`) et `offlineBundles.ts:118` (`servedEndpoints(db, 12)` = free-labs). Un abonné `paid-gcp` reçoit des nœuds gratuits, et un fichier peut survivre à la fin des droits de 24 h (`offlineBundles.ts:136`).
9. **Compteurs Xray cumulés pris comme totaux du jour** — `internal.ts:188-189` dit que les compteurs sont cumulés depuis le démarrage du process. `internal.ts:197-212` les écrit sous `day = today` avec GREATEST. Après un redémarrage du nœud, les compteurs repartent de zéro et le GREATEST garde l'ancien max : la consommation nouvelle est sous-comptée jusqu'à dépasser l'ancien total. Pas de surcompte. Le partage `DISTINCT ON` (`internal.ts:198`) est sans effet tant qu'il y a un grant par (appareil, nœud) (`schema.ts:232`).
10. **Doc obsolète** — `knowledge/10-infrastructure/traffic-stats.md` dit « le conteneur ne pousse aucune donnée » et « rien à implémenter » (D39). Le code accepte déjà `usage` sur heartbeat (`internal.ts:147`, `internal.ts:276-278`). La doc est fausse ; le conteneur ne l'envoie pas encore (`entrypoint.sh` sans `stats`, grep négatif).
11. **Doublon de logique de bump** — `services/health.ts:60-65` recopie `bumpPoolRevision` d'`endpoints.ts:161-166` (commentaire `health.ts:17-21` assume la copie). Risque de divergence si le SQL change.
12. **Code mort** — `telegram.ts:213-220` (`paymentReceived`) : non appelé.
13. **Plafond de 12 nœuds par bundle** — `endpoints.ts:503` (`limit = 12`) appliqué à `bundle.ts:323`. Avec des nœuds de nuit en plus, la limite se joue à la fois sur le tier et la fenêtre : à décider.

## 7. Dépendances hors tranche

- `routes/me.ts:168-230` : `loadEntitlement` lit `plans.endpoint_tier` (`schema.ts:480-482`) ; à vérifier qu'un forfait peut porter un second tier ou une fenêtre.
- `app.ts:237-238` : probation 30 min (`health = 'unknown'` si `down_since` > 30 min). Confirme le commentaire `health.ts:36` mais n'empêche pas le raccourci décrit en §6.3.
- `routes/admin.ts:1734-1771` : upsert manuel d'endpoint avec `status = 'active'`. C'est peut-être la seule voie d'approbation en production : à confirmer.
- `routes/admin.ts:1226-1232` : seul appelant d'`issueOfflineBundle`.
- `routes/offline.ts:64-69` : appelant de `markConsumed`.
- `routes/catalog.ts:45` : sémantique des tiers (`free-labs` illimité Cloud Run, `paid-gcp` limité 3x-ui).
- `infra/endpoint/entrypoint.sh:60, 197, 303` : libellé, création de client, absence de per_device et de stats (audit-infra-endpoint).
- `lib/crypto.ts` : `sealForDevice` et son contexte (AAD) pour l'appareil et la révision (non vérifié dans cet audit).
- `schema.ts:506-515` : contraintes exactes de `usage_daily` (PRIMARY KEY vu, `source` contrôlé).
- Android `OfflineBundle.kt` : contrat du fichier (cité par `offlineBundles.ts:4-6`), non lu.
- Android `SingBoxConfig.kt:185, 383` : construction des nœuds depuis le bundle, non lu en détail.

## 8. Non vérifié

- Le fuseau : aucun code de créneau n'existe, donc UTC+1 fixe (Cameroun, pas d'heure d'été) est une hypothèse (non vérifié).
- Nombre d'instances Cloud Run en production (impact du §6.5).
- Qui appelle `markReady` autrement que par `autoApprove`, et si une route admin approuve les nœuds `pending` (`admin.ts:1771` vu, flux complet non suivi).
- Présence des contraintes d'unicité sur `config_grants` (`schema.ts:232, 533` vus ; `(endpoint_id, identity)` non vérifié : un conflit ferait échouer `allocateGrant` sans gestion d'erreur).
- Protocole 3x-ui (API, auth, stats) : voir `knowledge/10-infrastructure/aura-vps-3x-ui.md`, non lu.
- `sealForDevice` (AAD), `OfflineBundle.kt` (usage unique côté app), et le contenu réel de `ENDPOINT_LABEL` envoyé par le conteneur.
- Aucune exécution : tous les constats sont des lectures de code, aucun test lancé.

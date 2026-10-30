# Audit API — cycle de vie d'un nœud (santé, statut, verdicts)

Statut : **relu** (lecture seule, aucune exécution). Toute affirmation porte
`fichier:ligne` dans `apps/api/src` sauf mention contraire. Ce qui dépend d'un
run réel est marqué `(non vérifié)`.

## Verdict

La mécanique D47/D50/D63/D145 est **conforme à ce qui a été décidé** : plus
aucune désactivation automatique par le temps, le verdict `down` vient des
clients, la probation dure 30 min, le heartbeat ne lève jamais un `down`.

Mais le système produit **exactement les trois symptômes** rapportés par le
propriétaire, pour des raisons structurelles, pas des bugs ponctuels :

1. **« Non mesuré » est l'état normal et quasi permanent d'un nœud.** Le
   conteneur n'envoie jamais `healthy` ni `latency_ms`
   (`infra/endpoint/README.md:71-74`) et il n'existe aucune sonde serveur
   (D51). Seuls les clients écrivent `healthy`. Avec peu d'utilisateurs actifs,
   un nœud reste `unknown` (« Non mesuré », `status-badge.tsx:27`) pour
   toujours.
2. **« Hors service » puis « en service » sans raison visible = le cycle
   témoin différentiel + probation.** Un **seul** appareil peut condamner un
   nœud (`health.ts:81-83`, chemin « witness ») : 2 échecs sur X + 1 succès
   ailleurs dans la fenêtre de 10 min → `down`. 30 min plus tard, le hook de
   probation le remet `unknown` **sans aucun succès**
   (`app.ts:256-259`) → il repart en rotation → re-`down`. Sur une base
   d'utilisateurs minuscule, un seul téléphone au comportement bruité (ex.
   P0 #1 Android : l'API Clash locale bloquée fait échouer **toutes** les
   sondes) fait osciller les nœuds en boucle.
3. **« Aucun test n'est possible » est exact.** Il n'existe **aucune** route
   serveur qui sonde un nœud. Les boutons « Tester » du dashboard testent la
   connexion au panneau 3x-ui (`adminXui.ts:222`) et Telegram
   (`adminNight.ts:231`) — jamais le tunnel VLESS. Les boutons de santé
   (`force-health-button.tsx:24`, `endpoint-drawer.tsx:23-28`) écrivent une
   **opinion** (`POST /endpoints/:id/health`), pas une mesure.

## Machine à états complète

### `endpoints.status` (`pending | active | draining | expired | failed`, endpoints.ts:9, schema.ts:200-201)

| Transition | Auteur | Déclencheur | Preuve |
|---|---|---|---|
| → `pending` (création) | `registerEndpoint` | conteneur : `POST /v1/internal/endpoints/register` | endpoints.ts:234, internal.ts:287 |
| → `active` (contourné) | insertion manuelle | dashboard : `POST /v1/admin/endpoints/manual` | admin.ts:2400 |
| `pending` → `active` | `markReady` | conteneur : `POST /v1/internal/endpoints/ready`, si `ENDPOINT_AUTO_APPROVE` (true en prod, D46) | endpoints.ts:448-456, config.ts:175 |
| → `draining` | admin only | `POST /v1/admin/endpoints/:id/status` | admin.ts:2555-2590 |
| → `expired` | admin only (depuis D145) ; aussi re-publication manuelle qui retire les anciennes variantes du groupe ; aussi `syncFrontSiblings` pour les frontaux retirés | `POST /endpoints/:id/status`, `POST /endpoints/manual`, `register` avec `front` | admin.ts:2555, admin.ts:2429-2433, endpoints.ts:345-349 |
| suppression | admin | `DELETE /v1/admin/endpoints/:id`, `POST /endpoints/purge-expired` (supprime `status='expired'` **OU** `expires_at < now()`) | admin.ts:2595, admin.ts:2523-2533 |
| `expired` bloque | `revive`/`markReady` refusent | re-register du même `deployment_key` | endpoints.ts:369-371, 446 |

`failed` : **jamais écrit** (aucun `UPDATE ... 'failed'` trouvé — grep). État
mort de l'énumération.

**Aucune transition automatique de statut ne subsiste** : `sweepEndpoints`
supprimé (D145), le hook de maintenance n'écrit plus `active → expired`
(`app.ts:261-263`), `expires_at` ne filtre plus `servedEndpoints`
(endpoints.ts:510-521).

### `endpoints.health` (`unknown | healthy | degraded | down`, endpoints.ts:10, schema.ts:202)

| Transition | Auteur | Déclencheur | Preuve |
|---|---|---|---|
| → `unknown` (création) | `registerEndpoint` / insertion manuelle | register, ajout manuel | endpoints.ts:234, admin.ts:2400 |
| `down` → `unknown` (probation) | hook maintenance paresseux | **30 min écoulées, aucun succès requis**, au plus 1×/60 s/instance, à la première requête entrante | app.ts:249-260 |
| `down` → `unknown` (probation, chemin verdict) | `decideHealth` | quorum 3 succès **et** probation écoulée | health.ts:73-78 |
| → `healthy` | heartbeat du nœud | `healthy:true` au heartbeat, **uniquement si pas déjà `down`** (D47) | endpoints.ts:481, internal.ts:346 |
| → `healthy` | verdict clients | ≥ 3 appareils distincts `ok` dans 10 min | health.ts:37, 73-79 ; telemetry.ts:178 |
| → `healthy` | admin | `POST /v1/admin/endpoints/:id/health` | admin.ts:2464-2517 |
| → `degraded` | heartbeat | `healthy:false` — **jamais envoyé par le conteneur** (README:71-74) → inatteignable en pratique | internal.ts:346, endpoints.ts:481 |
| → `down` | verdict clients, quorum | ≥ 3 appareils distincts en échec dans 10 min | health.ts:34, 81-83 |
| → `down` | verdict clients, témoin (D63) | **1 appareil** : 2 échecs sur X + ≥ 1 succès sur un autre nœud | health.ts:52, 81-83, 177-183 ; telemetry.ts:184-186 |
| → `down` | admin | `POST /endpoints/:id/health` | admin.ts:2464-2517 |

Champs annexes : `down_since` posé à l'entrée `down`, effacé à la sortie
(health.ts:126, admin.ts:2482, app.ts:258) ; `down_reason` ∈ `reports:<n>`,
`witness`, `manual` (health.ts:82, admin.ts:2474) ; `last_seen_at` par
register/revive/ready/heartbeat uniquement (endpoints.ts:396, 453, 479) ;
`health_checked_at` par heartbeat avec opinion et par l'admin (endpoints.ts:482,
admin.ts:2484). Toute transition de santé **bumpe** `pool_state.revision`
(health.ts:134, admin.ts:2491) sauf le hook de probation (app.ts:256-259, pas de
bump — compensé par l'ETag qui hache aussi le jeu servi, bundle.ts:102-110, 430).

### Liste servie

`servedEndpoints` : `status='active' AND health<>'down'` (+ tier, D141),
`expires_at` non filtré, `unknown` servi après `healthy`
(endpoints.ts:510-521). Un nœud `pending` n'est **jamais** servi.

## « Non mesuré » (Q2)

C'est la colonne `health='unknown'` : défaut du schéma (schema.ts:202), valeur
posée à l'insertion (endpoints.ts:234, admin.ts:2400), libellé du dashboard
(`apps/dashboard/src/components/common/status-badge.tsx:27`). Rien ne
l'invente côté front. Il n'est **pas** un verdict d'absence : un nœud `unknown`
est servi normalement, juste classé après `healthy` (endpoints.ts:515).

## D47/D50 — seuils et sanctions (Q3)

- Fenêtre : **10 min** (health.ts:31), sur `config_reports` (schema.ts:489-498).
- Sanction `down` : **3 appareils distincts** en échec (health.ts:34) **ou**
  témoin différentiel : 2 échecs consécutifs du même appareil sur le nœud +
  ≥ 1 succès du même appareil sur un autre nœud dans la fenêtre
  (health.ts:52, 177-183 ; D63).
- **Un seul appareil PEUT faire basculer un nœud** — par le chemin témoin, et
  c'est voulu (« au lancement, l'unique appareil doit pouvoir retirer un nœud
  mort », health.ts:222-223). Le quorum de 3, lui, exige 3 appareils distincts
  (`count(DISTINCT device_id)`, health.ts:184-185).
- Levée : probation **30 min** (health.ts:45, app.ts:259), puis quorum de
  3 succès pour `healthy` (health.ts:37, 73-79) — ou le hook qui remet
  `unknown` à 30 min sans succès (voir Défaut #3).
- Le heartbeat ne lève **jamais** un `down` (D47, endpoints.ts:481).

## D145 — ce qui bascule encore « hors service » (Q4)

Aujourd'hui, uniquement :

1. les **verdicts clients** (quorum ou témoin) via `POST /v1/me/telemetry`
   (telemetry.ts:174-186) ;
2. l'**action admin** `POST /endpoints/:id/health` ou `/:id/status` ;
3. la **purge/suppression** manuelle (qui supprime la ligne, ne la désactive
   pas).

Ni le heartbeat absent, ni l'expiration, ni aucun cron. `checkPoolExpiry`
(services/poolWatch.ts:238-305) ne fait que des rappels Telegram de créneaux de
nuit et compte les actifs ; `server.ts` ne purge que bundles/nonces/sessions
(services/maintenance.ts:41-55) — `config_reports` n'est **jamais purgée**
(croissance non bornée, P2).

## Nœud fraîchement déployé (Q5)

1. `register` → `status='pending'`, `health='unknown'` (endpoints.ts:234).
2. `ready` → `active` si auto-approbation (D46, config.ts:175), sinon il reste
   `pending` et n'est **jamais servi** (endpoints.ts:512).
3. Premier mesureur : **les clients, et eux seuls** (D51, health.ts:7-8). Le
   conteneur ne déclare volontairement aucune santé (README:71-74).
4. Aucun client ne le teste → il reste `unknown` (« Non mesuré ») **indéfiniment**,
   tout en étant servi.
5. **Non**, il ne peut pas passer `down` sans un seul rapport : le verdict lit
   exclusivement `config_reports` (health.ts:171-188). En revanche **un seul
   appareil suffit** (chemin témoin) dès qu'il échoue 2× sur le nœud et réussit
   ailleurs — sans que le nœud soit réellement mort. Et il peut **disparaître**
   de la base par `purge-expired` dès que son TTL est passé (4 h par défaut en
   ajout manuel, admin.ts:2364 ; DELETE sur `expires_at < now()`,
   admin.ts:2531-2533) même s'il est actif et servi — voir Défaut #2.

## Test à la demande (Q6)

Aucune route serveur ne sonde un nœud VLESS. L'API n'appelle jamais les nœuds
(D39). Inventaire des « Tester » réels :

- `POST /v1/admin/xui-servers/:serverId/test` → connexion au **panneau 3x-ui**
  (adminXui.ts:222-230, `testPanel`) ;
- `POST /v1/admin/telegram/test` (adminNight.ts:231).

Le dashboard n'a pas de bouton « Tester ce nœud » : `ForceHealthButton`
(`force-health-button.tsx:16-24`) et le tiroir (`endpoint-drawer.tsx:23-28`)
écrivent un verdict à la main via `setEndpointHealthAction`
(`network.action.ts:15-24` → `POST /endpoints/:id/health`). D129 avait demandé
un bouton « Tester » + « Activer » : « Activer » existe désormais (route
status, admin.ts:2555) ; le test, lui, n'a jamais été créé.

## Télémétrie → verdict (Q7)

`POST /v1/me/telemetry` (telemetry.ts:110-189) : session obligatoire
(`requireSession`, bearer + preuve d'appareil ; `device_id` jamais pris dans le
corps, schéma `.strict()` telemetry.ts:63-72) ; `reported_at = now()` serveur
(telemetry.ts:165-169) ; lot ≤ 20 rapports, corps ≤ 8 Ko (telemetry.ts:34, 116) ;
tout `configId` inconnu refuse le lot entier (telemetry.ts:157-160). Chaque
rapport insère une ligne `config_reports`, puis `reconcileHealth` par nœud cité
(telemetry.ts:174-179) et `reconcileDeviceWitnesses` si le lot contient un
succès (telemetry.ts:184-186).

**Pollution : oui, possible par construction.**

- `ok` est une **déclaration du client** ; le serveur ne peut pas distinguer
  une sonde TCP hors tunnel, une sonde à travers le tunnel, ou un téléphone
  cassé d'un nœud mort. Aucun champ ne décrit *comment* la mesure a été faite
  (reportSchema, telemetry.ts:54-61).
- Un appareil dont la sonde échoue systématiquement (Android, P0 #1 de
  `android-audit-2026-10-29` : API Clash loopback bloquée → **toutes** les
  sondes échouent) ne crée pas de témoin (aucun succès), mais 3 tels appareils
  condamnent chaque nœud servi par quorum. Un appareil *partiellement* cassé
  (échoue sur X, réussit sur Y — le cas normal de la bascule) devient témoin et
  down X après 2 échecs, seul (health.ts:177-183).
- `latency_ms` déclarée par le client ordonne le pool (endpoints.ts:516) —
  même confiance aveugle.
- Un appareil qui sonde en TCP direct **hors tunnel** et réussit produit des
  succès qui (a) font monter le quorum `healthy` et (b) servent de **témoin**
  contre d'autres nœuds : la santé d'un nœud peut donc dépendre d'une mesure
  qui n'a jamais traversé le tunnel.

## Remise « en service » (Q8)

1. **Probation expirée** : hook → `unknown` après 30 min, sans succès requis
   (app.ts:256-259) — exécuté paresseusement à la première requête après 60 s
   (app.ts:248-253). C'est la remise en service dominante.
2. **Quorum de succès** : 3 appareils distincts OK → `healthy` (health.ts:73-79) ;
   pour un nœud `down`, d'abord `unknown` (probation), puis un second quorum
   → `healthy`.
3. **Heartbeat `healthy:true`** : possible mais seulement si pas `down`
   (endpoints.ts:481) — et le conteneur ne l'envoie pas (README:71-74).
4. **Action admin** : `POST /endpoints/:id/health` → `healthy` (admin.ts:2464).
5. **Ré-ajout manuel** du même groupe : `status='active'`, `health='unknown'`,
   `down_since/down_reason` effacés (admin.ts:2401-2405).

## Leviers du propriétaire (Q9)

Toutes ces routes exigent `requireAdmin` + `authorize(endpoint.write)`
(`endpoint.read` pour le GET) :

| Route | Effet | Preuve |
|---|---|---|
| `GET /v1/admin/pool` | lecture (200 dernières lignes) | admin.ts:2275-2287 |
| `POST /v1/admin/endpoints/:id/health` | forcer `down`/`healthy` (**pas** `unknown`) + raison | admin.ts:2464-2517, 202-207 |
| `POST /v1/admin/endpoints/:id/status` | `active`/`draining`/`expired` | admin.ts:2555-2590 |
| `DELETE /v1/admin/endpoints/:id` | suppression | admin.ts:2595+ |
| `POST /v1/admin/endpoints/purge-expired` | purge (`expired` **ou** TTL passé) | admin.ts:2523-2550 |
| `POST /v1/admin/endpoints/manual` | ajout/republication (reset santé) | admin.ts:2379-2462 |

**Pas de re-test possible** : aucun forçage de remesure, aucune route « sonde ».
La seule façon de « tester » est d'attendre un rapport client ou de poser une
opinion à la main.

## Défauts

| # | Sévérité | Défaut | Preuve | Conséquence |
|---|---|---|---|---|
| 1 | **P1** | Aucune mesure serveur ni déclaration du conteneur : `unknown` permanent tant qu'aucun client ne rapporte | infra/endpoint/README.md:71-74 ; health.ts:7-8 (D51) ; status-badge.tsx:27 | « Non mesuré » affiché en permanence ; le propriétaire n'a aucun signal de vérité sur un nœud fraîchement déployé |
| 2 | **P1** | `purge-expired` supprime les nœuds **actifs** dont le TTL est passé, alors que D145 fait de `expires_at` une date d'affichage | admin.ts:2531-2533 vs endpoints.ts:124-130 ; TTL 4 h par défaut (admin.ts:2364) | Un clic « Purger » fait disparaître des nœuds vivants servis aux clients — bascule perçue « sans raison » |
| 3 | **P1** | Probation implémentée deux fois avec des sémantiques différentes : le hook remet `unknown` à 30 min **sans aucun succès**, `decideHealth` exige quorum + probation | app.ts:256-259 vs health.ts:73-78 | Un nœud réellement mort réintègre le pool servi toutes les 30 min → oscillation en service / hors service ; boucle apparente avec le défaut #4 |
| 4 | **P1** | Le témoin différentiel (D63) donne à **un seul appareil** le pouvoir de `down` un nœud ; aucun filtrage de la qualité du rapporteur (sonde cassée, TCP hors tunnel, tunnel cassé) | health.ts:52, 177-183 ; telemetry.ts:54-61 | Sur une petite base d'utilisateurs, un téléphone bruité fait basculer les nœuds « hors service » de façon incompréhensible ; combiné à #3 : cycle down→unknown→down |
| 5 | P2 | Hook de probation sans `bumpPoolRevision` (les autres transitions bumpent, D48) | app.ts:256-259 vs health.ts:134 | Aténué : l'ETag hache aussi le jeu servi (bundle.ts:102-110, 430). Risque résiduel si du code ne dépend que de `poolRevision` |
| 6 | P2 | États `degraded` (health) et `failed` (status) inatteignables : le conteneur n'envoie jamais `healthy:false`, aucun code n'écrit `'failed'` | infra/endpoint/README.md:71-74 ; internal.ts:346 ; grep `'failed'` sur endpoints : néant | Vocabulaire affiché (status-badge.tsx:26) qui ne se produira jamais ; fausse impression de granularité |
| 7 | P2 | `config_reports` jamais purgée (maintenance.ts:41-55 ne touche que bundles/nonces/challenges/sessions) | maintenance.ts:41-55 ; index schema.ts:497-498 | Croissance non bornée ; les fenêtres de verdict restent correctes (10 min) mais la table grossit indéfiniment |
| 8 | P2 | `POST /endpoints/:id/health` n'accepte que `down`/`healthy` : impossible de remettre un nœud « Non mesuré » à la main sans repasser par la ré-ajout manuel | admin.ts:202-207 | Levier admin incomplet |

## Vérifié vs incertain

**Vérifié (lecture du code, ligne citée)** : toutes les transitions ci-dessus,
les seuils, l'absence de route de test serveur, l'absence de purge de
`config_reports`, le comportement de `purge-expired`, le fait que le conteneur
n'envoie pas `healthy` (README + entrypoint.sh:405-425 n'envoie que
`KEY_PAYLOAD`).

**Non vérifié (dépend d'un run)** : le comportement réel en prod (fréquence des
verdicts `witness`, contenu réel de `config_reports`, état actuel des 13 lignes
d'`endpoints`) ; l'effet observé du P0 #1 Android sur les rapports ; le
déploiement effectif de `ENDPOINT_AUTO_APPROVE=true` sur `vpn-api` (D46 le
décide, config.ts:175 le lit).

## Questions ouvertes

1. Faut-il une route serveur « tester ce nœud » (mesure réelle TCP/WS depuis
   l'API) ou une sonde dédiée, pour sortir de l'impasse « Non mesuré » ?
2. Le témoin différentiel doit-il exiger plus qu'un appareil quand le pool
   d'appareils actifs est connu (ex. ≥ 2 témoins ou pondération par ancienneté) ?
3. `purge-expired` : faut-il restreindre le DELETE à `status='expired'`
   uniquement, conformément à D145 ?
4. Le hook de probation doit-il exiger au moins un succès avant de remettre un
   nœud dans le pool servi ?

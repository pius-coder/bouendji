---
id: reseau-audit-2026-10-30
title: Audit du flux réseau — dashboard, API, app (2026-10-30)
status: verified
updated: 2026-10-30
---

# Audit du flux réseau — dashboard, API, app

Synthèse des trois audits (agents `audit-reseau-api`, `audit-reseau-dashboard`,
`audit-reseau-app`). Statut **vérifié par lecture du code** (chaque affirmation
porte `fichier:ligne`) ; le comportement runtime en production reste
`(non vérifié)`.

## Verdict en une phrase

Le système fait exactement ce qui est codé, mais il n'a **aucun moyen de
mesurer un nœud par lui-même** : la santé dépend à 100 % de déclarations de
téléphones non filtrées, la probation réintègre sans preuve, et le dashboard
cache les raisons. D'où « non mesuré » permanent, bascules inexpliquées et
impression de ne rien pouvoir gérer.

## 1. Pourquoi « non mesuré » à chaque déploiement

- `health` vaut `unknown` à la création (`endpoints.ts:234`, `admin.ts:2400`) ;
  c'est le libellé « Non mesuré » (`status-badge.tsx:27`).
- **Rien côté serveur ne mesure un nœud** : D51 interdit toute sonde 24/7, et le
  conteneur d'endpoint n'envoie **jamais** `healthy` ni `latency_ms`
  (`infra/endpoint/README.md:71-74`).
- Seuls les clients écrivent la santé, via `POST /v1/me/telemetry`
  (`telemetry.ts:174-186`). Sans 3 appareils distincts en succès dans 10 min,
  le nœud reste `unknown` **indéfiniment** — tout en étant servi
  (`endpoints.ts:515`).
- « Non mesuré » n'est donc **pas une panne** : c'est « personne ne l'a encore
  noté ».

## 2. Pourquoi « hors service » puis « en service » sans raison

### Les deux chemins qui écrivent `down`

| Chemin | Condition | Preuve |
|---|---|---|
| Quorum | ≥ 3 appareils **distincts** en échec dans 10 min | `health.ts:34,81-83,185` |
| Témoin différentiel (D63) | **1 seul appareil** : ≥ 2 échecs sur le nœud + ≥ 1 succès sur un autre nœud dans 10 min | `health.ts:52,177-183,228-250` |

Le rapport client est `{configId, ok, latencyMs}` **sans dire comment la mesure
a été faite** (`telemetry.ts:54-61`). Le serveur ne peut pas distinguer :

- un nœud réellement mort ;
- un opérateur mobile qui bloque l'IP du nœud ;
- un téléphone dont l'API Clash locale est cassée (bug cleartext des anciennes
  versions) — dans ce cas **toutes** les sondes échouent et **tous** les nœuds
  sont rapportés en échec (`VpnTunnelService.kt:573-574`).

Avec 3 appareils dans cet état, **tous les nœuds sains passent `down`**.

### Pourquoi ça revient tout seul

- Un hook de maintenance remet `down` → `unknown` après **30 min, sans exiger
  aucun succès** (`app.ts:256-259`).
- Le nœud redevient donc servi (`endpoints.ts:514`), puis un nouveau verdict
  `down` peut tomber dès qu'il est `unknown` → **oscillation**.
- `decideHealth` exige pourtant quorum + probation (`health.ts:73-78`) : il y a
  **deux implémentations de la probation** avec des sémantiques différentes.

### Ce qui aggrave

- Un nœud `down` sort des bundles (`endpoints.ts:514`) ; seuls les appareils qui
  l'ont encore dans leur coffre peuvent le sonder et le réhabiliter.
- Le heartbeat du conteneur ne peut **jamais** lever un `down` (D47,
  `endpoints.ts:481`).
- `purge-expired` supprime aussi les nœuds **actifs** dont `expires_at` est
  passé (`admin.ts:2531-2533`), alors que D145 fait du TTL une simple date
  d'affichage : un clic peut faire disparaître des nœuds vivants.

## 3. Pourquoi « aucun test n'est possible »

**C'est littéralement vrai** :

- aucune route `POST /v1/admin/endpoints/:id/test` n'existe (grep exhaustif) ;
- les seuls « Tester » du dashboard visent le **panneau 3x-ui**
  (`adminXui.ts:222`) et **Telegram** (`adminNight.ts:231`), jamais le tunnel ;
- les boutons de santé (`endpoint-drawer.tsx:23-28`,
  `force-health-button.tsx:24`) écrivent une **opinion**
  (`POST /endpoints/:id/health`), pas une mesure.

## 4. Pourquoi « je ne peux rien gérer »

- `down_reason` existe dans le payload (`admin.ts:829`,
  `network.schema.ts:20`) mais **n'est pas affiché** dans le tiroir Réseau
  (`endpoint-drawer.tsx:203-207`).
- Le journal d'audit réseau est écrit avec `community_id = null`
  (`admin.ts:572`) alors que la page Journal filtre par `community_id`
  (`audit-table.tsx:44`) → **invisible**.
- « Rétablir en service » n'existe que si `health='down'`
  (`endpoint-drawer.tsx:101-111`) ; depuis `unknown`/`degraded`, aucune action.
- La page est un **instantané** : aucun polling, aucune date de fraîcheur.
- Les créneaux de nuit (`NightSlotsClient`) ne sont rendus par aucune page.
- « Purger » peut supprimer des nœuds actifs (voir §2).

## 5. Corrections proposées (par impact)

| # | Correction | Effet |
|---|---|---|
| 1 | Route `POST /v1/admin/endpoints/:id/test` : connexion TCP/TLS réelle vers `host:port`, résultat + latence | Fin du « aucun test possible » |
| 2 | Sonde serveur **unique** au `ready` d'un nouveau nœud (pas de cron, D51 respecté) | Fin du « non mesuré » permanent au déploiement |
| 3 | Probation : supprimer le hook qui réintègre sans preuve ; exiger ≥ 1 succès (ou test admin) | Fin de l'oscillation |
| 4 | Verdicts : ignorer les appareils dont **tous** les nœuds échouent dans la fenêtre ; l'app ne rapporte un échec que si son chemin de mesure fonctionne | Fin des condamnations en série |
| 5 | Dashboard : afficher `down_reason` traduit + probation restante ; « Rétablir » depuis `unknown` ; purge limitée à `status='expired'` ; journal réseau visible ; fraîcheur/polling | Reprise du contrôle |
| 6 | App : file de rapports priorisée et non silencieuse ; télémétrie : `configId` inconnu ignoré au lieu de perdre le lot | Moins de trous de mesure |

## 6. Livré le 2026-10-30 (D147, lot `eb1a092`, déployé en prod)

- **#1 fait** : `POST /v1/admin/endpoints/:id/test` (sonde TCP à la demande,
  `admin.ts`) — le bouton dashboard reste à faire.
- **#2 fait (variante)** : sonde serveur **périodique toutes les 5 min** + au
  démarrage (`probe.ts`, migration `102_endpoint_probe`), actifs seulement.
  Décision explicite du propriétaire : la périodicité remplace la sonde unique
  au `ready` ; D51 (pas de cron lourd) reste respecté (une simple boucle TCP).
- **#3/#4 intégrés au verdict combiné** (`health.ts`) : verdict serveur
  prioritaire si sonde < 15 min, sinon téléphones (fenêtre 10 min) ; retour
  signalé par alerte Telegram raison `probe:ok`.
- **Aucun retrait automatique** : `servedEndpoints`/`nightRowsFor` servent
  aussi les nœuds `down` (ordre `healthy`, `unknown`, `degraded`, `down`) ;
  purge manuelle limitée à `status='expired'`.
- **Vérifié en prod** : migration 102 appliquée, colonnes `probe_*` présentes,
  sonde de démarrage 07:46:52 UTC : 13/13 actifs OK (82–93 ms) ; `readyz` → 401,
  `openapi.json` → 200 ; 358/358 tests API.

- **Reste à faire** (§5 #5 côté dashboard uniquement) : ~~`down_reason` traduit +
  résultat sonde/latence~~ **fait (2026-10-30, commit `4beceff`)** — le drawer
  Réseau affiche la sonde (statut, latence, date, erreur) avec bouton
  « Tester ce nœud » (`POST /endpoints/:id/test`), la raison traduite
  (`downReasonLabel`, miroir de `healthReasonLabel`), « Rétablir en service »
  depuis `unknown`/`degraded` (plus seulement `down`), latence = sonde en
  priorité dans le tableau, copie de purge corrigée (« seuls les statut
  Expiré »). Vérifié : tsc silencieux, **150/150 tests dashboard**, `next build`
  exit 0. La fraîcheur/polling de la page reste à faire.
  §5 #6 (app : file de rapports) non traité.
  résultat sonde/latence, bouton « Tester ce nœud », restauration depuis
  `unknown`, purge limitée, fraîcheur/polling. §5 #6 (app : file de rapports)
  non traité.
## Fichiers sources des audits

- `knowledge/agents/audit-reseau-api/notes/audit.md`
- `knowledge/agents/audit-reseau-dashboard/notes/audit.md`
- `knowledge/agents/audit-reseau-app/notes/audit.md`

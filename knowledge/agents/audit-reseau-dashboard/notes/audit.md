# Audit réseau — dashboard (lecture seule), 2026-10-30

Statut : **relu** (code lu intégralement, croisé avec les routes API). Rien
n'est exécuté : aucun appel HTTP réel, aucun rendu vérifié sur Vercel. Tout ce
qui dépend du comportement runtime est marqué (à confirmer).

## Verdict

La page Réseau est une vraie console de pilotage (lecture + écriture pour
`owner`/`reseau`), pas une vitrine cassée. Mais les trois plaintes du
propriétaire se retrouvent toutes dans le code, avec des causes précises :

1. **« Je ne peux rien gérer »** — il peut, mais : la raison d'une bascule
   (`down_reason`) est dans la réponse de l'API et **n'est pas affichée** dans
   la page Réseau ; le journal d'audit des transitions réseau est **invisible**
   (la page Journal filtre par `community_id`, les événements réseau n'en ont
   pas) ; aucune sonde n'existe pour tester un nœud ; les sections « créneaux
   de nuit » (clé de déploiement, « Je m'en occupe ») sont **orphelines** —
   écrites mais jamais rendues par aucune page.
2. **« Aucun test n'est possible »** — exact : il n'existe **aucune route** de
   test d'un nœud VLESS (ni `POST /endpoints/:id/test`, ni probe serveur). Seuls
   les panneaux 3x-ui ont un bouton « Tester » (connexion au panneau, pas au
   tunnel). La santé d'un nœud VLESS ne peut venir que des rapports des
   téléphones (D50/D51) : un pool sans appareils actifs reste « Non mesuré ».
3. **« Bascules sans raison visible »** — les bascules automatiques viennent de
   la télémétrie client (`witness`, `reports:<n>`, `probation`), écrites dans
   `endpoints.down_reason` mais jamais rendues dans le tiroir Réseau. Le seul
   endroit du dashboard où `downReason` s'affiche est le tiroir de l'accueil
   (`home-detail.tsx:96-98`).

## 1. Inventaire des états affichés → champ API → réalité

Rendu par `StatusBadge` (`components/common/status-badge.tsx:7-34`), alimenté
par deux champs distincts de `GET /v1/admin/pool` :

| Libellé affiché | Champ API | Valeur | Signification côté API | Preuve |
|---|---|---|---|---|
| En service | `health` | `healthy` | Quorum de 3 appareils distincts en succès sur 10 min | `apps/api/src/services/health.ts:73-79` |
| Hors service | `health` | `down` | 3 appareils distincts en échec/10 min, **ou** témoin différentiel (2 échecs + ≥1 succès ailleurs). Retiré des bundles (`servedEndpoints` : `health <> 'down'`) | `health.ts:81-84`, `endpoints.ts:514` |
| Dégradé | `health` | `degraded` | Le conteneur déclare `healthy:false` au heartbeat. Toujours servi, classé après `unknown` | `routes/internal.ts:199-200`, `endpoints.ts:481,515` |
| Non mesuré | `health` | `unknown` | État initial (création, register, réveil après probation 30 min). **Servi quand même**, classé après `healthy` | `schema.ts:202`, `endpoints.ts:481,515` |
| Actif | `status` | `active` | Accepte les connexions. Depuis D145, ne devient plus jamais `expired` tout seul | `endpoints.ts:512`, `app.ts:261-263` |
| En attente | `status` | `pending` | Conteneur enregistré (`/register`) mais pas encore `/ready` (ou `ENDPOINT_AUTO_APPROVE=false`) | `endpoints.ts:234,448` |
| En vidange | `status` | `draining` | Pose **manuellement** (D145 : plus de sweep) | `admin.ts:2555-2590` |
| Expiré | `status` | `expired` | Pose **manuellement**, ou variante retirée d'un groupe manuel. Bloque un re-register. Purgeable | `admin.ts:2430,2555`, D145 |
| « Actifs » (filtre) | — | — | En réalité `status !== 'expired'` : inclut `pending` et `draining` | `network-endpoints-client.tsx:22` |

Le pool expose aussi `downSince`, `downReason`, `latencyMs`, `lastSeenAt`,
`expiresAt`, `inUse/capacity` (`admin.ts:813-834`, `network.schema.ts:5-24`).

## 2. Le bouton « Tester »

- **3x-ui** : `XuiTestButton` (`xui-server-sheet.tsx:153-174`) →
  `testXuiServerAction` (`network.action.ts:63-68`) → `POST
  /v1/admin/xui/servers/:serverId/test` (`adminXui.ts:222`). Résultat en toast.
  Vérifie la connexion **au panneau** (lecture de l'inbound), pas le tunnel
  VPN. Section réservée à l'`owner` (`xui-servers.tsx:14`).
- **Telegram** : `TelegramTestButton` (`telegram-test-button.tsx`) →
  `POST /v1/admin/telegram/test` (`adminNight.ts:231`). Canal d'exploitation,
  pas le réseau.
- **Nœuds VLESS du pool : aucun bouton, aucune route.** Grep exhaustif : ni
  composant de test sur `network-columns`/`endpoint-drawer`, ni route
  `*/endpoints/:id/test` dans `apps/api/src`. Côté serveur non plus : D51
  (« pas de cron, pas de vérificateur 24/7 ») — rien ne sonde un nœud. Si le
  propriétaire attend un « Tester » sur un nœud, il n'existe pas et n'a jamais
  existé.

## 3. Actions sur un nœud — existant vs manquant

### EXISTE (page Réseau, tiroir « Gérer », `endpoint-drawer.tsx`)

| Action | UI | Route API | Permission API |
|---|---|---|---|
| Mettre hors service / rétablir (`health` down↔healthy) | `:23-33,101-123,213-221` | `POST /endpoints/:id/health` (`admin.ts:2464-2517`) | `endpoint.write` (owner ou rôle plateforme `reseau`) |
| Statut : Activer / Vidanger / Expirer | `:35-45,136-167` | `POST /endpoints/:id/status` (`admin.ts:2555-2590`) | `endpoint.write` |
| Supprimer définitivement | `:47-58,176-187,224-232` | `DELETE /endpoints/:id` (`admin.ts:2595-2618`) | `endpoint.write` |
| Ajouter 1 nœud ou un lot de liens VLESS | `manual-endpoint-sheet.tsx` | `POST /endpoints/manual` (`admin.ts:2379-2462`) | `endpoint.write` |
| Purger les expirés | `purge-button.tsx` | `POST /endpoints/purge-expired` (`admin.ts:2523-2550`) | `endpoint.write` |
| 3x-ui : créer / Tester / supprimer | `xui-server-sheet.tsx` | `POST|DELETE /xui/servers…` (`adminXui.ts`) | `xui.manage` (owner) |

Chaque mutation porte `refreshAfter: true` → `refresh()` Next
(`network.service.ts:44-120`, `services/index.ts:56`) : le tableau est relu
après l'action (à confirmer en runtime sur Vercel).

### MANQUE

- **Tester/re-tester un nœud VLESS** : rien (voir §2).
- **Voir la raison d'une bascule** : `downReason` est dans le payload
  (`network.schema.ts:20`) mais **aucune ligne du tiroir ne l'affiche**
  (`endpoint-drawer.tsx:203-207` ne montre que « Hors service depuis »). Le
  journal d'audit existe côté API (`endpoint.health`, `endpoint.status`,
  `endpoint.delete` — `admin.ts:2493,2579,2609`) mais la page Journal du
  dashboard interroge toujours `community_id=<communauté>` (`audit-table.tsx:44`)
  et les événements réseau sont écrits avec `community_id = null`
  (`admin.ts:572`) : **invisibles dans l'UI**.
- **Remettre la santé depuis « Non mesuré » / « Dégradé »** : le tiroir
  n'propose « Rétablir en service » que si `health === 'down'`
  (`endpoint-drawer.tsx:101-111`) ; depuis `unknown`/`degraded`, seule action de
  santé possible : mettre hors service. L'API, elle, accepterait `healthy`.
- **Éditer un nœud** (renommer, capacité, TTL) : rien ; seulement supprimer et
  recréer.
- **Créneaux de nuit** : `NightSlotsClient`, `claimNightSlotAction`,
  `issueDeployKeyAction` existent (`night-slots-section.tsx:37`,
  `network.action.ts:71-82`) mais **aucune page ne rend ce composant** (grep :
  seule la définition existe). Le chemin « clé d'ingestion à usage unique »
  n'est donc atteignable nulle part dans l'UI.
- **`ForceHealthButton`** (`force-health-button.tsx`) : jamais importé — code
  mort ; c'était la seule UI qui permettait de saisir un **motif** au forçage.
  Le tiroir, lui, force `down` sans jamais demander de raison
  (`setEndpointHealthAction(e.endpointId, "down")` sans `reason`,
  `endpoint-drawer.tsx:220`) → l'API écrit `"manual"` (`admin.ts:2474`).

## 4. Peut-on voir POURQUOI un nœud est hors service ?

- **Dans la page Réseau : non.** Le tiroir affiche `downSince` (« Hors service
  depuis », `endpoint-drawer.tsx:206`) mais pas `downReason`, pourtant présent
  dans la réponse du pool (`admin.ts:829`, `network.schema.ts:20`).
- **Ailleurs : oui, partiellement.** Le tiroir de l'accueil affiche la raison
  (`home-detail.tsx:96-98`) et la file « À traiter » la met en sous-titre
  (`home-queue.tsx:103`).
- **Quelles valeurs ?** `manual` (forçage console), `witness` (témoin
  différentiel), `reports:<n>` (n appareils en échec), `probation`
  (`health.ts:82`, `admin.ts:2474`). Rien n'explique ces codes à l'écran.
- **Probation restante : non affichée.** La règle 30 min (`PROBATION_MINUTES`,
  `health.ts:45`, `app.ts:257-259`) n'apparaît nulle part dans le dashboard ;
  pire, quand la probation expire le nœud repasse `unknown` avec
  `down_reason='probation'` — la raison d'origine du `down` est **écrasée**
  (`health.ts:126-127` : `down_reason = $3` à chaque transition).
- **Quel appareil a condamné le nœud : impossible.** Les rapports bruts
  (`config_reports`) ne sont exposés à aucune route admin lue par le dashboard.

## 5. Rafraîchissement

- **À l'ouverture : oui.** La page est un server component ; le fetch est
  `no-store` (`base-service.ts:126`), `cache()` React limité à la requête
  (`network-table.tsx:8`). Chaque navigation relit l'API.
- **Après une action : oui** via `refreshAfter` → `refresh()`
  (`services/index.ts:56`).
- **Temps réel / polling : non.** Aucun `useAdminQuery` ni intervalle sur le
  pool ; la page laissée ouverte affiche un instantané figé, sans date de
  dernière mise à jour (`UpdatedAt` n'existe que sur l'accueil,
  `home-queue.tsx:52,108`). **Un propriétaire qui regarde la page voit des
  données périmées** dès qu'un verdict client tombe — et comme les bascules
  viennent précisément de la télémétrie, c'est le cas le plus fréquent.

## 6. Libellés : « hors service » vs « expiré »

- Deux axes distincts mais deux boutons au même effet : « Mettre hors service »
  (`health=down`) et « Expirer » (`status=expired`) retirent tous deux le nœud
  du pool servi (`endpoints.ts:512-514` exige `status='active'` **et**
  `health<>'down'`). Le tiroir l'explique à moitié (`endpoint-drawer.tsx:168-172`)
  sans dire que le résultat réseau est identique.
- **Décidé par qui ?** Jamais dit : un `down` peut venir des téléphones
  (quorum/témoin) **ou** du propriétaire — l'écran ne distingue pas les deux
  (la raison `manual` vs `witness`/`reports:n` ne s'affiche pas, cf. §4).
- **Libellé trompeur P1 — la purge** : le dialogue dit « dont la date de
  validité est dépassée **ou marqués expirés** » (`purge-button.tsx:46`) et
  l'API supprime en effet `status='expired' OR expires_at < now()`
  (`admin.ts:2531-2532`). Or depuis D145, `expires_at` est une **date
  d'affichage** : un nœud actif au TTL dépassé est encore servi
  (`endpoints.ts:510-520` ne filtre plus `expires_at`). **« Purger les
  expirés » peut donc supprimer des nœuds en service.**
- Filtre « Actifs » qui compte `pending`/`draining` comme actifs
  (`network-endpoints-client.tsx:22`) : trompeur (P2).
- L'accueil affiche `sain = total − down` (`home-metrics.ts:87-91`) : les
  « Non mesuré » sont comptés comme sains dans le chiffre « X / Y » de la
  tuile Nœuds (`home-stats.tsx:83-92`) (P2).

## 7. Après un déploiement d'un nouveau nœud

- **Ajout manuel (page ou API d'ingestion manuelle)** : `INSERT … status='active',
  health='unknown'` (`admin.ts:2400`) → s'affiche immédiatement « Actif » +
  « Non mesuré », et est **distribué dès suite** aux bundles (unknown servi,
  classé après healthy). Les variantes retirées du groupe passent `expired`
  (`admin.ts:2429-2433`).
- **Conteneur auto-enregistré** : `/register` → `status='pending',
  health='unknown'` (`endpoints.ts:234`) → « En attente » + « Non mesuré » ;
  `/ready` → `active` si `ENDPOINT_AUTO_APPROVE=true` (D46,
  `endpoints.ts:448`). Aucune vue dédiée : un nœud bloqué en `pending` n'est
  visible que via le filtre « Tous ».
- **Chemin « Non mesuré » → autre chose** : uniquement la télémétrie des
  téléphones (3 succès → `healthy` ; verdict `down` ; heartbeat `healthy:false`
  → `degraded`). Le dashboard n'a **aucun bouton** pour sortir un nœud de
  « Non mesuré » (cf. §3, action « rétablir » réservée au cas `down`). Sans
  appareils actifs pour sonder, un nœud reste « Non mesuré » pour toujours.

## Défauts classés

| # | Gravité | Défaut | Preuve |
|---|---|---|---|
| 1 | **P0** | Aucun test/sonde d'un nœud VLESS, côté dashboard **et** côté API : « aucun test n'est possible » est structurel | grep exhaustif `*/endpoints/:id/test` → 0 ; D51 |
| 2 | **P0** | `downReason` présent dans le payload mais non affiché dans la page Réseau → bascules « sans raison visible » | `network.schema.ts:20` vs `endpoint-drawer.tsx:203-207` |
| 3 | **P0** | Transitions réseau invisibles dans le Journal (filtre `community_id` vs événements à `community_id=null`) | `audit-table.tsx:44`, `admin.ts:572`, `admin.ts:2493` |
| 4 | **P1** | La purge peut supprimer des nœuds **actifs et servis** au TTL dépassé (contradiction D145) | `admin.ts:2531-2532` vs `endpoints.ts:510-520`, D145 |
| 5 | **P1** | Pas de bouton « rétablir en service » depuis `unknown`/`degraded` — seul `down` est rétablissable | `endpoint-drawer.tsx:101-111` |
| 6 | **P1** | Probation 30 min invisible ; `down_reason` écrasé par `probation` au réveil | `health.ts:45,126-127`, `app.ts:257-259` |
| 7 | **P1** | Créneaux de nuit orphelins (aucune page ne rend `NightSlotsClient`) ; `ForceHealthButton` jamais importé | grep ; `night-slots-section.tsx:37` |
| 8 | **P1** | Page ouverte = instantané figé : aucun polling, aucune date de fraîcheur des données | `network/page.tsx`, absence de `UpdatedAt` |
| 9 | **P2** | Filtre « Actifs » inclut `pending`/`draining` | `network-endpoints-client.tsx:22` |
| 10 | **P2** | Accueil : `unknown` compté comme sain dans « X / Y » | `home-metrics.ts:87-91` |
| 11 | **P2** | Pool tronqué à 200 nœuds sans pagination ni mention | `admin.ts:2283` |
| 12 | **P2** | Le forçage « hors service » depuis le tiroir ne demande jamais de motif (l'API le supporte) | `endpoint-drawer.tsx:220` vs `network.schema.ts:33` |

## Vérifié / incertain

**Vérifié (lecture de code, fichier:ligne)** : tout le périmètre listé
(`page.tsx`, 11 composants `components/network/`, `home-queue.tsx`,
`home-detail.tsx`, `home-stats.tsx`, `network.service.ts`, `network.schema.ts`,
`network.action.ts`, `roles.ts`, `base-service.ts`, `services/index.ts`) et les
routes API croisées (`admin.ts` pool/health/status/delete/purge/manual/audit,
`endpoints.ts`, `health.ts`, `internal.ts`, `adminXui.ts`, `adminNight.ts`,
`app.ts`, `schema.ts`).

**Incertain / à confirmer** : comportement runtime de `refresh()` sur Vercel
après mutation ; rendu réel des libellés (pas de navigateur lancé) ; contenu
réel de `down_reason` en production (valeurs observées non vérifiables depuis
ici) ; effet réel de la purge sur les nœuds en service (démontré par le code,
non rejoué sur la base).

## Questions ouvertes

- Q1 : la purge « expirés » doit-elle respecter D145 (ne supprimer que
  `status='expired'`, jamais `expires_at < now()` seul) ? À trancher avant tout
  clic en production.
- Q2 : le rôle `reseau` existe côté API (`admin_platform_roles`) ; l'UI le gère
  (`roles.ts:58-71`) — mais qui détient ce rôle en production ? Si personne,
  toute l'écriture réseau repose sur l'`owner` seul.
- Q3 : faut-il exposer `config_reports` (qui a condamné le nœud) dans le tiroir,
  ou se contenter d'afficher `downReason` + journal d'audit réseau ?
- Q4 : les libellés `witness` / `reports:2` / `probation` doivent-ils être
  traduits pour le propriétaire ?

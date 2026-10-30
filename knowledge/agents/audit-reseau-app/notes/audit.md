# Audit — Flux sonde → rapport → verdict → santé (axe app Android)

Statut : **relu** (lecture seule, code uniquement ; aucun test exécuté, aucun
comportement runtime confirmé sur appareil). Date : 2026-10-30.

## Verdict

L'app remonte bien **un rapport de sonde par nœud de la liste, à chaque
`probeAll`**, et pas seulement pour le nœud actif (`VpnTunnelService.kt:574`).
Le serveur transforme ces rapports en verdicts `down` avec un quorum de
**3 appareils distincts** ou **1 témoin différentiel** (`health.ts:81-83`),
et un nœud `down` est **retiré du bundle servi** (`endpoints.ts:514`).

La chaîne est conforme à D47/D50/D63/D64, mais elle a un angle mort
structurel : **l'app ne distingue pas « le nœud est mort » de « mon tunnel ou
mon API Clash est cassé »**. Un échec local est attribué au nœud. Combiné au
verdict différentiel (1 appareil suffit s'il a un succès ailleurs) et au
quorum (3 appareils suffisent sinon), un parc d'appareils défectueux — par
exemple les versions antérieures à la correction cleartext — peut marquer
`down` **tous les nœuds en même temps**, vider les bundles servis, et
boucler (voir Q8 : **oui, la boucle est possible**, preuve plus bas).

## Chaîne complète sonde → rapport → verdict → santé

| Étape | Où | Quoi |
|---|---|---|
| 1. Sonde | `VpnTunnelService.probeAll` :567-586 | Pour **chaque nœud** du plan, `measureDelayMs(tag)` via API Clash (`GET /proxies/{tag}/delay`, `LibboxTunnelEngine.kt:102-118`), URL `https://www.gstatic.com/generate_204` (`TunnelEngine.kt:103`), timeout 5 s, 4 en parallèle. |
| 2. Rapport local | `VpnTunnelService.kt:574` → `UsageMeter.report` :66-69 | `meter.report(configId, delayMs != null, delayMs)` — un rapport **par nœud**, actif ou non. File de 200 max, les plus anciens jetés (`UsageMeter.kt:67`). |
| 3. Envoi | `UsageMeter.flush` :83-89, appelé chaque 60 s de tunnel (`VpnTunnelService.kt:92,519`) et au démontage (`:411`) | Lot de **20 rapports max** (D64) + usage du jour, `POST /v1/me/telemetry` (`ApiClient.kt:286-289`). Échec réseau → lot remis en file ; 4xx → perdu (D64). |
| 4. Réception | `telemetry.ts:110-189` | `device_id` vient de la session (`:166-168`), `reported_at = now()` serveur, usage en `GREATEST`, un `configId` inconnu = 400 pour **tout le lot** (`:157-160`). |
| 5. Verdict | `health.reconcileHealth` :159-213, appelé par `telemetry.ts:175-179` + `reconcileDeviceWitnesses` :184-186 | Fenêtre 10 min. `down` si `doubters >= 3` (appareils distincts) OU témoin différentiel (≥ 2 échecs du même appareil sur le nœud + ≥ 1 succès du même appareil ailleurs) (`health.ts:34,52,81-83`). |
| 6. Écriture | `health.setHealth` :117-136 | `down` pose `down_since = now()` ; **seule une transition** bump la révision (D48). |
| 7. Service | `endpoints.servedEndpoints` :503-521 | `health <> 'down'` : le nœud `down` **sort du bundle** ; `unknown` est servi. Le heartbeat ne peut pas lever un `down` (D47, `endpoints.ts:481`). |

## Réponses aux questions

**Q1 — Contenu, fréquence, lots.** Un rapport = `{configId, ok, latencyMs}`
(`ApiClient.kt:595`), envoyé dans `TelemetryRequest{activeConfigId, usage,
reports}` (`ApiClient.kt:598`). Le serveur ajoute `device_id` (session) et
`reported_at = now()` (`telemetry.ts:166-168`). Fréquence : un rapport par
nœud **à chaque `probeAll`**, c'est-à-dire (a) au premier probe après
connexion (`VpnTunnelService.kt:537`), (b) à chaque tentative de bascule
(`:596`, backoff 30 s → 2 min → 10 min, `:89,543`), (c) sur `ACTION_PROBE`
depuis l'UI (`:200`). Lots : 20 rapports/requête (D64, `UsageMeter.kt:121`,
`ApiClient.kt:287`), file plafonnée à 200 avec rejet des plus anciens
(`UsageMeter.kt:67`), envoi toutes les 60 s de tunnel + flush final au
démontage (`VpnTunnelService.kt:411,519`).

**Q2 — Actif ou tous les nœuds ?** **Tous les nœuds** à chaque `probeAll`
(`VpnTunnelService.kt:569-574` itère `plan.nodes`, sans filtrer sur
`ServerBus.active`). Oui : un nœud que l'app n'a jamais utilisé peut recevoir
un verdict d'échec — il suffit que sa sonde via le tunnel échoue, y compris
pour une cause locale (tunnel sans sortie, API Clash inaccessible).

**Q3 — Sondes TCP directes.** Non. `AppController.testLatency` en mode tunnel
coupé fait un `tcpConnectMs` direct (`AppController.kt:817,838-844`) et ne
touche qu'à `ServerBus` (`:818-820`) — **aucun `meter.report`**, donc aucun
rapport serveur. Un réseau mobile qui bloque le port d'un nœud ne fait donc
pas marquer ce nœud « en échec » via ce chemin. En revanche, quand le tunnel
est monté (`CONNECTED`/`NO_CONNECTION`), le bouton déclenche `probeInService`
(`AppController.kt:797-799`) → `probeAll` → rapports serveur, et là un blocage
réseau du port de sortie produit des échecs attribués aux nœuds (par
construction, la sonde passe par le tunnel).

**Q4 — Tunnel monté sans sortie (NO_CONNECTION).** Chaque `measureDelayMs`
échoue → `delayMs = null` → `meter.report(configId, false, null)` pour **tous**
les nœuds du plan (`VpnTunnelService.kt:573-574`). Oui : toutes les configs
sont rapportées en échec dans les mêmes lots, et l'UI les marque `FAILED` en
même temps (`:575-581`). Si l'API Clash elle-même est inaccessible (bug
cleartext des versions antérieures), le résultat est identique : tout échoue,
et chaque échec est bien écrit comme `ok=false` visant le nœud. La boucle de
supervision rejoue `probeAll` à chaque backoff tant que rien ne répond
(`:542-547`), donc un appareil dans cet état génère N échecs par cycle,
indéfiniment.

**Q5 — Verdict `down` côté serveur.** Deux chemins (`health.ts:81-83`) :
- **Quorum** : `doubters >= 3` = **3 appareils distincts** ayant envoyé
  ≥ 1 rapport `ok=false` sur le nœud dans les 10 min (`DOWN_QUORUM`,
  `health.ts:34` ; comptage `DISTINCT device_id`, `health.ts:185`).
- **Témoin différentiel** (D63) : **1 seul appareil suffit** — 2 échecs sur le
  nœud + ≥ 1 succès sur un autre nœud dans la fenêtre (`WITNESS_FAILURES`,
  `health.ts:52,177-183` ; balayage `reconcileDeviceWitnesses` :228-250).

L'appareil qui compte : **tout appareil qui sonde**, pas seulement celui qui
est connecté au nœud — `config_reports` ne connaît que `device_id, config_id,
ok` (`telemetry.ts:166-168`), aucun lien avec la session active ou
`last_active_server_id`. Donc oui : un appareil au tunnel cassé (bug cleartext
des versions précédentes → API Clash `http://127.0.0.1` bloquée, P0 #1 de
l'audit du 2026-10-29) produisait `ok=false` sur **tous** les nœuds à chaque
`probeAll`. Trois tels appareils dans une fenêtre de 10 min suffisent à
marquer `down` **tous les nœuds sains** (`doubters >= 3`). Le témoin
différentiel ne sauve pas : il exige un succès du même appareil ailleurs, et
un appareil entièrement cassé n'en produit aucun.

**Q6 — Probation.** Démarre au passage `→ down` : `down_since = now()`
(`health.ts:126`). Durée : 30 min (`PROBATION_MINUTES`, `health.ts:45`).
Pendant la probation le nœud reste `down` → **retiré du bundle servi**
(`endpoints.ts:514`) : il n'est pas servi. Qui la lève : uniquement les
rapports clients — après 30 min de `down_since`, un quorum de **3 appareils
distincts en succès** fait passer le nœud `unknown` (raison `probation`),
**de nouveau servi**, et le quorum suivant le rend `healthy`
(`health.ts:72-79`). Le heartbeat 3x-ui ne peut jamais lever un `down` (D47,
`endpoints.ts:481`), et il n'existe aucun vérificateur serveur (D51).

**Q7 — Verdict « up ».** Personne d'autre que les sondes clients ne remet un
nœud debout : ni le heartbeat (D47), ni une reconnexion. Délai minimal avant
qu'un nœud repris soit servi : **30 min de probation + 1 quorum de succès
(3 appareils distincts)** — et paradoxe : le nœud `down` étant absent des
bundles neufs, seuls les appareils qui le gardent encore dans leur coffre
peuvent continuer à le sonder et provoquer sa réhabilitation. La remontée est
donc possible mais lente et dépendante des vieux bundles.

**Q8 — Boucle app incapable de sonder → nœuds `down` → retrait → encore pire.
OUI, prouvable par le code :**
1. Tunnel monté mais sortie morte (ou API Clash inaccessible) → chaque
   `probeAll` écrit `ok=false` pour **tous** les nœuds
   (`VpnTunnelService.kt:573-574`), rejeté en boucle par le backoff
   (`:542-547`).
2. Ces échecs arrivent au serveur comme des échecs **des nœuds**
   (`telemetry.ts:162-170`) ; 3 appareils distincts dans cet état →
   `doubters >= 3` → `down` sur **tous** les nœuds (`health.ts:81-83`).
3. `servedEndpoints` exclut `down` (`endpoints.ts:514`) → les nouveaux bundles
   sont vides, les révisions bumpent (D48) → les appareils perdent leur liste
   au prochain rafraîchissement.
4. Un appareil sans configuration ne peut plus monter de tunnel
   (`VpnTunnelService.kt:303-321`), donc plus sonder, donc plus produire les
   succès du quorum de réhabilitation.
5. Retour partiel seulement après 30 min de probation **et** 3 appareils
   capables de sonder le nœud (via un vieux coffre) — tant que des appareils
   cassés continuent de sonder, `doubters >= 3` peut re-basculer le nœud
   `down` dès qu'il est revenu `unknown` (le verdict `down` redevient
   possible dès le retour au service, `health.ts:79-83`), d'où une
   oscillation down/unknown tant que le parc défectueux sonde.

Contrepoids réels : le témoin différentiel et le quorum « 3 appareils »
limitent le cas d'**un** appareil cassé (c'est le faux positif que D50
interdit, `health.ts:153-154`). Le trou n'apparaît qu'avec **plusieurs**
appareils partageant le même défaut client — exactement le cas d'un APK
défectueux déployé à toute la base.

## Défauts

### P0
1. **Aucune distinction cause locale / cause nœud dans le rapport**
   (`VpnTunnelService.kt:574`, `UsageMeter.kt:66-69`). Un échec de l'API
   Clash, du réseau mobile ou du tunnel est écrit `ok=false` visant le nœud.
   Conséquence : un parc sur une version buguée peut condamner tous les nœuds
   (boucle Q8). Piste : ne rapporter que si `probeSelector` réussit (l'app
   sait alors que le chemin de mesure fonctionne), ou taguer les rapports
   « mesure locale incertaine ».
2. **Le témoin différentiel s'applique aussi quand la mesure du succès est
   trompeuse** : un appareil dont le tunnel passe par le seul nœud Y mais dont
   l'opérateur bloque les IP des autres nœuds produit 2 échecs + 1 succès →
   `down` sur chaque nœud bloqué, un appareil à la fois (`health.ts:177-183`,
   `reconcileDeviceWitnesses` :228-250). C'est voulu par D63, mais aucun
   garde-fou serveur ne distingue « blocage ISP géographique » de « nœud mort ».

### P1
3. **Un `configId` retiré (endpoint supprimé) fait abandonner tout le lot**
   (`telemetry.ts:157-160` → 400 → lot perdu, D64). Si la console purge un
   endpoint encore présent dans les coffres, la télémétrie (usage compris) de
   ces appareils est perdue tant qu'ils sonnent ce nœud.
4. **File de 200 avec rejet silencieux des plus anciens** (`UsageMeter.kt:67`)
   : en tempête de bascule avec beaucoup de nœuds, les rapports tronqués
   biaisent la fenêtre de verdict (les échecs les plus récents arrivent, les
   succès plus anciens peuvent être perdus).
5. **Délai d'envoi jusqu'à 60 s** (`VpnTunnelService.kt:92,519`) : les
   horodatages de verdict sont ceux de l'insertion serveur, pas de la mesure ;
   un témoin peut arriver hors fenêtre utile (atténué par
   `reconcileDeviceWitnesses`).

### P2
6. Les lots de rapports ne sont pas compressés ni priorisés ; chaque
   `probeAll` sur 12+ nœuds à chaque backoff consomme de la data mobile
   (déjà chiffré dans l'audit du 2026-10-29, volet performance).

## Vérifié / incertain

**Vérifié** (lecture du code, fichier:ligne) : contenu du rapport et DTO ;
fréquence et tailles de lot ; `meter.report` pour tous les nœuds ; absence de
rapport serveur sur `tcpConnectMs` ; quorums 3/2+1 et fenêtre 10 min ;
`device_id` de session, `reported_at = now()` ; exclusion `down` du bundle ;
probation 30 min et levée par quorum de succès ; heartbeat incapable de lever
un `down`.

**Incertain / à confirmer sur appareil** : le comportement réel quand l'API
Clash est inaccessible (les échecs remontent bien, mais le volume exact de
rapports dépend du timing des backoff) ; l'ampleur réelle de la boucle Q8 en
production (dépend du nombre d'appareils sur versions buguées) ; tout
chiffre de trafic.

## Questions ouvertes

- O1 : faut-il conditionner l'envoi des rapports d'échec à un
  `probeSelector` réussi (l'app prouve que son chemin de mesure marche) ?
- O2 : le serveur devrait-il ignorer les rapports d'un appareil dont
  **tous** les nœuds échouent simultanément (signature d'un client cassé) ?
- O3 : la purge d'un endpoint doit-elle être douce (garder la ligne pour
  accepter les rapports) pour éviter le 400 de lot ?
- O4 : pendant la probation, un nœud pourrait-il rester servi à faible
  priorité plutôt que retiré (atténuerait la boucle Q8) ?

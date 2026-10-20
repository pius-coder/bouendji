# Journal — xray-ops

## 2026-10-20T13:20:00Z · Création
- fait: charte créée
- portée: déterminer si 3x-ui ou l'API gRPC de Xray permet de désactiver un client à chaud, de lire son trafic par client, et de créer un inbound sans redémarrage
- etat: actif
- suite: lire 3x-ui.md et revocation.md, puis inspecter le dépôt 3x-ui

## 2026-10-20T13:24:00Z · Nœuds lus, périmètre confirmé
- fait: lecture de `3x-ui` et `revocation`, inventaire des questions à trancher
- etat: ok
- suite: vérifier l'API HTTP de 3x-ui dans le dépôt (routes, auth, endpoints de gestion des clients)

## 2026-10-20T13:27:04Z · Nœuds lus, mission cadrée

- fait: lecture de 3x-ui, revocation, threat-model, endpoint-lifecycle ; périmètre = 5 questions du nœud 3x-ui
- etat: ok
- suite: inventaire de l'arbre du dépôt 3x-ui via l'API GitHub

## 2026-10-20T13:57:17Z · Arbre + routes 3x-ui v3

- fait: arbre GitHub (2353 entrées) ; branche main = réécriture Go v3 (internal/web, internal/xray) ; dernière release stable v3.10.2 (2026-10-14) ; API /panel/api + Bearer token scopé + openapi.json ; bootstrap CLI -getApiToken
- etat: ok
- suite: vérifier le chemin de révocation (hot apply vs redémarrage)

## 2026-10-20T13:57:26Z · Révocation : AlterInbound à chaud, mais session vivante intacte

- fait: lu xray.go (tryHotApply, restartToDropClients), client_inbound_apply.go (RemoveUser + droppedClientNeedsRestart), setting.go (restartXrayOnClientDisable=true par défaut), check_client_ip_job.go (RemoveUser ne coupe pas une session établie) ; désactivation = gRPC local, redémarrage planifié à 30 s si le réglage est actif
- etat: ok
- suite: trafic : persistance, tick 5 s, remise à zéro

## 2026-10-20T13:57:26Z · Trafic : delta en mémoire + table client_traffics

- fait: XrayTrafficJob @every 5s ; QueryStats(Reset=false) avec StatsLastValues en RAM ; persistance SQLite/Postgres table client_traffics (email unique) ; quota et expiration appliqués par le panel (disableInvalidClients) ; autoRenew ResetDay mensuel
- etat: ok
- suite: API Xray directe : services, stats, limites (proto + doc)

## 2026-10-20T13:59:04Z · CLÔTURE

- fait: rapport écrit dans notes/3x-ui-verdict.md
- etat: ok
- suite: intégration par l'orchestrateur

## 2026-10-20T13:59:08Z · CLÔTURE
verdict rendu dans notes/3x-ui-verdict.md

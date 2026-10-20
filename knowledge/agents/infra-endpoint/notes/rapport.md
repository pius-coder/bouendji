# Rapport — `infra-endpoint`

**Verdict : le lot est écrit et vérifié autant que possible sans Docker.** Les
cinq fichiers existent, le script passe `sh -n`, refuse un environnement
incomplet en `78`, et la configuration qu'il produit a été validée par le vrai
binaire Xray (`Configuration OK.`). Ce qui n'est pas prouvé : l'image elle-même
(pas de daemon Docker) et un cycle réel contre l'API.

## Fichiers écrits

| Fichier | Lignes | Contenu |
|---|---|---|
| `infra/endpoint/entrypoint.sh` | ~430 | toute la séquence, `#!/bin/sh`, `set -eu` |
| `infra/endpoint/Dockerfile` | 26 | `teddysun/xray:latest` + `apk add --no-cache curl jq`, `ENTRYPOINT` |
| `infra/endpoint/config.example.json` | 55 | exemple statique de la config générée, jamais lu au runtime |
| `infra/endpoint/README.md` | ~250 | contrat, variables, codes de sortie, build/push, logs, pièges |
| `infra/endpoint/.dockerignore` | 5 | liste blanche (`*` puis `!fichier`) |

Plus, dans mon dossier : `knowledge/agents/infra-endpoint/notes/harness/`
(`run-tests.sh`, `run-real-jq.sh`, `check-config.mjs`, `check-fields.mjs`,
`fakebin/{jq,curl,xray}`) — les scripts de vérification, rejouables.

## Vérifié, et comment

1. **`sh -n infra/endpoint/entrypoint.sh`** → exit 0. `dash` et `busybox` ne
   sont pas installés sur cette machine : l'analyse POSIX a donc été faite avec
   le `sh` de Git for Windows (bash en mode POSIX), ce qui **ne prouve pas**
   l'absence de bashisme à lui seul. D'où le point 2.
2. **Aucun bashisme** : grep des motifs `[[ ]]`, `local` en position de
   commande, `=(` (tableaux), `$RANDOM`, `function nom`, `{var[`. Zéro
   occurrence. Le script n'utilise que `case`, `[ ]`, `if`, `$( )`, `${#var}`.
3. **Variables obligatoires** (exécution réelle) :
   - tout vide → `78`, `PUBLIC_HOST manquant : nom d'hôte public du service…` ;
   - `PUBLIC_HOST` seul → `78`, `API_URL manquant…` ;
   - + `API_URL` → `78`, `ENDPOINT_INGEST_SECRET manquant…` ;
   - `PUBLIC_HOST=https://…` → `78` (schéma refusé) ;
   - `API_URL=api.example.com` → `78` (schéma obligatoire) ;
   - `PORT=abc` → `78`.
4. **Parcours complet** avec `curl` et `xray` simulés (le vrai `jq` dans un
   second passage) : `register → config → -test → écoute → ready → heartbeat →
   SIGTERM`. Sortie **0**. Les trois lignes d'identité (`enregistré`,
   `xray écoute`, `ready`, `heartbeat ok`) apparaissent, et :
   - l'UUID, le chemin WS et le jeton sont **absents** des logs (grep) ;
   - **aucun** appel de désinscription n'est émis — `calls.log` ne contient que
     `register`, la sonde locale, `ready`, `heartbeat` ;
   - une ligne de log référençant un secret serait détectée statiquement : la
     vérification existe aussi en statique, zéro occurrence.
5. **Configuration réelle** : le vrai `jq` 1.7.1 exécute le programme de
   génération. Résultat comparé à `config.example.json` : structure identique.
   Le chemin WS est préservé (`/ws/AbC-123_xyz`) et le port vient de `$PORT`.
6. **Validation par le vrai binaire** : `xray 26.3.27` (build Windows, même
   version que celle attendue dans l'image) → `xray run -test -c config` :
   `Configuration OK.`, exit 0. Un chemin de config inexistant sort bien en
   `23`, ce qui confirme le code d'échec documenté.
7. **Sonde de disponibilité mesurée** : Xray lancé pour de vrai sur un port
   local, `GET /` sans `Upgrade` → **404**, `GET /ws/exemple` → **400**,
   journal d'accès muet (`access: "none"`). La sonde accepte tout code HTTP non
   nul : elle prouve que le listener sert, sans exiger une réponse précise.
8. **Champs envoyés** (`check-fields.mjs`) : 8 clés (`deployment_key`,
   `public_host`, `port`, `agent_version`, `region`, `label`, `capacity`,
   `ttl_seconds`) — **toutes** présentes dans `registerSchema`
   (`apps/api/src/routes/internal.ts:72-89`), aucune inventée. `sni` n'est pas
   envoyée : `routes/internal.ts:131` fait `input.sni ?? input.public_host`.

## Décisions prises

- **`PORT` ≠ `PUBLIC_PORT`.** Cloud Run termine TLS et route sur `$PORT` ; le
  client dial 443. C'est `PUBLIC_PORT` (défaut 443) qui part dans
  l'enregistrement, sinon les URI `vless://` distribuées aux appareils
  pointeraient sur `:8080` et ne se connecteraient pas.
- **`deployment_key` = `${K_SERVICE}:${K_REVISION}`**, repli `hostname` : même
  UUID pour toutes les instances d'une révision, UUID neuf à chaque
  redéploiement, TTL jamais prolongé par un restart.
- **409 → 78** avec le message exact « déploiement expiré, nouvelle révision
  requise » ; **401/403 → 78** (jeton) ; **400/404 → 78** (déploiement
  malformé) ; **réseau, 429, 5xx → retry 2→30 s sans fin**, car ce n'est pas
  réparable par un redéploiement.
- **Heartbeat sans `latency_ms` ni `healthy`** : mesurer la latence de
  `127.0.0.1` ne mesure rien, et déclarer `healthy` sans preuve polluerait le
  classement du pool (`servedEndpoints` trie sur `health`/`latency_ms`).
- **`access: "none"`** : le journal d'accès Xray contient l'URL des requêtes,
  donc le chemin WS. C'est la seule raison de le couper.
- **Blocage des plages privées** (`10/8`, `172.16/12`, `192.168/16`, `127/8`,
  `169.254/16`, `::1`, `fc00::/7`, `fe80::/10`) vers un outbound `blackhole` :
  sans ça, un utilisateur du tunnel peut joindre le serveur de métadonnées GCP
  (`169.254.169.254`) depuis l'instance. Pas de `geoip:private` : dépendance à
  un fichier de données pour un gain nul.
- **`network: "ws"`** conservé (alias de `method: "websocket"`, vérifié dans
  `infra/conf/transport_internet.go`) : Xray imprime un avertissement de
  dépréciation au démarrage, non fatal, constaté à l'exécution.
- **`SIGTERM` ne fait aucun appel API** : scale-to-zero et recyclage
  d'instance l'envoient aussi ; désinscrire viderait le pool à chaque
  scale-down.
- **Pas de mode « dry run »** : un chemin qui démarre Xray sans enregistrement
  serait un contournement silencieux du contrat. L'essai local passe par une
  vraie API.

## Ce qui reste non testé (sans Docker)

- `docker build` : `apk add --no-cache curl jq`, le `COPY`, le `chmod`, et le
  fait que l'`ENTRYPOINT` remplace bien le `CMD` hérité ;
- le binaire Xray **Alpine** de l'image (la validation utilise le build Windows
  de la même version, 26.3.27) ;
- un cycle réel `register → ready → heartbeat` contre `apps/api` (l'API n'était
  pas démarrée) ;
- le comportement plateforme : `Request timeout` à 3600, CPU bridé entre deux
  requêtes (dérive du heartbeat), cold start, SIGTERM de Cloud Run.

## Points pour l'orchestrateur

- Rien à changer dans `apps/api` : le contrat a été respecté tel quel.
- À intégrer dans les nœuds partagés si tu valides :
  `knowledge/10-infrastructure/gcp-v2ray-repo.md` peut passer de « réécriture
  décidée » à « conteneur écrit dans `infra/endpoint/`, non construit » ;
  `cloud-run-deploy-form.md` gagne la distinction `PORT`/`PUBLIC_PORT` dans la
  ligne « Container port ».
- Question ouverte : `ENDPOINT_TTL` par défaut côté API = 16 200 s, mais un
  nœud Cloud Run ne peut servir que des sessions WS d'une heure. Le conteneur
  n'a aucune raison de forcer une valeur ; le bundle doit continuer de porter
  `max_session_seconds`.

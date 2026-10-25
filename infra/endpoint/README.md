# `infra/endpoint/` — conteneur d'endpoint Xray pour Cloud Run

Ce conteneur **n'est pas** un proxy configuré à l'avance. Il s'enregistre auprès
de l'API, reçoit son identité (UUID + chemin WebSocket), écrit sa configuration,
démarre Xray, annonce qu'il est prêt, bat le cœur, et **meurt sans se
désinscrire**.

```
boot
 → valider l'environnement            (sinon exit 78)
 → POST /v1/internal/endpoints/register   (retry 2 → 30 s, sans fin)
   ← { endpoint_id, uuid, ws_path, expires_at, status, pool_revision }
 → écrire /etc/xray/config.json       (jq -n, mode 600)
 → xray run -test -c …                (sinon exit 70)
 → xray run -c …  en tâche de fond
 → attendre que le port réponde VRAIMENT (sonde HTTP locale, pas un sleep)
 → POST /v1/internal/endpoints/ready
 → heartbeat toutes les 45 s
 → SIGTERM : tuer xray et sortir 0, SANS appeler l'API
```

## Fichiers

| Fichier | Rôle |
|---|---|
| `Dockerfile` | `teddysun/xray:latest` + `curl` + `jq`, entrypoint en `ENTRYPOINT` |
| `entrypoint.sh` | toute la séquence ci-dessus, `#!/bin/sh` POSIX, `set -eu` |
| `config.example.json` | exemple **statique** de ce que l'entrypoint génère (documentation et `xray run -test` local) |
| `.dockerignore` | liste blanche : seuls `Dockerfile`, `entrypoint.sh`, `config.example.json` entrent dans le contexte |

`config.example.json` n'est **jamais** lu au démarrage : la configuration réelle
est reconstruite à chaque boot à partir de la réponse de l'API. Aucun gabarit à
trous n'existe dans l'image, donc aucun UUID ne peut être oublié dedans.

## Contrat d'ingestion (source : `apps/api/src/routes/internal.ts`)

Authentification : `Authorization: Bearer $ENDPOINT_INGEST_SECRET`.
Secret vide côté API → `503` ; jeton faux → `401`.

`POST {API_URL}/v1/internal/endpoints/register`

```json
{
  "deployment_key": "node-01:node-01-00002-abc",
  "public_host": "node-01-1234567890.us-central1.run.app",
  "port": 443,
  "agent_version": "endpoint/1.0",
  "region": "us-central1",     // omis si ENDPOINT_REGION absent
  "label": "node-01",          // omis si ENDPOINT_LABEL absent
  "capacity": 80,              // omis si ENDPOINT_CAPACITY = 0
  "ttl_seconds": 16200         // omis si ENDPOINT_TTL = 0
}
```

Réponse `200` :

```json
{
  "endpoint_id": "ep_…",
  "uuid": "…",                 // secret : ne sort jamais d'ici
  "ws_path": "/ws/…",          // secret : ne sort jamais d'ici
  "expires_at": "2026-10-20T19:30:00.000Z",
  "status": "pending",
  "pool_revision": 7
}
```

`POST /v1/internal/endpoints/ready` — corps `{ "deployment_key": "…" }` →
`{ "status": "active", "pool_revision": 8 }`.

`POST /v1/internal/endpoints/heartbeat` — corps `{ "deployment_key": "…" }` →
`{ "status": "active", "expires_at": "…" }`. Le script n'envoie **ni**
`latency_ms` **ni** `healthy` : mesurer la latence de `127.0.0.1` ne mesure rien
d'utile, et mentir sur `healthy` polluerait le classement du pool.

`deployment_key` = `${K_SERVICE}:${K_REVISION}`, repli `hostname` si Cloud Run
ne fournit pas les deux variables. Conséquences :

- toutes les instances d'une même révision obtiennent le **même** UUID
  (`register` est idempotent côté API) ;
- un redémarrage de la même révision réutilise l'identité **et** l'`expires_at`
  existants — un restart ne prolonge jamais la vie du nœud ;
- un nouveau déploiement (nouvelle révision) crée une nouvelle ligne ;
- une clé déjà expirée renvoie `409` → le conteneur sort en `78`.

## Variables d'environnement

| Variable | Obligatoire | Défaut | Contrôle |
|---|---|---|---|
| `PUBLIC_HOST` | **non sur Cloud Run** (déduit) ; **oui** hors Cloud Run | sur Cloud Run : `<K_SERVICE>-<numéro de projet>.<région>.run.app` | nom d'hôte seul, sans `://` ni `/`, ≤ 253 car., mis en minuscules. Ne le poser que pour un domaine personnalisé ou hors Cloud Run |
| `API_URL` | **oui** | — | doit commencer par `http://` ou `https://`, slash final toléré |
| `ENDPOINT_INGEST_SECRET` | **oui** | — | non vide, sinon `78` |
| `PORT` | non | `8080` | injecté par Cloud Run : port d'écoute **local** |
| `PUBLIC_PORT` | non | `443` | port que le client dial, donc celui de l'URI `vless://` |
| `ENDPOINT_REGION` | non | omis | ≤ 24 car. |
| `ENDPOINT_LABEL` | non | omis (l'API prend `public_host`) | 2 à 64 car. |
| `ENDPOINT_CAPACITY` | non | omis (l'API prend `80`) | 1 à 10 000 |
| `ENDPOINT_TTL` | non | omis (l'API prend `ENDPOINT_DEFAULT_TTL` = 16 200 s) | entier de secondes. L'API le ramène dans `[ENDPOINT_MIN_TTL = 3 600 ; ENDPOINT_MAX_TTL = 30 jours]` : une valeur plus courte est relevée à 3 600 s (`apps/api/src/config.ts:170-171`, `services/endpoints.ts:213`) |
| `ENDPOINT_AGENT_VERSION` | non | `endpoint/1.0` | ≤ 64 car. |
| `ENDPOINT_HEARTBEAT_SECONDS` | non | `45` | cadence du battement |
| `ENDPOINT_READY_TIMEOUT` | non | `60` | attente maximale du port avant `70` |
| `XRAY_CONFIG` | non | `/etc/xray/config.json` | chemin du fichier généré |

**`PORT` ≠ `PUBLIC_PORT`.** Cloud Run termine TLS et route sur `$PORT` (8080) ;
le client, lui, se connecte en `wss://PUBLIC_HOST:443`. C'est `PUBLIC_PORT`
(443) qui part dans l'enregistrement, parce que c'est lui qui finira dans
l'URI `vless://` distribuée aux appareils. Envoyer `8080` produirait des URI
qui ne se connectent pas.

L'inbound écoute `0.0.0.0:$PORT` avec `security: none` : TLS est terminé par
Cloud Run, le conteneur ne voit que du HTTP/1.1 en clair sur le port local.

## Codes de sortie

| Code | Sens | Effet Cloud Run |
|---|---|---|
| `0` | SIGTERM/SIGINT reçu, arrêt propre | instance recyclée, service intact |
| `70` | `EX_SOFTWARE` : xray absent, configuration générée refusée par `xray run -test`, xray mort après démarrage, réponse d'API inexploitable | l'instance échoue ; visible dans les logs |
| `78` | `EX_CONFIG` : variable manquante/ invalide, `401`/`403`, `409` (déploiement expiré), `400`/`404` | idem : c'est une erreur de déploiement, pas un incident réseau |

Les erreurs **réseau** (`000`) et les `5xx`/`429` ne tuent jamais le conteneur :
nouvelle tentative avec backoff `2 → 4 → 8 → 16 → 30 s`, plafonné à 30 s,
indéfiniment. Un endpoint qui ne peut pas joindre l'API ne démarre pas — c'est
voulu : sans identité, il ne sert à rien.

## Construire et pousser — sans `gcloud`

L'image se construit et se pousse avec n'importe quel moteur OCI. Cloud Run ne
demande qu'une **URL d'image** dans son formulaire.

```sh
# depuis la racine du dépôt
docker build --platform linux/amd64 -t <compte>/vpn-endpoint:1.0.0 infra/endpoint
docker push <compte>/vpn-endpoint:1.0.0
```

- `--platform linux/amd64` : obligatoire depuis un Mac ARM (Cloud Run est
  amd64) ;
- `podman build` / `podman push` fonctionnent à l'identique ;
- un registre public (Docker Hub, GHCR public) évite toute authentification
  Google. Un registre privé demande un identifiant de tirage dans Cloud Run.

Puis, dans « Create service » : *Deploy one revision from an existing container
image*, `Container image URL` = l'image poussée, `Container port` = `8080`.
Réglages complets : `knowledge/10-infrastructure/cloud-run-deploy-form.md`.

## Essai local

```sh
docker run --rm -p 8080:8080 \
  -e PUBLIC_HOST=localhost \
  -e API_URL=http://10.0.2.2:3000 \
  -e ENDPOINT_INGEST_SECRET="$ENDPOINT_INGEST_SECRET" \
  -e PORT=8080 -e PUBLIC_PORT=8080 \
  <compte>/vpn-endpoint:1.0.0
```

`PUBLIC_PORT=8080` en local : sans TLS devant, le client doit dial le port
exposé. `API_URL` doit être joignable **depuis le conteneur**.

Vérifier la configuration générée sans démarrer Xray :

```sh
docker run --rm --entrypoint /bin/sh <image> -c 'xray run -test -c /opt/endpoint/config.example.json'
# → « Configuration OK. »
```

## Logs attendus

Tout part sur **stderr**, préfixé par un horodatage UTC. Format exact :

```
2026-10-20T15:00:00Z endpoint: démarrage (clé de déploiement issue de K_SERVICE:K_REVISION, port local 8080, port public 443)
2026-10-20T15:00:01Z endpoint: enregistré : endpoint_id=ep_01J… status=pending expires_at=2026-10-20T19:30:00.000Z pool_revision=7
2026-10-20T15:00:01Z endpoint: configuration écrite et validée (xray run -test OK)
2026-10-20T15:00:01Z endpoint: xray démarré (pid 12)
2026-10-20T15:00:02Z endpoint: xray écoute sur 0.0.0.0:8080
2026-10-20T15:00:02Z endpoint: ready : status=active pool_revision=8
2026-10-20T15:00:02Z endpoint: heartbeat toutes les 45s
2026-10-20T15:00:47Z endpoint: heartbeat ok
```

Arrêt :

```
2026-10-20T15:30:00Z endpoint: SIGTERM reçu : arrêt du processus local. Aucune désinscription envoyée, l'endpoint reste actif jusqu'à expires_at.
```

**Ce qui n'apparaît jamais dans les logs** : l'UUID, le chemin WS, le jeton, et
le contenu de `config.json`. Xray est configuré avec `access: "none"`, donc il
n'écrit pas non plus l'URL des requêtes entrantes (qui contient le chemin WS).
Le journal d'accès est désactivé pour cette raison précise, pas par souci de
volume.

## Pièges Cloud Run (chacun coûte cher s'il est ignoré)

1. **`Request timeout` vaut 300 s par défaut.** Un tunnel WS est *une* requête :
   à 300 s la connexion tombe, soit une reconnexion toutes les 5 minutes. Passer
   à **3600**. Le maximum de la plateforme est 3600 s, donc aucun nœud ne peut
   promettre plus d'une heure de session : le client doit tourner à
   `max_session_seconds − 60`.
2. **Facturation à la requête = CPU bridé hors requête.** Sans client, le
   heartbeat de 45 s dérive (parfois de plusieurs minutes) : c'est normal. Il ne
   faut jamais déduire la mort d'un nœud de `last_seen_at` — seule `expires_at`
   fait foi. Le script ne tente pas de corriger la dérive.
3. **`min-instances = 0`.** Le premier paquet paie 1 à 3 s de cold start : le
   conteneur réenregistre **et** revalide sa configuration à chaque démarrage.
   Le client doit accorder une seconde chance avant de classer le nœud mauvais.
4. **`SIGTERM` n'est pas une fin de vie.** Il arrive aussi au scale-to-zero et au
   recyclage d'instance. Sortir en désinscrivant viderait le pool à chaque
   scale-down. Ici, `SIGTERM` ne fait **aucun** appel API.
5. **Le système de fichiers est éphémère.** Aucun état ne survit : la config est
   régénérée à chaque boot, et l'API doit être joignable au démarrage.
6. **L'URL publique n'est pas injectée, mais elle se déduit.** Sur Cloud Run,
   `entrypoint.sh` (lignes 73-83) construit `PUBLIC_HOST` à partir de `K_SERVICE`,
   du numéro de projet et de la région, lus sur le serveur de métadonnées. Rien
   à saisir **avant** le premier déploiement. Ne poser `PUBLIC_HOST` que pour un
   domaine personnalisé, ou hors Cloud Run.
7. **`Maximum instances` vide = 100.** À borner à 2. Toutes les instances d'une
   révision partagent le même UUID grâce à `deployment_key`.
8. **Le port de la sonde de démarrage par défaut est TCP.** Elle valide que le
   port écoute, pas que Xray répond correctement. C'est pour cela que
   l'entrypoint fait sa **propre** sonde HTTP locale avant d'annoncer `ready`.

## Détails d'implémentation utiles

- **Binaire** : l'image de base `teddysun/xray:latest` est Alpine (minirootfs
  3.24.2) et expose `/usr/bin/xray`, lancé par défaut avec
  `-config /etc/xray/config.json`. Le script le résout par `command -v xray` et
  échoue en `70` s'il est absent.
- **Validation de config** : `xray run -test -c <fichier>` affiche
  `Configuration OK.` et sort en `0` ; une config invalide sort en `23`. La
  sortie de l'échec est réaffichée **après masquage** de l'UUID et du chemin WS.
- **Sonde de disponibilité** : `curl http://127.0.0.1:$PORT/`. Mesuré sur Xray
  26.3.27 : une requête sans `Upgrade` reçoit **404** sur un chemin inconnu et
  **400** sur le chemin WS. Le script considère que le port répond dès qu'un
  code HTTP non nul arrive — c'est la preuve que le listener sert, un `sleep 2`
  n'en est pas une. La sonde vise `/` volontairement : viser le chemin WS
  mettrait ce chemin sur une ligne de commande visible dans `/proc`.
- **`routing`** : les plages privées et lien-local (`10/8`, `172.16/12`,
  `192.168/16`, `127/8`, `169.254/16`, `::1`, `fc00::/7`, `fe80::/10`) partent
  vers `blocked`. Sans cela, un utilisateur du tunnel peut atteindre le serveur
  de métadonnées GCP (`169.254.169.254`) depuis l'instance. `domainStrategy:
  "AsIs"` : on ne résout pas les domaines côté serveur pour les bloquer, on
  filtre sur l'IP de destination.
- **`streamSettings.network: "ws"`** plutôt que `method: "websocket"` : les deux
  sont acceptés, `network` est la forme historique. Xray imprime un avertissement
  de dépréciation de WebSocket (il pousse vers XHTTP) : c'est **un
  avertissement, pas une erreur**, et WS reste la seule transport que Cloud Run
  route en HTTP/1.1 avec nos clients.
- **Aucun `flow`/XTLS** : inutile sans TLS dans le conteneur, et incompatible
  avec WS.

## Dépannage

| Symptôme | Cause probable |
|---|---|
| `PUBLIC_HOST manquant` | hors Cloud Run : variable absente. Sur Cloud Run : la déduction a échoué (`K_SERVICE` absent, ou serveur de métadonnées injoignable) ; poser `PUBLIC_HOST` explicitement le temps de diagnostiquer |
| `API_URL manquant` / `ENDPOINT_INGEST_SECRET manquant` | variable absente du formulaire Cloud Run |
| `jeton d'ingestion refusé` (`401`/`403`) | `ENDPOINT_INGEST_SECRET` différent de celui de l'API |
| `déploiement expiré, nouvelle révision requise` (`409`) | cette `deployment_key` existe déjà et a expiré : redéployer une nouvelle révision |
| `route d'enregistrement absente` (`404`) | `API_URL` pointe sur le mauvais service, ou l'API n'a pas la route `/v1/internal` |
| `API injoignable` en boucle | DNS/sortie réseau, `API_URL` interne, API arrêtée. Le conteneur ne démarrera pas |
| `xray n'écoute pas sur le port 8080 après 60s` | `PORT` incohérent avec le port du conteneur Cloud Run, ou port déjà pris |
| `xray a refusé la configuration générée` | réponse d'API inattendue (chemin WS non conforme) ; l'erreur est réaffichée masquée |
| Le nœud reste `pending` côté API | `ready` n'a pas abouti (API injoignable) ; l'endpoint n'est pas encore distribué |
| Le tunnel tombe toutes les 5 minutes | `Request timeout` resté à 300 s |

## Ce qui a été vérifié, et ce qui ne l'est pas

La machine de développement n'a **pas** Docker en marche : l'image n'a pas été
construite, et aucun déploiement Cloud Run n'a eu lieu.

**Vérifié pour de vrai :**

- `sh -n infra/endpoint/entrypoint.sh` passe ; aucun bashisme (`[[`, `local`,
  tableaux, `$RANDOM`, `function`) ;
- variables obligatoires absentes → **exit 78** avec un message qui nomme la
  variable ; `PUBLIC_HOST` avec schéma, `API_URL` sans schéma et `PORT` non
  numérique → `78` ;
- parcours complet avec `curl` et `xray` simulés : `register → config → -test →
  écoute → ready → heartbeat → SIGTERM`, sortie `0`, aucun appel de
  désinscription, et l'UUID, le chemin WS et le jeton **n'apparaissent dans
  aucune ligne de log** ;
- **le vrai `jq` 1.7.1** exécute le programme de configuration : la structure
  produite est identique à `config.example.json` (comparaison par
  re-sérialisation), le chemin WS est préservé tel quel et le port vient de
  `$PORT` ;
- **le vrai binaire Xray 26.3.27** valide cette configuration :
  `xray run -test` → `Configuration OK.`, exit `0` ;
- `config.example.json` démarre un vrai Xray qui écoute, et la sonde renvoie
  `404` sur `/`, `400` sur le chemin WS ;
- un fichier de config illisible fait bien sortir `xray -test` en `23` ;
- les champs envoyés à `register` sont tous dans le schéma Zod de
  `apps/api/src/routes/internal.ts` (8 envoyés, 0 hors schéma ; `sni` n'est pas
  envoyé, l'API le remplace par `public_host`) ;
- déduction de `PUBLIC_HOST` (lignes 73-83), bloc extrait tel quel et exécuté avec
  un `curl` factice qui répond comme le serveur de métadonnées (`numeric-project-id`,
  `instance/region`) : `vpn-node-513999018169.us-west1.run.app`. Sans `K_SERVICE`
  ou sans métadonnées, la sortie est `78` (simulé, pas un Cloud Run réel).

**Non vérifié (première exécution réelle) :**

- `docker build` et le `apk add curl jq` de l'image ;
- le binaire Xray **Alpine** de `teddysun/xray:latest` (la validation ci-dessus
  utilise le build Windows de la même version) ;
- l'enregistrement contre l'API réelle, le `ready` et le heartbeat réels ;
- le comportement Cloud Run : `Request timeout = 3600`, CPU bridé, cold start,
  SIGTERM de plateforme.

Les scripts de ces vérifications sont dans
`knowledge/agents/infra-endpoint/notes/harness/` (`run-tests.sh` ne demande que
`sh` ; `run-real-jq.sh` demande `jq` et `xray`).

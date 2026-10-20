# Journal — infra-endpoint

## 2026-10-20T15:02:56Z · Création
- fait: charte créée
- portée: Écrire infra/endpoint : Dockerfile, entrypoint POSIX, config Xray générée depuis l enregistrement, heartbeat, arrêt sans désinscription. Livrable exécutable sur Cloud Run, sans dépendance à gcloud.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-20T16:57:14Z · Image de base verifiee

- fait: Config OCI de teddysun/xray:latest (tag du 2026-10-18) lue via l'API registry Docker : base alpine-minirootfs-3.24.2 (apk dispo), Cmd /usr/bin/xray -config /etc/xray/config.json, VOLUME /etc/xray et /var/log/xray, geosite/geoip dans /usr/share/xray. Binaire et chemin confirmes, pas supposes.
- etat: ok
- suite: ecrire les 5 fichiers du lot

## 2026-10-20T16:57:14Z · Schema Xray verifie dans le code source

- fait: decryption:none obligatoire (infra/conf/vless.go) ; network et method sont deux alias acceptes (infra/conf/transport_internet.go) ; xray run -test sort 0 avec 'Configuration OK.' et 23 sinon (main/run.go) ; access:none desactive le journal d'acces (infra/conf/log.go).
- etat: ok
- suite: ecrire entrypoint + config.example

## 2026-10-20T16:57:40Z · Lot infra/endpoint ecrit

- fait: Dockerfile (teddysun/xray:latest + apk add curl jq, ENTRYPOINT), entrypoint.sh (POSIX set -eu, register retry 2->30s, jq -n, xray -test, sonde HTTP, ready, heartbeat 45s, SIGTERM sans desinscription), config.example.json, README.md, .dockerignore en liste blanche.
- etat: ok
- suite: verifier reellement

## 2026-10-20T16:57:40Z · Verifications executees

- fait: sh -n OK, zero bashisme ; 3 variables manquantes -> exit 78 avec message nommant la variable ; parcours complet avec curl/xray simules -> exit 0 apres SIGTERM, aucun appel de desinscription, UUID/chemin WS/jeton absents des logs ; vrai jq 1.7.1 -> structure identique a config.example.json ; vrai xray 26.3.27 -> 'Configuration OK.' exit 0 ; sonde mesuree 404 sur / et 400 sur le chemin WS.
- etat: ok
- suite: rapport + cloture

## 2026-10-20T16:58:26Z · Rapport ecrit

- fait: notes/rapport.md : fichiers, decisions (PORT vs PUBLIC_PORT, blocs prives, heartbeat sans latence mensongere, SIGTERM sans desinscription), verifications reelles, reste non teste sans Docker.
- etat: ok
- suite: cloture

## 2026-10-20T16:58:47Z · CLÔTURE
infra/endpoint livre : Dockerfile, entrypoint POSIX, config.example.json, README, .dockerignore. sh -n OK, zero bashisme, env incomplet -> 78, parcours simule -> exit 0 sans desinscription ni secret dans les logs. Config produite validee par le vrai xray 26.3.27 ('Configuration OK.'). Non teste : docker build et cycle reel contre l'API (pas de daemon Docker).

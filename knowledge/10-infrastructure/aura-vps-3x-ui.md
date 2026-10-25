---
id: aura-vps-3x-ui
title: aura-vps — 3x-ui derrière nginx (base du plan limité)
tags: [vps, 3x-ui, xray, nginx, plan-limite]
status: verified
updated: 2026-10-24
related: [3x-ui, cloud-run, node-control, decisions]
---

> **Statut 2026-10-24 (D84 corrigée).** Le relais Cloud Run → VPS n'est **pas**
> retenu pour le plan illimité, qui reste `infra/endpoint` (xray dans Cloud Run).
> Mais **3x-ui sur VPS garde son utilité pour le plan limité** (VPS permanents,
> temps + quota, identité par appareil — `00-brief/objective.md`). Le serveur
> reste donc en place ; le démonter n'est pas la règle par défaut.

État réel du VPS `aura-vps` (198.251.65.186, Ubuntu 24.04.5, hôte SSH
`aura-vps` dans `~/.ssh/config`, utilisateur `claude`, sudo sans mot de passe)
au 2026-10-23. Partagé avec Dokku (`aura-worker`, `aura-db`).

## Ce qui a été retiré

L'Xray installé le 2026-10-22 par le script XTLS (`xray.service`, utilisateur
`xray`, `/usr/local/bin/xray`, `/usr/local/etc/xray/config.json`, un client
`vps@node`, VLESS+WS sur `127.0.0.1:10000`, chemin `/vless-ws`).
Sauvegarde : `/root/backup-xray-20261023-135259/` (config, unités systemd,
ancien `xray-ws.conf`). Unités, binaire, config et utilisateur `xray` supprimés.

## Ce qui tourne

- Conteneur Docker `3x-ui`, image `ghcr.io/mhsanaei/3x-ui:latest` étiquetée
  localement `3.10.2-local` (label `org.opencontainers.image.version=3.10.2`,
  dernière release GitHub `v3.10.2` du 2026-10-14). `--network host`,
  `--restart unless-stopped`, volumes `/opt/3x-ui/db:/etc/x-ui` et
  `/opt/3x-ui/cert:/root/cert`. Xray embarqué : 26.10.10 (journal du conteneur).
- Panneau : `127.0.0.1:2053`, chemin de base aléatoire. Identifiants, URL et
  jeton API (scope `admin`, nom `orchestrator`) dans `/root/3x-ui-admin.txt`
  (0600). Jamais recopiés ailleurs.
- Abonnement : `*:2096` (pas réglable par `x-ui setting`) — bloqué par ufw.
- Inbound id 1 `cloudrun-vless-ws` : VLESS, `127.0.0.1:10000`, WS `/bouendji-vpn`,
  `security: none`, client `cloudrun-test` (UUID neuf, lisible dans le panneau).
- nginx `/etc/nginx/conf.d/xray-ws.conf` : port 80, `server_name
  198.251.65.186 *.run.app;`, `location = /bouendji-vpn` (correspondance exacte,
  la query `?ed=2048` passe) → `proxy_pass http://127.0.0.1:10000`. Chemin
  passé de `/vless-ws` à `/bouendji-vpn` le 2026-10-23 à la demande de
  l’utilisateur (mise à jour API `inbounds/update/1` + nginx, client conservé).
  Le chemin doit être identique dans 3x-ui, nginx et le client.

## Vérifié (2026-10-23)

- Depuis le VPS : upgrade WS sur `127.0.0.1/vless-ws` (puis `/bouendji-vpn`, avec et sans `?ed=2048`) avec `Host:
  198.251.65.186` et `Host: test-abc.a.run.app` → `101` ; Host inconnu → 444.
- Depuis l'extérieur, `--noproxy '*'` : `http://198.251.65.186/vless-ws` en WS
  → `101 Switching Protocols` (idem sur `/bouendji-vpn`, `/vless-ws` → 404) ;
  `:2053` → fermé (timeout).
- Login formulaire du panneau → `403` (CSRF) ; le jeton Bearer passe
  (`/panel/api/inbounds/list` → 200, `/panel/api/openapi.json` → 200).

## Pièges

- **Cloud Run réécrit `Host` en `<service>.run.app`.** Le catch-all Dokku
  (`00-default-vhost.conf`, `default_server`, `return 444`) avalait ces
  requêtes : d'où l'ajout de `*.run.app` au `server_name`.
- Le relais `praveenkarunarathne/Google-Cloud-Run-Proxy` (`main.go`) vise
  **`V2RAY_SERVER_IP:80` en dur**, en TCP brut : le VPS doit parler HTTP/WS en
  clair sur 80. Il ignore l'erreur de `net.Dial` : si le VPS est injoignable,
  `remoteConn` vaut `nil` et `defer remoteConn.Close()` fait paniquer
  l'instance (relu, non exécuté).
- `x-ui setting -getApiToken` **régénère** le jeton et invalide le précédent.
- La machine Windows passe par `HTTP_PROXY=127.0.0.1:10808` : un test `curl`
  sans `--noproxy '*'` mesure ce proxy (faux `503` sur 2053).
- Depuis la ligne de l'utilisateur, `Host: *.run.app` vers l'IP du VPS donne
  `404` alors que le VPS répond `101` en local : cause **non vérifiée**
  (filtrage du FAI sur le nom d'hôte ?). Sans effet sur Cloud Run → VPS.

## Relais Cloud Run déployé (2026-10-23)

Déployé par l'utilisateur : `https://google-cloud-run-proxy-775920917576.us-central1.run.app`
(projet 775920917576, `us-central1`, `V2RAY_SERVER_IP=198.251.65.186`).
Vérifié depuis le VPS (`curl --http1.1`, upgrade WS) : `/bouendji-vpn` → `101`,
`/vless-ws` et `/` → `404` ; le journal nginx montre les requêtes arriver des
IP Google `34.96.x.x`. Depuis la machine Windows, curl échoue en TLS (exit 35,
cf. limites réseau dans `AGENTS.md`) : tester depuis le VPS.

## Non vérifié

- Un vrai client VLESS (v2rayNG/NekoBox) passant par le relais : seule
  l'ouverture WS est testée, pas un tunnel complet.
- Le « domain fronting » (adresse = IP Google, SNI = autre domaine Google,
  `host` = `*.run.app`) utilisé par la config d'exemple de l'utilisateur :
  **non testé**.
- Que `docker` en `--network host` reste filtré par ufw après reboot (vérifié
  seulement à chaud).

## Tunnel `cloudflared` vers le panneau (D85, 2026-10-23)

- `cloudflared` 2026.10.3 installé depuis le dépôt apt officiel
  `pkg.cloudflare.com`, service systemd `cloudflared` (jeton dans l'unité).
- Tunnel **`ctl-aura`**, id `3d690add-005f-4e61-ac51-1003c232445e`, compte
  Cloudflare `e72b8fa58c9783c95109d8d6d18d72ee`, créé par `wrangler tunnel
  create` (wrangler 4.145.0, scope `connectivity (admin)`). Géré à distance :
  règles posées par `PUT /accounts/…/cfd_tunnel/…/configurations` (200).
- Règles : `ctl-aura.numzer0.store` + chemin
  `^/<basePath>/panel/api/(clients/.*|inbounds/get/[0-9]+)$` →
  `http://127.0.0.1:2053` ; tout le reste → `404`. Le panneau web, `setting/*`
  et `openapi.json` ne passent **pas** par le tunnel.
- Vérifié : `systemctl is-active cloudflared` → `active`, 4 connexions
  `Registered tunnel connection` (mci01, mci03, okc01).
- **DNS non créé** : le jeton OAuth de wrangler n'a que `zone (read)` →
  `POST dns_records` = 403 `Authentication error`. Reste à faire par
  l'utilisateur : CNAME `ctl-aura` → `3d690add-005f-4e61-ac51-1003c232445e.cfargotunnel.com`,
  proxifié. Puis Cloudflare Access + jeton de service sur ce hostname.
- Non vérifié : appel de bout en bout via `https://ctl-aura.numzer0.store`
  (bloqué par le DNS).

## Démontage (non fait, à décider)

Pas de démontage prévu : ce serveur sert le plan limité. Si ce plan est
abandonné, les étapes de retour arrière sont : `sudo docker rm -f 3x-ui`,
`sudo cloudflared service uninstall`, `wrangler tunnel delete
3d690add-005f-4e61-ac51-1003c232445e`, restaurer `xray-ws.conf` depuis
`/root/backup-xray-20261023-135259/`. Non exécuté.

### État cloudflared au 2026-10-24

- Service `cloudflared` **active** sur aura-vps (2026.10.3), tunnel `ctl-aura`
  **healthy** côté Cloudflare (`wrangler tunnel info`), connexions enregistrées.
- Règles d'ingress en place (voir plus haut), panneau toujours en `127.0.0.1`.
- **DNS absent** : `ctl-aura.numzer0.store` ne résout ni en CNAME ni en A
  (vérifié depuis la machine locale et depuis le VPS). Le jeton OAuth de wrangler
  ne permet pas d'écrire la zone (`zone (read)` seulement, POST dns_records → 403).
- **Cloudflare Access absent** : pas d'application ni de jeton de service créés.
  Sans cela, seul le chemin aléatoire du panneau et le Bearer 3x-ui protègent
  l'accès une fois le DNS créé.

### Pour finir la mise en place

1. Créer un jeton d'API Cloudflare avec **Zone → DNS → Modifier** sur
   `numzer0.store` (et **Accès Zero Trust → Applications → Modifier** si Access
   doit être fait par API). Le stocker en variable d'environnement locale, ne
   jamais le coller dans le chat ni dans `knowledge/`.
2. Créer le CNAME `ctl-aura` → `3d690add-005f-4e61-ac51-1003c232445e.cfargotunnel.com`,
   proxifié. Alternative sans API : Zero Trust → Networks → Tunnels → `ctl-aura`
   → Public hostname.
3. Vérifier : `dig ctl-aura.numzer0.store` résout, puis
   `curl -H "Authorization: Bearer …" https://ctl-aura.numzer0.store/<basePath>/panel/api/inbounds/list`
   → `200`, et `https://ctl-aura.numzer0.store/` → `404`.
4. Créer l'application Access (self-hosted sur `ctl-aura.numzer0.store`) et un
   jeton de service, puis la règle « Service Auth ». Vérifier qu'une requête sans
   les en-têtes `CF-Access-Client-Id` / `CF-Access-Client-Secret` est refusée.

Non vérifié : l'appel de bout en bout via le hostname (bloqué par le DNS).

Vérifié 2026-10-24 : `wrangler login --scopes-list` ne propose **aucun scope DNS
en écriture** (seuls `zone:read` et `connectivity:admin`). Wrangler ne peut donc
pas créer le CNAME : il faut un jeton d'API Cloudflare (Zone → DNS → Modifier),
ou le hostname ajouté via Zero Trust → Tunnels → `ctl-aura` → Public hostname.

### Mise à jour 2026-10-24 — DNS créé, tunnel vérifié

- **CNAME créé** dans `numzer0.store` (compte `e72b8fa…`) : `ctl-aura` → tunnel
  `3d690add-…` (type Tunnel, proxifié). Créé via le tableau de bord (Chrome
  DevTools), wrangler ne pouvant pas écrire le DNS. Résolution vérifiée : A
  `172.67.223.104`, `104.21.54.38`.
- **Test de bout en bout depuis le VPS** :
  - `clients/list` avec Bearer → `200` (données de 3x-ui servies à travers le tunnel) ;
  - `clients/list` sans Bearer → `404` (3x-ui ne révèle rien sans jeton) ;
  - `setting/all` avec Bearer → `404` (route hors règles, bloquée côté Cloudflare) ;
  - `/` → `404`.
- **Cloudflare Access : toujours absent.** Zero Trust n'est pas activé sur ce
  compte (page « Get started »). L'activer peut demander un moyen de paiement
  même sur le plan gratuit : **décision à prendre par l'utilisateur**, non faite.
- Protection actuelle du hostname : chemin aléatoire + jeton Bearer + règles
  d'ingress. Suffisant pour l'API à ce stade, mais Access ajoute une seconde
  barrière avant l'application.

### Précision 2026-10-24 — pas besoin de Zero Trust pour le tunnel

- Le tunnel se gère dans **Networking → Tunnels** du compte
  (`dash.cloudflare.com/e72b8fa…/tunnels`), sans activer Zero Trust.
- Zero Trust n'est requis que pour **Cloudflare Access** (couche d'authentification
  devant le hostname). Décision de l'utilisateur, 2026-10-24 : **Access non mis en
  place pour l'instant**. Le hostname reste protégé par le chemin aléatoire, le
  Bearer 3x-ui et les règles d'ingress du tunnel. À rouvrir si le panneau est exposé
  à un autre usage que l'API.

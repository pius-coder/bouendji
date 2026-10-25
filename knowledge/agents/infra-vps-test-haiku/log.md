# Journal — infra-vps-test-haiku

## 2026-10-25T05:23:55Z · Création
- fait: charte créée
- portée: 1) Déployer l'image ghcr.io/pius-coder/vpn-endpoint:latest sur aura-vps (Docker, conteneur de test jetable) contre https://api.numzer0.store et prouver register → ready → heartbeat → présence dans le pool admin. 2) Retirer de la doc/env toute exigence de saisir l'URL Cloud Run avant déploiement (PUBLIC_HOST déduit des métadonnées depuis 4105b82).
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-25T05:25:28Z · Lecture charte, nœuds et entrypoint

- fait: Lu charte, aura-vps-dokku-test, cloud-run-deploy-form, handoff-2026-10-24, infra/endpoint/README.md, entrypoint.sh (429 lignes). Contrat : register/config/xray -test/ready/heartbeat 45s ; PUBLIC_HOST déduit lignes 73-83 si K_SERVICE.
- etat: ok
- suite: Vérifier le VPS (ssh aura-vps, docker sudo, dokku), puis smoke test conteneur jetable

## 2026-10-25T05:29:09Z · Tâche 1 — smoke test endpoint sur aura-vps

- fait: Conteneur jetable vpn-endpoint-smoke (ghcr.io/pius-coder/vpn-endpoint:latest, digest a82d1d49…), PUBLIC_HOST=smoke.invalid, ENDPOINT_TTL=900, sans port publié, secret via env-file 0600 supprimé juste après docker run. Logs conteneur : enregistré (endpoint_id b11c0162…, status=pending, 05:26:21Z), xray -test OK, xray écoute 8080, ready status=active (05:26:23Z), heartbeat ok 05:27:08Z et 05:27:53Z (3 au total avant suppression). Dokku vpn-api : register 200 (05:26:21.83), ready 200 (05:26:23.18), heartbeat 200 (05:27:08.25, 05:27:53.29) — horodatages corrélés aux logs conteneur. Constat : expires_at = register+3600 s, pas 900 : ENDPOINT_MIN_TTL=3600 (config.ts:170) clamp (services/endpoints.ts:213-221). Nettoyage : conteneur supprimé, env-file absent, ps -a vide. Résidu : nœud smoke.invalid reste 'active' dans la liste servie jusqu'à ~06:26:21Z (pas de désinscription, pas de purge sur heartbeat).
- etat: partiel
- suite: Vérifier présence pool admin (non fait : nécessite identifiants admin, non lus). Décision requise de l'orchestrateur : retirer le nœud résiduel (sans doute via action admin, à valider par l'utilisateur). Tâche 2 ensuite.

## 2026-10-25T05:31:00Z · Tâche 2 — déduction PUBLIC_HOST et doc Cloud Run

- fait: entrypoint.sh l.73-83 testé (bloc extrait, curl factice) : métadonnées OK -> vpn-node-513999018169.us-west1.run.app (rc 0) ; métadonnées absentes ou K_SERVICE absent -> exit 78 'PUBLIC_HOST manquant' (rc 78). Limite : pas de Cloud Run réel, format d'URL non constaté (non vérifié). README modifié (tableau variables, ENDPOINT_TTL min 3600 vérifié config.ts:170, piège 6, dépannage, section vérifié marquée simulation). cloudrun.env : aucune modification (ne contient pas PUBLIC_HOST ; vérification par clés seulement). Proposition pour cloud-run-deploy-form et cloud-run-url écrite dans notes/proposition.md (nœuds partagés non touchés).
- etat: ok
- suite: Orchestrateur : intégrer notes/proposition.md ; décider du sort du nœud smoke.invalid résiduel (actif jusqu'à ~06:26Z)

## 2026-10-25T05:31:01Z · CLÔTURE
Smoke test OK côté endpoint (register/ready/heartbeat x2 vus dans logs conteneur et vpn-api, 200). Nœud smoke.invalid résiduel dans la liste servie jusqu'à ~06:26Z (TTL relevé à 3600 s par l'API). Présence pool admin non vérifiée. PUBLIC_HOST déduit : logique vérifiée en simulation, non vérifiée sur Cloud Run réel. README corrigé ; propositions pour nœuds partagés dans notes/proposition.md. Conteneur et env-file supprimés.

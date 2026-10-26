# Audit infra - conteneur endpoint et deploiement de nuit

Lecture seule. Aucun deploiement, aucun `docker`, `gcloud` ou SSH. Chemins relatifs a `C:\Users\lenovo\Projects\bouendji`. Les chiffres de l'API 3x-ui viennent de notes lues, pas d'un test.

## 1. Verdict

- Le conteneur `infra/endpoint` est coherent : register, config, `xray -test`, ready, heartbeat, SIGTERM sans desinscription. Il n'a jamais ete construit ni deploye ici (`infra/endpoint/README.md:271-272`).
- Le deploiement manuel de nuit n'est pas faisable par un membre « Reseau » non technicien en l'etat : une douzaine de champs, un secret a lire en SSH sur `aura-vps` (`cloud-run-deploy-form.md:41`), un compte de lab Qwiklabs (`deploiement-etat.md:33-34`), et une duree par defaut (4 h 30) qui ne tombe pas sur les creneaux (4 h).
- Le forfait limite 3x-ui : l'API de creation de client, de quota, de trafic et de desactivation est documentee sur source (`knowledge/agents/xray-ops/notes/3x-ui-verdict.md:364-371`), mais testee seulement en lecture sur `aura-vps`. Il n'y a ni VM GCP, ni DNS automatisable, ni Access, ni quota ou expiration verifies de bout en bout.
- Plusieurs nœuds se contredisent (region, PUBLIC_HOST, statut de Cloud Run, duree de vie). Voir section 2, bloc « Contradictions ».

## 2. Inventaire

| Fichier | Role | Taille approx. | Etat |
|---|---|---|---|
| `infra/endpoint/entrypoint.sh` | Sequence complete du conteneur, 428 lignes | 16,5 Ko | solide (lecture), non execute en reel |
| `infra/endpoint/README.md` | Contrat d'ingestion, variables, pieges Cloud Run | 17 Ko | partiel : table des variables incomplete (`ENDPOINT_FRONT_*` absents), revendique des tests dont l'execution est hors de cette tranche |
| `infra/endpoint/Dockerfile` | Image `teddysun/xray:latest` + curl, jq | 28 lignes | partiel : base non epinglee (`Dockerfile:6`) |
| `infra/endpoint/config.example.json` | Exemple statique (UUID fictif, path `/ws/exemple`) | 1,1 Ko | solide, documentaire uniquement (`README.md:31-33`) |
| `knowledge/10-infrastructure/cloud-run.md` | Contraintes de la plateforme | 3,7 Ko | solide ; prix non cites (`cloud-run.md:25-26`) |
| `knowledge/10-infrastructure/cloud-run-deploy-form.md` | Valeurs du formulaire, image GHCR | 6 Ko | partiel : region contradictoire (`:19` vs `:42`) |
| `knowledge/10-infrastructure/cloud-run-url.md` | Decision PUBLIC_HOST | 2 Ko | creux/statique : statut `open`, recommandation non appliquee |
| `knowledge/10-infrastructure/deploiement-etat.md` | Etat du 2026-10-20, remplace | 2,7 Ko | mort (`status: stale`, `:10-12`) |
| `knowledge/10-infrastructure/endpoint-lifecycle.md` | Etats, TTL, drain | 2 Ko | solide ; pas de sonde de l'etat `active` (`:51-53`) |
| `knowledge/10-infrastructure/gcp-v2ray-repo.md` | Historique du depot tiers a reecrire | 2,3 Ko | creux/statique (depot tiers, `:49-50` obsolete) |
| `knowledge/10-infrastructure/node-control.md` | Pilotage (D39) | 7 Ko | solide (decision), sections tunnel et 3x-ui non testees |
| `knowledge/10-infrastructure/traffic-stats.md` | Consommation (D39) | 5,4 Ko | solide (decision) ; aucune table d'usage (`:12-13`) |
| `knowledge/10-infrastructure/aura-vps-3x-ui.md` | 3x-ui sur aura-vps, tunnel ctl-aura | 10,7 Ko | partiel : statut « verified » en tete, mais section relais contraire a D84 (`:75-82`) |

Taille hors tranche lue : `knowledge/60-research/3x-ui.md` (lignes 20-75), `knowledge/agents/xray-ops/notes/3x-ui-verdict.md` (lignes ciblees), `knowledge/00-brief/decisions.md` (D21, D22, D32, D84, D93, D96, D97, D113-D115).

### Contradictions entre nœuds

- **C1 Region.** `cloud-run-deploy-form.md:19` dit « us-central1 (seule proposee) ». Le meme fichier donne `us-west1` en exemple (`:42`), et `entrypoint.sh:84` et `README.md:45` donnent `us-central1`. La deduction de PUBLIC_HOST a ete verifiee avec `us-west1` (`README.md:299`). Le relais aura est en `us-central1` (`aura-vps-3x-ui.md:77`).
- **C2 PUBLIC_HOST.** `cloud-run-url.md:29-41` recommande PUBLIC_HOST obligatoire (statut `open`). `entrypoint.sh:73-83` et `README.md:214-218` deduisent l'URL et disent « rien a saisir ». `cloud-run-deploy-form.md:42` le demande encore a la saisie.
- **C3 Cloud Run abandonne ou non.** `deploiement-etat.md:10-12` et `00-brief/decisions.md:151-153` (D32) disent Cloud Run abandonne. `decisions.md:484-496` (D84) et `:555-559` (D96) le reinstaurent pour le plan illimite. `cloud-run-deploy-form.md:48-50` dit « verifie le 2026-10-24 ».
- **C4 Duree de vie.** Le brief dit « 4 h de vie » (`knowledge/30-clients/audit-brief.md:48`), D115 dit « vit 4 h » (`decisions.md:659-664`). Le code et la doc donnent 16 200 s, soit 4 h 30 (`endpoint-lifecycle.md:33`, `cloud-run-deploy-form.md:46`, D21). D113 dit « redeployes toutes les 2 a 4 h ».
- **C5 Ou tourne `vpn-api`.** `cloud-run-deploy-form.md:41` lit le secret par `dokku config:get vpn-api` sur `aura-vps`. D32 dit que l'API est sur Vercel (`decisions.md:151-156`). Lequel est vrai : (non verifie, a confirmer dans `vercel.md`).
- **C6 Heartbeat.** `entrypoint.sh:22` = 45 s, `README.md:18` = 45 s, `cloud-run.md:72` cite « environ 60 s ».
- **C7 3x-ui et GCP.** D114 et D113 veulent des VM GCP permanentes. `aura-vps-3x-ui.md:16-18` decrit un VPS (IP 198.251.65.186) dont le fournisseur n'est pas indique (non verifie : n'est pas GCP). D22 parle de « noeud VPS ».

## 3. Ce qui sert le plan

- Contrat d'ingestion propre et sortant seulement : `entrypoint.sh:159-176` (post_json, Bearer), `:192-217` (payload register, champs optionnels omis si vides), `:264-279` (validation de l'UUID et du chemin).
- `deployment_key = K_SERVICE:K_REVISION` : toutes les instances d'une revision ont le meme UUID, un restart ne prolonge pas la vie (`README.md:76-84`, `entrypoint.sh:137-140`). C'est ce qui protege le pool (`endpoint-lifecycle.md:41-43`).
- Pas de desinscription au SIGTERM : `entrypoint.sh:223-235`. Coherent avec `cloud-run.md:64-68`.
- Config generee avec `jq -n`, pas de gabarit : `entrypoint.sh:287-336`, avec blocage des plages privees (`:317-331`) pour empecher l'acces aux metadonnees.
- Logs sans UUID ni chemin WS : `README.md:189-193`, `entrypoint.sh:224`.
- Deduction de PUBLIC_HOST sur Cloud Run : `entrypoint.sh:73-83` (utilisable pour le point 8 du plan, sans saisie).
- 3x-ui sur aura-vps : conteneur en `--network host`, panneau en `127.0.0.1:2053`, inbound VLESS-WS en loopback, nginx : `aura-vps-3x-ui.md:30-46`. Verifie : `aura-vps-3x-ui.md:50-56` et `:164-168` (clients/list en 200 avec Bearer, 404 sans, tunnel ctl-aura actif).
- Tunnel de controle sans port public : `aura-vps-3x-ui.md:94-113` (regles d'ingress limitees a clients/* et inbounds/get). Sert au plan limite (D85).
- Architecture 3x-ui retenue : un conteneur par VM, panneau loopback, Bearer scope, `restartXrayOnClientDisable=false`, un client par appareil (`knowledge/60-research/3x-ui.md:69-71`).

## 4. Ecarts avec le plan

### 4.1 Point 4 (forfaits) : procedure de deploiement nocturne (question 1)

Procedure actuelle, dans l'ordre (`cloud-run-deploy-form.md:14-50`) :

1. Image : `ghcr.io/pius-coder/vpn-endpoint:latest` (public, D96 `decisions.md:555-558`). Verifie le 2026-10-24 : le workflow `endpoint-image` est en succes et le manifeste est lisible sans authentification (`cloud-run-deploy-form.md:48-50`).
2. Nom de service `node-NN` : immuable, il entre dans l'URL et dans la deployment_key (`:18`, `entrypoint.sh:137`).
3. Region : `us-central1` (`:19`, contradiction C1).
4. Authentification publique, facturation a la requete, min 0, max 2 (`:20-23`). Sinon max vaut 100 par defaut (`:107`).
5. Ingress All, port 8080, 512 Mio, 1 vCPU, timeout **3600** (`:24-28`, piege a 300 par defaut `:52-61`), Second generation, CPU boost, affinite off, HTTP/2 off, sonde TCP sur `$PORT` (`:29-33`).
6. Variables d'environnement (`:40-46`) : `API_URL=https://api.numzer0.store`, `ENDPOINT_INGEST_SECRET` (lu par `ssh aura-vps "dokku config:get vpn-api ..."`, `:41`), `PUBLIC_HOST` (facultatif, `:42`), `ENDPOINT_FRONT_ADDRESS` et `ENDPOINT_FRONT_SNIS` (`:43-44`), `ENDPOINT_LABEL` et `ENDPOINT_REGION` (`:45`), `ENDPOINT_TTL` (`:46`, exemple 16200).
7. Creation, puis le conteneur s'enregistre seul : register, config, xray, ready, heartbeat (`entrypoint.sh:243-428`).

Faisabilite pour un non-technicien a 20 h et a minuit :

- Non faisable en l'etat. Il faut une session sur `aura-vps` pour lire le secret (`:41`), donc un acces SSH, que le role « Reseau » n'a pas (role decrit par `audit-brief.md:26-28` : il ne voit que l'espace Reseau).
- Le secret global est colle en clair dans la console Cloud Run (`:41`, reconnu comme « lisible dans la console », `deploiement-etat.md:52-54`). Un membre Reseau le voit donc.
- Le compte de deploiement est un compte de lab Qwiklabs (`deploiement-etat.md:33-34`, `cloud-run-deploy-form.md:109` sur l'ancien service, `decisions.md:563`, « free-labs = Qwiklabs »). Sa date d'expiration n'est pas verifiee (non verifie).
- Une duree par defaut inadaptee : sans `ENDPOINT_TTL`, l'API prend 16 200 s (`entrypoint.sh:62`, `README.md:98`). Un creneau 20 h-24 h finit alors a 00 h 30. Pour un creneau de 4 h, il faut `ENDPOINT_TTL=14400` : la valeur est acceptee car elle est entre 3 600 et 30 jours (`README.md:98`). Aucune note ne le dit.
- Duree de la saisie : non verifiee (aucune mesure). Ordre de grandeur de la saisie : une douzaine de champs, dont le secret.

Valeurs que le dashboard peut afficher a copier, sans secret :

- image, region, nom de service generique, CPU, memoire, timeout 3600, min 0, max 2, ingress All, port 8080, sonde TCP ;
- `API_URL` (public) ;
- `ENDPOINT_LABEL` (nom generique, voir 4.2) ;
- `ENDPOINT_REGION` ;
- `ENDPOINT_TTL=14400` pour un creneau de 4 h ;
- `ENDPOINT_FRONT_ADDRESS` et `ENDPOINT_FRONT_SNIS` : non secrets, mais le fronting n'est pas teste (`aura-vps-3x-ui.md:88-90`) et n'est pas documente dans le README (absent de `README.md:88-101`).

Le secret ne doit pas etre affiche. Il faudrait un jeton de deploiement propre a un creneau (voir section 5).

### 4.2 Point 8 : noms de nœuds generiques (question 2)

- Aujourd'hui, le nom est fixe par `ENDPOINT_LABEL` (`entrypoint.sh:60`, envoye a `:197`, `:208`). Si absent, l'API prend `public_host`, c'est-a-dire l'URL brute (`README.md:96`).
- Le conteneur ne genere aucun nom. Un nom aleatoire dans l'entrypoint serait instable : le systeme de fichiers est ephemere et chaque cold start reenregistre (`cloud-run.md:58-62`). Il faut donc generer le nom cote dashboard, le stocker, puis le passer en `ENDPOINT_LABEL`.
- Le nom de service `K_SERVICE` apparait aussi dans l'URL publique et dans `deployment_key` (`entrypoint.sh:137-140`, `cloud-run-deploy-form.md:18`). Un nom generique doit donc etre pose aussi a ce niveau, sinon `node-01` reste visible dans l'URL.
- Inconnu : si l'API met a jour le label lors d'un nouveau `register` de la meme `deployment_key` (non verifie, `services/endpoints.ts` hors tranche).

### 4.3 Point 4, forfait limite 3x-ui sur VM GCP (question 3)

Etat du serveur actuel, `aura-vps` (`aura-vps-3x-ui.md`) :

- 3x-ui `3.10.2` en conteneur Docker, panneau `127.0.0.1:2053`, chemin aleatoire, jeton API scope admin dans un fichier 0600 (`:30-37`).
- Inbound `cloudrun-vless-ws` sur `127.0.0.1:10000`, chemin `/bouendji-vpn`, un client de test (`:39-40`). Client de test : ne pas recopier.
- nginx sur le port 80 relaie le chemin WS (`:41-46`). Abonnement sur 2096 bloque par ufw (`:38`).
- Tunnel `cloudflared` ctl-aura actif, 4 connexions (`:98-107`), CNAME cree a la main le 2026-10-24 (`:158-163`).

API disponible d'apres les notes (source lue, pas testee sauf mention) :

- Creer un client : `POST /panel/api/clients/add` et `/clients/bulkCreate` (`knowledge/agents/xray-ops/notes/3x-ui-verdict.md:364`). Le quota et l'echeance sont `total` (octets) et `expiryTime` (`knowledge/60-research/3x-ui.md:53-54`), et `totalGB` dans le corps d'update (`verdict.md:376`). Le nom exact dans le corps de creation est (non verifie).
- Lire le trafic : `GET /panel/api/clients/traffic/:email` (fraicheur 5 s, `verdict.md:367`, `3x-ui.md:26-28`) et `clients/list` (`verdict.md:368`).
- Desactiver : `POST /panel/api/clients/bulkDisable` (`node-control.md:116-121`, `3x-ui.md:60`). Ne touche qu'a `enable` (`3x-ui.md:60`).
- Verifie sur aura-vps : `clients/list` en 200 avec Bearer, 404 sans, `inbounds/list` en 200 (`aura-vps-3x-ui.md:56`, `:165-168`). Non verifie sur aura : clients/add, quota, traffic, bulkDisable.
- Reglage critique non documente pour aura : `restartXrayOnClientDisable=false`. Par defaut a `true`, il coupe tous les clients du noeud au moindre desactivation (`3x-ui.md:22-24`). Non verifie sur aura.
- Piege : `GetUsersStats` ne liste que les clients en ligne, donc inutilisable pour le quota (`3x-ui.md:61-62`).

Ce qui manque pour des VM GCP permanentes avec 3x-ui :

1. Aucune definition de VM dans le depot hors `infra/endpoint` (non verifie : je n'ai lu que `infra/endpoint`). Ni script ni IaC.
2. Un chemin de controle automatisable : le CNAME de `ctl-aura` a ete cree a la main car le jeton wrangler n'a pas le scope DNS (`aura-vps-3x-ui.md:153-163`). Par VM, il faudrait un jeton API avec Zone DNS Modifier, ou Zero Trust (`:137-143`). Sans cela, la creation de client a l'achat (D114) ne peut pas etre automatique.
3. Cloudflare Access absent (`:169-171`). Le panneau est protege seulement par un chemin aleatoire et le Bearer.
4. Auto-update du panneau a desactiver (`3x-ui.md:64-65`), non verifie sur aura.
5. Identite : un client par appareil `d-<devices.id>` (`3x-ui.md:69-71`) face a D113 (« son propre client, lien unique par abonne »). A trancher.
6. Quota et coupure a l'epuisement (D113, D114) : jamais testes de bout en bout sur un noeud.
7. Perte de compteurs si le panneau s'arrete (`3x-ui.md:30-31`). Le quota en depend.

### 4.4 Point 6 : Telegram, rappels de creneau (hors tranche, signale)

Le rappel 15 min avant un creneau depend de deux horaires : `opens_at` et `closes_at`. Ils n'existent pas dans les notes de ma tranche. Le cycle de vie ne connait que `expires_at` et le drain de 900 s (`endpoint-lifecycle.md:29`, `:36`). Pour une relance a 5 min, il faut un champ de creneau (voir section 5). Non verifie cote API.

## 5. Structure de code proposee

Proposition, pour validation. Pas de modification de fichier.

- Table `endpoint_slots` (API, Postgres, hors tranche) : `id`, `group_id`, `label` (nom generique, texte), `region`, `ttl_seconds` (14400 par defaut), `opens_at`, `closes_at`, `status` (`planned|deployed|expired`), `deploy_token_hash`, `created_by`. Les noms de colonnes sont a valider contre `services/endpoints.ts`.
- Route dashboard `GET /v1/reseau/slots/next` (espace Reseau) : renvoie les valeurs non secretes (image, region, nom de service, label, ttl, API_URL, fenetre). Ne renvoie jamais `ENDPOINT_INGEST_SECRET`.
- Jeton de creneau : `POST /v1/reseau/slots/:id/token` renvoie un jeton a usage unique affiche une fois. A la place de `ENDPOINT_INGEST_SECRET` global dans `entrypoint.sh:56` et `:86`. Le controle se fait cote `internal.ts` (non verifie : la verification Bearer est dans `apps/api/src/routes/internal.ts`).
- Generateur de nom : fonction TypeScript `genericLabel(rng: () => number): string` dans le code API (fichier a choisir selon les conventions de `apps/api`, non verifiees).
- `infra/endpoint/entrypoint.sh` :
  - garder `ENDPOINT_LABEL` tel quel (`:60`) ;
  - ajouter un listener HTTP minimal sur `$PORT` qui repond 200 avant register (le port est sinon ferme pendant le retry infini, `:243-262` et `:350`) ;
  - rendre le delai de register borne, puis sortie explicite ;
  - documenter `ENDPOINT_FRONT_*` dans `README.md:88-101`.
- `infra/endpoint/Dockerfile:6` : epingler `teddysun/xray` a une version precise (non verifie : tag disponible).
- Pour 3x-ui (VM GCP) : `infra/vm/` (hors tranche) avec un script de creation, `restartXrayOnClientDisable=false` pose a l'installation, un hostname par VM, et Cloudflare Access. Ce n'est pas une proposition finale, les conventions ne sont pas lues.

## 6. Bugs et risques

- **R1, demarrage sans port.** `entrypoint.sh:243-262` : register boucle sans fin, et `xray` ne demarre qu'apres (`:350`). Pendant ce temps, rien n'ecoute sur `$PORT`. La sonde de demarrage est TCP sur `$PORT` (`cloud-run-deploy-form.md:33`, `README.md:221-223`). Si l'API est lente, Cloud Run peut tuer l'instance (delai de la sonde non verifie). Scenario : API lente a 20 h, nœud jamais `active`.
- **R2, secret global.** `ENDPOINT_INGEST_SECRET` est dans la console (`cloud-run-deploy-form.md:41`) et sur tous les nœuds. Scenario : un membre Reseau quitte, ou un nœud est copie. Il faut tourner le secret sur tous les nœuds. Aucune revocation par nœud.
- **R3, pas de signature.** `entrypoint.sh:166` envoie `X-Ingest-Timestamp`, mais rien ne montre que l'API verifie la fraicheur (non verifie). Un rejeu est possible si le secret fuit.
- **R4, duree par defaut.** `entrypoint.sh:62` et `:209-210` : sans `ENDPOINT_TTL`, 16 200 s. Scenario : un creneau 20 h-24 h a 4 h qui survit jusqu'a 00 h 30 et chevauche le creneau 24 h-4 h.
- **R5, domain fronting.** `entrypoint.sh:63-66` et `cloud-run-deploy-form.md:43-44` : non teste (`aura-vps-3x-ui.md:88-90`). Les SNI sont des domaines Google de Play et de YouTube. Risque de conditions d'utilisation et de blocage (non verifie).
- **R6, base d'image non epinglee.** `Dockerfile:6` (`teddysun/xray:latest`). Une mise a jour peut changer `/usr/bin/xray` ou la commande par defaut, dont depend `entrypoint.sh:153`.
- **R7, relais aura toujours deploye.** `aura-vps-3x-ui.md:75-82` : le relais Cloud Run est deploye en `us-central1` et vise le VPS. D84 l'a annule pour le plan illimite (`decisions.md:484-490`). Si le service tourne encore, il coute et expose le VPS (non verifie).
- **R8, PUBLIC_HOST deduit.** `entrypoint.sh:73-83`. Si le format d'URL change ou si un domaine personnalise est pose, le nœud est enregistre avec une URL injoignable, qui pollue le pool (`cloud-run-url.md:12-15`).
- **R9, 3x-ui restart.** `knowledge/60-research/3x-ui.md:22-24`. Sans `restartXrayOnClientDisable=false`, couper un client coupe tous les autres. Non verifie sur aura.
- **R10, panneau sans Access.** `aura-vps-3x-ui.md:169-171` : seul le chemin aleatoire et le Bearer protegent le panneau via le tunnel.
- **R11, compteurs perdus.** `3x-ui.md:30-31`. Un arret du panneau remet a zero la fenetre de trafic, donc le quota peut etre sous-compte.
- **R12, faux 404 du FAI.** `aura-vps-3x-ui.md:71-73` : `Host: *.run.app` donne 404 depuis la ligne de l'utilisateur (cause non verifiee). Sans effet sur Cloud Run, selon la note.
- **R13, secret en argv.** `entrypoint.sh:165` met le secret dans la ligne de commande de curl, visible dans `/proc` dans le conteneur. Risque faible, mais evitable avec un fichier de config.

## 7. Dependances hors tranche

- `apps/api/src/routes/internal.ts` : Bearer, verification de `X-Ingest-Timestamp`, semantique de 409 et de l'idempotence, champ `label`, `port`, `ttl_seconds` (`README.md:40-84`).
- `apps/api/src/services/endpoints.ts` : `identity_mode` (`traffic-stats.md:33-34`), mise a jour du label sur re-register (non verifie).
- `apps/api/src/config.ts:170-171` : bornes du TTL (`README.md:98`).
- `.github/workflows/endpoint-image.yml` : construction et publication GHCR (`cloud-run-deploy-form.md:48`), non lu.
- `knowledge/10-infrastructure/vercel.md` : ou tourne `vpn-api` (C5).
- `knowledge/50-security/revocation.md` : mention des clients 3x-ui et de `bulkDisable`.
- `knowledge/60-research/3x-ui.md` : source des points 3x-ui (non verifies ici en detail).
- `knowledge/agents/infra-endpoint/notes/harness/` : les verifications revendiquees dans `README.md:274-300` (non relancees).
- Telegram (point 6), relances, horaires de creneau : cote API, non lu.
- Compte de lab et son expiration : hors depot.

## 8. Non verifie

- Tout ce qui n'a pas ete execute : `docker build`, `apk add`, `xray` sur Alpine, enregistrement reel, ready et heartbeat reels (`README.md:302-309`).
- Duree reelle d'un deploiement a la console et du cold start.
- Delai de la sonde de demarrage Cloud Run et valeur par defaut de la plateforme.
- Format d'URL Cloud Run actuel pour les nouveaux projets.
- Expiration du compte de lab Qwiklabs.
- Prix Cloud Run (`cloud-run.md:25-26`) : pas de source citee.
- Fournisseur et facturation de `aura-vps` (non GCP ?).
- Corps exact de creation de client 3x-ui (`clients/add`, champs `totalGB` ou `total`), et reponse de `clients/traffic`.
- Valeur de `restartXrayOnClientDisable` et version d'auto-update sur `aura-vps`.
- Verification d'`X-Ingest-Timestamp` cote API.
- Presence d'un relais Cloud Run actif (`aura-vps-3x-ui.md:75-82`).
- Existence de VM GCP permanentes : aucune note ne les decrit.
- Lecture de `vercel.md`, `revocation.md` et du workflow GHCR : non fait, hors tranche.

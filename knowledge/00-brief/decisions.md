---
id: decisions
title: Décisions tranchées
tags: [brief, decisions, journal]
status: decided
updated: 2026-10-23
related: [open-questions, roles-and-commissions]
---

Chaque décision est datée. Une décision contredite plus tard doit être modifiée
ici, pas laissée en double.

## Architecture

- **D1** (2026-10-19) — Moteur : **sing-box**, rebrandé. Pas de fork d'UI
  existant : interface Compose entièrement écrite.
- **D2** (2026-10-19) — Un seul code source pour toutes les marques. Thème
  injecté **au build** (tokens), jamais tiré au hasard au lancement.
- **D3** (2026-10-19) — Backend Node 24 + Fastify 5 + TypeScript + Zod +
  `jose`. PGlite en dev/test, Postgres via `DATABASE_URL`, un seul `schema.ts`.
- **D4** (2026-10-19) — Auth : scrypt ; enrôlement d'appareil avec deux clés
  EC P-256 Keystore (SIGN + AGREE) ; signature par requête
  `METHOD\nPATH\nsha256(body)\ntimestamp\nnonce` ; JWT 15 min + refresh opaque
  rotatif.

## Distribution des configurations

- **D5** (2026-10-19) — ECDH P-256 → HKDF-SHA256
  (`vpn-bundle-v1|deviceId|revision`) → enveloppe AES-256-GCM.
- **D6** (2026-10-19) — L'API renvoie un **tableau** de configurations, jamais
  une seule. Aucune n'est affichable ni copiable dans l'app.
- **D7** (2026-10-19) — Sélection et bascule **côté client**, pour fonctionner
  même si l'API est inaccessible.
- **D8** (2026-10-20) — Les endpoints sont du **stock global**, pas rattachés à
  une communauté. `deployment_key` unique et idempotent.
- **D9** (2026-10-20) — `deployment_key = K_SERVICE:K_REVISION` : stable sur un
  restart, unique par révision. Un redéploiement crée donc un nouvel endpoint.
- **D10** (2026-10-20) — Heartbeat = `last_seen_at` + latence, **jamais**
  d'extension de `expires_at`, **jamais** de bump de révision du pool.
- **D11** (2026-10-20) — Drain par défaut 900 s avant expiration.
- **D12** (2026-10-20) — `identity_mode` ∈ `shared` | `per_device`. Cloud Run
  en `shared`, VPS permanent en `per_device`.

## Argent

- **D13** (2026-10-19) — Fapshi, deux services distincts : encaissement et
  décaissement. Un service activé pour les versements ne peut plus encaisser.
- **D14** (2026-10-19) — Le webhook Fapshi n'est jamais cru sur parole : statut
  re-vérifié par l'API (`FAPSHI_VERIFY_WITH_API=true`). Mock par défaut en dev.
- **D15** (2026-10-19) — La commission est **attachée à la commande**, pas à un
  UTM. Les UTM ne servent qu'au suivi de campagne.

## Rôles

- **D16** (2026-10-20) — Pas de rôle global `super_admin`. Un seul
  `platform_role = owner`, plus des `community_memberships` avec
  `community_admin` | `support` | `finance`. Le `community_id` vient toujours
  de la session, jamais du corps de requête.
- **D17** (2026-10-20) — Deux audiences de jeton : `vpn-mobile` et
  `vpn-admin`. Croisement interdit.

## Expérience

- **D18** (2026-10-20) — Le choix manuel d'une configuration est une
  **préférence** ; l'automatisme est **obligatoire**. Bascule après échecs
  répétés, avec bandeau non bloquant.
- **D19** (2026-10-20) — Si plus rien ne fonctionne : écran « aucune connexion
  disponible » + contact direct de l'administrateur de la marque, et reprise
  automatique avec backoff.
- **D20** (2026-10-20) — Fichier hors-ligne destiné au cas « l'app n'arrive pas
  à récupérer la liste (timeout / API bloquée) », pas au cas « zéro réseau ».
  Usage unique, lié à l'appareil, détruit par l'app après import.

## Réseau (après analyse, 2026-10-20)

- **D21** (2026-10-20) — Durée de vie par défaut d'un endpoint : **4 h 30
  (16 200 s)**, drain 900 s → 4 h 15 de service utile. Ce n'est pas un choix
  produit : la durée de vie du projet qui héberge les nœuds est elle-même de
  4 h 30. `ENDPOINT_DEFAULT_TTL` porte cette valeur.
- **D22** (2026-10-20) — 3x-ui **par nœud VPS**, panneau strictement en
  loopback, jeton Bearer scopé, `restartXrayOnClientDisable=false`, un client
  par appareil (`email = "d-<devices.id>"`). 3x-ui n'a pas sa place dans un
  conteneur Cloud Run éphémère.
- **D23** (2026-10-20) — Aucune promesse de révocation instantanée. La
  formulation vendable est « identifiant révoqué en moins de 5 s ; la session
  en cours s'éteint à la prochaine reconnexion, ou immédiatement si un
  bannissement IP est appliqué ». Sur GCP : pas de révocation du tout, seule
  l'expiration compte.
- **D24** (2026-10-20) — `last_seen_at` ne retire **jamais** un endpoint du
  pool. Avec la facturation à la requête, le CPU est bridé hors requête : un
  nœud sans trafic n'est pas mort, il est endormi. Seule `expires_at` fait foi.
- **D25** (2026-10-20) — Chaque endpoint transporte `max_session_seconds` dans
  son bundle ; le client se reconnecte à `max_session_seconds − 60`. La valeur
  vient du timeout de requête réel du nœud (3 600 s recommandé), jamais d'une
  constante dans l'app.

## Exploitation (2026-10-20)

- **D26** — Le canal d'exploitation est **Telegram**, derrière
  `TELEGRAM_ENABLED`. Un message ne transporte **jamais** de configuration, ni
  UUID, ni chemin WS, ni jeton : `services/telegram.ts` les masque avant envoi
  (`scrub`), y compris pour un message écrit à la hâte. Un échec d'envoi
  renvoie `false`, il ne lève jamais dans la requête qui l'a déclenché.
- **D27** — Le rappel « déployer un nouveau nœud » est émis par **l'API**, pas
  par le conteneur : un conteneur mourant ne peut pas annoncer sa propre mort.
  Il porte sur le nœud **le plus jeune** (`max(expires_at)` parmi
  `active`/`draining`), se répète au plus toutes les 15 min, et se déclenche à
  `DEPLOY_WARN_MINUTES` (30 par défaut). Il tourne dans le même tick que le
  balayage du pool, jamais sur un pool périmé.
- **D28** — Le seed est **idempotent** et ne réinitialise jamais un mot de
  passe existant. Il refuse de créer un compte si `SEED_ADMIN_PASSWORD` est
  vide ou fait moins de 12 caractères. Les prix qu'il insère sont provisoires
  et affichés comme tels (voir O12).

## Fichier hors-ligne et marque (2026-10-20)

- **D29** — Le fichier hors-ligne est signé en **Ed25519** sur une chaîne
  textuelle (`vpn-offline-v1\n…`), jamais sur du JSON : une canonicalisation qui
  change d'un langage à l'autre casserait la vérification sans prévenir. La clé
  **publique est épinglée dans l'APK** au build (`BrandTokens.offlineBundleSigningKeyB64`) :
  la rotation est donc une nouvelle version de l'application, pas un réglage
  serveur. Le contenu est scellé pour la clé ACORD de l'appareil, et la validité
  par défaut est de **60 min** (`OFFLINE_BUNDLE_TTL_MINUTES`, borné à 24 h).
  L'application marque la consommation **localement avant** d'écrire la liste :
  une coupure entre les deux laisse un fichier consommé sans configurations —
  jamais un fichier réutilisable.
- **D30** — Une marque est un **fichier source réécrit avant compilation**, pas
  un thème chargé à l'exécution. `tools/inject-brand.mjs` valide le manifeste
  (thème, package, URL https sans chemin, appId, contact) et réécrit
  `BrandTokens.kt` + `brand.properties` ; il relit ce qu'il vient d'écrire et
  sort en **78** si une constante n'a pas été remplacée. Le workflow
  `.github/workflows/android-brand.yml` compile, signe (ou signale l'absence de
  keystore) et publie l'empreinte SHA-256. Aucun APK non signé n'est présenté
  comme publiable.

## Interface d'administration (2026-10-20)

- **D31** — Le dashboard est écrit avec **Next.js** (App Router, TypeScript),
  exporté en statique (`output: "export"`, `basePath: "/admin"`,
  `trailingSlash: true`) et servi par l'API sous `/admin/`. Il n'y a **pas** de
  second service : une origine, pas de CORS, pas de CDN. Conséquence assumée :
  `apps/admin/out` n'est pas commité, donc `pnpm --filter @vpn/admin build` doit
  tourner avant de servir ; sans export, l'API répond `/admin/` en 503 avec la
  commande à lancer, jamais un 404 ambigu.
  La version précédente, écrite en JavaScript sans build, est conservée dans
  `apps/admin-legacy/` à titre de référence (comportements et libellés), et
  n'est plus servie.

## Hébergement et réécriture (2026-10-20, soirée)

- **D32** — **Vercel**, pas Cloud Run, pour le **dashboard et l'API**. Cloud Run
  est abandonné : l'accès était limité à son interface, l'endpoint ne pouvait de
  toute façon pas y vivre avec notre contenu, et le compte ne permettait ni
  Secret Manager ni IAM fin. Conséquence directe : l'API Fastify tourne en
  **fonction serverless** (un adaptateur, un seul point d'entrée) et la base
  devient **Postgres managé** — PGlite n'a pas de disque persistant là-bas.
  `D31` est **remplacé** : l'API ne sert plus `/admin/`, le dashboard vit sur sa
  propre origine. Voir `10-infrastructure/vercel.md` pour les limites relevées.
- **D33** — Le dashboard **et** la couche d'interface Android sont **supprimés**
  et réécrits entièrement : le rendu précédent a été rejeté, sur le visuel comme
  sur le code. Retirés : `apps/admin/`, `apps/admin-legacy/`,
  `apps/android/app/src/main/java/cm/bouendji/vpn/ui/` (19 fichiers), le
  `Dockerfile` et `.dockerignore` de la racine, `dist/`.
  **Conservés** : l'API et ses 94 tests, `packages/contract`, le socle Android
  (Keystore, ApiClient, VpnService, socle crypto), `infra/endpoint/`, `tools/`,
  `knowledge/` et l'historique git. `MainActivity.kt` n'est plus qu'un point
  d'entrée vide : il existe pour que le manifeste ne pointe pas sur une classe
  fantôme, et doit être remplacé par la nouvelle vague UI.
- **D34** — L'**endpoint** (xray/VLESS) ne peut pas être sur Vercel : la
  plateforme sert du HTTP serverless, elle n'ouvre aucun port brut. Il reste sur
  un VPS ou dans un conteneur, et c'est toujours lui qui s'enregistre auprès de
  l'API.

## Prix et partage (2026-10-21)

- **D35** — **Prix fixé par la communauté ; enveloppe de 30 % répartie à la
  performance.** Le client paie le prix de sa communauté sur le lien Fapshi de
  la plateforme, qui encaisse **100 %**. Sur le chiffre d'affaires encaissé,
  **30 % constituent l'enveloppe des commissions** ; **70 % restent le revenu
  plateforme** (`owner`). L'enveloppe est répartie entre les communautés **au
  prorata de ce qu'elles ont généré** : une communauté qui n'a rien vendu
  touche **0**.
  - Exemple : 1 000 000 XAF générés par 5 communautés (500k / 300k / 150k /
    50k / 0) → enveloppe 300 000, répartie 150k / 90k / 45k / 15k / 0.
  - Quand **tout** le CA est généré par les communautés et que la répartition
    est strictement proportionnelle, le résultat est **identique à 30 % par
    commande**. L'enveloppe n'est donc pas un second calcul : c'est la même
    arithmetic vue au mois.
  - Le revendeur ne reverse jamais d'argent : la plateforme encaisse et doit.
  - Le taux de référence et le plafond sont **30 %**
    (`commission_bps <= 3000`) ; l'`owner` peut accorder moins, jamais plus.
  - Conséquence assumée : deux communautés peuvent vendre le même forfait à des
    prix différents.
  - `plans` est déjà indexé par `app_id`, et `apps.community_id` rattache
    chaque marque à une communauté : **le prix est donc déjà propre à une
    marque**. Il manque les routes admin de gestion des forfaits et un endpoint
    public par app, pas une nouvelle table.
  - **Remplace** la lecture « prix global, commission par communauté » de
    `40-money/roles-and-commissions`.
  - **Périmètre confirmé (2026-10-21)** : l'enveloppe porte sur le **seul CA
    généré par les communautés**. Une vente directe reste à 100 % à la
    plateforme et ne finance aucune commission.
  - **Performance confirmée** : le CA généré, pas le nombre de ventes ni la
    marge.
  - **Répartition confirmée** : strictement proportionnelle au CA généré. Donc
    `commission_i = 30 % × CA_i`, ce qui rend l'accrual par commande équivalent
    à la clôture mensuelle. L'enveloppe est un affichage comptable, pas un
    second calcul.
  - **Calcul confirmé (2026-10-21)** : assiette **brute** (la plateforme absorbe
    les frais Fapshi sur ses 70 %), arrondi **`floor`** (jamais plus de 30 %),
    **aucun plafond de prix** (le white label fait porter le risque tarifaire à
    la marque de l'administrateur, pas à la plateforme).
  - Implémenté : `MAX_COMMISSION_BPS = 3000`, contrainte SQL 0..3000, routes
    admin de gestion des forfaits et catalogue public par app. Vérifié par
    `tsc --noEmit` et 100 tests.

- **D36** — **Aucun remboursement, y compris si le service ne fonctionne pas.**
  Le produit vend un accès à durée déterminée ; l'échec côté client (appareil
  incompatible, réseau, configuration) n'ouvre pas droit à un remboursement.
  - L'API n'expose **aucune** route de remboursement. `refundOrder()` reste un
    service interne, appelé par aucun `app.*` : il sert à une correction
    exceptionnelle (double débit avéré), pas à une politique commerciale.
  - Les conditions d'utilisation doivent l'écrire noir sur blanc avant l'achat.
  - Limite hors de notre contrôle : un client peut ouvrir un litige auprès de
    son opérateur ou de Fapshi. Le remboursement subi n'est pas une décision
    produit ; il doit être saisi comme une annulation exceptionnelle.

- **D37** — **Un appareil par compte est la norme ; la version desktop passera
  par le partage de connexion du téléphone.** Le forfait standard ouvre **un**
  appareil (`plans.device_limit = 1` par défaut). Une version desktop est
  prévue plus tard, mais elle **ne consomme pas un second slot** : elle se
  connecte à travers le partage de connexion du téléphone, comme un client
  desktop derrière le proxy du mobile.
  - Une offre multi-appareils reste possible techniquement
    (`device_limit > 1`), mais n'est pas la norme commerciale.

- **D38** — **Versement des commissions : demande par `finance`, validation par
  `owner`, décaissement asynchrone.** `finance` prépare la demande
  (`POST /communities/:id/payouts`) ; le montant est la **somme des commissions
  `available` non rattachées**, jamais un montant fourni par le client.
  `owner` approuve (`POST /payouts/:id/approve`) ; `finance` ne peut pas
  s'auto-approuver. Le décaissement réel est une opération **asynchrone** vers
  Fapshi : `approved` n'est pas `paid`.
  - États : `pending` → `approved` → `paid` / `failed`.
  - **Bug corrigé le 2026-10-21** : l'activation insère les commissions en
    `available`, mais la demande de versement filtrait `pending` — aucune
    demande n'était donc créable sur une vraie vente. La requête filtre
    désormais `available` ; le test d'administration utilise ce même état.
  - **Reste non câblé** : `fapshi.payout()` n'a aucun appelant ; `approved` ne
    déclenche encore aucun décaissement, et les commissions rattachées ne
    passent pas à `paid`.

- **D39** — **UUID partagé au lancement ; UUID par appareil plus tard ; pas de
  `cloudflared`.** Le premier déploiement garde **un seul UUID par endpoint**
  (`email: "shared"`), partagé par tous les clients du nœud. Aucun client par
  utilisateur n'est créé, donc :
  - **pas de consommation par utilisateur** (seuls des totaux par nœud sont
    possibles) ;
  - **pas de révocation individuelle au niveau du nœud** : la coupure reste
    l'expiration du bundle et la session courte ;
  - **pas de liste de clients à synchroniser** : le heartbeat reste un simple
    battement, sans `clients_revision`.
  - **`cloudflared` est écarté** : le nœud reste strictement sortant, l'API ne
    l'appelle jamais. Conséquence : sur un VPS, le panneau 3x-ui n'est pas
    piloté à distance par l'API.
  - Le passage à l'UUID par appareil (stats + révocation) est **reporté**. Il
    faudra alors l'état désiré décrit dans `10-infrastructure/node-control` et
    accepter un court `pending` à l'activation.


- **D40** — **Le revendeur n'encaisse pas : modèle A (2026-10-21).** Décision de
  l'utilisateur, après exposé des trois modèles possibles.
  - Le client paie **toujours** par un lien de paiement Fapshi rattaché à une
    commande créée par l'API. L'argent ne transite **jamais** par le revendeur.
  - Le revendeur est rémunéré par la **commission déjà attachée à la commande**
    (D15). Donc : aucun reversement, aucune caisse à rapprocher, aucun solde à
    suivre manuellement.
  - **Conséquence interface** : l'écran « code d'accès » (`nji`) du prototype
    partenaire est **supprimé**. Aucun système de génération ni de consommation
    de codes n'est construit côté serveur. L'activation passe uniquement par un
    paiement confirmé, dont le statut est revérifié auprès de Fapshi (D14) :
    payer crédite automatiquement, l'utilisateur ne saisit rien.
  - **Écarté maintenant, pas pour toujours** : le modèle « crédits prépayés +
    codes » (modèle C, usage telecom). Il exigerait un portefeuille revendeur,
    un ledger, des codes à usage unique et une protection anti-rejeu. À rouvrir
    seulement si des revendeurs à volume réel sont signés.
  - **Écarté définitivement** : le revendeur qui encaisse en espèces puis
    reverse (modèle B) — dépendance à sa bonne volonté, commissions
    invérifiables, surface de fraude. S'il encaisse malgré tout, il paie un lien
    pour la commande ; il ne « rend pas plus tard ».

- **D41** — **Le build Bouendji doit reprendre l'identité Halo v2 sur tout le
  parcours mobile (2026-10-21).** La référence visuelle est
  `../Atelier-identites-VPN-v2.html`, direction Halo. Elle ne sert pas de
  contrat métier : les textes, données et transitions restent ceux des routes
  et décisions du dépôt. Le parcours livré comprend connexion/inscription,
  accueil VPN, forfaits/paiement, compte/appareils, réglages et aide, ainsi que
  les états bloquants. Les écrans `nji` et invitation restent exclus (D40).
  L'identité reste injectée au build (D2/D30), jamais choisie au lancement.

## Travail à deux et leurre (2026-10-22)

- **D42** — **Monorepo à deux : Android = @pius-coder, API + admin = @mani-iks.**
  Branches `android/*` / `api/*` / `admin/*`, PR squash, review du propriétaire
  via `.github/CODEOWNERS`. `CONTRIBUTING.md` fait foi. Deux projets Vercel sur
  le même repo : `bouendji-api` (Root `apps/api`, domaine
  `bouendji.numzer0.store`), `bouendji-admin` (Root `apps/admin`, à recréer
  D32/D33). `DECOY_URL` en variable Vercel (Preview = test, Production = vrai
  site SMS). Répond à O9 (qui construit quoi).
- **D43** — **Rideau anti-curieux, pas une sécurité.** Le domaine API est
  visible après reverse (inévitable). Navigateur sans `X-App-Id` (+ UA
  `vpn-android`) → `302` vers `DECOY_URL` (placeholder
  `https://example-sms.com` en attendant le vrai site SMS). Client JSON sans
  métadonnées → JSON d'erreur normal, jamais 302 (sinon tests/dashboard
  cassés). Bypass : `/healthz`, `/readyz`, `/v1/payments/webhook/*` (D14).
  Une seule couche : `apps/api/src/lib/decoy.ts` (Fastify, vérifié par 5 tests).
  Le `middleware.ts` Edge a été supprimé le 2026-10-23 (D71) : il importait
  `next/server`, qui n'est pas une dépendance, et ne compilait donc pas. La
  sécurité réelle reste D4/D5.

## Production — liste vivante, argent et marques (2026-10-23)

Issues de l'audit des six couches et de l'arène de conception. Chaque décision
ferme une question ouverte ou un défaut vérifié dans le code.

- **D45** — **Deux natures de nœuds.** `endpoints.tier ∈
  {free-labs, paid-gcp}`, `plans.endpoint_tier`. La règle d'accès « jamais
  mélangées » a été remplacée le 2026-10-29 par D141.
  Un forfait d'un tier n'est créable que si ≥ 1 nœud de ce tier est actif et non
  `down` (422 sinon). Les labs gratuits assurent la continuité par le nombre ;
  le nœud GCP facturé est persistant et seul à pouvoir mesurer la consommation
  par appareil. Ferme : le nœud de lab qui sert un forfait payant, et le forfait
  vendu sans nœud.
- **D46** — **`ENDPOINT_AUTO_APPROVE=true` en production.** En production, un
  `ready` laissait le nœud `pending` et `servedEndpoints` filtre `active` : le
  pool était vide par construction. Le secret d'ingestion reste la frontière ;
  un nœud forgé se coupe depuis la console (`POST /v1/admin/endpoints/:id/health`).
- **D47** — **La santé décide de la présence, pas l'horloge.** Le heartbeat et
  `ready` ne peuvent **pas** lever un `down`
  (`health = CASE WHEN health='down' THEN 'down' ELSE COALESCE($3, health) END`).
  Un nœud vivant dont le tunnel est mort est exactement le cas à voir.
- **D48** — **Une transition de santé bumpe `pool_state.revision`**, un
  heartbeat non. L'ETag du bundle dépend des configs servies, donc une liste qui
  change produit un nouvel ETag.
- **D49** — **`expiresAt` de l'enveloppe = `min(fin des droits, max(expirations
  des configs))`.** Le `min` faisait mourir le bundle avec le nœud le plus
  faible. Le 304 est refusé si l'enveloppe calculée est expirée.
- **D50** — **Verdict `down` à deux chemins** : 3 appareils distincts en échec
  sur 10 min, **ou** 1 témoin différentiel (2 échecs consécutifs sur ce nœud +
  ≥ 1 succès sur un autre dans la fenêtre). Retour : 3 succès, ou 30 min de
  probation. Ferme le nœud mort indétectable quand un seul appareil existe.
- **D51** — **Pas de cron, pas de vérificateur serveur 24/7.** Entretien
  paresseux : hook `onRequest`, au plus une exécution par 60 s et par instance.
  Ferme O15 sans plan Pro ni déclencheur externe.
- **D52** — **Consommation à deux sources nommées** : `device` (compteurs du
  moteur) et `node` (mesure du nœud payant). `usage_daily.source` est affiché.
  Un chiffre qu'on n'a pas lu n'est pas écrit.
- **D53** — **Compte par marque** : `UNIQUE (app_id, lower(email))`, `phone`
  obligatoire, `appId` obligatoire au login. Un même email peut exister sur deux
  marques ; les erreurs de connexion restent indiscernables.
- **D54** — **`DASHBOARD_ACCESS_KEY` exigée (`X-Access-Key`) sur tous les
  `/v1/admin/*`**, login et inscription compris. Pas de table d'invitations.
- **D55** — **Refus de démarrer en production** si `PAYMENT_PROVIDER ≠ fapshi`,
  ou si `MASTER_KEY` / `JWT_SECRET` / `DATABASE_URL` Postgres /
  `ENDPOINT_INGEST_SECRET` / `DASHBOARD_ACCESS_KEY` / `BUILD_CALLBACK_SECRET`
  manquent. Ferme l'abonnement gratuit par `/pay/mock/:ref/confirm`.
- **D56** — **Ingestion : bearer + `X-Ingest-Timestamp` (±120 s). Pas de HMAC.**
  Le jeton est déjà la frontière ; HMAC ne protège que d'une requête capturée,
  ce que TLS empêche. Ferme O4.
- **D57** — **Retraits : `finance`, `owner` et `community_admin` approuvent,
  jamais leur propre demande**, transition conditionnelle. La rémunération de
  `finance` se prend sur les 70 % du propriétaire, hors système. **Amende D38.**
- **D58** — **Un `202` Fapshi n'est pas un versement.** `approved` = autorisé,
  `processing` = envoyé, `paid` = confirmé, `needs_review` après 10 min sans
  référence, `/resolve` clôt.
- **D59** — **Forfaits libres** : prix + durée en jours, autant que l'admin veut.
  **Aucun forfait au seed.** Ferme O12.
- **D60** — **La bascule reste celle de sing-box** (`selector` + `urltest`) ;
  on ajoute la mesure à travers le tunnel, le rapport, le re-fetch et le bandeau.
- **D61** — **`NO_CONNECTION` = bandeau, jamais un écran plein.** Un bundle vide
  n'écrase pas la liste locale.
- **D62** — **APK : Vercel Blob + lien dans la console** ; la CI télécharge
  `libbox.aar` depuis une Release GitHub. Remplace D44 pour le premier jour.
- **D63** — **Témoin différentiel** (voir D50) : la bascule du client fournit la
  preuve gratuitement.
- **D64** — **Télémétrie en lots de 20**, réinjection plafonnée à 200, 4xx
  (≠408/429) = lot abandonné, réseau/5xx = reprise avec backoff.
- **D65** — **Machine à états des retraits** : `pending → approved →
  processing → paid|failed`, `needs_review` + `/resolve`, `attempts ≤ 3`,
  réclamation atomique **avant** l'appel réseau.
- **D66** — **Le manifeste de marque est un contrat d'API**, validé à la
  création (422, mêmes règles qu'`inject-brand.mjs`), stocké dans `apps.brand`
  et `builds.spec`, déclenché par `workflow_dispatch`, clos par
  `POST /v1/internal/builds/:id/callback`.
- **D67** — **Deux échéances côté appareil** : `rightsExpiresAtMs` seule
  provoque « expiré » ; `nextConfigExpiryMs` déclenche un rafraîchissement sans
  vider le coffre.
- **D68** — **`tier` et `identity_mode` traversent les schémas zod** d'ingestion.
  Sans ça, `z.object` jette les clés et le nœud retombe sur `shared`/`free-labs`.
- **D69** — **Nœud `paid-gcp` : `per_device`, pool de 200 UUID**, `config_grants`
  écrit au bundle, statistiques par UUID lues dans le heartbeat. Lot séparé avec
  porte ; repli déclaré (`source='device'`).
- **D70** — **Le rapport a un producteur** : boucle de 60 s qui lit la sortie
  active et mesure chaque sortie via l'API Clash (vrai handshake + requête HTTP),
  puis force `selectOutbound` après 2 échecs consécutifs. Backoff 30 s → 2 min
  → 10 min.
- **D71** — **`middleware.ts` supprimé.** Une seule couche de leurre, côté
  Fastify. Voir D43.
- **D72** — **Documentation code-first** : `@fastify/swagger` (OpenAPI 3.1.0) lit
  les schémas des routes, Scalar sert `/reference`, `/openapi.json` est versionné
  et régénéré par `pnpm --filter @vpn/api openapi`. **`/reference` et
  `/openapi.json` sont exemptés du rideau** : un navigateur envoyant
  `Accept: text/html` était redirigé vers le site leurre, rendant l'interface
  inutilisable là où elle sert. Le document ne décrit que des routes que `curl`
  énumère déjà ; le rideau n'est pas une sécurité (D43).
- **D73** — **`dev` est la seule porte d'entrée de `master`.** Aucun commit
  direct sur `master`, aucune PR qui la vise : branche → PR vers `dev` → CI →
  review → squash, puis PR `dev` → `master`.
- **D74** (2026-10-23) — **Journal piloté par l'environnement, pas par un
  drapeau.** `production` garde le JSON brut de Pino (Cloud Run et les
  collecteurs lisent des champs) ; partout ailleurs, `server.ts` passe un
  `transport` vers `pino-pretty`. `buildApp` accepte donc
  `FastifyServerOptions["logger"]` au lieu d'un booléen ; tests et fonction
  Vercel continuent de passer `false`. `pino-pretty` est une **devDependency**
  et n'est jamais importé en production.

- **D75** (2026-10-23) — **La référence OpenAPI doit être enrichie à partir des
  routes réelles et Scalar doit charger cette même spécification** : source
  centralisée dans `apps/api/src/http/contracts.ts`, appliquée via le
  `transform` documentaire de Swagger et jamais comme validateur Fastify.
  Chaque opération publiée doit avoir résumé, description et réponses ; les
  statuts et médias HTML sont explicités. Voir D76 pour les premiers compteurs
  vérifiés.
- **D76** (2026-10-23) — **Contrat OpenAPI enrichi et vérifié statiquement** :
  64 opérations avec résumés, descriptions et réponses ; 27 corps JSON ;
  53 exigences de sécurité ; HTML explicite pour les trois routes navigateur.
  `typecheck` et génération `openapi` réussissent. Le Playground est utilisable
  pour construire des appels, mais les flux réels nécessitent serveur, base et
  secrets ; la génération seule ne prouve pas leur exécution.
- **D77** (2026-10-23) — **Toutes les routes déclarent leur frontière d'accès,
  y compris les sondes.** `/healthz` et `/readyz` utilisent la clé dédiée
  `HEALTHCHECK_KEY` dans `X-Health-Check-Key`, obligatoire en production. Le
  contrat OpenAPI la propose au Playground. Les routes mobiles pré-session
  gardent leurs preuves dédiées ; le webhook exige `FAPSHI_WEBHOOK_SECRET` en
  production et revérifie le statut fournisseur ; le paiement mock reste hors
  production. Inventaire et diagrammes :
  `20-backend/admin-access-flows`.
- **D78** (2026-10-23) — **Dashboard en deux niveaux d'authentification.** Le
  navigateur s'authentifie auprès du serveur Next.js ; Next.js s'authentifie
  auprès de l'API. Les clés API et secrets restent côté serveur Next.js/API et
  ne sont jamais envoyés au navigateur. Fastify reste l'autorité des jetons,
  rôles et périmètres. Détails du BFF dans `20-backend/admin-access-flows`.


- **D79** (2026-10-23) — **Session du dashboard : cookie httpOnly + jeton CSRF.**
  Le navigateur reçoit un cookie de session httpOnly posé par Next.js ; les
  écritures exigent un jeton CSRF. Le JWT `vpn-admin`, `DASHBOARD_ACCESS_KEY`
  et les clés API restent côté serveur Next.js.
- **D80** (2026-10-23) — **Première livraison du dashboard : `owner` et
  `community_admin`.** Les écrans `finance` (versements) et l'audit complet
  suivent. Direction visuelle Halo v2, conçue mobile d'abord. Détails dans
  `30-clients/dashboard-ux`.

- **D82** (2026-10-23) — **Arbitrages validées par l'utilisateur pour le
  dashboard.** Validées : D79 (session cookie httpOnly + CSRF) et D81 (système
  UI shadcn new-york-v4 + jetons Halo v2). Clé console (`DASHBOARD_ACCESS_KEY`)
  ajoutée par le serveur Next.js, jamais saisie à l'écran de connexion (D78).
  `support` et `finance` hors de la première livraison (D80). **Non tranchés,
  à ne pas trancher par défaut** : durée de la session Next.js, TTL des fichiers
  hors-ligne (le schéma accepte `ttlHours` jusqu'à 72 h, `admin.ts` l.151 ; le
  commentaire du handler et la valeur effective disent 24 h, `admin.ts` l.1188 —
  à aligner, correction de sens le 2026-10-23), routes de compteurs et de lecture unitaire, visibilité de `host` et
  `port` dans `GET /pool` pour `community_admin`. Ces points restent dans
  `00-brief/open-questions.md`.

- **D83** (2026-10-23) — **aura-vps : Xray nu remplacé par 3x-ui 3.10.2 en
  conteneur.** Demandé par l'utilisateur pour servir de cible au relais
  `praveenkarunarathne/Google-Cloud-Run-Proxy` (TCP brut vers `:80`). Inbound
  VLESS+WS `127.0.0.1:10000` `/bouendji-vpn`, nginx :80 accepte `*.run.app`,
  panneau en loopback (conforme D22). Ancien Xray sauvegardé puis supprimé.
  Détails : `10-infrastructure/aura-vps-3x-ui`. Le relais vers ce VPS est
  **écarté pour le plan illimité** (voir D84) ; le VPS et 3x-ui restent en place
  pour le plan limité.

- **D84** (2026-10-24) — **Relais écarté pour le plan illimité ; 3x-ui VPS
  conservé pour le plan limité.** Sur le plan illimité, on reste sur D39 +
  `infra/endpoint`. Après analyse d'une config de référence qui fonctionne
  (image `teddysun/v2ray` dans Cloud Run, outbound `freedom`, UUID partagé,
  `ajndjd2/ahmed-vip1`), on confirme que le modèle produit reste **xray/v2ray
  directement dans Cloud Run qui parle à notre API** (`register`/`ready`/
  `heartbeat`) — c'est exactement `infra/endpoint`, déjà écrit. Les décisions
  relais prises le 2026-10-23 sont **annulées pour le plan illimité** : relais
  TCP muet → VPS, segment Google→VPS en clair, VPS point unique, et D39 reste la
  règle de ce plan. Pour le **plan limité** (VPS permanents, quota, identité par
  appareil — `00-brief/objective.md`), 3x-ui reste la bonne base ; `cloudflared`
  et l'auto-annonce des relais y sont à réévaluer, pas supprimés.
  **L'API n'a jamais été modifiée** (`git status apps/api` vide) : rien à
  revenir côté code. `relay-architecture` supprimé. O22 abandonnée ; O5 reste
  ouverte (résolue côté endpoint par `PUBLIC_HOST`). Ce qui reste à ajouter à
  `infra/endpoint` quand on voudra la consommation : `stats`/`policy`/
  `api StatsService` dans la config, une boucle de remontée, une route API et
  une table `usage` (ce que D39 avait déjà reporté).

- **D86** (2026-10-24) — **Les recommandations des skills better-\* sont
  autorisées, y compris quand elles contredisent le HIG ou la règle « pas
  d'ombres ».** Conséquences retenues :
  - bordures fines réalisées avec une ombre de 1 px (technique better-ui) ;
    les ombres portées restent interdites ;
  - bouton de validation toujours actif (better-accessibility), au lieu de
    l'activation conditionnelle du HIG ;
  - contraste à respecter : texte de bouton à 4,5:1 minimum, soit
    `#0066d6` pour le bouton proéminent (5,42:1) au lieu de `#0a7cff` (3,93:1),
    sauf décision contraire de l'utilisateur sur la couleur de marque.
  Source : décision de l'utilisateur après le rapport `design-rules-opus`.
  Les autres points ouverts (gris, sélecteur d'apparence, masquage par rôle)
  restent à trancher.

- **D87** (2026-10-24) — **Révision de D86 : les ombres sont autorisées, avec
  les bordures fines.** L'interdiction des ombres portées est levée par
  l'utilisateur. Les bordures fines restent la base de séparation ; les ombres
  s'ajoutent là où elles aident la hiérarchie (surfaces flottantes, feuilles,
  menus). Référence de style : Chariow (`reference`, pages de connexion fournies
  le 2026-10-24) pour les couleurs, la fluidité et les composants ; shell et
  diagrammes d'orya-stack ; icônes Solar ; kit Apple Design Resources pour les
  dimensions iOS.
- **D88** (2026-10-24) — **Couleur d'accent : pas le bleu.** L'utilisateur
  refuse le bleu système comme accent. L'accent suit la référence Chariow
  (jaune) ; le texte posé sur fond jaune est sombre, pas blanc, pour respecter
  le contraste (D86, 4,5:1 minimum).
- **D89** (2026-10-24) — **Priorités : infra, puis parcours client, puis tests
  client, puis fin du dashboard.** Le dashboard est mis en pause. Les
  sous-agents sont arrêtés (coupures répétées) : l'orchestrateur mène seul
  jusqu'à une application fonctionnelle.
- **D90** (2026-10-24) — **Environnement de test sur aura-vps sous Dokku**
  (`vpn-api`, `vpn-node1`, `vpn-db`), `NODE_ENV=development`, paiement simulé,
  en attendant les clés Fapshi et Vercel. Détail :
  `10-infrastructure/aura-vps-dokku-test`. Marque Android de test
  `cm.bouendji.vpn.test` (`tools/brands/aura-test.json`).
- **D91** (2026-10-24) — **Design Android : reprendre le prototype
  `brondon-code/lelexxl2a2` et n'adapter que les thèmes.** Décision de
  l'utilisateur ; elle remplace le principe « on ne copie pas le prototype »
  de `30-clients/ui-restructure-plan`. Les règles de contenu restent (jamais
  d'UUID ni de `vless://` à l'écran, pas de prix inventé).
- **D92** (2026-10-24) — **Contact de marque de test : `support@henshins.online`**
  (`mailto:`), donné par l'utilisateur.
- **D93** (2026-10-24) — **Nœuds manuels et domain fronting.** Un serveur non
  déployé par l'API s'ajoute par `POST /v1/admin/endpoints/manual` (owner seul) :
  une ligne par SNI, `ws_host` = Host du WebSocket quand il diffère du SNI, UUID
  chiffré, jamais renvoyé ni audité. Republier un groupe remplace ses lignes.
- **D94** (2026-10-24) — **Fichier de secours = extension `.bvpn`** (JSON
  `offline-bundle`). L'app l'accepte par « Ouvrir avec », « Partager vers » et
  Paramètres/Aide › Importer ; seule entrée hors lanceur du manifeste.
- **D95** (2026-10-24) — **Parrainage enregistré, non récompensé.** Code par
  compte (`GET /v1/me/referral`), lien posé à l'inscription (`referralCode`) ;
  la règle de récompense reste une question ouverte.
- **D96** (2026-10-24) — **Image d'endpoint sur GHCR** :
  `ghcr.io/pius-coder/vpn-endpoint` (publique), construite par le workflow
  `endpoint-image` à chaque changement de `infra/endpoint`. Elle remplace l'image
  tierce `docker.io/ajndjd2/ahmed-vip1` (UUID figé et public). Le fronting se
  déclare par `ENDPOINT_FRONT_ADDRESS` / `ENDPOINT_FRONT_SNIS`.
- **D97** (2026-10-24) — **Illimité / Limité se choisit à l'achat** (D45
  inchangée : un bundle = le type du forfait actif). Forfaits : sélecteur
  « Illimité | Limité » si la marque vend les deux, étiquette sur chaque billet ;
  Serveurs : étiquette du type actif. `free-labs` = illimité (Cloud Run, Qwiklabs),
  `paid-gcp` = limité (3x-ui sur VM Google Cloud, quota, UUID par appareil).
  `endpointTier` exposé par le catalogue et réglable par l'admin.
- **D98** (2026-10-24) — **Marque réelle « Bouendji VPN » en bêta** :
  `tools/brands/bouendji.json`, package `com.bouendji.vpn`, thème `billet`, mot
  `NJI`, owner `tuekampius13@gmail.com` (mot de passe : `/root/bouendji-owner.txt`
  sur le VPS, 0600). Forfaits illimités repris du prototype : 300 (24 h),
  1 000 (4 j), 1 500 (1 sem.), 3 200 (2 sem.), 5 500 (1 mois) — prix toujours
  provisoires (O12). Paiement **simulé** tant que Fapshi n'est pas branché.
- **D99** (2026-10-24) — **Leurre de l'API → `https://www.numzer0.store`**
  (`DECOY_URL` sur `vpn-api`). Le domaine est chez Cloudflare ; aucun
  sous-domaine n'y pointe encore vers l'API (accès Cloudflare requis).
- **D100** (2026-10-24) — **APK de marque stockés sur Cloudflare R2** (remplace
  Vercel Blob de D62), lien remis par l'admin à ses utilisateurs. Mise à jour
  automatique dans l'APK : plus tard. **Non implémenté** au 2026-10-24.
- **D101** (2026-10-24) — **Domaines sur `numzer0.store`** (Cloudflare, nuage
  gris / DNS uniquement, A → 198.251.65.186) : `api`, `dl`, `node1`, `node2`.
  Certificats Let's Encrypt par Dokku. Les noms `sslip.io` restent servis le
  temps de la transition. L'APK Bouendji VPN vise `https://api.numzer0.store`
  depuis 1.0.0-beta.2. Correctif : un nœud qui change de nom met aussi à jour son
  SNI et fait bouger la révision du pool (`revive`).
- **D102** (2026-10-25) — **Chaîne de build des APK de marque** (applique D100) :
  workflow `android-brand` (dispatch par le dashboard, ou push d'un manifeste
  `tools/brands/*.json`) → injection de la marque + icônes → `assembleRelease`
  → zipalign + apksigner (keystore `bouendji`, RSA 4096, secrets GitHub ;
  sauvegarde `/root/android-release/` sur le VPS, 0600) → R2 bucket `vpn-apps`,
  `brands/<package>/<package>-<version>-<code>.apk` + `latest.apk`, servi par
  `https://apps.numzer0.store` (domaine R2 personnalisé) → rappel backend.
  Prérequis restants : `libbox.aar` téléchargeable par la CI (Release GitHub,
  publication publique refusée sans accord explicite) et secrets
  `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` posés par l'utilisateur.
- **D103** (2026-10-25) — **Refonte visuelle du dashboard** (décision de
  l'utilisateur, « actuellement complètement cassé, trop terne ») : style iOS
  partout, **ombres et dégradés là où ils servent la hiérarchie** (feuilles,
  tiroirs, menus, cartes de chiffres, bouton principal), couleurs et composants
  calqués sur l'interface **connectée** de Chariow (analysée dans le Chrome de
  l'utilisateur ; l'utilisateur s'y connecte lui-même). **Trois thèmes
  d'accent : rose, vert, rouge** (remplace l'accent jaune unique de D88 ;
  contraste ≥ 4,5:1 pour le texte maintenu, D86).
- **D104** (2026-10-25) — **Suspense granulaire, client minimal** : seule la
  valeur dynamique est enveloppée dans `<Suspense>`, jamais son titre ni son
  cadre ; chaque valeur dynamique est un composant serveur séparé. Le titre, les
  libellés et la mise en page restent statiques (prérendus). `"use client"`
  uniquement pour la moindre goutte d'interactivité, isolée dans son propre
  composant ; tout le reste est serveur.
- **D105** (2026-10-25) — **Sous-agents Haiku en effort `high`** pour les tâches
  externes au dashboard (APK, infra VPS) ; l'orchestrateur garde le dashboard.
- **D106** (2026-10-25) — **Shell recréé, architecture conservée** : rail de
  sections, sous-menu (communauté + écrans de la section), bande de section,
  contenu en feuille arrondie ; mobile : barre du haut, puces de section,
  barre d'onglets basse. Seul le rendu change, vers Chariow (demande de
  l'utilisateur). **Accents de Chariow aux mêmes endroits, seule la couleur
  primaire change** (rose, vert, rouge) ; états sélectionnés teintés de la
  primaire, pas gris.
- **D107** (2026-10-25) — **Ajout manuel de nœud par lien `vless://`** : le
  formulaire accepte un lien collé, analysé dans le navigateur pour
  pré-remplir adresse, port, UUID, SNI, Host, chemin et libellé ; seuls
  `type=ws` + `security=tls` sont acceptés (forme servie par
  `POST /v1/admin/endpoints/manual`). Le lien n'est ni envoyé tel quel, ni
  journalisé, ni stocké.
- **D108** (2026-10-25) — **Rendu pixel près de Chariow, primaire ≤ 10 %**
  (remplace la partie « états sélectionnés teintés de la primaire » de D106) :
  bouton principal noir, item actif sur fond gris avec icône primaire, primaire
  réservée au focus, survol, sélection et indicateurs ; bordures `#e5e7e8`
  visibles, ombres seulement sur surface, tiroirs et menus ; document non
  défilant, seule la surface défile, barre d'outils et en-tête de tableau
  collants. Détail et suivi : `30-clients/dashboard-plan`.

- **D109** (2026-10-25) - **Dashboard sur Vercel, projet `freeteam5/vpn-dashboard`** :
  Root Directory = `apps/dashboard`, construit par Turbo (`bun run build
  --filter=@vpn/dashboard`) pour que `@vpn/contract/dist` existe. Domaine
  vise : `a.numzer0.store` (zone Cloudflare, id `3c461aaf6c029e6649deb30d04d5d5cd`),
  CNAME vers `cname.vercel-dns.com` en DNS-only. Le lien Git automatique a
  echoue (`repo_no_access`) : l'app Vercel n'a pas les droits d'ecriture sur
  `pius-coder/bouendji`.
- **D110** (2026-10-25) - **Neon = cible de migration, pas la base active** : la
  base de production reste `dokku-postgres-vpn-db` sur `aura-vps` ; la base
  Neon `neondb` (eu-central-1) existe mais etait **vide** (0 table) au
  2026-10-25. Migration vers Neon prevue "plus tard", comme base de dump.
- **D111** (2026-10-25) - **Identifiants Fapshi poses sur `vpn-api`**
  (`FAPSHI_API_USER`, `FAPSHI_API_KEY`) avec `--no-restart`. Le passage
  en paiement reel reste **bloque** : `BUILD_CALLBACK_SECRET` et
  `FAPSHI_WEBHOOK_SECRET` sont absents, et `PAYMENT_PROVIDER` vaut encore
  `mock` (garde-fou `config.ts` l. 197-214).

- **D113** (2026-10-26) - **Forfait limite = client 3x-ui dedie, coupure a l'epuisement** :
  le plan limite tourne sur des VM Google Cloud **permanentes** avec 3x-ui. Chaque
  abonne d'un forfait limite recoit **son propre client VLESS** (lien unique), ce qui
  permet de suivre son trafic et de couper son acces depuis 3x-ui. Quota epuise :
  acces coupe et l'app propose directement d'acheter un nouveau forfait (pas de
  debit reduit, pas de pack data separe). L'illimite reste sur des noeuds
  ephemeres (liens temporaires, redeployes toutes les 2 a 4 h). Dit par
  l'utilisateur le 2026-10-26.- **D114** (2026-10-26) - **3x-ui pilote par l'API, sans geste admin** : paiement
  confirme d'un forfait limite -> l'API cree le client 3x-ui (quota, echeance),
  suit sa consommation, et l'acces est coupe a l'epuisement. Confirme par
  l'utilisateur le 2026-10-26.
- **D115** (2026-10-26) - **Deux familles de forfaits, pas d'illimite seul** :
  (1) **Limite** = quantite de data fixe (client 3x-ui dedie, D113/D114).
  (2) **Limite + illimite de nuit** = le meme quota de jour, plus de la data
  illimitee la nuit sur les serveurs ephemeres. Un serveur illimite vit 4 h :
  un deploiement a **20 h** (jusqu'a 24 h), un second a **24 h** (jusqu'a 4 h).
  L'utilisateur choisit sa plage : **20 h-24 h**, **24 h-4 h** ou **20 h-4 h**
  (les deux deploiements). L'admin de communaute fixe quotas, durees et prix
  par option ; l'utilisateur choisit sur une **page de paiement** de l'app (a
  creer) qui affiche le prix. Les abonnes illimites voient la liste des serveurs
  illimites avec ping ; en cas d'echec, ils demandent un fichier de secours a
  l'admin (seul cas d'usage). Corrige par l'utilisateur le 2026-10-26.- **D116** (2026-10-26) - **Pas d'email, WhatsApp partout** : une communaute
  porte un lien de groupe WhatsApp et le numero WhatsApp de l'admin. Pas de
  reinitialisation de mot de passe par email. L'app affiche au premier lancement
  un pop-up « Bienvenue sur <nom de l'app> » qui propose de rejoindre la
  communaute (la plupart des installations viennent du lien de telechargement,
  sans contact prealable avec l'admin).- **D117** (2026-10-26) - **Libre-service des marques** : chaque admin de
  communaute cree sa communaute et son application pendant son onboarding et
  **demande** le build ; l'owner valide, la pipeline construit et depose l'APK
  sur R2. **Un admin = une seule application.** L'owner voit qui est connecte.
- **D118** (2026-10-26) - **Connexion par email OU numero WhatsApp** :
  l'onboarding demande le numero WhatsApp en option, explique son usage par des
  cartes. Un **guide par role** explique l'usage de la plateforme et les cas
  documentes dans `knowledge/`.
- **D119** (2026-10-26) - **Serveurs de nuit deployes a la main, rappel
  Telegram** : pas de deploiement automatique. Le bot Telegram notifie
  **plusieurs destinataires** (deux owners + le role deploiement) ; aujourd'hui
  `config.ts` n'accepte qu'un `TELEGRAM_CHAT_ID`. Le bot doit etre teste de bout
  en bout. L'utilisateur fournira le jeton du bot et les ID.
- **D120** (2026-10-26) - **Nouveau role plateforme « Reseau »** (deploiement
  des serveurs) avec sa propre interface, attribue par l'owner. Les roles
  plateforme sont cumulables (une personne peut etre owner et reseau).
- **D121** (2026-10-26) - **Prix plancher** : la plateforme fixe le cout de
  base du Go et ses marges, d'ou un prix minimum. L'admin de communaute fixe
  ses prix au-dessus de ce minimum, aide par un **indicateur de prix** qui
  explique le calcul. La page de paiement est dans l'app, au theme de la marque.- **D122** (2026-10-26) - **API sur Dokku, plus sur Vercel** : Vercel reste
  pour le dashboard ; l'API reste `vpn-api` sur Dokku (connexions longues pour
  le SSE). Le `apps/api/vercel.json` n'est plus une cible.
- **D123** (2026-10-26) - **Deux comptes Google Cloud, deux usages** :
  (a) un **compte GCP durable** sert **uniquement le forfait limite** : VM(s)
  permanentes avec 3x-ui, **creees par les owners seuls**, qui enregistrent le
  lien et l'acces du panneau 3x-ui dans le dashboard (espace Plateforme) ;
  (b) les **comptes Qwiklabs** servent **uniquement l'illimite de nuit** :
  nœuds Cloud Run deployes par le role Reseau. Jamais de compte durable pour la
  nuit. En attendant la VM GCP, les tests 3x-ui se font sur `aura-vps`.
- **D124** (2026-10-26) - **Cle de deploiement par creneau de nuit** (decide par
  l'orchestrateur, l'utilisateur ne savait pas) : le membre Reseau ne voit jamais
  `ENDPOINT_INGEST_SECRET`. Le dashboard lui donne pour chaque creneau une cle a
  usage unique, valable jusqu'a la fin du creneau, qu'il colle dans Cloud Run ;
  l'API l'echange a l'enregistrement du nœud. Raison : la valeur reste visible
  dans la console d'un compte Qwiklabs jetable ; une fuite ne vaut qu'un
  creneau. Reversible si l'utilisateur prefere le secret global.- **D125** (2026-10-26) - **Aucun tarif code en dur** : cout du Go, cout par
  plage de nuit, marge plateforme **et plafond de commission** sont saisis par
  les owners dans le dashboard (Plateforme > Tarifs), sans valeur par defaut
  dans le code. Le plafond de 30 % actuel (D35) devient une valeur reglable par
  les owners.
- **D126** (2026-10-26) - **Priorite : livrer les APK aujourd'hui.** La refonte
  du dashboard (vague 2) est suspendue ; on garde les ecrans existants et on
  n'ajoute que ce qui sert a vendre. Travail fait par l'orchestrateur seul,
  **sans sous-agent** (demande explicite de l'utilisateur).
- **D127** (2026-10-26) - **Forfait sur mesure (type MyWay) remplace les anciens
  forfaits limites.** L'abonne choisit la data (Go) et la duree (jours) par
  curseurs. L'admin saisit un prix par Go a 1 jour et un prix par Go a 30 jours ;
  interpolation lineaire entre les deux ; prix = Go x prix/Go(duree), arrondi
  au multiple de 50 FCFA superieur ; bornes des curseurs reglees par l'admin ;
  jamais sous le plancher owner (D121). **Le prix est calcule par le serveur.**
  L'illimite de nuit reste une option ajoutee par-dessus. Aucun chiffre par
  defaut dans le code (D125).
- **D128** (2026-10-26) - **APK compilees uniquement sur GitHub Actions**, pour
  toutes les communautes en prod, deposees sur R2. Une **seule cle de
  signature** pour toutes les marques (secret GitHub + sauvegarde chez
  l'utilisateur). Accord donne pour pousser la branche et deployer l'API en prod
  avec migrations ; les secrets (Fapshi reel, R2, keystore) sont poses par
  l'utilisateur lui-meme. Aucune APK distribuee avant un test reel sur le
  Pixel 8 (tunnel + petit paiement).
- **D129** (2026-10-27) — **Liste des serveurs côté application : tirage explicite,
  pas de push pour l'instant.** L'app télécharge la liste (bundle) au lancement, au
  retour au premier plan, et à l'ouverture de la page Serveurs (`refreshServers`).
  Un bouton « Actualiser la liste » est ajouté sous les filtres. Un push temps réel
  (FCM) vers le téléphone reste à décider : il impose de recompiler les 8 APK et
  de créer un projet Firebase (côté utilisateur). Le bouton « Activer » d'un nœud
  dans le tableau de bord (à côté de « Tester ») demande une route API
  (`POST /v1/admin/endpoints/:id/status`) : non fait. Voir
  `30-clients/flux-serveurs-app.md`.
- **D130** (2026-10-27) — **Chronomètre de session tenu par `TunnelStateBus`.** Il était
  dans l'écran Accueil (`remember`) : il repartait à zéro à chaque changement de page.
  Désormais `TunnelStateBus.since` garde le début (premier passage à « connecté »,
  remis à zéro à l'arrêt). Code relu, non compilé.
- **D131** (2026-10-28) — **Aucun domaine de plateforme codé en dur dans le
  partage d'application.** `ShareAppCard` retombait sur `https://bouendji.app`
  quand une marque n'avait ni APK ni groupe WhatsApp : une communauté partageait
  l'adresse de la plateforme, pas la sienne. Le repli est supprimé : sans lien,
  la carte affiche « Lien bientôt disponible », pas de QR, pas de boutons
  Copier/WhatsApp. Ordre conservé : APK, puis groupe WhatsApp.

- **D132** (2026-10-28) - **Forfaits : trois types, l'illimite revient.** Limite (Go),
  **Illimite sur une duree** (ex. 7 j, 30 j) et Limite + illimite de nuit. **Annule la partie
  "pas d'illimite seul" de D115** (corrige par l'utilisateur). Chaque forfait illimite porte
  **son propre prix** saisi par l'admin (pas de prix global), controle contre le plancher
  plateforme. Les durees/prix ne sont pas ecrits en dur : ni "la verite absolue", ni le slider.
- **D133** (2026-10-28) - **Slider Android (Plans.kt)** : il choisit la quantite de Go (ou la
  duree) ; l'offre illimitee est une carte fixe attachee au slider, avec son prix propre.
  Les forfaits illimites ne sont plus des paliers du slider.
- **D134** (2026-10-28) - **Dashboard : le v2 prime sur le legacy.** 5 ecrans (Accueil, Abonnes,
  Offres, Argent, Communaute) avec onglets et tiroirs ; sidebar differente par role ;
  Plateforme et Reseau reserves a l'owner / membre Reseau. L'admin de communaute ne voit pas le
  technique par defaut (appareils, secours, journal, builds : derriere onglets/tiroirs) ;
  l'accueil = "A traiter" + 4 chiffres. Code non touche : audit d'abord (voir ecarts-v2-2026-10-28).

- **D135** (2026-10-28) — **Dashboard : conditionnement automatique du sélecteur de serveurs selon la famille.**
  Dans le formulaire de forfait (`plan-sheet.tsx`), le sélecteur « Serveurs » (Illimité `free-labs` vs Limité `paid-gcp`)
  est automatiquement verrouillé selon la famille du forfait :
  - `unlimited` → `free-labs` (« Illimité ») ;
  - `limited` → `paid-gcp` (« Limité ») ;
  - `limited_night` → `paid-gcp` (« Limité ») le jour, les créneaux de nuit activant les serveurs illimités.
  Le sélecteur manuel redondant est verrouillé/masqué pour éviter toute mauvaise configuration.

- **D136** (2026-10-28) — **Android : filtrage dynamique des serveurs affichés selon l'abonnement payé.**
  Tous les serveurs connus du bundle restent persistés dans le stockage local du téléphone (fonctionnement hors-ligne).
  Toutefois, la liste affichée à l'utilisateur dans l'interface et active dans le sélecteur dépend de son abonnement :
  - Sans abonnement actif : aucun serveur n'apparaît (message invitant à souscrire un forfait) ;
  - Forfait `unlimited` : seuls les serveurs illimités (`free-labs`) s'affichent ;
  - Règle `limited` / `limited_night` remplacée le 2026-10-29 par D141.

- **D137** (2026-10-28) — **Android : inscription sans email (4 champs) et synchronisation différée / secours.**
  - L'inscription sur Android ne demande plus aucun email : strictement 4 champs (Nom complet, Téléphone/WhatsApp,
    Mot de passe, Code de parrainage facultatif).
  - Hors-ligne, le profil est conservé dans le téléphone ; l'application s'appuie sur le tunnel de secours
    (rescue bundle pré-embarqué) pour contacter l'API et ouvrir la page de paiement Mobile Money.

- **D138** (2026-10-28) - **Moteur sing-box (`libbox.aar`) et APK en mode universel (`armeabi-v7a`, `arm64-v8a`, `x86_64`)** :
  Certains smartphones Android récents (ex. Tecno Pova 6 Neo, gammes Infinix et Itel) tournent sous un système Android 32-bit (`armeabi-v7a`) sur SoC 64-bit et rejettent l'installation d'une APK qui ne porte que `arm64-v8a` (`INSTALL_FAILED_NO_MATCHING_ABIS`). Le workflow CI `libbox.yml` compile désormais les architectures `android/arm`, `android/arm64` et `android/amd64`, assurant la compatibilité totale dès Android 8.0 (`minSdk = 26`).

- **D139** (2026-10-28) - **Déclenchement automatique des builds APK depuis le dashboard via l'API Dokku** :
  Pour que l'approbation d'un build par l'owner (`/v1/admin/builds/:id/approve`) déclenche la compilation réelle sur GitHub Actions, `vpn-api` sur `aura-vps` a été configuré avec `GITHUB_TOKEN`, `GITHUB_REPO=pius-coder/bouendji`, `GITHUB_REF=api/prod-hardening`, `BUILD_CALLBACK_SECRET`, et `MOCK_BUILDS=false`. Le secret GitHub `BUILD_CALLBACK_TOKEN` est aligné pour sécuriser le rapport terminal d'avancement vers l'API.

- **D140** (2026-10-29) — **Réseau : Pas de serveurs spécifiques à la nuit, unification de l'infrastructure.**
  L'option de nuit (20h-00h, 00h-04h) est une règle d'accès et d'autorisation sur l'abonnement du client, et non une catégorie distincte de serveurs physiques. Les connexions nocturnes utilisent exactement les mêmes serveurs que le pool illimité (`free-labs`). La notion de créneaux de déploiement spécialisés pour la nuit était de l'over-engineering.
  Le document v2 et la page Réseau du dashboard sont simplifiés : gestion directe et concrète des serveurs réels (pool illimité et serveurs 3x-ui), avec cycle de vie complet (actif, vidange, expiré, purge des nœuds morts).

- **D141** (2026-10-29) — **Accès réseau cumulatif pour les abonnés payants et le propriétaire VIP.**
  Un forfait gratuit/illimité reste borné aux nœuds `free-labs`. Un forfait
  `paid-gcp` — y compris le plan `owner-vip` — reçoit les nœuds `paid-gcp` et
  `free-labs`, et l'écran Android les laisse tous sélectionnables. Cette
  décision remplace la partie « un seul tier par bundle » de D45 et le filtrage
  exclusif des forfaits limités de D136. Vérifié par les commits `f4757e7` et
  `ee12984`.

## D141 � 2026-10-29 � Diff�renciation structurelle par th�me
Saitrix (nebula) : �cran d'auth sans onglets ni grand titre, compact et non scrollable, bascule Inscription/Connexion par lien sous le bouton. Mascotte : robot (concepts ChatGPT e9 + c68, fonds retir�s ; c318 exclu). Sources : tools/brands/saitrix/mascot*.png. Fond d'ic�ne adaptative : #16082F. V�rifi� : assembleDebug OK, install� sur Pixel 8, capture relue. Reste : autres �crans (Home, Servers, Plans, Profile) � diff�rencier, puis Goat VPN.


- **D142** (2026-10-29) — **Outillage dev : provider OpenCode `explabs` (gateway Experiential Labs).**
  Ajouté à la config globale (`~/.config/opencode/opencode.json`), PAS au dépôt : ID `explabs`, package natif
  `@opencode/ai/providers/openai-compatible`, baseURL `https://api.experientiallabs.ai/v1`, clé lue via
  `{file:~/.secrets/xpl-key}` (jamais dans un fichier suivi). Modèles : `deepseek-v4.1-flash-uncensored`
  (1M ctx / 393 216 out ; variantes low|high|max|none) et `glm-5.3-flash-uncensored` (1M ctx / 131 072 out ;
  low|high|max). Vérifié par `opencode run` sur chaque modèle et chaque variante testée (réponses OK).
  Pièges consignés : (1) `opencode.json` commence par un BOM UTF-8 — le préserver lors des éditions, et le
  retirer avant tout `JSON.parse` par script ; (2) dans OpenCode v2.2.0, `capabilities.reasoning.toggle` ne
  produit PAS de variante `none` (erreur « Variant unavailable ») — la déclarer via `variants: [{id: none,
  settings: {reasoningEffort: none}}]`. Sauvegarde : `opencode.json.bak-explabs`.

- **D143** (2026-10-29) — **Ajout manuel VLESS : plusieurs liens, pays déduit de Cloud Run, noms de fleuves.**
  `POST /v1/admin/endpoints/manual` accepte maintenant un bloc de liens (un par ligne, 50 max,
  `extractVlessUris` dans `apps/api/src/lib/vless.ts`). Un lien = un nœud ; l'empreinte du groupe
  inclut désormais `hostHeader` (sinon deux liens ne différant que par le Cloud Run s'écrasaient).
  Un lien invalide refuse tout le bloc (aucune écriture partielle). Le pays affiché vient de la
  région GCP du host Cloud Run (`apps/api/src/lib/cloudrun.ts` → code ISO alpha-2, ex. `us-west1`
  → `us`) car `Flags.kt` de l'app rend le drapeau à partir d'un code à deux lettres ; région
  inconnue → `auto`. Le libellé est un fleuve camerounais + numéro (`Sanaga 42`,
  `cameroonRiverNameFor`), stable pour la même empreinte. Le dashboard a un mode « Lot de liens »
  dans la feuille d'ajout (`manual-endpoint-sheet.tsx`) qui appelle `addManualVlessAction`.
  Réponse : `nodes[]` + `groups[]`, `group`/`label` conservés pour compat. Vérifié : `tsc` API et
  dashboard sans sortie ; `node --test test/manualVless.test.ts` 8/8 pass (dont 2 nouveaux) ;
  dashboard `vless-link.test.ts` 6/6 pass (dont 3 nouveaux). Piège : `bun test` échoue sur les
  tests API (401) — utiliser `node --test --import tsx`.

- **D144** (2026-10-29) — **Pages de téléchargement par marque sur `dl.numzer0.store`, jamais une page commune.**
  `vpn-dl` (nginx Dokku) sert un `index.html` par marque : `/` et `/bouendji/` (Bouendji),
  `/dalas-npv/`, `/goat-vpn/`, `/gregor-44/`, `/james-pro/`, `/nevpn/`, `/saitrix/`, `/test/`.
  Chaque page ne lie que le APK versionné de SA marque sur `apps.numzer0.store` — aucun lien
  croisé, aucun annuaire : les communautés ne se découvrent pas entre elles. Les fichiers vivent
  sur le montage persistant `/var/lib/dokku/data/storage/vpn-dl/` (survivent au redéploiement).
  L'ancien `bouendji-vpn.apk` (91 Mo, beta.2) reste en place mais n'est plus lié.

- **D145** (2026-10-29) — **Plus aucune désactivation automatique des serveurs.**
  Demande explicite : un serveur ne doit jamais être désactivé tout seul, même
  expiré. Changements (`38463d4`) : `sweepEndpoints` supprimé (plus de tick
  `active → draining → expired`, `server.ts` ne fait plus que les rappels de
  créneaux de nuit + purge bundles/sessions) ; la transition silencieuse
  `active → expired` du hook de maintenance (`app.ts`) retirée ;
  `expires_at` ne filtre **plus** le service (`servedEndpoints`,
  `nightRowsFor`, diagnostic `/pool`) ni `ready`/`register` — seul un statut
  `expired` **posé à la main** bloque un re-register. `expires_at` devient une
  date d'affichage. La fenêtre de nuit 3x-ui reste bornée par le **créneau
  acheté** (`ns.ends_at`), pas par le TTL. Restent intacts : probation `down`
  30 min (D50, c'est l'inverse d'une désactivation), verdicts clients `down`
  (D47), purge manuelle console. Vérifié : tsc sans sortie, **358/358 tests**
  (dont 2 réécrits : « register après expiration → le nœud revit », « un nœud
  au TTL passé reste servi »). Déployé en prod (vpn-api, healthchecks OK) ;
  sauvegarde DB avant : `vpn-db-2026-10-29-avant-multilien.sql.gz`.

- **D146** (2026-10-29) — **Reprise de paiement et suspension admin livrées en
  prod, sans accès gratuit.** Le lot `0bdaa67` ajoute :
  `POST /v1/admin/orders/:id/reconcile` (owner ou `community_admin`), qui
  réinterroge le fournisseur pour une commande `created`/`pending` ou termine
  l'activation d'une commande `paid` non activée, journalise `order.reconcile`
  et **ne crée jamais de forfait gratuit** (l'attribution gratuite reste la
  question ouverte O22) ; `PATCH /v1/admin/:adminId` pour suspendre/réactiver
  un administrateur avec révocation de ses sessions et garde-fous (pas
  d'auto-suspension, pas de dernier owner). Côté dashboard : bouton
  « Vérifier le paiement », bouton statut admin, refonte visuelle (palette
  chaude, barre latérale sombre) et écran de connexion en deux panneaux.
  Vérifié : tsc API + dashboard sans sortie, **API 358/358**, **dashboard
  150/150**, `next build` OK. Déployé : API Dokku (openapi expose la route,
  conteneur `Running`, logs 200) et dashboard Vercel
  (`E9dWLSK62PRWD67vYRii7mhQ6Deo`, Ready, alias
  `vpn-dashboard-seven.vercel.app`). Sauvegarde DB avant :
  `vpn-db-2026-10-29-avant-dashboard-updates.sql.gz`. Le déploiement Vercel a
  exigé de forcer IPv4 (voir `deploiement-dashboard-api`).

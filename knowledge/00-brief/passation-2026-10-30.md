---
id: passation-2026-10-30
title: Passation — régime réseau en prod, dashboard réseau livré, 8 marques sur Pixel 8
tags: [passation, reseau, sonde, dashboard, apk, dokku, vercel, pixel8]
status: verified
updated: 2026-10-30
related: [reseau-audit-2026-10-30, deploiement-dashboard-api, livraison-apk-2026-10-30, pages-cloudflare-2026-10-30, decisions]
---

# Passation — 2026-10-30 (session OpenCode)

**État** : rien ne tourne en arrière-plan. Tout est commité et poussé sur
`api/prod-hardening` (**`04ac6f7`**). L'API prod (Dokku) et le dashboard prod
(Vercel) sont à jour. **Le tunnel n'a pas encore été retesté sur le téléphone** —
c'est le premier geste de la reprise.

## À lire pour reprendre

1. `00-brief/decisions.md`, **D147** : le nouveau régime réseau (sonde serveur
   + rapports téléphones, aucun retrait automatique, alerte Telegram seule).
2. `10-infrastructure/reseau-audit-2026-10-30.md` : audit complet, §6 « livré »,
   reste à faire en fin de §6.
3. `10-infrastructure/deploiement-dashboard-api.md` : procédures Dokku/Vercel
   (pièges IPv4, dépôt réduit, `--archive=tgz`).

## Fait et vérifié aujourd'hui

### API — régime réseau (D147, lot `eb1a092`)

- Sonde TCP toutes les 5 min + au démarrage (`services/probe.ts`), migration
  `102_endpoint_probe` (`probe_ok`, `probe_latency_ms`, `probe_error`,
  `probed_at`).
- Verdict combiné (`services/health.ts`) : sonde prioritaire < 15 min, sinon
  téléphones (fenêtre 10 min) ; retour = alerte Telegram `probe:ok`.
- `servedEndpoints`/`nightRowsFor` servent aussi les nœuds `down` (ordre
  `healthy`, `unknown`, `degraded`, `down`) ; purge limitée à `status='expired'` ;
  route `POST /v1/admin/endpoints/:id/test`.
- **358/358 tests API**, tsc silencieux.
- Déployé en prod : healthchecks Dokku OK, migration 102 appliquée, sonde de
  démarrage 07:46:52 UTC **13/13 nœuds actifs OK (82–93 ms)**, `readyz` → 401,
  `openapi.json` → 200. Sauvegarde avant :
  `~/backups/vpn-db-2026-10-30-avant-sonde-reseau.sql.gz`.

### Dashboard — page Réseau (lot `4beceff`, déployé Vercel `3YJX9YjZ…`)

- Drawer nœud : section « Sonde serveur » (statut, latence, date, erreur) +
  bouton **« Tester ce nœud »** ; raison `down_reason` **traduite**
  (`downReasonLabel`, miroir de `healthReasonLabel` API) ; **« Rétablir en
  service » depuis `unknown`/`degraded`** (plus seulement `down`) ; copie
  corrigée (un nœud `down` reste distribué en fin de liste) ; latence du
  tableau = sonde en priorité ; copie de purge : « seuls les statut Expiré ».
- Schéma/service/action : `poolEndpoint` + `probeOk/probeLatencyMs/probeError/
  probedAt`, `testEndpoint` (`POST /endpoints/:id/test`), `testEndpointAction`.
- Bonus commité : accueil — page d'attente « admin sans communauté » (incident
  du matin).
- **tsc silencieux, 150/150 tests dashboard, `next build` exit 0**.
- Déployé Vercel **READY**, prod `https://vpn-dashboard-seven.vercel.app` :
  `/login` 200 (contenu neuf), `/` 307. Déploiement via le binaire en cache +
  `NODE_OPTIONS="--dns-result-order=ipv4first --no-network-family-autoselection"`
  + `--archive=tgz` (piège : le wrapper bash `.bin/vercel` casse, appeler
  `node …/node_modules/vercel/dist/vc.js`).

### Pages de téléchargement

- Les **8 pages** `https://<slug>.cleanforceplus.online` répondent **200**, ne
  lient chacune que l'APK versionné de leur marque (vérifié par fetch +
  extraction des `href` .apk). Détail : `30-clients/pages-cloudflare-2026-10-30.md`.

### Pixel 8 (`39141FDJH00GAV`) — 7 marques installées

| Package | Version installée | Mode |
|---|---|---|
| cm.bouendji.dalasnpv | 1.1.4 (6) | update (`install -r`) |
| cm.bouendji.goatvpn | 1.1.5 (7) | update |
| cm.bouendji.gregor44 | 1.1.4 (6) | update |
| cm.bouendji.jamespro | 1.1.4 (6) | update |
| cm.bouendji.nevpn | 1.1.4 (6) | **désinstall puis install** (signature v1 ≠ prod) |
| cm.bouendji.saitrix | 1.1.5 (7) | déjà à jour |
| cm.bouendji.test | 1.1.4 (6) | installation neuve |

APK téléchargés depuis R2 via `tools/fetch-segmented.ps1` dans
`C:\Users\lenovo\Downloads\` (6 fichiers ~150 Mo). Bouendji (`com.bouendji.vpn`,
beta.8-8) **non mis à jour** sur l'appareil (beta.3 v3 encore installée).

### WhatsApp Saitrix

- Décision du propriétaire : **l'admin Saitrix remplit lui-même** son numéro
  (dashboard → Paramètres de la communauté → « Numéro WhatsApp du support »,
  `PATCH /v1/admin/communities/:id` accepte `contactWhatsapp`). Rien à faire
  côté plateforme. Noté dans `30-clients/support-channel-runtime-2026-10-29.md`.

## Reste à faire (par priorité)

1. **Tester le tunnel sur le Pixel 8** : ouvrir une marque (ex. goatvpn ou
   saitrix), payer/activer si besoin, vérifier connexion VLESS + IPv6. À
   l'époque : « loopback cleartext » suspecté, voir
   `30-clients/flux-serveurs-app.md` et `android-audit-2026-10-29`.
2. **Dashboard réseau — fraîcheur/polling** : la page est un instantané ;
   afficher l'âge de la dernière sonde et rafraîchir (`revalidation` ou
   polling). Bouton « Tester ce nœud » existe déjà.
3. **Offres** : aucune offre active en prod ; relancer les communautés après
   vérification des planchers (voir `40-money/plancher-affiche-zero-2026-10-30.md`
   et `suppression-offres-prod-2026-10-30.md`).
4. Questions ouvertes non tranchées : signature de bundle en ligne (Ed25519),
   TLS pinning, conserver `dl.numzer0.store` en plus de `cleanforceplus.online`,
   annonces non affichées (`00-brief/open-questions.md`).
5. §6 de l'audit réseau : #6 (app : file de rapports priorisée) non traité.
6. `com.bouendji.vpn` (Bouendji, beta.8-8) pas installé sur le Pixel 8 si on
   veut tester la marque mère.

## Pièges de la journée (à ne pas redécouvrir)

- `bun`/`vercel` wrappers bash cassés sur ce shell (pas de `sed`/`dirname`) :
  appeler les entrypoints JS avec `node` directement.
- `next build` et `next dev` tournant en même temps → « Another next build
  process is already running » ; attendre la fin du premier.
- `powershell` absent du PATH des sous-shells : utiliser
  `C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe`.
- Aucune désactivation automatique des serveurs n'existe plus : ne réintroduire
  ni `sweepEndpoints`, ni filtre `health='down'` dans le service (D145/D147).

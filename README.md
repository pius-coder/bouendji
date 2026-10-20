# Plateforme VPN — marque blanche

Application Android VLESS, API, dashboard, paiements et génération d'APK par
marque. L'utilisateur ne voit jamais de lien `vless://` : il paie, enregistre
son appareil, et l'application maintient seule une connexion valide.

## Ce qui tourne, et où

```
apps/api        API Fastify + PGlite/Postgres, ingestion des endpoints, paiements
apps/admin      Dashboard Next.js (export statique servi par l'API sur /admin)
apps/admin-legacy  Ancienne version sans framework — référence, plus servie
apps/android    Application Android (sing-box, Compose, Keystore)
infra/endpoint  Conteneur qui transforme un déploiement Cloud Run en nœud
knowledge/      Mémoire du projet — la lire avant de coder
```

## Démarrer

```bash
pnpm install --config.strict-dep-builds=false
pnpm --filter @vpn/contract build
pnpm --filter @vpn/admin build   # produit apps/admin/out, servi sous /admin/

cd apps/api
cp .env.example .env          # remplir MASTER_KEY, JWT_SECRET, SEED_ADMIN_PASSWORD
pnpm seed                     # communauté, app, forfaits, propriétaire
pnpm dev                      # http://localhost:8080/admin/
```

Le seed est idempotent : le relancer ne duplique rien et ne réinitialise aucun
mot de passe. Sans `apps/admin/out`, `/admin/` répond 503 avec la commande à
lancer — l'API n'invente pas une page vide.

## Les quatre chiffres

| Valeur | Sens |
|---|---|
| `16200` | durée de vie d'un nœud (4 h 30), imposée par le projet qui l'héberge |
| `900` | drain : retiré du pool 15 min avant sa mort |
| `3300` | rotation du tunnel côté client (55 min) |
| `3600` | timeout de requête Cloud Run — à poser à la main, le défaut est 300 |

## Vérifier

```bash
pnpm --filter @vpn/api test        # suite complète
pnpm --filter @vpn/api typecheck
```

## Produire un APK de marque

Une marque est un fichier source réécrit avant compilation, jamais un thème
chargé au lancement.

```bash
node tools/inject-brand.mjs --spec marque.json --root apps/android
cd apps/android && gradle wrapper --gradle-version 8.7 && ./gradlew :app:assembleRelease
```

Le manifeste est décrit dans `tools/brands/_example.json` ; le script refuse un
package de référence, une URL non https, un thème inconnu (sortie 78). En CI,
`.github/workflows/android-brand.yml` fait les mêmes étapes et signe avec
`apksigner` si le keystore est fourni.

Fichier de secours hors-ligne : `node tools/offline-keygen.mjs` produit la paire
Ed25519 — privée dans `OFFLINE_BUNDLE_SIGNING_KEY`, publique dans
`offlineBundleSigningKeyB64` du manifeste.

## Nœud d'endpoint

`infra/endpoint/` se construit et se pousse comme n'importe quelle image ; le
conteneur s'enregistre tout seul auprès de l'API, écrit sa configuration Xray,
attend que le port réponde, puis signale `ready`. Rien n'est déployé
automatiquement : le déploiement Cloud Run reste une action manuelle (voir
`Fiche-deploiement-Cloud-Run.html`).

## Ce qui est vérifié, et ce qui ne l'est pas

- **Vérifié** : l'API TypeScript compile, les tests s'exécutent et passent.
- **Relu seulement** : le code Android (pas de SDK sur cette machine), le
  conteneur d'endpoint (Docker arrêté), le chemin Postgres réel (seul PGlite a
  tourné). Ces parties doivent être validées au premier build.

## Mémoire

`node knowledge/cli.mjs context` puis `node knowledge/cli.mjs report`.
Les décisions vivent dans `knowledge/00-brief/decisions.md` ; une valeur non
écrite là n'existe pas.

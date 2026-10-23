---
id: logging
title: Journal — Pino, transports et pièges
tags: [backend, api, logs, pino, fastify]
status: verified
updated: 2026-10-23
related: [api-routes, decisions]
---

# Journal — Pino, transports et pièges

D74. La sortie dépend de l'environnement, pas d'un drapeau passé au hasard.

| Environnement | `logger` transmis à Fastify | Sortie |
|---|---|---|
| `production` | `true` | JSON brut de Pino, une ligne par entrée |
| autre | `{ transport: { target: "pino-pretty" } }` | lignes lisibles, colorées |

`buildApp` accepte `FastifyServerOptions["logger"]` (booléen **ou** options
Pino) : les tests et la fonction Vercel continuent de passer `false` et restent
muets. `pino-pretty` est une **devDependency** et n'est jamais importé en
production — le chemin `logger: true` ne le référence pas.

## Vérifié (2026-10-23)

- `tsc -p apps/api/tsconfig.json --noEmit` : aucune sortie.
- `npm test` dans `apps/api` : 160 tests, 160 passés, 0 échec.
- Démarrage réel (`NODE_ENV=development`, port 8099) : `[06:45:36 UTC] INFO:
  Server listening at …`, puis `incoming request` / `request completed` avec
  `reqId`, `res.statusCode` et `responseTime` sur des lignes indentées.

## Pièges

- **Cette machine a `NODE_ENV=production` dans l'environnement global.** Donc
  `node --import tsx src/server.ts` échoue dans `config.ts`
  (`MASTER_KEY is required in production`) et, si tous les secrets étaient
  fournis, produirait du JSON au lieu du rendu lisible. Lancer avec
  `$env:NODE_ENV='development'`.
- Le transport Pino tourne dans un worker : sous le lanceur de tâches de fond,
  `stdout` n'a rien capturé (fichier vide). Rediriger explicitement
  (`Start-Process -RedirectStandardOutput`) pour voir les lignes.
- pnpm est épinglé à 12.8.1 mais ce registre ne sert que 11.28.8 : le shim
  `pnpm` échoue. Contournement utilisé :
  `node <scratch>/node_modules/pnpm/bin/pnpm.cjs add …`, le binaire JS
  résolvant la version épinglée depuis le store existant.

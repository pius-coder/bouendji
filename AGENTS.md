# AGENTS.md — plateforme VPN marque blanche

Ce dépôt contient l'API, le dashboard, le conteneur d'endpoint et l'application
Android. Le travail est long, interrompu par des compactions : **la mémoire
écrite prime sur le souvenir**.

## À faire au début de chaque session, et après CHAQUE compaction

```bash
node knowledge/cli.mjs context   # objectif, questions ouvertes, état
node knowledge/cli.mjs report    # ce que les sous-agents ont produit
```

Ne jamais répondre « je ne sais plus où on en était ». C'est écrit dans
`knowledge/`.

## Règle de persistance

Après **toute** analyse, tout chiffre vérifié, toute décision, tout piège
découvert : écrire dans `knowledge/` avant de continuer.

- un sujet = un nœud (`knowledge/<domaine>/<sujet>.md`) ;
- décision → `00-brief/decisions.md`, datée ;
- question non tranchée → `00-brief/open-questions.md` ;
- fait non vérifié → marqué `(non vérifié)` et statut `assumption`.

Un travail non écrit est un travail perdu.

## Sous-agents

Chaque sous-agent a `knowledge/agents/<slug>/` : `charter.md`, `log.md`,
`notes/`.

1. Le brief d'un sous-agent commence par : « lis ta charte, lis les nœuds
   `<ids>`, journalise chaque étape avec
   `node knowledge/cli.mjs agent log <slug> "<titre>" --fait "..." --etat ok --suite "..."` ».
2. Un sous-agent n'écrit que dans son dossier (sauf `owns:` explicite).
3. Il **propose** les modifications de nœuds partagés ; l'orchestrateur intègre.
4. Un sous-agent sans entrée de journal est considéré comme n'ayant rien fait.
5. Entre deux vagues : `node knowledge/cli.mjs report --write`, puis synthèse
   dans le nœud concerné.

## Communiquer un résultat

Un rapport de sous-agent doit contenir :

- le verdict (pas la liste des liens visités) ;
- ce qui est **vérifié** et comment (fichier + ligne, doc, test) ;
- ce qui reste **incertain** ;
- les fichiers écrits.

## Interdits

- Inventer une limite d'API, un prix, un nom de fichier, un endpoint.
- Écrire un `vless://` en clair dans l'app, un log, ou un fichier de test.
- Modifier `knowledge/` pour faire plaisir : le statut `verified` se mérite.
- Générer des images. HTML/CSS/SVG uniquement.

## État du code

- `apps/api` : `config.ts`, `schema.ts`, `db.ts`, `lib/*`, `services/*`,
  `routes/{internal,auth,devices,bundle,me,orders,payments,admin}.ts`, `app.ts`,
  `server.ts`, `seed.ts` écrits. Tests : `test/*.test.ts` (ingest, auth, bundle,
  payments, admin).
- `infra/endpoint/` : conteneur d'endpoint (register → config → xray → ready →
  heartbeat).
- `apps/admin` : SPA statique, sans build ni CDN.
- `apps/android` : socle Gradle + VpnService + Keystore + client signé.

## Ce que « vérifié » veut dire ici

- **Vérifié** : `tsc --noEmit` sans sortie, ou test exécuté dont la sortie est
  citée dans un rapport.
- **Relu** : code écrit mais non exécutable sur cette machine (Android, Docker,
  Postgres réel). Doit être marqué comme tel dans le rapport.
- Ne jamais écrire « ça marche » sans l'un des deux ci-dessus.

## Limites de la machine

Pas de JDK, pas d'Android SDK, pas de Gradle, pas d'`adb`, Docker arrêté.
L'application Android ne peut pas être compilée ici : tout code Android écrit
doit être relu en conséquence et sa vérification réelle reste à faire.

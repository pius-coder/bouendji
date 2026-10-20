# Mémoire du projet VPN

Base de connaissances **persistante** du chantier (application Android, API,
dashboard, réseau). Elle existe pour une seule raison : ne rien réinventer et ne
rien oublier après une compaction de contexte.

Tout est un fichier Markdown, lisible sans outil. Le CLI n'est qu'un confort.

```bash
node knowledge/cli.mjs context     # brief de reprise — À LIRE EN PREMIER
node knowledge/cli.mjs tree        # arborescence
node knowledge/cli.mjs read gcp    # un nœud, ses descendants, ses liens
node knowledge/cli.mjs find "egress"
node knowledge/cli.mjs open        # ce qui n'est pas tranché
node knowledge/cli.mjs check       # intégrité (ids, statuts, liens)
node knowledge/cli.mjs report      # ce que les sous-agents ont fait
```

## Arborescence

```
knowledge/
  00-brief/          objectif, décisions, questions ouvertes, glossaire
  10-infrastructure/ Cloud Run, endpoint, pool, ingestion
  20-backend/        schéma, routes, bundle hors-ligne, bots
  30-clients/        Android, sing-box, bascule, identités visuelles
  40-money/          Fapshi, rôles, commissions
  50-security/       menace, révocation
  60-research/       sujets à analyser (3x-ui…)
  agents/<slug>/     un dossier par sous-agent : charte + journal
  agents/_reports/   rapports générés
  cli.mjs
```

## Format d'un nœud

```markdown
---
id: cloud-run
title: Cloud Run — contraintes réelles
tags: [gcp, cloud-run, ttl]
status: verified | decided | assumption | open | stale
updated: 2026-10-20
related: [endpoint-lifecycle]
---

contenu…
```

- **verified** — fait constaté (doc officielle, code lu, test passé).
- **decided** — choix humain assumé.
- **assumption** — hypothèse de travail, non validée.
- **open** — question non tranchée. Le corps doit contenir la question (`?`).
- **stale** — ancien, peut-être faux, à revérifier.

## Règles

1. **Un sujet = un nœud.** On met à jour, on ne duplique pas.
2. **Pas de fait inventé.** Une limite d'API, un prix, un nom de fichier : soit
   c'est vérifié, soit c'est marqué `(non vérifié)`.
3. **Une décision contredite se réécrit** dans `decisions.md` avec sa date. Deux
   versions contradictoires dans deux fichiers = bug de mémoire.
4. **Les questions ouvertes vivent dans `open-questions.md`** et disparaissent
   quand elles sont réglées.
5. **On écrit après avoir appris**, pas à la fin du chantier.

## Sous-agents

Chaque sous-agent a un dossier `agents/<slug>/` avec :

- `charter.md` — mission, périmètre, fichiers possédés, interdits.
- `log.md` — journal **append-only**, une entrée `## <ISO> · <titre>` par étape,
  avec des lignes `- fait:`, `- etat:`, `- suite:`, `- bloque:`.
- `notes/` — tout ce qu'il veut y déposer.

Règles de cohabitation :

1. Un sous-agent n'écrit **que** dans son dossier, sauf fichiers explicitement
   listés dans sa charte (`owns:`).
2. Aucun sous-agent ne modifie un nœud partagé : il **propose**, l'orchestrateur
   intègre. C'est ce qui évite deux vérités concurrentes.
3. Le journal est la seule source pour savoir « où en était qui ». Un sous-agent
   qui travaille sans journaliser est considéré comme n'ayant rien fait.
4. Entre deux vagues de délégation, l'orchestrateur lance `report` et écrit la
   synthèse dans le nœud concerné.

```bash
node knowledge/cli.mjs agent new xray-ops --title "Xray / 3x-ui" --scope "…" --owns "3x-ui,revocation"
node knowledge/cli.mjs agent list
node knowledge/cli.mjs agent show xray-ops
node knowledge/cli.mjs agent log xray-ops "API Xray vérifiée" "- fait: AlterInbound existe
- etat: ok"
node knowledge/cli.mjs report --since 2026-10-20T00:00Z --write
```

## Après une compaction

1. `node knowledge/cli.mjs context`
2. `node knowledge/cli.mjs report`
3. `node knowledge/cli.mjs open` si une décision bloque
4. Ne jamais répondre « je ne sais plus où on en était » : c'est écrit.

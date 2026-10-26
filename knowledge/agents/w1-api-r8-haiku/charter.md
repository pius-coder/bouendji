---
id: w1-api-r8-haiku
title: Vague 1 - R8 nuit, Telegram, reseau
kind: agent
status: done
updated: 2026-10-26
scope: "Creneaux de nuit et cle de deploiement par creneau, Telegram multi-destinataires et rappels, noms aleatoires, ajout de noeud par lien VLESS, probation de sante."
owns: [knowledge/agents/w1-api-r8-haiku]
---

# Charte — Vague 1 - R8 nuit, Telegram, reseau

## Mission

Creneaux de nuit et cle de deploiement par creneau, Telegram multi-destinataires et rappels, noms aleatoires, ajout de noeud par lien VLESS, probation de sante.

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

- `knowledge/agents/w1-api-r8-haiku`

## Interdits

1. Écrire hors de `knowledge/agents/w1-api-r8-haiku/` — sauf les fichiers explicitement
   possédés ci-dessus.
2. Modifier un nœud de connaissance partagé : il **propose**, l'orchestrateur
   intègre.
3. Affirmer sans source. Ce qui n'est pas vérifié porte `(non vérifié)`.
4. Inventer un chiffre, une limite d'API, un nom de fichier.

## Protocole

1. **Avant** de travailler : lire les nœuds utiles
   (`node knowledge/cli.mjs read <id>`) et la charte.
2. **Pendant** : une entrée de journal par étape réelle, dans `log.md` :

   ```
   ## 2026-10-26T11:21:30Z · <titre court>
   - fait: ...
   - etat: ok | partiel | bloqué
   - suite: ...
   - fichiers: ...
   ```

3. **À la fin** : une entrée `CLÔTURE` avec le résultat, ce qui est vérifié et
   ce qui ne l'est pas, et les questions laissées ouvertes.

## Journal

Le journal est `log.md`, append-only, dans ce dossier.

---
id: ui-identities
title: Quatre identités visuelles
tags: [ux, design, hig, themes, motion]
status: decided
updated: 2026-10-20
related: [android-app, android-ui]
---

## Principe

Quatre directions réellement différentes, pas quatre palettes. Même structure
de navigation, identités distinctes. Aucune image générée : HTML, CSS, SVG,
code uniquement.

| Identité | Langage |
|---|---|
| **Halo** | verre, flou, cercles, lumière froide |
| **Mono** | éditorial, typographie, noir et blanc, filets |
| **Vector** | tube cathodique, monospace, scanlines, vert |
| **Otaku** | manga, trames, contours épais, accents saturés |

## Règles de structure

- Barre supérieure : **1 action à gauche, 3 à droite**.
- Les trois actions doivent avoir une fonction réelle (jamais décoratives).
- Le **compte à rebours vit à l'intérieur** du contrôle principal, pas à côté.
- États : arrêté, connexion, connecté, reconnexion.
- Clair / sombre / auto.
- Curseurs : rayon, épaisseur de bordure, police (sans, mono, pixel, otaku),
  intensité du mouvement.

## Anti-patterns constatés

- Quatre variantes de couleur = « même app ».
- Libellés qui se chevauchent avec la barre de navigation.
- Un timer posé au-dessus du bouton au lieu d'être dedans.
- Un orbe sans affordance de tap.

## Livrable

`outputs/Atelier-identites-VPN-v2.html` — planche interactive, quatre thèmes,
états, apparence, réglages. Sert de référence, pas de code à embarquer.

L'implémentation Compose qui en découle est décrite dans `android-ui`.


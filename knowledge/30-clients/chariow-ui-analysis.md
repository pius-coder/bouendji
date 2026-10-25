---
id: chariow-ui-analysis
title: Analyse de l'interface connectée de Chariow (référence visuelle du dashboard)
tags: [dashboard, design, chariow, reference, ombres, degrades, themes]
status: verified
updated: 2026-10-25
related: [dashboard-ux, dashboard-architecture, decisions]
---

Relevé le 2026-10-25 dans le Chrome de l'utilisateur (connecté par lui-même,
`app.chariow.com`), par Chrome DevTools : captures + styles calculés
(`getComputedStyle`). Écrans : Accueil, Ventes (+ tiroir de détail), Revenus,
Analytiques, Paramètres, Ventes en 390 px. **Aucune donnée client recopiée.**
Captures de travail : scratchpad de session (non versionnées).

## Charpente

- Fond d'application **gris** `#f5f6f6` ; la barre latérale est posée dessus,
  **sans bordure ni fond propre**.
- Le contenu vit dans **une surface blanche** à coins arrondis (`rounded-xmd`,
  ≈ 16 px) avec une ombre très douce `0 0 6px rgba(0,0,0,.06)`, décollée de 8 px
  du bord droit et du bas. La barre du haut reste sur le gris (titre de page à
  gauche avec bouton retour rond, recherche ⌘K pilule au centre, actions rondes
  à droite).
- Contenu centré, largeur max ≈ 1 230 px (≈ 1 024 px pour les tableaux).
- Barre latérale : sélecteur de boutique (carte blanche, bord `#cdd0d4`,
  icône sur carré noir), items 38 px, rayon 8, texte 16/400 `#4a4e54`, actif =
  fond `#e5e7e8` + texte `#242528` + **icône teintée en jaune de marque**.
  « Réduire le menu » en bas.
- Mobile (≤ 500 px) : surface blanche arrondie sur gris, **barre d'onglets
  basse** blanche à coins hauts arrondis, 5 entrées, active en couleur de
  marque ; la barre du haut devient logo + boutons ronds gris.

## Composants mesurés

| Élément | Valeurs |
|---|---|
| Bouton principal | fond **noir** `#000`, texte blanc 14/600, rayon 12, h 50 (page) ; icône à gauche |
| Bouton secondaire | transparent, bord 1 px `#cdd0d4`, rayon 8, h 32, 12/600 |
| Bouton destructif | `#e30026`, texte blanc, rayon 8, h 32 |
| Bouton « pilule » d'action rapide (accueil) | blanc, bord gris, rayon plein, icône + libellé |
| Champ / recherche | h 40, rayon 12, bord `#cad0d7`, fond blanc, 12 px ; icône loupe à gauche, bouton filtre carré à droite **dans** le champ |
| Puces de filtre | h 28, rayon 32, 12/600, fond `#f5f6f6` (actif `#e5e7e8`), **pastille de couleur** avant le libellé |
| Badge de statut | rayon 48, 13/700, icône cerclée à gauche ; succès fond `#c3fcd3`, échec fond violet pâle, neutre gris + contour |
| Tableau | en-têtes 14/700 `#656c75`, lignes séparées par un filet `#e5e7e8`, avatar initiales rond gris, vignette produit carrée rayon 8 grise |
| Cartes de chiffres | **groupe gris** `#f5f6f6` rayon ≈ 24 contenant des **cartes blanches** rayon 12–16 ; valeur 30/700 serrée, libellé 14 `#4a4e54`, (i) à droite ; variantes **teintées** (jaune très pâle `#fffec1`, vert très pâle `#dcfce9`) |
| Sections (Analytiques) | conteneur gris rayon 16 + titre 20/500 + grille 2 colonnes de cartes blanches |
| Cartes de navigation (Paramètres) | fond `#f8f8f9`, rayon 12, **tuile d'icône teintée** 40 px (rose, vert, jaune, cyan, violet, bleu), titre 16/700, description 14 `#656c75`, flèche → ; badge « Nouveau » rouge pilule |
| Titres de page | serif display (Sang Bleu Republic, sous licence) 30–40 px ; corps Euclid Circular B (sous licence) → **pile système** chez nous |
| Tiroir (détail) | à droite, **500 px**, fond blanc, voile sombre ≈ 50 %, ombre en couches `0 1px 3px rgba(0,0,0,.05), 0 20px 25px -5px rgba(0,0,0,.05), 0 10px 10px -5px rgba(0,0,0,.04)` ; en-tête : identifiant + copier, date, badge, rangée d'actions (contour vert, rouge plein, contour neutre) ; sections = tuile d'icône teintée 24 px + titre 14/700 + filet |
| Bannière d'annonce | bloc plein couleur (bleu `#0047ab`) rayon 16, titre serif blanc, fermeture ronde |
| Dégradé | voile blanc horizontal `linear-gradient(to right, rgba(255,255,255,.7), …, #fff)` pour estomper un débordement ; pas de dégradé décoratif sur les surfaces |

Rayons relevés : 9999 (pilules, ×20), 8 (×20), 16 (×14), 12, 32, 48.
Couleurs de texte : `#000`, `#4a4e54`, `#242528`, `#20252b`, `#656c75`.

## Ce que nous en gardons (D103, D104)

- Charpente « gris + surface blanche ombrée » ; barre latérale sans bord ;
  barre basse mobile.
- Groupes gris contenant des cartes blanches (chiffres, sections).
- Tuiles d'icône teintées pour hiérarchiser sans texte en plus.
- Ombres : surface (`0 0 6px .06`), tiroir/feuille/menu (couches ci-dessus).
- **Différences voulues** : style iOS (contrôles segmentés, feuilles du bas,
  listes groupées), **dégradés** sur le bouton principal, les cartes de chiffres
  mises en avant et l'en-tête des tiroirs (l'utilisateur les veut « là où c'est
  nécessaire ») ; **accent = thème rose, vert ou rouge** au lieu du jaune.

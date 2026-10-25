---
id: dashboard-ux-opus-proposed-decision
title: Proposition de décision D81 — système UI du dashboard
status: assumption
updated: 2026-10-23
---

# Proposition D81 (texte à intégrer par l'orchestrateur dans `00-brief/decisions.md`)

Ceci n'est **pas** une décision tant que l'utilisateur ne l'a pas validée.
Elle ne tranche aucune question produit (O7, portée de `support`/`finance`,
clé console, durée de session) : elle fixe seulement les conventions
d'interface, en restant dans le cadre de D31, D32, D41, D78, D79 et D80.

---

- **D81** (2026-10-23, proposée) — **Système UI du dashboard : shadcn/ui
  style `new-york-v4` (Radix), jetons Halo v2, conventions communes.**
  Le dashboard Next.js utilise uniquement les composants du registre shadcn
  en style `new-york-v4` (primitives Radix), pas les variantes `@base-ui`.
  Toasts par **Sonner** (`toast` n'existe pas en new-york-v4), formulaires par
  `Field` + react-hook-form + zod, tableaux par `Table` + TanStack. Les
  variables shadcn (`--background`, `--primary`, `--radius`, `--sidebar*`…)
  sont alimentées par les valeurs de `../Atelier-identites-VPN-v2.html`
  (Halo, l.231-404), une fois, sur `:root` et `.dark` ; le verre est réservé
  au chrome. Conventions : communauté active dans l'URL ; barre basse maison
  sous 768 px et `Sidebar collapsible="icon"` au-delà ; cartes `Item` sous
  640 px ; « Charger plus » sur `nextCursor` (commandes seulement) ;
  confirmation destructive en `AlertDialog`/`Drawer` ; aucune écriture
  optimiste pour l'argent, les appareils, les membres et les nœuds ; aucun
  indicateur affiché comme un total s'il vient d'une liste plafonnée. Le
  système complet et ses sources sont dans `30-clients/dashboard-ux`.

---

## Conséquences à noter avec la décision

- L'ancien texte de `30-clients/dashboard-ux` faisait saisir la clé console à
  la connexion ; D81 ne le reprend pas, mais le choix final reste une question
  ouverte (voir le nœud, question 1).
- Les manques d'API relevés (compteurs, recherche, lecture unitaire,
  pagination des abonnés/appareils) ne sont **pas** décidés ici : ils vont en
  questions ouvertes.
</content>

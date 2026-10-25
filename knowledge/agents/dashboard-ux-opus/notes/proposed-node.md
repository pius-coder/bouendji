---
id: dashboard-ux
title: UX du dashboard admin — système shadcn/ui, Halo v2, mobile d'abord
tags: [dashboard, ux, mobile, nextjs, bff, shadcn, halo, roles]
status: assumption
updated: 2026-10-23
related: [admin-access-flows, roles-and-commissions, listing-vivante, offline-bundle, api-routes, open-questions]
---

> Proposé par le sous-agent `dashboard-ux-opus` (2026-10-23). Remplace
> entièrement l'ancien texte. Détail, sources ligne par ligne et tableau
> complet : `agents/dashboard-ux-opus/notes/ux-system.md`.
> Statut `assumption` : rien n'est construit. Les faits d'API sont relus dans
> le code ; les noms shadcn sont vérifiés dans le registre officiel
> (`ui.shadcn.com/r/index.json`, style `new-york-v4`, le 2026-10-23).

## Principe

Utilisé surtout **sur téléphone** par `owner` et `community_admin` (D80) : voir
les ventes, traiter une alerte, révoquer un appareil, émettre un fichier
hors-ligne. Le desktop est une vue élargie du même parcours.

Le rôle choisit ce qu'on **affiche** ; il ne protège rien. Fastify recharge
rôles et appartenances à chaque requête et renvoie 403 (D78).

## Socle

- Next.js App Router sur Vercel (D31, D32), BFF : le navigateur ne voit ni
  `X-Access-Key` ni le JWT `vpn-admin` (D78, D79).
- shadcn/ui **style `new-york-v4` (Radix)**. Piège : l'index par défaut liste
  aussi des variantes `@base-ui/react` (`toast`, `drawer`, `combobox`) ;
  `toast` n'existe pas en new-york-v4 → **Sonner** pour les toasts.
- `Drawer` = vaul. Formulaires = `Field` + `Controller` (react-hook-form) +
  `zodResolver` ; l'ancien `Form` n'est pas utilisé. Tableaux = `Table` +
  TanStack (« Data Table » est un guide, pas un composant).
- Thème `next-themes`, classe `.dark`, variables shadcn en `oklch()`.
- Communauté active **dans l'URL** : `/[communityId]/…`. Sans elle, un compte
  à plusieurs communautés reçoit 400 (`lib/auth.ts:256-258`).

## Tokens (Halo v2, `../Atelier-identites-VPN-v2.html`)

| Token shadcn | Clair | Sombre | Source |
|---|---|---|---|
| `--background` | `#f8fbff` | `#080b12` | l.240 / l.383 |
| `--foreground` | `#0b1322` | `#eef4ff` | l.232 / l.376 |
| `--muted-foreground` | `#5b6779` | `#98a5bb` | idem |
| `--border` | `rgba(12,24,44,.10)` | `rgba(255,255,255,.10)` | idem |
| `--primary`, `--ring` | `#0a7cff` | `#0a7cff` / anneau `#8fc0ff` | l.33, 236, 402 |
| `--accent` / `-foreground` | `rgba(10,124,255,.11)` / `#0a63cc` | `.20` / `#8fc0ff` | l.371 / l.402 |
| `--destructive` | `#ff375f` | idem | l.272 |
| `--success` (projet) | `#16c784` | idem | l.287 |
| `--warning` (projet) | `#ff9f0a` | idem | l.789 |
| `--neutral-state` (projet) | `#9aa6b8` | idem | l.804 |
| `--sidebar` | `rgba(255,255,255,.62)` | `rgba(18,26,42,.72)` | l.360 / l.400 |
| `--radius` | `1rem` (tuile 16 px) ; xl = 1.4× ≈ barre 23 px | | l.339, 361 |

- Polices : piles système de la référence (`--font-system`,
  `--font-display`, `--font-mono`, l.22-24) ; aucune police web.
- Mouvement : `280ms`, `cubic-bezier(.22,.9,.24,1)` (l.31-32), coupé sous
  `prefers-reduced-motion`.
- **Verre** (`--glass`, flou 18–24 px) **seulement sur le chrome** (barre
  basse, en-tête, sidebar, écran de connexion). Cartes, listes, formulaires :
  surfaces opaques. `--card` (`#ffffff` / `#0e1420`) n'est pas dans la
  référence : à valider.
- Vert, orange, gris d'état : jamais comme couleur de texte sur fond clair ;
  un état a toujours un libellé. Contrastes **non mesurés**.
- Montants : `Intl.NumberFormat('fr-FR', {style:'currency', currency:'XAF',
  maximumFractionDigits:0})`, chiffres `tabular-nums`.

## Shell et navigation

| Élément | Composant |
|---|---|
| Desktop ≥ 768 px | `SidebarProvider` + `Sidebar collapsible="icon"` (16rem / 3rem) + `SidebarInset`, `SidebarTrigger` (⌘/Ctrl+B), `SidebarMenuBadge` |
| Mobile < 768 px | **barre basse maison** (shadcn n'en a pas ; sous 768 px `Sidebar` devient un `Sheet`, qu'on ne rend pas) |
| « Plus » | `Drawer` + `Item` |
| Switch de communauté | `DropdownMenu` (desktop), `Drawer` (mobile), `Command` au-delà de ~7 |
| Palette | `CommandDialog` (desktop, ⌘/Ctrl+K), navigation seulement |
| Fil d'Ariane | `Breadcrumb` desktop ; mobile : retour + titre |
| Sous-sections | `Tabs` |
| Compte, thème | `DropdownMenu` sur `Avatar` |

Barre basse : 5 entrées max, libellés visibles, cibles ≥ 44 px, hauteur 62 px
+ `env(safe-area-inset-bottom)`, actif = `--accent`, `aria-current="page"`.
Entrées par rôle (première livraison) :

- owner : Accueil · Abonnés · Appareils · Commandes · Plus (Communautés,
  Réseau, Builds, Hors-ligne, Journal, Comptes).
- community_admin : Accueil · Abonnés · Appareils · Commandes · Plus
  (Forfaits, Membres, Builds, Hors-ligne, Réseau, Journal).

Le nom de la communauté et **le rôle dans celle-ci** (`GET /v1/admin/me`)
sont affichés sous le switch. Navigation recalculée par communauté active,
jamais l'union des rôles.

## Données

**Pagination réelle (vérifiée dans `admin.ts`) :**

| Liste | Pagination |
|---|---|
| Commandes | curseur : `?cursor=&limit=` (1–100, défaut 20, `&status=`) → `{ items, nextCursor? }` |
| Commissions | `limit` 1–100, pas de curseur |
| Abonnés, appareils | **aucune**, 100 derniers figés |
| Versements, journal | `limit` 1–200 (défaut 50), pas de curseur |
| Fichiers hors-ligne | 50 derniers, réponse `{ bundles }` |
| Pool, communautés, marques | ≤ 200 |

- Liste : `Item` (cartes) sous 640 px, `Table` + TanStack au-delà ; une seule
  définition de colonnes avec priorité d'affichage.
- Commandes : **« Charger plus »** tant que `nextCursor` existe ; pas de
  défilement infini, pas de `Pagination` numérotée (aucun total).
- Listes plafonnées : « 100 derniers abonnés », jamais un faux total.
- Filtres : `ToggleGroup` dans `ScrollArea` (puces), dans l'URL. Statuts de
  commande observés : `created, pending, paid, failed, canceled, refunded`
  (liste non exhaustive, non vérifié). Versements : enum vérifié.
- **Aucune recherche serveur** et **aucun tri** paramétrable n'existent :
  filtre local libellé « Filtrer les 100 derniers » sur abonnés/appareils ;
  pas d'en-têtes triables sur les listes paginées.
- Vide : `Empty`, une phrase + une action.
- Chargement : `Skeleton` à la géométrie finale, `Spinner` seulement dans un
  bouton.
- Erreurs : enveloppe `{ code, message, details?, retryAfter?, requestId? }`
  (`http/schemas.ts:15-48`). `details` → erreurs de champ ; 409 → message de
  l'API ; 429 → compte à rebours ; 500 → `requestId` copiable. Données
  anciennes conservées + `Alert` « Impossible d'actualiser ».
- « À jour à 14:32 » + bouton Actualiser sur chaque écran de données.

## Actions

- Formulaires : `Field*` ; le zod client **recopie** les bornes de l'API
  (forfait, communauté, compte, versement — voir `ux-system.md` §4.1) ; taux
  saisi en % (0–30) et converti en bps par le BFF. Champs 16 px, bouton
  d'envoi en bas, pleine largeur sur mobile.
- Confirmation destructive : `AlertDialog` (≥ 768 px) / `Drawer` (< 768 px),
  nomme l'objet et l'effet, « Annuler » par défaut, verbe sur le bouton
  `destructive`. Concerne : révoquer un appareil, retirer un membre,
  suspendre une communauté, forcer un nœud `down`, désactiver un forfait.
- Toasts `Sonner` : après la réponse 2xx seulement, avec le fait renvoyé
  (« 2 sessions fermées ») ; en haut sur mobile ; pas d'erreur de champ en
  toast.
- **Pas d'actions en lot** : aucune route n'en accepte.
- **Aucune écriture optimiste** pour l'argent, les appareils, les membres, les
  nœuds, les communautés : désactiver → appeler → relire → annoncer.

## Pages

- Détail : `Sheet` à droite sur desktop (appareil, commande, nœud, journal),
  page sur mobile ; page partout pour communauté, forfait, abonné. **Aucune
  route de lecture unitaire** n'existe : le détail vient de la ligne de liste ;
  les noms (abonné, forfait) sont résolus par le BFF depuis les listes.
- Création : `Dialog` sur desktop, page plein écran sur mobile ; `Drawer` pour
  un formulaire d'un champ.
- **Stepper hors-ligne** (maison : shadcn n'a pas de stepper) : Appareil →
  Durée (1 h par défaut serveur ; UI ≤ 24 h, voir questions) → Vérifier →
  Émis (`{ bundleId, notAfter, singleUse, endpointCount, file }`, télécharger
  ou partager, compte à rebours). Cas A seulement (appareil enrôlé) : le cas B
  n'a pas de route admin. **Aucun quota affiché** (O7). `consumedAt` vide =
  « Consommation non remontée ».

## Connexion, session, statut

- Connexion : **email + mot de passe** ; la clé console est ajoutée par le
  serveur Next.js (D54, D78, D79). `Card`, `Field`, `InputGroup` (afficher le
  mot de passe). Message d'échec unique, 429 → compte à rebours. Retour par
  `?next=` (chemin interne validé).
- JWT admin **8 h**, **pas de rafraîchissement admin** : avertissement avant
  expiration, puis reconnexion.
- 401 → cookie supprimé, `/login?next=…`, pas de resoumission automatique.
  403 → `Empty` dans le shell avec le message de l'API, jamais d'écran blanc.
- Statut API : `/healthz`/`/readyz` exigent une clé (D77) → une route BFF
  (à construire) renvoie `ok | dégradé | injoignable` ; point dans l'en-tête,
  `Alert` si injoignable.

## Accueil

- **Aucune route de compteurs n'existe.** « Abonnés actifs » est impossible
  (le DTO abonné n'a pas d'abonnement) ; appareils et solde seraient faux
  au-delà de 100. L'accueil montre donc d'abord ce qui est exact.
- `Card` × 3 au plus, chacune avec sa portée et « à jour à … ». Pas de
  graphique en première version.
- « À traiter » (`Item`, triés par gravité) : nœud `down` (pool), build
  `failed`, versement `needs_review` / `pending` (hors D80). La ligne
  « appareil à révoquer » de l'ancien texte est **retirée** : aucun signal API.

## Accessibilité

Cibles ≥ 44 px (surcharger les tailles `sm`/`icon` de shadcn) ; focus 2 px
`--ring`, décalage 3 px ; `viewport-fit=cover` + `env(safe-area-inset-*)` ;
**16 px** dans `Input`, `Textarea`, `NativeSelect`, `CommandInput` ; rien au
survol seul ; `prefers-reduced-motion` ; `lang="fr"` ; testé à 360 et 390 px,
clair et sombre.

## Rôles — écrans et actions

Source : `permitted()` (`apps/api/src/routes/admin.ts:229-310`), qui fait foi.
✅ action · 👁 lecture · — masqué · (D80) hors première livraison.

| Écran / action | owner | community_admin | support | finance |
|---|---|---|---|---|
| Communautés : créer, modifier, suspendre | ✅ | — | — | — |
| Forfaits | ✅ | ✅ | 👁 | 👁 |
| Membres | ✅ | ✅ (pas soi-même) | — | — |
| Comptes admin | ✅ | — | — | — |
| Abonnés | ✅ | ✅ | 👁 | — |
| Appareils, révoquer | ✅ | ✅ | ✅ | — |
| Fichier hors-ligne | ✅ | ✅ | ✅ | — |
| Commandes | ✅ | ✅ | 👁 sans montants | ✅ toutes (D80) |
| Commissions | ✅ | 👁 | — | 👁 (D80) |
| Versements : approuver | ✅ | ✅ (pas la sienne) | — | ✅ (D80) |
| Versements : préparer, payer, confirmer, résoudre | ✅ | — | — | ✅ (D80) |
| Réseau : voir | ✅ | 👁 | 👁 | — |
| Réseau : forcer l'état | ✅ | — | — | — |
| Builds | ✅ | ✅ | — | — |
| Journal | ✅ | 👁 | — | — |

`support` reçoit les commandes **sans** `amountXaf`/`commission*` : la colonne
disparaît, on n'affiche pas 0.

## Questions (non tranchées)

1. Clé console saisie ou injectée par le serveur ? (proposé : injectée).
2. Durée de session Next.js vs JWT 8 h ; route de rafraîchissement admin ?
3. Route de compteurs d'accueil et recherche serveur avant livraison ?
4. Lecture unitaire et curseur pour abonnés/appareils (plafond 100) ?
5. Durée max d'un fichier hors-ligne : 24 h ou 72 h (`admin.ts:148`) ?
6. Curseur dans l'URL ? Rafraîchissement automatique des listes ?
7. Confirmation renforcée (saisie du nom) pour suspension et nœud `down` ?
8. Actions en lot : besoin réel ?
9. O7 — qui émet les fichiers hors-ligne, quel quota ?
10. Écrans `support` et `finance` (D80 les reporte).
11. Comment `community_admin` trouve-t-il l'`adminUserId` d'un futur membre,
    `GET /admins` étant réservé à l'owner ?
12. `community_admin` et `support` voient `host`/`port` des nœuds : voulu ?

## Écarts relevés à intégrer ailleurs

- `roles-and-commissions` : approbation de versement ouverte à
  `community_admin` et `finance` dans le code (D57) ; le tableau du nœud dit
  encore « owner valide ».
- `offline-bundle` : TTL max 72 h dans le schéma (`admin.ts:148`), 24 h dans le
  nœud et le commentaire du handler (`admin.ts:1186-1187`).
- `api-routes` / OpenAPI : la réponse 201 d'émission documente `id`
  (`contracts.ts:866`), le code renvoie `bundleId` (`admin.ts:1208`).
- `GET /v1/admin/offline-bundles` n'appelle pas `authorize` (seulement
  `scopedCommunity`, `offline.ts:24-56`) : un `finance` membre peut lister
  (relu, non testé).

## Liens

- [[admin-access-flows]] — deux niveaux d'authentification (D78, D79)
- [[roles-and-commissions]] — périmètres par rôle
- [[listing-vivante]] — verdict `down`
- [[offline-bundle]] — émission du fichier hors-ligne
- [[open-questions]] — O7
</content>

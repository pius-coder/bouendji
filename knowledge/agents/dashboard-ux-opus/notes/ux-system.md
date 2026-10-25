---
id: dashboard-ux-opus-ux-system
title: Système UI/UX du dashboard admin (shadcn/ui, Halo v2)
status: assumption
updated: 2026-10-23
tags: [dashboard, ux, shadcn, nextjs, halo, roles]
---

# Système UI/UX du dashboard admin

Note de travail du sous-agent `dashboard-ux-opus`. Elle sert de source au nœud
proposé (`proposed-node.md`). Statut `assumption` : rien ici n'est encore
construit ni exécuté. Les faits d'API sont **relus dans le code** (fichier +
ligne). Les noms shadcn sont **vérifiés dans le registre** officiel
(`https://ui.shadcn.com/r/index.json` et `r/styles/new-york-v4/<nom>.json`,
téléchargés le 2026-10-23).

Conventions de cette note :

- `(non vérifié)` = je n'ai pas pu le confirmer dans le code ou la doc.
- `(à construire)` = n'existe pas encore, c'est une proposition.
- `BFF` = Route Handlers / Server Actions Next.js qui parlent à Fastify (D78).

---

## 0. Socle technique

| Élément | Choix | Source |
|---|---|---|
| Framework | Next.js App Router, TypeScript | D31 (framework conservé), D32, `admin-access-flows` |
| Hébergement | Vercel, origine distincte de l'API | D32 |
| Composants | shadcn/ui, style **`new-york-v4`** (primitives Radix) | registre : `sheet`, `dialog`, `dropdown-menu`… dépendent de `radix-ui` |
| Drawer | `drawer` du style new-york-v4 = **vaul** | `r/styles/new-york-v4/drawer.json` → `["cn","vaul"]` |
| Toasts | **`sonner`** (dépend de `sonner` + `next-themes`) | `r/styles/new-york-v4/sonner.json` |
| Formulaires | `field` (+ `Controller` de react-hook-form, `zodResolver`) | doc `docs/forms/react-hook-form` |
| Tableaux | `table` + guide « Data Table » (TanStack Table) | « Data Table » est un **guide**, pas un item du registre |
| Thème | `next-themes`, classe `.dark` | doc `docs/theming` ; dépendance de `sonner` |
| Icônes | `lucide-react` | dépendance de `sidebar` (new-york-v4) |

Piège vérifié : l'index par défaut `r/index.json` liste aussi `toast`,
`combobox`, `drawer` basés sur **`@base-ui/react`**. Ce ne sont pas les
variantes Radix. `toast` **n'existe pas** dans `new-york-v4` (la requête
renvoie une page HTML). Il faut initialiser le projet en style Radix et
utiliser **Sonner**, pas `toast`.

Composants du registre retenus (tous vérifiés présents en `new-york-v4` sauf
mention) : `sidebar`, `sheet`, `drawer`, `dialog`, `alert-dialog`,
`dropdown-menu`, `command`, `tabs`, `breadcrumb`, `badge`, `card`, `skeleton`,
`empty`, `spinner`, `item`, `field`, `form`, `sonner`, `native-select`,
`input-group`, `button-group`, `toggle-group`, `scroll-area`, hook
`use-mobile`. Présents dans l'index, non revérifiés un par un en new-york-v4 :
`button`, `input`, `label`, `select`, `checkbox`, `switch`, `textarea`,
`separator`, `tooltip`, `avatar`, `alert`, `table`, `pagination`, `popover`,
`progress`, `collapsible`, `input-otp`, `kbd` (non vérifié en new-york-v4 ;
`button`, `input`, `separator`, `tooltip`, `skeleton`, `sheet` sont des
dépendances déclarées de `sidebar`, donc existent).

`form` (ancien wrapper `<Form>`) existe toujours dans le registre, mais la doc
actuelle des formulaires n'utilise que `Field`. **On n'utilise que `Field`.**

---

## 1. Tokens — Halo v2 traduit en variables shadcn

### 1.1 Valeurs relevées dans la référence

Fichier : `../Atelier-identites-VPN-v2.html` (dossier `outputs/`).

| Rôle | Clair | Sombre | Ligne |
|---|---|---|---|
| Encre | `#0b1322` | `#eef4ff` | 232 / 376 |
| Texte atténué | `#5b6779` | `#98a5bb` | 232 / 376 |
| Ligne | `rgba(12,24,44,.10)` | `rgba(255,255,255,.10)` | 232 / 376 |
| Verre (surface) | `linear-gradient(180deg,rgba(255,255,255,.78),rgba(255,255,255,.44))` | `linear-gradient(180deg,rgba(28,38,58,.72),rgba(14,20,32,.55))` | 233 / 377 |
| Bord du verre | `rgba(255,255,255,.85)` | `rgba(255,255,255,.14)` | 234 / 378 |
| Ombre du verre | `0 18px 36px -22px rgba(16,40,84,.55)` | `0 22px 40px -24px rgba(0,0,0,.9)` | 235 / 379 |
| Accent | `#0a7cff` | `#0a7cff` (texte actif sombre `#8fc0ff`) | 33, 236 / 402 |
| Accent actif (fond) | `rgba(10,124,255,.11)`, texte `#0a63cc` | `rgba(10,124,255,.20)`, texte `#8fc0ff` | 371 / 402 |
| Fond de page | dégradés `#dbe9ff`, `#e8dcff`, `#f8fbff → #eef3fb → #e9eef8` | `#123a6b`, `#3a2668`, `#080b12 → #0a0f1a → #070a10` | 237-240 / 380-383 |
| Succès / en ligne | `#16c784` | idem | 287 |
| Attention / bascule | `#ff9f0a` | idem | 789 |
| Danger / pastille | `#ff375f` | idem | 272 |
| Neutre « hors ligne / expiré » | `#9aa6b8` | idem | 804 |
| Libellé de stat | `#8492a7` | `#7f8fa8` | 344 / 398 |
| Valeur de stat | `#132540` | `#e7eefc` | 345 / 399 |

Typographie (l.22-25) : `--font-system` = pile système
(`-apple-system, …, "Segoe UI Variable Text", "Segoe UI", Roboto, system-ui`),
`--font-display` (même pile, variantes Display), `--font-mono`
(`ui-monospace, "SF Mono", "JetBrains Mono", "Cascadia Mono", Consolas`).
**Aucune police web** n'est chargée par la référence.

Graisses et chasse relevées : titres 640 à 660 avec `letter-spacing` négatif
(-0.032em sur le titre 27 px, l.294) ; libellés en capitales 8–9 px, 700,
`letter-spacing` 0.15–0.2em (l.330, 344) ; chiffres en `tabular-nums` (l.333).

Rayons relevés : puce 99 px (l.280), barre d'onglets 23 px (l.361), bouton
d'onglet et carte d'abonnement 18 px (l.349, 365), tuile de stat 16 px (l.339),
icône ronde 50 % sur 44 × 44 px (l.255).

Mouvement : `--dur: 280ms`, `--ease: cubic-bezier(.22,.9,.24,1)` (l.31-32).
Pression : `scale(.94)` (l.263).

Verre : `backdrop-filter: blur(18–24px) saturate(1.3–1.5)` (l.257, 352, 361).

### 1.2 Traduction proposée en variables shadcn (à construire)

La référence est un écran mobile grand public ; un dashboard dense ne peut pas
mettre du verre partout. Règle : **verre uniquement sur le chrome** (barre
basse, en-tête collant, sidebar), **surfaces opaques** pour les cartes, listes
et formulaires (lisibilité, contraste, coût de `backdrop-filter` sur un
téléphone d'entrée de gamme).

shadcn attend des valeurs `oklch()` (doc theming). Les hex ci-dessous sont les
**sources** ; la conversion en oklch est à faire à l'implémentation (et à
vérifier au contraste, voir §1.3).

```css
:root {
  --radius: 1rem;                 /* 16 px = tuile de stat Halo (l.339) */
  /* dérivés shadcn : sm 0.6x = 9.6 px, md 0.8x = 12.8 px, lg 1x = 16 px,
     xl 1.4x = 22.4 px (≈ 23 px barre d'onglets) */

  --background: #f8fbff;          /* haut du dégradé Halo l.240 */
  --foreground: #0b1322;          /* --ink */
  --card: #ffffff;                /* surface opaque (proposition) */
  --card-foreground: #0b1322;
  --popover: #ffffff;
  --popover-foreground: #0b1322;
  --primary: #0a7cff;             /* --accent */
  --primary-foreground: #ffffff;
  --secondary: #eef3fb;           /* milieu du dégradé l.240 */
  --secondary-foreground: #132540;
  --muted: #eef3fb;
  --muted-foreground: #5b6779;    /* --muted */
  --accent: rgba(10,124,255,.11); /* fond actif l.371 */
  --accent-foreground: #0a63cc;
  --destructive: #ff375f;
  --border: rgba(12,24,44,.10);   /* --line */
  --input: rgba(12,24,44,.10);
  --ring: #0a7cff;

  /* ajouts propres au projet (pas des tokens shadcn) */
  --success: #16c784;
  --warning: #ff9f0a;
  --neutral-state: #9aa6b8;
  --glass: linear-gradient(180deg,rgba(255,255,255,.78),rgba(255,255,255,.44));
  --glass-border: rgba(255,255,255,.85);
  --glass-shadow: 0 18px 36px -22px rgba(16,40,84,.55);
  --ease-halo: cubic-bezier(.22,.9,.24,1);
  --dur-halo: 280ms;

  --sidebar: rgba(255,255,255,.62);           /* barre d'onglets l.360 */
  --sidebar-foreground: #0b1322;
  --sidebar-primary: #0a7cff;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: rgba(10,124,255,.11);
  --sidebar-accent-foreground: #0a63cc;
  --sidebar-border: rgba(255,255,255,.92);
  --sidebar-ring: #0a7cff;

  --chart-1: #0a7cff; --chart-2: #16c784; --chart-3: #ff9f0a;
  --chart-4: #cbb8ff; /* aurore l.247 */ --chart-5: #9aa6b8;
}

.dark {
  --background: #080b12;          /* l.383 */
  --foreground: #eef4ff;
  --card: #0e1420;                /* (proposition : entre #0a0f1a et le verre) */
  --card-foreground: #eef4ff;
  --popover: #0e1420;
  --popover-foreground: #eef4ff;
  --primary: #0a7cff;
  --primary-foreground: #ffffff;
  --secondary: #161f30;           /* rgba(22,31,48) l.397, rendu opaque */
  --secondary-foreground: #e7eefc;
  --muted: #161f30;
  --muted-foreground: #98a5bb;
  --accent: rgba(10,124,255,.20);
  --accent-foreground: #8fc0ff;
  --destructive: #ff375f;
  --border: rgba(255,255,255,.10);
  --input: rgba(255,255,255,.14);
  --ring: #8fc0ff;
  --glass: linear-gradient(180deg,rgba(28,38,58,.72),rgba(14,20,32,.55));
  --glass-border: rgba(255,255,255,.14);
  --glass-shadow: 0 22px 40px -24px rgba(0,0,0,.9);
  --sidebar: rgba(18,26,42,.72);  /* l.400 */
  --sidebar-border: rgba(255,255,255,.12);
  --sidebar-accent: rgba(10,124,255,.20);
  --sidebar-accent-foreground: #8fc0ff;
}
```

Les valeurs marquées « proposition » (`--card` clair et sombre) **ne sont pas
dans la référence** : Halo n'a que du verre. Elles sont à valider à l'œil.

### 1.3 Contraste (à vérifier, non mesuré)

- Blanc sur `#0a7cff` (bouton principal) et `#0a63cc` sur fond accent : à
  mesurer avant de figer. `#0a7cff` sur blanc est probablement juste au-dessus
  de 4,5:1 pour du texte normal (non vérifié).
- `#16c784`, `#ff9f0a` et `#9aa6b8` **ne doivent jamais servir de couleur de
  texte** sur fond clair : contraste insuffisant probable (non vérifié). Ils
  servent de point, d'icône ou de fond de pastille avec texte foncé.
- La couleur ne porte jamais seule l'état : chaque `Badge` d'état a un libellé.

### 1.4 Typographie du dashboard

| Usage | Taille | Graisse | Remarque |
|---|---|---|---|
| Titre de page | 22–24 px | 640 | `letter-spacing: -0.02em` (Halo -0.032em à 27 px) |
| Valeur d'indicateur | 28 px | 640 | `tabular-nums`, `--font-display` |
| Corps, ligne de liste | 15–16 px | 400–520 | |
| Champ de saisie | **16 px minimum** | 400 | anti-zoom iOS |
| Libellé de stat / eyebrow | 11–12 px | 700, capitales, `letter-spacing: .12em` | Halo 8–9 px est trop petit pour un dashboard |
| Identifiant, montant, horodatage | 13–14 px | `--font-mono` ou `tabular-nums` | |

Montants : `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', maximumFractionDigits: 0 })`.
Le XAF n'a pas de décimales. Le séparateur de milliers français est une
espace fine insécable (U+202F) : à ne pas casser dans les cartes étroites.

Dates : `Intl.DateTimeFormat('fr-FR')`, relatif pour « il y a 5 min » sur
l'activité, absolu au survol **et** au toucher (pas d'info au survol seul).

---

## 2. Shell et navigation

### 2.1 Structure

```
app/
  (auth)/login/page.tsx            ← hors shell
  (console)/layout.tsx             ← SidebarProvider + barre basse + en-tête
  (console)/[communityId]/...      ← écrans scopés (abonnés, appareils, commandes…)
  (console)/platform/...           ← écrans owner globaux (communautés, comptes, réseau)
```

La communauté active vit **dans l'URL** (`/[communityId]/…`), pas dans un état
client : partageable, rechargeable, et c'est exactement le paramètre que l'API
attend (`/v1/admin/communities/{communityId}/…`). L'API revérifie de toute
façon (`scopedCommunity`, `apps/api/src/lib/auth.ts:251-263`).

### 2.2 Composants par élément

| Élément | Composant shadcn | Détail |
|---|---|---|
| Fournisseur de layout | `SidebarProvider` | enveloppe tout le shell |
| Sidebar desktop (≥ 768 px) | `Sidebar` `collapsible="icon"` + `SidebarHeader` / `SidebarContent` / `SidebarFooter` / `SidebarGroup` / `SidebarMenu` / `SidebarMenuButton` / `SidebarMenuBadge` / `SidebarRail` | largeur 16rem, 3rem replié (constantes `SIDEBAR_WIDTH`, `SIDEBAR_WIDTH_ICON`) |
| Contenu principal | `SidebarInset` | |
| Barre basse mobile (< 768 px) | **composant maison** (`nav` + `Button variant="ghost"`) | **shadcn n'a pas de barre basse** : `Sidebar` devient un `Sheet` sous 768 px, il ne fournit pas d'onglets bas |
| Menu « Plus » (mobile) | `Drawer` (vaul) listant des `Item` | ouvert depuis le 5ᵉ onglet |
| Bouton replier (desktop) | `SidebarTrigger` | raccourci `Ctrl/⌘+B` fourni (`SIDEBAR_KEYBOARD_SHORTCUT = "b"`) |
| Switch de communauté | desktop : `DropdownMenu` dans `SidebarHeader` ; mobile : `Drawer` ; au-delà de ~7 communautés : `Command` dans le `Drawer`/`Popover` | owner voit jusqu'à 200 communautés (`LIMIT 200`, `admin.ts:693`) |
| Menu compte | `DropdownMenu` sur `Avatar` (`SidebarFooter` desktop, en-tête mobile) | thème, déconnexion |
| Recherche globale / palette | `Command` en `CommandDialog` (desktop, `Ctrl/⌘+K`) | navigation entre écrans uniquement (voir §3.4 : pas de recherche serveur) |
| Fil d'Ariane | `Breadcrumb` (desktop seulement) | mobile : bouton retour + titre |
| Sous-sections d'un écran | `Tabs` | ex. Communauté : Aperçu · Forfaits · Membres · Builds |
| Indicateur API | `Badge` + point de couleur dans l'en-tête | voir §7.4 |

Sous 768 px, `Sidebar` rend un `Sheet` (`MOBILE_BREAKPOINT = 768` dans le hook
`use-mobile`, vérifié). Décision UX proposée : **sur mobile, on ne rend pas la
`Sidebar` du tout** ; la barre basse et le `Drawer` « Plus » la remplacent.
Raison : deux menus pour les mêmes destinations, c'est un de trop.

### 2.3 Barre basse (mobile)

- Position fixe, `padding-bottom: env(safe-area-inset-bottom)`, hauteur de
  contenu 62 px (Halo l.358), rayon 23 px, fond `--sidebar` + verre.
- **5 entrées maximum** : Accueil · Abonnés · Appareils · Commandes · Plus.
  L'ordre suit la fréquence d'usage visée (support d'abord, argent ensuite).
- Entrées **différentes selon le rôle** (§9.2). Si un rôle a moins de 4
  destinations, la barre en montre moins ; jamais d'onglet grisé.
- Onglet actif : fond `--accent`, texte `--accent-foreground`, icône 2 px
  (Halo l.371-372). `aria-current="page"`.
- Chaque onglet ≥ 44 × 44 px, libellé toujours visible (pas d'icône seule).
- Pastille numérique (`Badge`) sur un onglet seulement si le chiffre vient
  d'une réponse d'API ; sinon rien (§8).

### 2.4 Menu « Plus »

`Drawer` du bas, poignée visible, liste d'`Item` (icône + titre + description
courte + chevron). Contenu typique (filtré par rôle) : Communauté (forfaits,
membres), Builds, Fichiers hors-ligne, Réseau, Journal, Commissions,
Versements (hors première livraison, D80), Thème, Se déconnecter.

### 2.5 Switch de communauté

- Source : `GET /v1/admin/communities` → `{ items: [{ id, name, slug, status,
  commissionBps, createdAt, suspended }] }` (`admin.ts:690-703`, DTO l.442-452).
- Une seule communauté : pas de switch, le nom est affiché en texte.
- Plusieurs : le nom courant + chevron ouvre la liste ; `suspended: true` est
  signalé par `Badge variant="outline"` « Suspendue ».
- Le **rôle dans la communauté courante** est affiché sous son nom (lu dans
  `GET /v1/admin/me` → `memberships[].role`, `admin.ts:677-687`) : l'utilisateur
  sait pourquoi il voit ce qu'il voit.
- Changer de communauté = naviguer vers `/[autreId]/<même écran>` si ce rôle
  y a accès, sinon vers l'accueil de la communauté.
- Piège vérifié : sans `communityId`, un compte non-owner à **plusieurs**
  communautés reçoit `400 VALIDATION_FAILED` (`lib/auth.ts:256-258`). Le BFF
  doit **toujours** envoyer la communauté de l'URL.

---

## 3. Patterns de données

### 3.1 Liste responsive

| Largeur | Rendu | Composant |
|---|---|---|
| < 640 px | **cartes** : une ligne = un `Item` (titre, sous-titre, statut en `Badge`, chevron) | `Item`, `ItemContent`, `ItemTitle`, `ItemDescription`, `ItemActions` (sous-composants à confirmer à l'implémentation, non vérifiés un par un) |
| ≥ 640 px | tableau | `Table` + TanStack Table (guide Data Table) |

Une seule source de colonnes : la définition TanStack déclare pour chaque
colonne `meta.priority` (1 = toujours, 2 = ≥ 640, 3 = ≥ 1024) ; la carte
mobile affiche les colonnes de priorité 1. Pas deux listes à maintenir.

Toute la ligne est cliquable (ouvre le détail, §5.1) ; les actions de ligne
sont dans un `DropdownMenu` (bouton `…` de 44 px), jamais au survol seul.

### 3.2 Pagination — ce que l'API fait vraiment

| Liste | Pagination | Paramètres | Source |
|---|---|---|---|
| Commandes | **curseur** : réponse `{ items, nextCursor? }` | `cursor` (≤ 512 car.), `limit` 1–100 (défaut 20), `status` | `admin.ts:192-193`, `1220-1258` |
| Commissions | aucune ; `limit` seul | `limit` 1–100 (défaut 20), `status` | `admin.ts:1261-1284` |
| Abonnés | **aucune**, `LIMIT 100` figé | aucun | `admin.ts:1087-1108` |
| Appareils | **aucune**, `LIMIT 100` figé | aucun | `admin.ts:1112-1137` |
| Versements | aucune ; `limit` 1–200 (défaut 50) | `communityId`, `status`, `limit` | `admin.ts:121-127`, `1644-1689` |
| Journal d'audit | aucune ; `limit` 1–200 (défaut 50) | `communityId`, `limit` | `admin.ts:198-201`, `1773-1797` |
| Fichiers hors-ligne | aucune, `LIMIT 50`, réponse `{ bundles }` | `deviceId` | `offline.ts:24-56` |
| Builds | aucune, `LIMIT 100` | — | `builds.ts:286-296` |
| Pool | aucune, `LIMIT 200`, réponse `{ poolRevision, count, endpoints }` | — | `admin.ts:1692-1706` |
| Communautés, marques | `LIMIT 200` | — | `admin.ts:690-703`, `784-801` |

Corrections par rapport à l'ancien nœud : le champ s'appelle **`nextCursor`**
(pas `cursor`) dans la réponse, et **seules les commandes** sont paginées par
curseur. La limite 200 s'applique aux versements et au journal, pas aux
commandes.

Pattern UI :

- Commandes : bouton **« Charger plus »** en bas (`Button variant="outline"`
  pleine largeur sur mobile), visible tant que `nextCursor` existe. Pas de
  défilement infini. Le curseur est gardé dans l'URL (`?cursor=`) pour qu'un
  retour arrière retrouve la page — **mais** les pages déjà chargées sont
  perdues au rechargement (proposition : n'enregistrer que les filtres dans
  l'URL, pas le curseur ; question Q6).
- Le composant `Pagination` (numéros de page) **n'est pas utilisé** : il
  suppose un total et des pages numérotées que l'API ne fournit pas.
- Listes non paginées : afficher en pied « 100 derniers abonnés » quand la
  réponse contient exactement 100 éléments. Ne jamais afficher « 100 abonnés »
  comme un total.

### 3.3 Filtres

- Commandes : filtre `status` (valeur envoyée telle quelle, l'API accepte une
  chaîne ≤ 32 caractères, `admin.ts:194`). Statuts observés dans le code :
  `created`, `pending`, `paid`, `failed`, `canceled`, `refunded`
  (`services/payments.ts`) — **liste non exhaustive (non vérifié)** : il n'y a
  pas d'enum dans le schéma de base.
- Rendu : `ToggleGroup type="single"` défilant horizontalement dans une
  `ScrollArea` (puces), « Toutes » par défaut. Desktop : même chose, ou
  `Select` si plus de 5 valeurs.
- Filtres dans l'URL (`?status=paid`) : rechargement et partage fonctionnent.
- Versements : filtre `status` ∈ `pending, approved, processing, paid, failed,
  needs_review` (enum vérifié, `admin.ts:125`).

### 3.4 Recherche

**Aucune route admin n'accepte de paramètre de recherche** (vérifié : seuls
`cursor`, `limit`, `status`, `communityId`, `deviceId` existent). Donc :

- Abonnés et appareils (≤ 100 lignes reçues) : **filtre local** sur les
  lignes chargées, champ `InputGroup` avec icône loupe, libellé
  « Filtrer les 100 derniers ». Honnête sur la portée.
- Commandes : pas de champ de recherche (filtrer localement une page de 20
  serait trompeur). Recherche serveur = question Q3.

### 3.5 Tri

L'API trie toujours par `created_at DESC` (abonnés, appareils, commandes,
commissions, journal), et les versements par priorité d'état puis date
(`admin.ts:1675-1684`). Aucun paramètre de tri n'existe. **Pas d'en-têtes de
colonne triables** sur les listes paginées. Tri local autorisé seulement sur
les listes complètes ≤ 200 (pool, communautés, forfaits).

### 3.6 Vide

Composant `Empty` (`EmptyHeader`, `EmptyMedia`, `EmptyTitle`,
`EmptyDescription`, `EmptyContent` — sous-composants non vérifiés un par un).
Une phrase + une action utile, jamais une illustration générée :

| Écran | Texte | Action |
|---|---|---|
| Abonnés | « Aucun abonné pour l'instant. » | « Voir les forfaits » |
| Commandes (filtrée) | « Aucune commande « payée ». » | « Retirer le filtre » |
| Appareils | « Aucun appareil enregistré. » | — |
| Hors-ligne | « Aucun fichier émis. » | « Choisir un appareil » |
| Pool (`count: 0`) | « Aucun nœud dans la liste. » | rôle owner : lien vers la doc d'exploitation |

### 3.7 Chargement

- `Skeleton` qui reprend **exactement** la géométrie finale (même hauteur de
  carte, même nombre de colonnes). `SidebarMenuSkeleton` dans la sidebar.
- Next.js : `loading.tsx` par segment pour la première navigation.
- `Spinner` **seulement** dans un bouton en cours d'envoi (à côté du libellé,
  bouton désactivé), jamais plein écran.

### 3.8 Erreurs

Enveloppe vérifiée (`http/schemas.ts:15-48`) :
`{ code, message, details?, retryAfter?, requestId? }`. Codes possibles
(`packages/contract/src/index.ts:360-376`) : `VALIDATION_FAILED`,
`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`,
`DEVICE_LIMIT_REACHED`, `DEVICE_REVOKED`, `DEVICE_PROOF_INVALID`,
`EMAIL_NOT_VERIFIED`, `INVALID_CREDENTIALS`, `SUBSCRIPTION_REQUIRED`,
`ORDER_NOT_PAYABLE`, `PAYMENT_PROVIDER_ERROR`, `INTERNAL`.

| Cas | Rendu |
|---|---|
| Lecture échouée, pas de données | `Alert variant="destructive"` dans la zone de contenu + `Button` « Réessayer » |
| Lecture échouée, données déjà affichées | données conservées + bandeau `Alert` « Impossible d'actualiser » + « Dernière mise à jour à 14:32 » |
| `VALIDATION_FAILED` sur un formulaire | `details` → `form.setError(champ, message)` ; `FieldError` sous chaque champ |
| `CONFLICT` (409) | message de l'API tel quel dans le `Dialog`/`Drawer` (ex. « Dernier administrateur actif », `contracts.ts:803`) |
| `RATE_LIMITED` (429) | bouton désactivé avec compte à rebours `retryAfter` s |
| `INTERNAL` (500) | message générique + `requestId` copiable (bouton « Copier la référence ») |
| `PAYMENT_PROVIDER_ERROR` / 502 versement | « Fournisseur injoignable : le retrait reste approuvé » (`contracts.ts:914`) |

`message` est « déjà localisé côté serveur » (`schemas.ts:37`) : on l'affiche,
on ne le réécrit pas.

### 3.9 « Dernière mise à jour »

- Chaque écran de données affiche en pied d'en-tête « À jour à 14:32 » (heure
  de la dernière réponse 200 reçue par le BFF), avec un bouton icône
  « Actualiser » (44 px, `aria-label`).
- Pas de rafraîchissement automatique en arrière-plan en première version
  (coût Vercel + base) ; actualisation au retour sur l'onglet du navigateur
  (`visibilitychange`) : proposition, question Q7.

---

## 4. Patterns d'action

### 4.1 Formulaires

- `useForm` + `zodResolver` + `Controller` → `Field`, `FieldLabel`,
  `FieldDescription`, `FieldError`, `FieldGroup`, `FieldSet`, `FieldLegend`
  (noms relevés dans la doc formulaires).
- **Le schéma zod du client recopie les bornes de l'API**, il ne les invente
  pas. Exemples vérifiés :
  - forfait : `code` 2–40, `^[a-z0-9]+(?:-[a-z0-9]+)*$` ; `name` 2–80 ;
    `priceXaf` entier 1–10 000 000 ; `durationDays` 1–3650 ; `deviceLimit`
    1–10 ; `badge` ≤ 40 ; `sortOrder` 0–1000 (`admin.ts:157-187`) ;
    `code` immuable en modification (`admin.ts:182-187`).
  - communauté : `name` 2–120 ; `slug` 2–64, même regex ; `commissionBps`
    0–3000 (`admin.ts:63-86`). Saisie en **pourcentage** (0–30 %, pas de 0,5),
    conversion en bps dans le BFF.
  - compte admin : email ≤ 190, `name` 2–120, mot de passe 12–256
    (`admin.ts:105-112`).
  - versement : `note` ≤ 280, **aucun montant** (`admin.ts:114-119`).
  - fichier hors-ligne : `ttlHours` entier 1–72 (`admin.ts:146-150`) — voir
    l'incohérence §6.3.
- Le zod du client n'est qu'un confort : l'API reste juge (schémas `.strict()`).
- Champs : 16 px, `inputmode` adapté (`numeric` pour prix et durée),
  `autocomplete` explicite, `enterkeyhint`.
- Bouton d'envoi : en bas, pleine largeur sur mobile (zone du pouce), désactivé
  pendant l'envoi avec `Spinner`, jamais désactivé avant la première tentative
  (les erreurs s'affichent au submit).
- Un champ monétaire affiche l'aperçu formaté sous la saisie
  (« 2 500 F CFA ») via `FieldDescription`.

### 4.2 Confirmation destructive

Responsive : `AlertDialog` ≥ 768 px, `Drawer` < 768 px (même contenu, un
composant `ConfirmAction` qui choisit via `useIsMobile`).

**Contenu obligatoire** : nom de l'objet (« Pixel 8 de Marie »), effet exact
tiré de la réponse de l'API, et deux gestes : « Annuler » (focus par défaut)
et l'action en `Button variant="destructive"` libellée par le verbe
(« Révoquer l'appareil », pas « OK »).

Actions concernées (vérifiées) :

| Action | Route | Effet à annoncer |
|---|---|---|
| Révoquer un appareil | `POST /v1/admin/devices/{id}/revoke` | appareil `revoked` + sessions coupées ; réponse `sessionsRevoked` (`admin.ts:1139-1171`) |
| Retirer un membre | `DELETE /v1/admin/memberships/{id}` | `status='disabled'` ; 409 si dernier `community_admin` actif (`admin.ts:1006-1036`) |
| Suspendre une communauté | `PATCH /v1/admin/communities/{id}` `status: "suspended"` | owner seul |
| Forcer un nœud `down` | `POST /v1/admin/endpoints/{id}/health` | sort de la liste servie, bump de révision (`admin.ts:1716-1770`) ; owner seul |
| Désactiver un forfait | `PATCH /v1/admin/plans/{id}` `active: false` | |
| Exécuter un virement | `POST /v1/admin/payouts/{id}/pay` | hors première livraison (D80) |

Pas de saisie « tapez le nom pour confirmer » sauf pour suspendre une
communauté et forcer un nœud `down` (impact sur tous les utilisateurs) :
proposition, question Q8.

### 4.3 Toasts (Sonner)

- `Toaster` monté une fois dans le layout ; position `top-center` sur mobile
  (la barre basse occupe le bas), `bottom-right` sur desktop.
- Succès : uniquement **après** la réponse 2xx, avec le fait renvoyé
  (« Appareil révoqué · 2 sessions fermées »).
- Erreurs de formulaire : **pas** de toast, elles vont dans les champs.
- Erreurs d'action hors formulaire : toast d'erreur avec `requestId` si 500.
- Pas de bouton « Annuler » dans un toast pour une action irréversible.

### 4.4 Actions en lot

**Aucune route admin n'accepte de lot** (vérifié : chaque écriture porte un
seul identifiant dans le chemin). En première version : **pas de sélection
multiple** (`Checkbox` de ligne absente). Un lot en boucle côté BFF ferait N
écritures, N lignes d'audit et des échecs partiels difficiles à présenter.
Question Q9.

### 4.5 Écritures non optimistes

Argent, appareils, membres, santé de nœud, communautés : **jamais
d'optimisme**. Séquence :

1. clic → bouton désactivé + `Spinner` ;
2. Server Action / Route Handler → Fastify ;
3. réponse 2xx → `revalidatePath`/`router.refresh()` → la liste relue montre
   le nouvel état → toast ;
4. erreur → état inchangé, message.

Optimisme toléré uniquement sur des préférences locales (thème, sidebar
repliée — cookie `sidebar_state` fourni par shadcn).

Double clic : le bouton désactivé suffit côté UI ; l'API est déjà idempotente
sur la santé de nœud (`WHERE health <> $2`, `admin.ts:1735-1745`) et verrouille
la ligne `apps` pour les builds (`builds.ts`, commentaire l.235-240). Pour la
révocation, un second appel réécrit `revoked_at` (non idempotent au sens
strict, sans danger) — relu, non testé.

### 4.6 Envoi des écritures depuis le navigateur

D79 : cookie httpOnly + jeton CSRF. Proposition d'implémentation UI (à
construire) : Server Actions Next.js pour les écritures (Next vérifie l'origine)
**plus** le jeton CSRF exigé par D79, envoyé dans un champ caché ou un en-tête
par le BFF. Le navigateur ne voit jamais `X-Access-Key` ni le JWT `vpn-admin`.

---

## 5. Patterns de page

### 5.1 Détail

| Objet | Mobile | Desktop | Pourquoi |
|---|---|---|---|
| Appareil, commande, entrée de journal, nœud | page dédiée (`/[c]/devices/[id]`) | `Sheet side="right"` par-dessus la liste | consultation rapide, la liste reste visible |
| Communauté, forfait, abonné | page | page | contenu riche, sous-onglets (`Tabs`) |

Le `Sheet` desktop est **adressable** (routes parallèles / interceptées Next.js
ou `?open=<id>`) : un lien partagé ouvre le même détail. À choisir à
l'implémentation (non vérifié sur ce projet).

Limite d'API vérifiée : **il n'existe pas de route de lecture unitaire** pour
un appareil, un abonné ou une commande. Le détail est donc construit depuis la
ligne de liste déjà chargée ; un lien direct vers un appareil hors des 100
derniers ne peut pas s'afficher. Question Q4.

Les DTO ne joignent pas les noms : une commande porte `userId` et `planId`
(`admin.ts:500-518`), un appareil `userId` (`admin.ts:1127-1136`). Le BFF
résout les noms à partir des listes abonnés (100 derniers) et forfaits ; à
défaut, il affiche un identifiant court en `--font-mono`.

### 5.2 Création

| Formulaire | Mobile | Desktop |
|---|---|---|
| Forfait, membre, compte admin, communauté | page plein écran (`/new`), bouton d'envoi collé en bas au-dessus de la zone sûre | `Dialog` |
| Préparer un versement (note seule) | `Drawer` | `Dialog` |

Pas de `Dialog` sur mobile pour un formulaire de plus de 2 champs : le clavier
virtuel le rend inutilisable.

### 5.3 Stepper — émission d'un fichier hors-ligne

shadcn **n'a pas de composant stepper** (absent du registre vérifié). Le
stepper est maison : liste ordonnée `ol` + `Badge` d'étape + `Progress`
(proposition), dans une page sur mobile et une `Sheet` large sur desktop.

Étapes (cas A seulement : appareil déjà enrôlé, `offline-bundle`) :

1. **Appareil** — choisi dans la liste des appareils de la communauté ; un
   appareil `revoked` n'est pas proposé (l'API répond 403 `DEVICE_REVOKED`,
   `offline-bundle`). Si on vient du détail d'un appareil, étape pré-remplie.
2. **Durée** — `NativeSelect` ou `ToggleGroup` : 1 h (défaut serveur,
   `admin.ts:1188`), 6 h, 24 h. Les bornes réelles sont 1–72 h : voir §6.3.
   **Aucun quota affiché** (O7 non tranché).
3. **Vérifier** — récapitulatif : appareil, abonné, expiration calculée,
   « usage unique », rappel que le fichier ne s'auto-détruit pas chez le
   destinataire (WhatsApp, Téléchargements — `offline-bundle`).
4. **Émis** — `POST /v1/admin/devices/{deviceId}/offline-bundles` →
   `{ bundleId, deviceId, notAfter, singleUse, endpointCount, file }`
   (`admin.ts:1207-1214`). Actions : « Télécharger le fichier » (le BFF
   sérialise `file`) et « Partager » (Web Share API sur mobile, non vérifié
   sur ce projet). Compte à rebours jusqu'à `notAfter`.

Le cas B (appareil jamais enrôlé, QR de clé publique) **n'a pas de route admin**
(vérifié : la seule route d'émission prend un `deviceId` existant). Il n'est
pas dans le stepper.

Le contenu de `file` est chiffré pour l'appareil ; l'interface ne l'affiche
jamais, ne le journalise pas, ne le met pas dans l'URL.

Suivi : `GET /v1/admin/offline-bundles?deviceId=` →
`{ bundles: [{ id, deviceId, userId, notAfter, consumedAt, expired }] }`
(`services/offlineBundles.ts:215-231`). `consumedAt` reste vide tant que l'app
n'appelle pas la route de consommation (`offline-bundle`) : afficher
« Consommation non remontée » plutôt que « Non utilisé ».

---

## 6. Connexion et session

### 6.1 Écran de connexion

- Champs : **email + mot de passe uniquement**. La clé console
  (`DASHBOARD_ACCESS_KEY` → `X-Access-Key`) est ajoutée **par le serveur
  Next.js** (D54, D78, D79 : « restent côté serveur Next.js »).
  **Correction de l'ancien nœud**, qui faisait saisir la clé par
  l'utilisateur : c'est contraire à D78/D79. À confirmer par l'orchestrateur
  (question Q1).
- Composants : `Card` centrée (verre Halo autorisé ici, fond dégradé Halo),
  `Field` × 2, `Input type="email" autocomplete="username"`,
  `Input type="password" autocomplete="current-password"` avec bouton
  afficher/masquer (`InputGroup` + `InputGroupButton`), `Button` pleine largeur.
- Erreurs : message unique (l'API ne distingue pas les cas) ; 429 → compte à
  rebours `retryAfter` (`contracts.ts:670-677`, TTL 8 h documenté).
- Retour : paramètre `?next=` (chemin interne uniquement, validé côté serveur
  pour éviter une redirection ouverte).

### 6.2 Session

- JWT `vpn-admin` valable **8 h** (`lib/auth.ts:92`), réponse de login
  `{ accessToken, token, accessExpiresAt, expiresAt, admin }`
  (`adminAuth.ts:124-130`). **Pas de route de rafraîchissement admin** (aucune
  dans `openapi.json`). Donc la session Next.js ne peut pas durer plus de 8 h
  sans nouvelle connexion (proposition : cookie de même durée ; question Q2).
- Avertissement 5 min avant `expiresAt` : `Sonner` persistant « Session
  bientôt expirée — Se reconnecter » (proposition).

### 6.3 401, 403, et l'incohérence TTL

- **401** (jeton expiré, compte désactivé : `token_version++`,
  `roles-and-commissions`) : le BFF supprime le cookie et redirige vers
  `/login?next=<chemin>`. Si une écriture était en cours, le formulaire n'est
  pas resoumis automatiquement après reconnexion (risque de double action) :
  l'utilisateur relance.
- **403** : écran `Empty` dans la zone de contenu (le shell reste) — « Vous
  n'avez pas accès à cette page dans <communauté> » + « Retour à l'accueil ».
  Jamais d'écran blanc. Le message de l'API est affiché en `EmptyDescription`
  (« Communauté hors de votre périmètre. », `lib/auth.ts:261`).
- **Incohérence relevée** : `offlineBundleSchema` accepte `ttlHours` jusqu'à
  **72** (`admin.ts:148`) alors que le commentaire du handler dit « jamais
  au-delà de 24 h » (`admin.ts:1186-1187`) et que le nœud `offline-bundle`
  dit « borné à 24 h ». L'UI propose au plus 24 h tant que ce n'est pas
  tranché (question Q5).
- **Incohérence OpenAPI** : la réponse 201 d'émission est documentée avec `id`
  (`contracts.ts:866`) alors que le code renvoie `bundleId` (`admin.ts:1208`).
  Le BFF doit lire `bundleId`.

### 6.4 Statut global de l'API

- `/healthz` et `/readyz` exigent `X-Health-Check-Key` (D77,
  `admin-access-flows`). Le navigateur ne peut donc pas les appeler. Le BFF
  expose une route interne (à construire, ex. `/api/status`) qui interroge
  `/readyz` côté serveur et renvoie seulement `ok | dégradé | injoignable`.
- Rendu : point + libellé dans l'en-tête desktop et dans le menu compte mobile.
  `injoignable` → `Alert` en haut de page « L'API ne répond pas. Les données
  affichées peuvent être anciennes. »
- Fréquence : au chargement et au retour sur l'onglet, pas en boucle
  (proposition).

---

## 7. Accueil et indicateurs

### 7.1 Ce qui est faisable sans nouvelle route

**Aucune route de compteurs n'existe** (vérifié : aucune opération
`stats`/`summary`/`dashboard`/`search` dans `openapi.json` ; 36 opérations admin, builds et
hors-ligne relevées sur 55 chemins). Tout indicateur devrait donc être dérivé de listes
plafonnées, ce qui donne des chiffres faux dès que le plafond est atteint.

| Indicateur visé | Source possible | Fiabilité |
|---|---|---|
| Ventes du jour (XAF) | somme de `amountXaf` des commandes `paid` créées aujourd'hui, en paginant `nextCursor` jusqu'à sortir de la journée | exacte mais coûteuse (N appels) ; `paidAt` ≠ `createdAt` |
| Abonnés actifs | **impossible** : le DTO abonné n'a pas d'abonnement (`admin.ts:1097-1106`) | — |
| Appareils | compte de la liste (≤ 100) | faux au-delà de 100 |
| Solde commissions | somme de `amountXaf` des commissions (≤ 100, `limit`) | faux au-delà de 100 ; statut « disponible » à confirmer (non vérifié) |
| Nœuds `down` | `GET /pool` → `endpoints[].health === 'down'` | exact (≤ 200) |
| Builds en échec | `GET /apps/{appId}/builds` → `status === 'failed'` | exact (≤ 100 par marque) |

Recommandation (pas une décision) : une route agrégée côté API
(`GET /v1/admin/communities/{id}/summary`, **n'existe pas**) avant de montrer
des chiffres d'accueil. En attendant, l'accueil montre ce qui est exact :
« À traiter » + derniers éléments. Question Q3.

### 7.2 Composition (à construire)

- Rangée d'indicateurs : `Card` × 3 max (`CardHeader` + `CardDescription`
  libellé en capitales + `CardTitle` valeur `tabular-nums` + `CardFooter`
  « à jour à … »). Sur 360 px : défilement horizontal ou empilement 1 colonne,
  jamais 3 colonnes de 100 px.
- Pas de graphique en première version (règle de l'ancien nœud conservée :
  lisibilité à 360 px). `chart` existe dans le registre pour plus tard.
- Chaque indicateur indique sa portée s'il est plafonné (« sur les 100
  derniers »).

### 7.3 « À traiter »

Liste d'`Item` triée par gravité, chaque ligne mène à l'écran concerné :

| Ligne | Condition (vérifiée) | Rôles qui la voient |
|---|---|---|
| Nœud hors liste | `pool.endpoints[].health === 'down'` (`admin.ts:1692-1706`) | owner, community_admin, support (`endpoint.read`) |
| Build échoué | build `status === 'failed'` (`builds.ts:68`) | owner, community_admin |
| Versement à examiner | payout `status === 'needs_review'` | owner, finance (hors première livraison) |
| Versement en attente d'approbation | payout `pending` créé par quelqu'un d'autre | owner, community_admin, finance |
| « Appareil à révoquer » | **aucun signal API** ne désigne un appareil à révoquer | — (ligne de l'ancien nœud **retirée** : non vérifiable) |

Pastille `Badge variant="destructive"` sur l'onglet Accueil = nombre de lignes
« À traiter », seulement si calculé.

---

## 8. Accessibilité et mobile

- **Cibles ≥ 44 × 44 px** (Halo `.halo-ico` 44 px, l.255) : boutons icônes,
  onglets, `…` de ligne, case de `ToggleGroup`. Les `Button size="sm"` /
  `icon` de shadcn sont plus petits par défaut (non mesuré) : surcharger la
  taille ou agrandir la zone de toucher par un pseudo-élément.
- **Focus visible** : anneau `--ring` 2 px, décalage 3 px (Halo/atelier l.47 :
  `outline:2px solid; outline-offset:3px`). Ne jamais retirer `outline` sans
  remplacement. Les composants Radix gèrent le piège de focus dans
  `Dialog`/`AlertDialog`/`Sheet` ; le focus revient au déclencheur à la
  fermeture.
- **Zones sûres** : `viewport-fit=cover` dans le `viewport` Next.js, puis
  `env(safe-area-inset-top|bottom|left|right)` sur l'en-tête, la barre basse,
  le `Drawer` et les boutons collés en bas.
- **Texte 16 px dans les champs** (`Input`, `Textarea`, `NativeSelect`,
  `CommandInput`) : la classe par défaut de shadcn passe à `md:text-sm` sur
  desktop (non vérifié sur v4) ; sur mobile, garder `text-base`.
- Rien au survol seul : `Tooltip` n'est qu'un complément d'un libellé visible
  ou d'un `aria-label`.
- `prefers-reduced-motion` : couper les translations Halo (`translateY`,
  `scale(.94)`) et l'animation `ping`.
- Mode sombre : `next-themes`, choix Système / Clair / Sombre dans le menu
  compte. Tester 360 px et 390 px, clair et sombre.
- Langue : `lang="fr"`. Libellés d'état toujours textuels, jamais couleur seule.
- Annonces : Sonner rend une région live (non vérifié sur la version) ;
  les erreurs de formulaire sont liées par `aria-invalid` + `FieldError`.

---

## 9. Rôles

### 9.1 Règle

Le rôle **ne protège rien côté client**. Il choisit ce qu'on affiche ; Fastify
recharge rôles et appartenances à chaque requête (`requireAdmin`, D78) et
renvoie 403. L'UI se fonde sur `GET /v1/admin/me` (`platformRole`,
`memberships[{ communityId, role }]`) et sur la **matrice du code**
(`admin.ts:229-310`), qui fait foi quand elle diffère du nœud
`roles-and-commissions`.

Écarts vérifiés entre le code et `roles-and-commissions` (à remonter) :

| Capacité | Nœud | Code (`permitted`) |
|---|---|---|
| Approuver un versement | owner ; finance prépare | owner, **community_admin** de la communauté, finance (D57) |
| Voir le pool | non précisé | owner, community_admin, support — DTO avec `host` et `port` (`admin.ts:633-654`) |
| Lire le journal | non précisé | owner, community_admin (sa communauté) |
| Lire les abonnés/appareils | — | owner, community_admin, support ; **pas** finance |
| Builds | — | owner, community_admin (`builds.ts:140-144`) |
| Lister les fichiers hors-ligne | — | pas d'`authorize`, seulement `scopedCommunity` (`offline.ts:24-56`) : un `finance` membre peut lister (relu, non testé) |

### 9.2 Écrans et actions par rôle

Légende : ✅ visible et actionnable · 👁 lecture seule · — masqué ·
(D80) = hors première livraison.

| Écran / action | owner | community_admin | support | finance | Route |
|---|---|---|---|---|---|
| **Accueil** | ✅ toutes communautés ou une | ✅ sa communauté | ✅ | ✅ (D80) | composite |
| Communautés : liste | ✅ toutes | 👁 les siennes | 👁 les siennes | 👁 les siennes | `GET /communities` |
| Communauté : créer | ✅ | — | — | — | `POST /communities` |
| Communauté : renommer, taux, suspendre | ✅ | — (taux en lecture) | — | — (taux en lecture) | `PATCH /communities/{id}` (`community.manage`) |
| Forfaits : liste | ✅ | ✅ | 👁 | 👁 | `GET /apps/{appId}/plans` (`community.read`) |
| Forfaits : créer / modifier | ✅ | ✅ sa communauté | — | — | `plan.manage` |
| Membres : liste | ✅ | ✅ | — | — | `membership.read` |
| Membres : ajouter / changer rôle / retirer | ✅ | ✅ (pas soi-même) | — | — | `membership.write` (`admin.ts:933, 974, 1015`) |
| Comptes admin (annuaire, création) | ✅ | — | — | — | `GET/POST /admins` (`community.manage`) |
| **Abonnés** | ✅ | ✅ | 👁 | — | `member.read` |
| **Appareils** : liste | ✅ | ✅ | ✅ | — | `member.read` |
| Appareils : révoquer | ✅ | ✅ | ✅ | — | `device.revoke` |
| **Fichier hors-ligne** : émettre | ✅ | ✅ | ✅ | — | `offline_bundle.issue` (O7 ouvert) |
| Fichiers hors-ligne : liste | ✅ | ✅ | ✅ | — (techniquement listable, voir 9.1) | `GET /offline-bundles` |
| **Commandes** | ✅ montants | ✅ montants | 👁 **sans montants** | ✅ montants, toutes communautés (D80) | `order.read`, `seesMoney` (`admin.ts:316-320`) |
| Commissions | ✅ | 👁 | — | 👁 (D80) | `commission.read` |
| Versements : file | ✅ | 👁 sa communauté | — | ✅ (D80) | `GET /payouts` |
| Versements : préparer | ✅ | — | — | ✅ sa communauté (D80) | `payout.create` |
| Versements : approuver | ✅ | ✅ (pas sa propre demande → 409) | — | ✅ (D80) | `payout.approve` |
| Versements : payer, confirmer, résoudre | ✅ | — | — | ✅ (D80) | `payout.pay/confirm/resolve` |
| **Réseau** (pool) : voir | ✅ | 👁 | 👁 | — | `endpoint.read` |
| Réseau : forcer `down` / `healthy` | ✅ | — | — | — | `endpoint.write` |
| Builds : voir / déclencher | ✅ | ✅ | — | — | `requireBuildAdmin` |
| **Journal** | ✅ global ou par communauté | 👁 sa communauté | — | — | `audit.read` |

Les commandes vues par `support` n'ont **pas** `amountXaf`,
`commissionBps`, `commissionXaf` (`orderDto` conditionnel, `admin.ts:507-513`).
La colonne et la carte « montant » disparaissent ; on n'affiche pas « 0 F ».

### 9.3 Barre basse par rôle (première livraison D80 : owner, community_admin)

| Rôle | Onglets |
|---|---|
| owner | Accueil · Abonnés · Appareils · Commandes · Plus (Communautés, Réseau, Builds, Hors-ligne, Journal, Comptes) |
| community_admin | Accueil · Abonnés · Appareils · Commandes · Plus (Forfaits, Membres, Builds, Hors-ligne, Réseau, Journal) |
| support (proposition, non livrée D80) | Accueil · Appareils · Abonnés · Commandes · Plus (Hors-ligne, Réseau) |
| finance (proposition, non livrée D80) | Accueil · Commandes · Versements · Commissions |

Owner sans communauté sélectionnée : vue « Plateforme » (communautés, réseau,
comptes) ; les onglets scopés demandent d'abord une communauté.

### 9.4 Rôles mixtes

Un même compte peut avoir des rôles différents selon la communauté. La
navigation est recalculée **par communauté active**, jamais une union des
rôles. Exception côté API : `finance` voit les commandes et versements de
toutes les communautés (`anyRole(["finance"])`, `admin.ts:264-266`).

---

## 10. Tableau de synthèse : pattern → composant → écran → rôle

| Pattern | Composant(s) shadcn | Écrans | Rôles |
|---|---|---|---|
| Shell desktop | `SidebarProvider`, `Sidebar` (`collapsible="icon"`), `SidebarInset`, `SidebarTrigger`, `SidebarRail` | tous | tous |
| Barre basse mobile | maison (`Button variant="ghost"`, `Badge`) | tous | tous (entrées filtrées) |
| Menu « Plus » | `Drawer`, `Item` | mobile | tous |
| Switch communauté | `DropdownMenu` / `Drawer` / `Command` | en-tête | multi-communautés, owner |
| Palette | `Command` (`CommandDialog`) | desktop | tous |
| Fil d'Ariane | `Breadcrumb` | desktop | tous |
| Sous-sections | `Tabs` | communauté, abonné | owner, community_admin |
| Liste < 640 px | `Item` | abonnés, appareils, commandes, journal, pool | selon §9.2 |
| Liste ≥ 640 px | `Table` + TanStack (guide Data Table) | idem | idem |
| Charger plus | `Button variant="outline"` | commandes | owner, community_admin, support, finance |
| Filtres | `ToggleGroup` dans `ScrollArea`, `Select` | commandes, versements | idem |
| Filtre local | `InputGroup` | abonnés, appareils | owner, community_admin, support |
| Vide | `Empty` | toutes les listes | tous |
| Chargement | `Skeleton`, `SidebarMenuSkeleton`, `Spinner` (bouton) | tous | tous |
| Erreur | `Alert`, `Button` | tous | tous |
| Dernière mise à jour | texte + `Button` icône | tous | tous |
| Formulaire | `Field*`, `Input`, `InputGroup`, `Select`/`NativeSelect`, `Switch`, `Textarea` | forfait, communauté, membre, compte, versement | selon §9.2 |
| Création | `Dialog` (desktop) / page (mobile) | forfait, membre, communauté, compte | owner, community_admin |
| Détail | `Sheet` (desktop) / page (mobile) | appareil, commande, nœud, audit | selon §9.2 |
| Confirmation destructive | `AlertDialog` / `Drawer` | révoquer, retirer, suspendre, forcer `down` | owner, community_admin, support (révoquer) |
| Toast | `Sonner` (`Toaster`) | tous | tous |
| Stepper hors-ligne | maison (`ol`, `Badge`, `Progress`), `ToggleGroup` | hors-ligne | owner, community_admin, support |
| Connexion | `Card`, `Field`, `Input`, `InputGroup`, `Button` | `/login` | — |
| Session/401/403 | redirection ; `Empty` (403) ; `Sonner` (expiration) | tous | tous |
| Statut API | `Badge`, `Alert` | en-tête | tous |
| Indicateurs | `Card` | accueil | selon données |
| À traiter | `Item`, `Badge` | accueil | selon §7.3 |
| Menu compte, thème | `DropdownMenu`, `Avatar` | en-tête / sidebar | tous |

---

## 11. Questions (non tranchées ici)

- **Q1** — La clé console est-elle saisie par l'utilisateur (ancien nœud) ou
  injectée par le serveur Next.js (lecture de D54/D78/D79) ? Je propose la
  seconde ; à confirmer.
- **Q2** — Durée de la session Next.js : alignée sur les 8 h du JWT admin, ou
  plus courte ? Faut-il une route de rafraîchissement admin (n'existe pas) ?
- **Q3** — Faut-il une route agrégée (compteurs d'accueil) et une recherche
  serveur (email abonné, commande) avant la première livraison ?
- **Q4** — Faut-il des routes de lecture unitaire (appareil, abonné, commande)
  et une pagination curseur sur abonnés/appareils (plafond 100 actuel) ?
- **Q5** — Durée maximale d'un fichier hors-ligne : 24 h (nœud, commentaire)
  ou 72 h (schéma zod `admin.ts:148`) ?
- **Q6** — Le curseur de pagination va-t-il dans l'URL ?
- **Q7** — Rafraîchissement automatique des listes (intervalle, ou au retour
  sur l'onglet) ?
- **Q8** — Confirmation renforcée (saisie du nom) pour suspendre une
  communauté et forcer un nœud `down` ?
- **Q9** — Actions en lot (révocations multiples) : besoin réel ?
- **Q10 (O7)** — Qui émet les fichiers hors-ligne, et avec quel quota ? Le code
  autorise owner, community_admin et support ; l'UI n'affiche aucun quota.
- **Q11** — Portée de `support` et `finance` dans le dashboard (D80 les
  reporte) : les écrans §9.3 pour ces rôles sont une proposition.
- **Q12** — `community_admin` peut ajouter un membre par `adminUserId`, mais
  `GET /v1/admin/admins` est réservé à l'owner : comment trouve-t-il
  l'identifiant ? (D54 : pas de table d'invitations.)
- **Q13** — `community_admin` et `support` voient `host` et `port` des nœuds
  dans `GET /pool` : est-ce voulu ? (`roles-and-commissions` ne parle que de
  l'UUID et du chemin WS.)
</content>
</invoke>

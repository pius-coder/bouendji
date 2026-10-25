# dashboard-kit-opus — blocage et mesures (2026-10-24)

## Pourquoi rien n'a été écrit dans `apps/dashboard`

Entre 09:36 et 09:51 (heure locale, UTC+1), un autre agent a réécrit, en
direct, exactement le périmètre de ce brief (relevé par `find -mmin`) :

| Heure | Fichiers |
|---|---|
| 09:36 | `lib/chart-format.ts` (nouveau), `common/insight-band.tsx`, `common/charts.tsx` : **bug `formatChartValue` déjà corrigé** (module partagé sans `"use client"`) |
| 09:39 | `/tmp/chariow.html`, `/tmp/chariow.css` téléchargés (page publique chariow.com) |
| 09:44 | `bun add --prefer-offline @solar-icons/react@2.3.0` (échoué, package.json inchangé), `bun dev` lancé (API + dashboard) |
| 09:49 | `common/icon.tsx` (nouveau : tracés Solar 2.3.0 vendus depuis orya-stack), lucide retiré de 17 fichiers `common/`, `shell/`, `home/`, `kit/` |
| 09:50 | `globals.css` (accent `#ffcc00`, texte `#141b34`, rayon 0.75rem), `lib/utils.ts`, `common/button.tsx`, `segmented-control`, `status-badge`, `charts`, `page-header`, `shell-nav`, `ui/{sheet,alert-dialog,dialog,select,dropdown-menu}.tsx` |

Règle du brief : fichier touché par un autre agent depuis moins de 15 min =
interdit. Tous les fichiers du livrable sont dans ce cas, et l'écriture
continue. Écrire en parallèle aurait produit des éditions concurrentes sur les
mêmes fichiers. Aucun fichier de `apps/dashboard` n'a été modifié par cet agent.
Une installation `bun add @solar-icons/react@2.3.3` lancée par cet agent a été
**arrêtée** (PID 43552) dès la détection de l'installation concurrente, pour ne
pas courir sur `bun.lock` ; `package.json` est resté inchangé.

## Mesures utiles à l'agent qui intègre (vérifiées)

Source des couleurs : `chariow.css` (CSS publique de chariow.com, classes
Tailwind compilées), extraction par `grep`. Contrastes : script
`scratchpad/contrast.mjs` (formule WCAG 2.x).

Rampe grise Chariow : 100 `#e5e7e8`, 200 `#cdd0d4`, 300 `#abb0b5`,
400 `#808790`, 500 `#656c75`, 600 `#575c63`, 700 `#4a4e54`, 800 `#414349`,
900 `#3a3c3f`, 1000 `#242528` ; fonds `#f5f6f6`, `#f8f8f9`.
Jaune : 100 `#fffec1`, 500 `#ffcc00`, 600 `#d19500`, 700 `#a66a02`,
1000 `#442304`. Erreur `#e71d36`, rouge `#e30026`, vert `#23ce6b`.
Rayons de la CSS : 2, 6, 8, **12** (`rounded-[12px]`), 16, 24, 32, 48 px.
Ombres : `0 4px 8px -1px rgba(0,0,0,.12)` (sm), `0 12px 16px -4px rgba(0,0,0,.1)`
(md), `0 20px 24px -4px rgba(0,0,0,.1)` (lg), `0 32px 64px -12px rgba(0,0,0,.15)` (2xl).
Polices : Euclid Circular B (texte) et Sang Bleu Republic (titres), servies
par `fonts.axazara.com` — **sous licence, ne pas embarquer** ; pile système.
Échelle « display » : xs 31/44, xxs 25/37, sm 39/56 ; heading-sm 25/33 ;
`letter-spacing: -2%`.

| Paire | Ratio | Verdict |
|---|---|---|
| `#242528` sur `#ffffff` | 15,33 | ok |
| `#656c75` (gray-500) sur `#ffffff` / `#f5f6f6` | 5,31 / 4,90 | ok texte secondaire |
| `#808790` (gray-400) sur blanc | 3,63 | **refusé** pour du texte |
| `#242528` sur `#ffcc00` | 10,14 | ok (D85) |
| blanc sur `#ffcc00` | 1,51 | **refusé** (D85) |
| `#ffcc00` sur blanc (bord, anneau) | 1,51 | **refusé** comme anneau de focus en clair : anneau sombre |
| `#d19500` sur blanc | 2,62 | refusé (< 3:1 non-texte) |
| `#a66a02` (yellow-700) sur blanc | 4,48 | juste sous 4,5 : **refusé** pour un lien |
| `#8a5600` sur blanc / `#f5f6f6` | 6,16 / 5,68 | ok lien en clair |
| `#e71d36` sur blanc | 4,54 | ok de justesse ; `#c8102e` = 5,88 |
| `#23ce6b` sur blanc | 2,08 | refusé en texte ; `#0f7a3e` = 5,42 |
| `#cdd0d4` / `#abb0b5` sur blanc | 1,55 / 2,19 | filet décoratif seulement ; bord de champ `#8a9099` = 3,22 |
| sombre : `#f5f6f6` sur `#242528` | 14,15 | ok |
| sombre : `#abb0b5` sur `#242528` | 7,01 | ok secondaire |
| sombre : `#808790` sur `#242528` | 4,22 | refusé ; `#959ba3` = 5,47 |
| sombre : `#ffcc00` sur `#242528` | 10,14 | ok (jaune utilisable en texte et en anneau en sombre) |
| sombre : `#18191b` sur `#ffcc00` | 11,64 | ok bouton |
| sombre : `#ff6b7d` / `#3ddc84` / `#ffb020` sur `#242528` | 5,58 / 8,59 / 8,38 | ok |
| sombre : `#6b7079` sur `#242528` | 3,08 | ok bord de champ |

## Solar

- `npm view @solar-icons/react` : 2.3.3, modifié 2026-10-17, 58 Mo dépaqueté ;
  `@solar-icons/react-perf` 2.1.1 (34,8 Mo). `@solar-icons/core` : 404.
- orya-stack a la 2.3.0 installée ; exports `./linear/*`, `./bold/*`,
  `./outline/*`, `./broken/*`, `./line-duotone/*`, `./bold-duotone/*` ;
  2 778 icônes linéaires ; composants nommés `XxxIcon` (ex. `Home2Icon`).
- Noms vérifiés (fichiers `dist/icons/linear/*.mjs`) : home-2, users-group-rounded,
  smartphone, bill-list, wallet, wallet-money, server, history, buildings, tag,
  shield-check, shield-user, alt-arrow-{right,left,down,up}, check, check-circle,
  close, close-circle, magnifier, eye, eye-closed, letter, lock-password,
  menu-dots, logout-2, sun, moon, danger-triangle, info-circle, refresh,
  add, add-circle, settings, pen, trash-bin-minimalistic, copy, filter,
  sort-vertical, bell, hamburger-menu, monitor, key, calendar.
  **Absent** : aucun logo de marque (pas de Google) — le bouton social doit
  recevoir son logo en prop (SVG fourni par la marque), pas depuis Solar.
- Restent sur lucide à 09:51 (grep) : `ui/{breadcrumb,checkbox,command,dialog,
  dropdown-menu,select,sheet,sidebar,sonner,spinner}.tsx`, `auth/login-form.tsx`, `plans/plan-sheet.tsx`,
  `communities/create-community-sheet.tsx`, `members/add-member-sheet.tsx`,
  `_legacy/search-box.tsx` ; `lucide-react` toujours dans `package.json`.

## Incohérence de la base

`00-brief/decisions.md` utilise **D83 deux fois** (aura-vps 3x-ui, l.475 ;
better-\*, l.503) et **D84 deux fois** (relais, l.484 ; ombres, l.517). Les
renvois « D83 »/« D84 » des briefs sont ambigus : à renuméroter par
l'orchestrateur.

---
id: refonte-admin-artifact
title: Artefact de la refonte admin — « Parcours admin Bouendji » (v2)
tags: [dashboard, refonte, artifact, parcours, admin, validation]
status: verified
updated: 2026-10-28
related: [admin-journeys, dashboard-plan, dashboard-ux, decisions, etat-2026-10-28]
---

# Artefact de la refonte admin — détection (2026-10-28)

## Identification du fichier

| Champ | Valeur |
|---|---|
| Chemin | `C:/Users/lenovo/Downloads/Parcours admin Bouendji.md` |
| Taille | 35 226 octets |
| Lignes | 662 |
| SHA-256 | `85b203403bfa507a255cf2d8600cdeba15d56a54bb3d784d2a490426b2a1e08c` |
| Modifié | 2026-10-28 07:58 |
| En-tête | « Refonte du dashboard · version à valider · 26 octobre 2026 » |
| Titre | « Parcours admin Bouendji » |
| Copies | **aucune autre** trouvée dans Downloads, Desktop, Documents (`find -iname "*parcours*"`) |
| Copie versionnée | `docs/refonte-admin/parcours-admin-bouendji-v2.md` — même SHA-256, 662 lignes (2026-10-28) |

Provenance : c'est l'export de l'artefact Claude
`https://claude.ai/artifact/Sxajm3C2zFFcdiyZaBrRPm` cité par le nœud
`admin-journeys` (« version 2, en attente de validation »). Le fichier
téléchargé est donc la **version 2 de la refonte**, pas une note de synthèse.

## Contenu détecté

26 sections, dont :

- **Parcours admin** : cycle de vie, mot de passe forcé, onboarding en 6 étapes,
  prix plancher, guide par rôle, demande de build, aide à un abonné, argent,
  présence.
- **Parcours abonné** : paiement + forfait limité, illimité de nuit, écrans
  Android touchés.
- **Écrans** : navigation, charpente (desktop/mobile), puis 8 fiches écran par
  écran (Accueil, Abonnés, Offres, Argent, Communauté, Plateforme, Réseau,
  Mon compte) avec composants, clics et routes API.
- **Technique** : cache/SSE, tableau des changements d'API nécessaires,
  2 questions ouvertes (prix des plages, identifiants Telegram).

## Couverture détectée dans le code (grep, 2026-10-28)

### API — présent

`adminOnboarding.ts` (`GET/PATCH /v1/admin/onboarding`,
`POST /onboarding/community`, `POST /apps`, `PATCH /apps/:appId`, logo),
`pricing.ts` (`GET/PUT /v1/admin/pricing`), `adminDetails.ts`
(`users/:id`, `orders/:id`, `summary`, `search`), `adminAccount.ts`
(`me/password`, `me/sessions`), `adminNight.ts` (`night-slots`, `history`,
`claim`, `deploy-key`, `telegram/test`), `builds.ts` (`build-requests`,
`builds/:id/approve|reject`), `offline.ts` / `admin.ts`
(`offline-bundles`, `endpoints/manual`), `adminAuth.ts` (connexion par email
**ou** numéro WhatsApp), réinitialisation du mot de passe admin (commit
`c2751ad`).

### API — absent

- `platform-staff` : aucune occurrence dans `apps/api/src`.
- Flux SSE / temps réel / présence : aucune occurrence de `text/event-stream`.
- Ticket de flux signé : absent.

Divergence de nom : l'artefact écrit `GET/PUT /v1/admin/pricing/floor` ; le
code expose `GET/PUT /v1/admin/pricing`.

### Dashboard — pages présentes (14 `page.tsx`)

`/` (Accueil), `/login`, `/mot-de-passe`, `/compte`, `/admins`,
`/communities`, `/payouts`, `/network`, et par communauté : `subscribers`,
`devices`, `orders`, `offline`, `plans`, `builds`, `members`, `commissions`,
`audit`.

### Dashboard — écrans de l'artefact encore absents

- **Plateforme › Tarifs** (prix plancher) : les permissions
  `pricing.read` / `pricing.manage` existent dans `lib/roles.ts`, aucune page.
- **Plateforme › Équipe plateforme** (staff, rôles cumulés, Telegram).
- **Plateforme › Demandes de build** : l'API approve/reject existe, pas d'UI
  d'approbation (seulement `build-trigger.tsx` pour demander).
- **Réseau › Ce soir / Historique** : l'API `night-slots` existe, aucun écran.
- **Communauté › Réglages** : le tiroir communauté ne modifie que nom et
  commission ; pas de WhatsApp (groupe/numéro).
- **Présence** (pastille en ligne) et **SSE** : rien.

## Risque

Le seul exemplaire de la refonte validée se trouvait dans `Downloads` : hors
git, hors sauvegarde, effaçable. Il est désormais copié dans le dépôt
(`docs/refonte-admin/parcours-admin-bouendji-v2.md`) ; le nœud
`admin-journeys` ne contient qu'un résumé de 171 lignes et le lien Claude.

## Suite proposée

1. ~~Copier le fichier dans le dépôt~~ — fait le 2026-10-28.
2. Faire valider la version 2 par l'utilisateur (le document dit « version à
   valider ») ; ensuite seulement passer `admin-journeys` en `decided`.
3. Utiliser le tableau « Changements d'API nécessaires » comme liste de lots :
   `platform-staff`, SSE/présence, écrans Tarifs, Équipe plateforme, demandes
   de build, créneaux de nuit, réglages WhatsApp.

---
id: support-channel-runtime-2026-10-29
title: Canal de support — build-time vs endpoint runtime
tags: [android, api, dashboard, support, whatsapp, white-label]
status: reviewed
updated: 2026-10-29
related: [android-state-review-2026-10-29, decisions, dashboard-management-gaps-2026-10-29]
---

# Canal de support — build-time vs endpoint runtime

Statut : **reviewed** — lecture du code API, dashboard, Android et des specs de
marque. Aucun appel réseau exécuté dans cette passe.

## Constat vérifié

### Ce que les 8 APK affichent aujourd'hui

- `tools/brands/*.json` (8 fichiers) : `supportUrl = "mailto:support@henshins.online"`
  et `communityWhatsappUrl` / `communityTelegramUrl` vides.
- `brand/BrandTokens.kt:80,98-99` : mêmes valeurs injectées au build.
- L'app ouvre ce lien dans `MainActivity.kt:123` (`openSupport`) et l'affiche
  dans `ui/screens/Profile.kt:403-418`, `Intro.kt:289-320`, `Auth.kt:141-162`.
- Les deux rangées « Communauté WhatsApp » et « Canal Telegram » sont donc
  **toujours masquées** (test `isNotBlank`), et le bouton support ouvre un
  `mailto:` — qui ne fait rien si aucun client mail n'est configuré
  (`ActivityNotFoundException` avalée, `MainActivity.kt:125-131`).

Conclusion : l'utilisateur voit l'adresse de la **plateforme**, pas celle de
l'administrateur de sa communauté.

### Ce que la base contient déjà

- `communities.whatsapp_group_url` et `communities.contact_whatsapp`
  (`migrations/040_communities_whatsapp.ts:11-12`), éditables dans le dashboard
  (`admin.ts:608-609`, `admin.ts:932-945`).
- `apps.support_url`, `apps.support_email`, `apps.privacy_url`,
  `apps.terms_url`, `apps.min_version_code`, `apps.store_url`
  (`schema.ts:17-35`).
- `admin_users.whatsapp_number` (`admin.ts:1434-1485`).

### Ce qui ne circule pas

- `GET /v1/me` ne renvoie la communauté que sous `{id, slug, name}`
  (`routes/me.ts:417`) : aucun contact, aucun lien de groupe.
- Aucune route publique ne renvoie le profil de marque. Le catalogue public
  existe (`GET /v1/apps/:appId/plans`, `routes/catalog.ts:30`) et donne le
  patron à suivre.
- Le dashboard n'a **aucun écran** pour `supportEmail`, `privacyUrl`,
  `termsUrl` : seuls les schémas d'onboarding les mentionnent
  (`onboarding.schema.ts:144-164`). Aucun formulaire ne les écrit.

### Le mauvais câblage d'origine

L'onboarding écrit dans `apps.support_url` le **lien de groupe** de la
communauté, avec un repli codé en dur :

```
const supportUrl = community.whatsappGroupUrl || whatsappGroupUrl.trim()
                   || "https://chat.whatsapp.com/bouendji";
```

(`components/onboarding/onboarding-wizard.tsx:302-303`)

Donc « Contacter le support » fait entrer l'utilisateur dans un groupe, ou dans
le groupe `bouendji` par défaut — ce n'est pas une conversation 1:1 avec
l'administrateur. Les deux notions (canal communautaire / support direct) sont
confondues à la source.

## Analyse : trois couches, une seule règle

| Couche | Contenu | Change après installation ? |
|---|---|---|
| Build | `appId`, `apiBaseUrl`, `packageName`, thème, clé de signature, nom du lanceur | non, par définition |
| Runtime caché | support 1:1, groupe, Telegram, e-mail, liens légaux, version minimale, bandeau | oui, sans rebuild |
| Serveur seulement | secrets, prix, bundles | oui |

Le support est une **donnée d'exploitation**, pas une identité de marque. Il
doit donc sortir du build. En revanche, un **endpoint de redirection** est le
mauvais primitif pour le bouton de l'app :

1. il exige le réseau au moment précis où l'utilisateur n'en a plus (tunnel
   coupé, connexion impossible) ;
2. il ajoute un aller-retour TCP/TLS/302 sur un réseau mobile camerounais ;
3. il masque le destinataire (l'utilisateur ne sait pas quel numéro s'ouvre) ;
4. tout endpoint de redirection est un risque d'open redirect s'il accepte une
   cible en paramètre ;
5. il ne peut pas transporter le code d'appareil prérempli sans le mettre dans
   une URL GET, donc dans les journaux.

Un **profil JSON public + cache local** règle les cinq points : une requête au
démarrage, une copie chiffrée sur l'appareil, un repli build-time, et aucune
dépendance au réseau au moment du clic.

La redirection garde un usage légitime : un lien unique imprimé ou un QR code
(`https://api…/s/<slug>` → 302 vers le canal courant). Dans ce cas la cible
vient de la base, jamais de la requête.

## Recommandation

### 1. Route publique `GET /v1/apps/:appId/profile`

Même forme que le catalogue : `appId` en clé, filtre SQL par `app_id`, 404 si
inconnu, aucune donnée utilisateur. Réponse < 1 Ko, `ETag`, `Cache-Control:
public, max-age=300`.

```json
{
  "app": { "id": "…", "name": "Saitrix", "minVersionCode": 6 },
  "support": {
    "source": "community",
    "whatsapp": "2376XXXXXXXX",
    "whatsappUrl": "https://wa.me/2376XXXXXXXX",
    "call": "tel:+2376XXXXXXXX",
    "email": null,
    "groupUrl": "https://chat.whatsapp.com/…",
    "hours": "Lun–Sam 8h–20h",
    "responseHint": "Réponse sous 2 h"
  },
  "legal": { "privacyUrl": null, "termsUrl": null },
  "updatedAt": "2026-10-29T18:00:00Z"
}
```

### 2. Ordre de résolution, calculé côté serveur

1. `communities.contact_whatsapp` (ligne directe de la communauté) ;
2. sinon `apps.support_url` s'il s'agit d'un contact (`wa.me`, `tel:`, `mailto:`) ;
3. sinon repli plateforme, explicite (`source: "platform"`).

Le lien de groupe est un canal **distinct** (« Rejoindre la communauté »), pas
le bouton support. Le dashboard affiche un avertissement quand
`source = "platform"`.

### 3. Ce que l'app fait

- Cache `contact.profile` dans `SecureStore`, avec `fetchedAt`.
- Au démarrage : affiche le cache immédiatement, rafraîchit en tâche de fond
  (jamais bloquant).
- Sans cache ni réseau : repli `BrandTokens.supportUrl` pendant une version,
  puis suppression.
- Choix du canal : WhatsApp si un handler existe, sinon `tel:`, sinon copie du
  numéro. Jamais un bouton mort.
- Message prérempli : nom de l'app, version, code d'appareil court, dernier code
  d'erreur. Encodé en `?text=`.
- Validation avant `openUrl` : schémas `https`, `mailto`, `tel` ; hôtes
  `wa.me`, `chat.whatsapp.com`, `t.me` uniquement.

### 4. Dashboard

- Carte « Support » par application/communauté avec **aperçu exact** de ce que
  l'app affichera.
- Validation : `^237[62]\d{8}$` pour un mobile camerounais, URL de groupe
  `^https://chat\.whatsapp\.com/[A-Za-z0-9_-]{8,128}$`, `https` obligatoire.
- Écrire le lien de groupe dans `communities.whatsapp_group_url`, **plus** dans
  `apps.support_url`.
- Contrôle avant build : support résolu non vide, aucun `.invalid`.

### 5. Réutilisation du profil

Le même document peut porter `minVersionCode` (déjà en base, jamais lu par
l'app), un bandeau d'information et les liens légaux — trois sujets qui
exigeraient sinon un rebuild des 8 APK.

## Alternatives écartées

| Option | Sans rebuild | Hors ligne | Risque | Verdict |
|---|---|---|---|---|
| A. Build-time seul (actuel) | non | oui | 8 rebuilds pour un numéro | rejeté |
| B. `/v1/me` seulement | oui | après connexion | écran de connexion sans support | insuffisant |
| C. Profil public + cache | oui | oui | périmé jusqu'au TTL | **retenu** |
| D. Redirection | oui | non | open redirect, saut réseau | QR/impression seulement |
| E. Firebase Remote Config | oui | oui | projet, dépendance, hors Play | surdimensionné |
| F. Profil signé Ed25519 | oui | oui | complexité | plus tard si besoin |

## Décisions à prendre

1. Support 1:1 WhatsApp comme canal principal, e-mail en dernier recours ?
2. Le groupe et le support restent deux boutons distincts ?
3. Repli hors ligne : `BrandTokens.supportUrl` pendant une version, ou profil
   embarqué au build (dernier connu) ?
4. Le profil porte-t-il aussi `minVersionCode` et les liens légaux dès la
   première version ?
5. Redirection `/s/<slug>` : maintenant (QR/impression) ou plus tard ?

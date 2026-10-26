---
id: audit-brief
title: Brief commun de l'audit du code (refonte 2, 2026-10-26)
tags: [audit, refonte, brief, sous-agents]
status: decided
updated: 2026-10-26
related: [admin-journeys, dashboard-plan, decisions]
---

# Brief commun — audit du code avant la refonte 2

Tu es un **auditeur en lecture seule**. Tu ne modifies **aucun** fichier du code.
Tu écris seulement dans ton dossier `knowledge/agents/<ton-slug>/`.

## Pourquoi cet audit

Le dashboard et l'app ont été construits « une page par route API », sans
parcours. Avant de réécrire, on veut savoir **exactement** ce qui existe, ce qui
est réutilisable, ce qui manque, et **comment structurer le code** pour le plan
ci-dessous. Chaque auditeur couvre **une seule tranche** du code. Ne sors pas de
ta tranche : si un point dépend d'un autre fichier, note-le dans « Dépendances
hors tranche » sans aller le lire en entier.

## Le plan cible (résumé fidèle, validé par l'utilisateur)

Rôles : `owner` (plateforme, cumulable), **`reseau`** (nouveau rôle plateforme :
déploie les serveurs de nuit, ne voit que l'espace Réseau, cumulable avec
owner), `community_admin`, `support`, `finance`.

1. **Mot de passe forcé (R1)** : tout admin créé avec un mot de passe temporaire
   (y compris ceux déjà en prod) doit le changer à sa prochaine requête (actuel,
   nouveau, confirmation). Après changement, ses autres sessions sont révoquées.
   Écran « Mon compte » : profil, mot de passe, sessions ouvertes, thème.
   **Connexion par email OU numéro WhatsApp.** Pas d'email envoyé, jamais.
2. **Libre-service** : l'owner invite un admin (mot de passe temporaire envoyé
   sur WhatsApp). L'admin fait son **onboarding en 6 étapes** : profil (WhatsApp
   facultatif), communauté (nom, lien du groupe WhatsApp, numéro de contact),
   application (nom, couleur, logo, aperçu), forfaits, équipe, récapitulatif →
   **demande de build**. **Un admin = une seule application.** L'owner **valide
   ou refuse** (motif) ; la pipeline GitHub Actions construit, dépose l'APK sur
   Cloudflare R2, rappelle l'API. États du build : brouillon, demandé, refusé,
   en cours, publié, échec.
3. **Guide par rôle** après l'onboarding, avancement stocké côté serveur.
4. **Forfaits, deux familles** : (a) **Limité** = quota de data, client VLESS
   **dédié dans 3x-ui** (VM GCP permanentes), créé automatiquement par l'API au
   paiement, trafic lu côté serveur, accès coupé à l'épuisement → l'app propose
   de racheter ; (b) **Limité + illimité de nuit** : même quota le jour, plus
   data illimitée la nuit sur des nœuds Cloud Run éphémères (4 h de vie) déployés
   **à la main** à 20 h et à minuit. Plages choisies au paiement : 20h-24h,
   24h-4h, 20h-4h.
5. **Prix plancher** : l'owner fixe coût du Go, coût par plage de nuit, marge ;
   l'admin fixe ses prix au-dessus, aidé d'un indicateur de prix.
6. **Telegram** : rappels de déploiement 15 min avant chaque créneau, relance
   toutes les 5 min en retard, à **plusieurs destinataires** (owners + réseau).
7. **Dashboard** : 5 sections (Accueil, Abonnés, Offres, Argent, Plus/Communauté),
   onglets dans les pages, **détail en tiroirs** (Sheet desktop, Drawer mobile),
   état du tiroir dans l'URL, tout nom cliquable vers sa fiche, recherche Ctrl K,
   espace Plateforme (owner) et Réseau. **Cache client** (page revisitée sans
   skeleton) + **flux SSE** d'invalidation depuis l'API (Postgres LISTEN/NOTIFY),
   pas de polling ; présence (qui est connecté).
8. **Réseau** : noms de nœuds génériques tirés au hasard ; ajout d'un nœud par
   lien VLESS collé, champs remplis seuls et en lecture.
9. **App Android** : pop-up de bienvenue (rejoindre le groupe WhatsApp, écrire à
   l'admin), page de paiement au thème de la marque avec choix de plage et prix,
   jauge de quota à l'accueil, **feuille Activité** (débit en direct, data
   reçue/envoyée, data restante), liste des serveurs avec ping, bouton
   « Demander de l'aide » (WhatsApp) qui copie le code d'appareil.

## Ce que tu dois produire

Un seul fichier : `knowledge/agents/<ton-slug>/notes/audit.md`, **250 lignes au
plus**, avec exactement ces sections :

1. **Verdict** — 3 à 5 lignes : état réel de la tranche.
2. **Inventaire** — tableau : fichier · rôle · taille approx. · état
   (`solide`, `partiel`, `creux/statique`, `mort`, `bug`). Chaque affirmation
   cite `fichier:ligne`.
3. **Ce qui sert le plan** — ce qu'on garde tel quel ou presque, avec
   `fichier:ligne`.
4. **Écarts avec le plan** — pour chaque point du plan qui touche ta tranche :
   ce qui manque ou contredit, avec `fichier:ligne`. Numérote par point du plan
   (1 à 9).
5. **Structure de code proposée** — fichiers à créer / modifier / supprimer,
   avec noms de fonctions, de tables ou de colonnes, signatures TypeScript ou
   Kotlin, routes. Concret. Suis les conventions déjà présentes dans la tranche
   (nomme-les avec `fichier:ligne`).
6. **Bugs et risques** — avec `fichier:ligne` et le scénario qui casse.
7. **Dépendances hors tranche** — ce qu'il faudrait vérifier ailleurs.
8. **Non vérifié** — ce que tu n'as pas pu confirmer.

## Règles strictes

- **Lecture seule.** Aucun `Edit`/`Write` hors de ton dossier d'agent. Aucune
  commande qui installe, télécharge, compile ou modifie quoi que ce soit (le
  réseau de la machine est un forfait mobile limité). Pas de `git` en écriture.
- **Pas d'invention.** Pas de `fichier:ligne`, pas d'affirmation. Ce que tu
  suppose porte `(non vérifié)`. Ne devine jamais le nom d'un fichier : vérifie
  avec Glob/Grep.
- **Lis par morceaux.** Utilise Grep pour localiser, puis Read avec `offset` /
  `limit`. Ne lis pas des fichiers entiers inutilement.
- Ne recopie jamais un secret, un jeton, ni un lien `vless://` réel.
- Journalise chaque étape réelle :
  `node knowledge/cli.mjs agent log <slug> "<titre>" --fait "..." --etat ok --suite "..."`
  puis, à la fin :
  `node knowledge/cli.mjs agent close <slug> "<résultat en une ligne>"`.
- Ta réponse finale (à l'orchestrateur) : le verdict, les 5 écarts les plus
  importants, le chemin de `audit.md`. Pas plus de 25 lignes.

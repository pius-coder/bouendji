---
id: objective
title: Objectif du produit et état du chantier
tags: [brief, produit, perimetre]
status: decided
updated: 2026-10-20
related: [decisions, open-questions]
---

## Produit

Application Android VPN **VLESS** en marque blanche, avec backend, dashboard
d'administration, paiements et génération d'APK par marque.

L'utilisateur ne voit **jamais** de lien `vless://`. Il paie, crée un compte,
enregistre son appareil, et l'application maintient seule une connexion valide.

Boucle principale :

```
paiement confirmé
  → compte activé
  → appareil enrôlé (clé Keystore)
  → l'API renvoie un TABLEAU de configurations chiffrées pour cet appareil
  → l'app choisit, teste, se connecte
  → expiration / panne  →  bascule automatique sur une autre entrée de la liste
  → synchronisation du bundle à la prochaine occasion
```

On ne s'abonne **pas** à une configuration : on s'abonne à l'ensemble des
configurations actives, dont la liste est révisée côté serveur.

## Deux plans commerciaux

| Plan | Support | Modèle |
|---|---|---|
| Illimité | nœuds GCP (Cloud Run) | temps seul |
| Limité | VPS permanents | temps + quota de données |

Le plan limité est une option que l'utilisateur choisit activement. Il n'existe
pas encore : c'est une décision produit du 2026-10-20.

## Répartition du travail

- L'utilisateur travaille sur **l'application Android** et détient le compte
  **Fapshi**.
- Le partenaire devait prendre le backend, le dashboard et les paiements — mais
  la consigne la plus récente est de tout construire ici (application, admin,
  API).

## Où en est le code

`outputs/vpn-platform/` : monorepo pnpm. Contrat, `config.ts`, `schema.ts`,
`db.ts`, `crypto.ts`, `auth.ts`, `errors.ts`, `mailer.ts`, `fapshi.ts`,
`lib/vless.ts`, `services/endpoints.ts` sont écrits.

Pas encore écrit : les routes internes d'ingestion, `app.ts`, `server.ts`, les
tests, `infra/endpoint/`, le bundle, le dashboard, l'application Android.

Rien n'a été compilé ni exécuté à ce jour : aucun `pnpm install` n'a été lancé.

---
id: vercel
title: Vercel — ce que la plateforme impose vraiment
tags: [vercel, hebergement, serverless, limites, cron]
status: verified
updated: 2026-10-20
related: [deploiement-etat, cloud-run, pool-and-failover]
---

Relevé dans la documentation Vercel (consultée le 2026-10-20), pour remplacer
Cloud Run. Ces valeurs sont **citées**, pas déduites.

## Limites chiffrées

| Contrainte | Hobby | Pro |
|---|---|---|
| Durée max d'une fonction | **300 s** (défaut **et** maximum) | 300 s par défaut, jusqu'à **800 s** |
| Durée étendue | — | jusqu'à **1800 s** (30 min) |
| Mémoire | 2 GB | 4 GB |
| Cron | **une fois par jour** | schedules à la minute |

## Ce que ça casse dans notre API

1. **Le balayage de 60 s ne survit pas.** `server.ts` fait tourner un tick
   (`poolWatch`, `purgeExpired`, expiration d'endpoints) dans un processus qui
   vit en permanence. En serverless, il n'y a pas de processus : il faut un
   **Cron**. Sur Hobby, un cron par jour est très en dessous du besoin — un nœud
   expiré resterait dans le pool jusqu'à 24 h. Donc : **Pro** (cron à la minute),
   ou un déclencheur externe qui appelle une route protégée, ou un balayage
   paresseux calculé à la lecture (`expires_at > now()`), cette dernière étant la
   seule qui ne dépend d'aucun plan.
2. **Le limiteur de débit en mémoire devient plus faible qu'avant.** Chaque
   instance serverless a son propre compteur : la limite réelle est multipliée
   par le nombre d'instances. C'était déjà un défaut connu sous Cloud Run ; ici
   c'est le régime par défaut.
3. **`DATABASE_URL` obligatoire.** PGlite s'appuie sur un système de fichiers qui
   n'existe pas (ou n'est pas partagé) entre invocations. Postgres managé
   (Neon, Supabase) n'est pas un confort, c'est la condition de fonctionnement.
4. **Pas de WebSocket long ni de tunnel.** Vercel termine la requête : aucun
   client VPN ne peut s'y connecter. L'endpoint reste **en dehors** (D34).
5. **`PUBLIC_BASE_URL` devient l'origine Vercel**, pas celle de Cloud Run : les
   URL de retour de paiement doivent pointer dessus.

## Ce qui reste à trancher

- Le balayage : cron Pro, route protégée appelée de l'extérieur, ou calcul
  paresseux. **Question ouverte**, posée dans `00-brief/open-questions.md`.
- L'adaptateur Fastify → Vercel : `@fastify/static` a été retiré (il ne sert
  plus), le reste de la surface (routes, hooks, `rawBody`) doit être vérifié
  contre le runtime Vercel avant d'être déclaré fonctionnel. **Non vérifié** :
  aucune fonction n'a été déployée.
---
id: failover-client
title: Bascule automatique côté client
tags: [android, failover, reseau, ux, batterie]
status: decided
updated: 2026-10-20
related: [singbox-engine, pool-and-failover, ui-identities]
---

## Détection

On ne teste pas « le réseau » : on teste **le trafic à travers le tunnel**.

- Sonde : requête HTTP courte vers un point de contrôle, timeout 3 à 5 s.
- Deux échecs consécutifs → déclenchement de la bascule.
- Un seul échec → rien (le mobile perd un paquet tout le temps).
- Jamais de test quand l'écran est éteint au-delà du rythme minimal : la
  batterie est un budget, pas une ressource infinie.

## Bascule

1. Tester les autres entrées du bundle, en parallèle, avec un plafond
   (4 à 6 simultanées).
2. Retenir celles qui passent un vrai handshake **et** une requête HTTP.
3. Classer par latence mesurée, pas par ping ICMP.
4. Déplacer le `selector` — pas de redémarrage du tunnel si évitable.
5. Reconfirmer par une sonde ; si échec, essayer la suivante.

## Cadence

Backoff : 30 s → 2 min → 10 min, plafonné. Retour au rythme normal après une
période stable (par exemple 5 min sans échec).

## Choix manuel

Le choix de l'utilisateur est une **préférence**, pas un verrou. Après deux
échecs, l'app bascule et affiche un bandeau non bloquant :
« Votre choix ne répondait plus — bascule automatique », avec un bouton
« revenir à mon choix ».

## Épuisement

Toutes les entrées ont échoué :

- écran « Aucune connexion disponible » ;
- bouton de contact vers l'administrateur de la marque (lien stocké dans le
  build) ;
- reprise automatique avec backoff, sans bloquer l'interface ;
- tentative de synchronisation de la liste **hors tunnel** si l'API est
  joignable.

## Reconnexion préventive

Indépendante du failover : avant la coupure de 60 min imposée par Cloud Run
(≈ 55 min), l'app se reconnecte d'elle-même. Voir O11 : que faire d'un
téléchargement en cours à cet instant ?

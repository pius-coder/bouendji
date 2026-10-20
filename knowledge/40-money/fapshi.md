---
id: fapshi
title: Fapshi — encaissement et versements
tags: [paiement, fapshi, webhook, payout]
status: verified
updated: 2026-10-20
related: [roles-and-commissions]
---

## Deux services, pas un

Fapshi sépare **encaissement** et **décaissement**. Un service activé pour les
versements ne peut plus encaisser. Les versements en production demandent une
activation supplémentaire. C'est une contrainte de compte, pas une option de
code.

## Flux d'encaissement

1. L'app crée une commande côté API (`order`), jamais chez Fapshi directement.
2. L'API initialise le paiement et renvoie un lien.
3. L'utilisateur paie dans le navigateur.
4. Fapshi appelle le webhook.
5. **Le webhook n'est jamais cru** : le statut est re-vérifié par l'API
   (`FAPSHI_VERIFY_WITH_API=true`).
6. Paiement confirmé → abonnement activé → commission calculée.

États à distinguer : `payment_pending`, `payment_confirmed`, `access_active`.
Un paiement confirmé mais un accès pas encore actif ne doit jamais provoquer une
seconde demande de paiement.

## Flux de versement

- Registre de commissions (pas de solde éditable).
- Lots de versement avec clé d'idempotence.
- Une transaction au résultat incertain est marquée, jamais rejouée à l'aveugle.
- Un remboursement annule la commission correspondante.

## Détention du compte

L'utilisateur détient le compte Fapshi et les clés. C'est lui qui déclenche ou
valide les versements. Le code ne doit donc jamais supposer qu'il peut payer
automatiquement sans confirmation humaine.

## Ouvert

O6 : la notification de retrait est annoncée sur **WhatsApp**, alors que les
rappels d'exploitation étaient sur Telegram. Un canal ou deux ?

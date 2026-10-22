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

### État vérifié du code (2026-10-21)

- Un seul jeu d'identifiants Fapshi par déploiement (`env.fapshi.apiUser` /
  `apiKey`) : **pas de compte d'encaissement par communauté**. L'argent d'une
  commande arrive donc sur le compte plateforme.
- `POST /v1/admin/communities/:id/payouts` calcule le montant depuis les
  commissions disponibles ; le montant n'est jamais fourni par le client
  (`apps/api/src/routes/admin.ts` ~874-936).
- `POST /v1/admin/payouts/:id/approve` ne fait que passer
  `status='approved'` (`admin.ts` ~938-966). **Aucun appel `fapshi.payout()`
  n'est câblé** : la méthode existe dans `lib/fapshi.ts` mais n'a aucun
  appelant. Les « routes api-money » citées en commentaire n'existent pas
  (`apps/api/src/routes/` ne contient pas `money.ts`).
- Conséquence : aujourd'hui, un versement approuvé **n'envoie pas d'argent**.

## Sens des flux

```
client final --(lien Fapshi)--> compte plateforme
                                      |
                                      +--> commission calculée (community_id)
                                      |
                                      +--> versement approuvé --> communauté
```

Le revendeur ne reverse rien par un lien de paiement : il est **bénéficiaire**
d'une commission, pas débiteur. Un modèle « le revendeur encaisse puis doit
reverser » n'existe ni en décision ni en code.

## Détention du compte

L'utilisateur détient le compte Fapshi et les clés. C'est lui qui déclenche ou
valide les versements. Le code ne doit donc jamais supposer qu'il peut payer
automatiquement sans confirmation humaine.

## Ouvert

O6 : la notification de retrait est annoncée sur **WhatsApp**, alors que les
rappels d'exploitation étaient sur Telegram. Un canal ou deux ?

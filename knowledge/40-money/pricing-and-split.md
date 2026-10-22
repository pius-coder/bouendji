---
id: pricing-and-split
title: Prix, enveloppe 30 % et commissions
tags: [money,prix,commission,payout]
status: decided
updated: 2026-10-21
related: [decisions, open-questions, roles-and-commissions, fapshi, schema]
---

## Question

Qui fixe le prix de vente, comment l'argent est partagé entre la plateforme et
les revendeurs, et comment une commission est calculée ?

## Décision (D35)

1. **Le prix est fixé par la communauté**, forfait par forfait.
2. Le client paie ce prix sur le **lien Fapshi de la plateforme**, qui encaisse
   **100 %**. Le revendeur ne reverse jamais d'argent.
3. **30 % du CA généré par les communautés** forment l'enveloppe des
   commissions. **70 %** restent à la plateforme (`owner`).
4. L'enveloppe est répartie **au prorata du CA généré**. Une communauté sans
   vente touche **0**.
5. Une vente **directe** (sans communauté) ne finance aucune commission : elle
   reste à 100 % à la plateforme.

## Formule

```
CA_partenaire_i = somme des montants encaissés attribués à la communauté i
CA_partenaire   = somme des CA_partenaire_i
enveloppe       = 0,30 × CA_partenaire
commission_i    = enveloppe × (CA_partenaire_i / CA_partenaire)
                = 0,30 × CA_partenaire_i
```

La deuxième ligne est l'identité qui compte : **répartition proportionnelle =
30 % par commande**. L'enveloppe est donc un **affichage comptable mensuel**, pas
un second calcul. On accumule la commission à chaque commande, on agrège pour
l'affichage. Aucun job de clôture n'est nécessaire tant que la répartition
reste strictement proportionnelle.

## Exemple (1 000 000 XAF, 5 communautés)

| Communauté | CA généré | Part | Commission (30 %) |
|---|---:|---:|---:|
| A | 500 000 | 50 % | 150 000 |
| B | 300 000 | 30 % | 90 000 |
| C | 150 000 | 15 % | 45 000 |
| D | 50 000 | 5 % | 15 000 |
| E | 0 | 0 % | 0 |
| **Total** | **1 000 000** | 100 % | **300 000** |

## Invariants

1. `orders.amount_xaf` = prix réellement payé, figé au paiement.
2. `orders.commission_bps` ≤ 3000 ; `orders.commission_xaf` figé au paiement.
3. Changer le prix d'un forfait ne réécrit **aucune** commande passée.
4. Un remboursement annule la commission. Si elle est déjà versée, elle se
   déduit de l'enveloppe suivante ; jamais de solde négatif silencieux.
5. Le montant d'un versement n'est **jamais** fourni par le client : il est la
   somme des commissions disponibles (`admin.ts` ~888-898).
6. Une communauté désactivée ne génère plus de commission ; ses commissions
   déjà acquises restent dues.
7. La commission est indépendante des UTM (D15).

## White label : le prix est déjà par marque

`apps` porte le nom, le `package_name`, le thème et le logo ; `apps.community_id`
rattache chaque marque à une communauté (`schema.ts` ~6-35). `plans` est indexé
par `app_id` (`UNIQUE(app_id, code)`), donc **les forfaits et leurs prix sont
déjà propres à une marque**, et une marque appartient à une communauté.

Conséquence : **pas besoin de `community_prices`**. Le modèle existant suffit.
Ce qui manque n'est pas la table, c'est la **gestion** :

- aucune route admin ne crée ou ne modifie un forfait (`admin.ts` n'en contient
  aucune ; seul `seed.ts` insère les trois forfaits initiaux) ;
- aucun endpoint public ne sert les forfaits de l'app appelante, donc
  l'application ne peut pas afficher les prix définis par son administrateur.

## Ce qui reste ouvert (O18)

Plus rien : **brut**, **`floor`**, **aucun plafond de prix** (décidé le
2026-10-21). Le plafond de 30 % porte sur le **taux**, pas sur le prix de vente.

## Implémenté le 2026-10-21

- `commissionFor` plafonne à `MAX_COMMISSION_BPS = 3000` et arrondit vers
  le bas (`services/payments.ts`).
- `communities.commission_bps` : défaut `3000`, contrainte
  `communities_commission_bps_range CHECK (0..3000)`, lignes existantes
  ramenées à 3000 au boot (`schema.ts`).
- `GET /v1/admin/apps/:appId/plans` (lecture, `community.read`),
  `POST /v1/admin/apps/:appId/plans` et `PATCH /v1/admin/plans/:planId`
  (`plan.manage` = `community_admin` de la marque ou `owner`), avec audit
  `plan.create` / `plan.update` (`routes/admin.ts`).
- `GET /v1/apps/:appId/plans` : catalogue public, offres actives seulement,
  filtré par `app_id` en SQL, avec la `revision` attendue par
  `POST /v1/orders` (`routes/catalog.ts`).
- `code` n'est pas modifiable après création : il entre dans la révision.

Le versement réel reste non câblé : `POST /payouts/:id/approve` ne fait que
passer `status='approved'` (`admin.ts`), et `fapshi.payout()` n'a aucun
appelant. Voir `40-money/fapshi`.

## Vérifié

- `npx tsc --noEmit` : aucune sortie.
- `npm test` : 100 tests, 100 passés, dont
  « la commission est plafonnée à 30 % et arrondie vers le bas »,
  « les forfaits sont propres à une marque et modifiables par son
  administrateur » et « le catalogue public ne sert que les offres actives de
  l'app demandée ».

## Sources

- `apps/api/src/schema.ts` ~123-137 (`plans` : global, sans `community_id`).
- `apps/api/src/schema.ts` ~139-161 (`orders` : prix, taux et commission figés).
- `apps/api/src/routes/admin.ts` ~874-966 (création et approbation des versements).
- `apps/api/src/services/payments.ts` (paiement, commission à la confirmation).
- `00-brief/decisions.md` D15, D35.

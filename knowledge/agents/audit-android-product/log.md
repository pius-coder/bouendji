# Journal — audit-android-product

## 2026-10-29T19:06:04Z · Création
- fait: charte créée
- portée: Audit en lecture seule de lapp Android, axe : Parcours produit ecrans et coherence des decisions. Ne modifie aucun fichier de code.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-29T19:59:53Z · CLOTURE partielle

- fait: audit produit ecrans/parcours : 6 ecrans, AppController, Shell, MainActivity, contrats API auth/orders/payments/me/catalog/bundle/account/devices lus ; notes/audit.md ecrit (P0 retour paiement perdu au cold start + commande non persistee ; P1 retour Fapshi code en dur Nevpn, PLAN_CHANGED sans rechargement, D67 coffre vide, appareil revoque inatteignable, quota non affiche, support mailto, mot de passe non gerable)
- etat: partiel
- suite: reprendre : bundle.ts >450, payments.ts >416, OfflineBundle, tests Android, verification base prod night_slots

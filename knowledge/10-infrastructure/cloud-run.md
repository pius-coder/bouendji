---
id: cloud-run
title: Cloud Run — contraintes réelles
tags: [gcp, cloud-run, ttl, cout, reseau]
status: verified
updated: 2026-10-20
related: [cloud-run-url, endpoint-lifecycle, pool-and-failover]
---

Faits vérifiés, avec leurs conséquences sur le produit. Aucune de ces
contraintes n'est négociable : elles viennent de la plateforme.

## 1. Une requête ne peut pas dépasser 60 minutes

Timeout maximal : **3 600 s**, WebSocket compris. Un tunnel VLESS-over-WS
tunnelise **tous** les flux TCP de l'utilisateur dans une seule requête HTTP.
À la 60ᵉ minute, tout tombe d'un coup.

Conséquence : un nœud « 4 h » n'existe jamais 4 h sans coupure. Il existe en
tranches d'une heure. La reconnexion doit être **préventive**, côté client,
avant que la plateforme ne coupe (55 min est la marge raisonnable).

## 2. Le trafic sortant est cher

≈ **0,12 $/Go** (tier 1). 3 To/mois ≈ **368 $**. Free tier : **1 Go/mois**,
donc inutilisable pour du VPN.

Un VPS à 4-6 € fait mieux. C'est ce qui justifie la répartition : GCP pour les
plans illimités en temps (peu de volume), VPS pour les plans à quota.

## 3. Couvrir un créneau en continu coûte cher même sans trafic

CPU : 0,000024 $/vCPU-s. Mémoire : 0,0000025 $/GiB-s.
Un créneau couvert 720 h/mois = 2 592 000 s → **≈ 62 $ de CPU** (1 vCPU)
+ **≈ 3 $ de mémoire** (512 Mio), hors trafic et hors requêtes.

À 4 h 30 de vie : 720 / 4,5 = **160 déploiements par mois** par créneau.

## 4. L'URL du service n'est pas injectée

Voir `cloud-run-url`. Le conteneur ne connaît pas son nom public.

## 5. Le conteneur doit écouter sur `$PORT`

Cloud Run route le HTTP/1.1 et le gRPC vers le port fourni dans `PORT`.
Un serveur qui n'écoute pas sur ce port ne reçoit rien. Une montée WebSocket
est une requête HTTP valide, donc Xray peut servir directement sur `$PORT`,
mais la sonde de démarrage par défaut est TCP : elle valide le port, pas la
bonne réponse HTTP.

## 6. `min-instances=0` = cold start

À la première requête, l'instance démarre (1 à 3 s pour Xray + l'appel
d'enregistrement à l'API). Beaucoup de clients interprètent ce délai comme un
serveur mort. Les tests de latence de l'app classeront ce nœud mauvais alors
qu'il est bon ensuite.

## 7. Le système de fichiers est éphémère

Aucune persistance entre instances ni entre redémarrages. Donc **chaque cold
start doit réenregistrer** auprès de l'API pour récupérer son UUID et son
chemin WS. Si l'API est down, le nœud ne démarre pas.

## 8. `SIGTERM` n'est pas une fin de vie

Il est aussi envoyé lors d'un scale-to-zero ou d'un recyclage d'instance. Il ne
doit **jamais** déclencher une désinscription du pool : le nœud doit rester
`active` jusqu'à son `expires_at`.

## 9. Les compteurs de trafic disparaissent avec l'instance

Les statistiques Xray vivent en mémoire. Sans push périodique (≈ 60 s) vers
l'API, tout quota est invérifiable.

## 10. Le timeout de requête se règle — et vaut 300 s par défaut

Le formulaire propose 300 s, le maximum est 3 600 s. Laissé à 300, le tunnel
tombe toutes les 5 minutes. Voir `cloud-run-deploy-form`.

Conséquence : le bundle doit transporter `max_session_seconds` par endpoint, et
le client doit tourner à `max_session_seconds − 60` au lieu d'une constante
codée en dur.

## 11. Facturation à la requête : CPU bridé hors requête

Un tunnel WS actif est une requête, donc le CPU est alloué. Sans client, plus de
CPU : un heartbeat de 60 s dérive. Donc `last_seen_at` ne sert **jamais** à
retirer un nœud du pool ; seule `expires_at` fait foi.


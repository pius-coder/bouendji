---
id: singbox-engine
title: sing-box — intégration et limites
tags: [singbox, libbox, moteur, gpl, urltest]
status: assumption
updated: 2026-10-20
related: [android-app, failover-client]
---

## Intégration

`libbox` exposé en Kotlin. La configuration est construite **en mémoire** à
partir du bundle déchiffré, jamais écrite en clair.

Structure utile :

```json
{
  "outbounds": [
    { "type": "selector", "tag": "proxy", "outbounds": ["auto", "n1", "n2"] },
    { "type": "urltest", "tag": "auto", "outbounds": ["n1", "n2"] },
    { "type": "vless", "tag": "n1", "...": "..." }
  ]
}
```

- Toutes les configurations du bundle existent comme outbounds dès le départ :
  la bascule ne recharge pas la configuration, elle déplace le `selector`.
- `urltest` mesure réellement le délai à travers chaque sortie.
- L'API Clash (`experimental.clash_api`) expose `/proxies/{tag}/delay` : c'est
  le moyen propre de tester **une** sortie sans interrompre le trafic. C'est ce
  que doit utiliser le bouton « tester » de l'utilisateur.

## Pièges

- Un test TCP ne prouve rien : un serveur peut accepter la connexion puis
  refuser le VLESS (UUID expiré). Le test doit faire un vrai handshake puis une
  requête HTTP à travers le tunnel.
- `urltest` sur un nœud en cold start le déclare mauvais. Prévoir une seconde
  chance avant de le classer.
- La licence est **GPL-3.0** : distribuer un APK qui embarque `libbox` implique
  de fournir les sources correspondantes. À traiter comme une contrainte
  juridique, pas comme un détail.

## Non vérifié

Aucun test réel de `libbox` n'a été fait ici. Tout ce qui précède est un plan
d'intégration, pas une validation.

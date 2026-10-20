---
id: telegram-bot
title: Bot d'exploitation — rappels, approbations, alertes
tags: [telegram, whatsapp, bot, ops, notifications]
status: open
updated: 2026-10-20
related: [open-questions, endpoint-lifecycle, ingest-auth]
---

## Rôle

Ce n'est pas un gadget : c'est l'interface d'exploitation mobile. L'utilisateur
déploie depuis son téléphone, donc les rappels et les approbations doivent
arriver là où il est.

## Événements

| Événement | Quand | Action attendue |
|---|---|---|
| Rappel de renouvellement | T-60 min | « déploie un nouveau nœud » + bouton |
| Fin du drain | T-15 min | « ce nœud n'accepte plus de nouveaux clients » |
| Pool faible | `count(active) < 2` | alerte répétée toutes les 10 min |
| Nouvel endpoint | `pending` | boutons **Approuver / Rejeter** |
| Retrait Fapshi | à la demande de versement | notification + statut (canal à confirmer) |

## Contraintes techniques

- API Bot : ≈ 30 messages/s global, **1 message/s par conversation**. Largement
  suffisant ; il faut juste ne pas boucler.
- Mode **webhook** plutôt que long polling : l'API a déjà une URL publique. Le
  webhook doit être protégé par `X-Telegram-Bot-Api-Secret-Token` et par une
  liste d'`chat_id` autorisés.
- Un bouton inline renvoie un `callback_query` : il faut répondre dans les
  secondes, donc l'approbation doit être une mise à jour courte, pas un appel
  Cloud Run.

## Reste à trancher

- O6 : Telegram **ou** WhatsApp ? Deux canaux = deux intégrations, deux pannes
  possibles, deux secrets. WhatsApp Business API est nettement plus lourd
  (vérification, templates, coût par conversation).
- Recommandation : **Telegram pour l'exploitation**, WhatsApp seulement si le
  canal est imposé par Fapshi pour les retraits.

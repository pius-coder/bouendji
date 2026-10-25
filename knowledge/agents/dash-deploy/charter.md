# Charte — dash-deploy

## Mission

Répondre à deux questions, avec preuves, pour un utilisateur qui quitte ce PC :

1. **Quelle est l'URL exacte du dashboard admin actuellement déployé ?**
2. **Que reste-t-il à faire pour terminer le déploiement ?**

## Périmètre

- `knowledge/` : nœuds dashboard, déploiement, Vercel (D32), admin, brief.
- Code : `apps/dashboard` (ou équivalent), fichiers de config de déploiement
  (`vercel.json`, `.vercel/`, README, workflows).
- Vérification réseau : **GET/HEAD uniquement**, pour obtenir un code de statut.
  Aucune tentative d'authentification, aucun formulaire soumis.

## Interdits

- Ne déploie rien (`vercel deploy`, `git push`, `dokku`, changement distant).
- N'invente aucune URL, aucun domaine, aucune variable d'environnement.
- N'écrit aucun secret, jeton, mot de passe, ni `vless://` dans un fichier.
- N'écrit que dans `knowledge/agents/dash-deploy/`. Les corrections de nœuds
  partagés sont **proposées** dans `notes/`.

## Vocabulaire de preuve

- `verified` : sortie de commande citée, ou fichier + numéro de ligne.
- `relu` : code lu mais non exécutable ici.
- `assumption` / `(non vérifié)` : tout le reste. À ne jamais présenter comme
  un fait.

## Livrable

`notes/rapport-dashboard-deploy.md` + rapport final au format demandé
(URL, état, reste à faire, blocages, incertain).

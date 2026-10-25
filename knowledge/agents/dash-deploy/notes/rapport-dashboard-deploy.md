# Rapport — accès au dashboard admin et reste du déploiement

Auteur : sous-agent `dash-deploy` · date : 2026-10-25 · lecture seule sur l'infra.

## Verdict

**Aucun dashboard admin n'est déployé, ni sur Vercel, ni sur le VPS.** Il n'existe
donc **aucune URL de dashboard à donner à l'utilisateur**. Le dashboard existe en
revanche comme code dans `apps/dashboard` (commit `2e53a5e`, 2026-10-25 07:51) et
passe `next build` selon le handoff du jour.

Ce qui est réellement déployé et joignable : l'**API** sur `https://api.numzer0.store`
(Dokku, `aura-vps`), en `NODE_ENV=development` avec paiement simulé.

## a) URL du dashboard — preuves de l'absence

| Vérification | Commande | Résultat |
|---|---|---|
| Projets Vercel du compte | `vercel projects ls` (équipe `freeteam5`) | `aura_stack` → `https://app.henshins.online`, `sociolink` → `https://sociolink-dun.vercel.app`. **Aucun projet VPN.** |
| Équipes Vercel | `vercel teams ls` | une seule : `freeteam5`. Pas d'autre périmètre à inspecter. |
| Lien local | `apps/dashboard/.vercel` | absent ; `vercel.json` absent dans `apps/dashboard` (`.gitignore` l. 37-38 ignore `.vercel`) |
| Applications Dokku | `ssh aura-vps "dokku apps:list"` | `aura-worker`, `vpn-api`, `vpn-dl`, `vpn-node1`, `vpn-node2` — **pas de dashboard** |
| Domaines de l'API | `dokku domains:report vpn-api` | `vpn-api.198.251.65.186.sslip.io`, `api.numzer0.store` seulement |
| Ancienne route `/admin/` (D31, remplacée) | `curl -o NUL -w %{http_code} https://api.numzer0.store/admin/` | **404** |
| DNS des candidats | `Resolve-DnsName` | `admin.numzer0.store`, `dashboard.numzer0.store`, `dash.numzer0.store` → **NXDOMAIN** ; test de wildcard `zzz-not-a-real-host.numzer0.store` → NXDOMAIN (donc pas de wildcard qui masquerait un sous-domaine) |
| Mémoire projet | `knowledge/00-brief/handoff-2026-10-24.md` l. 74-75 | « **Reste côté dashboard** : … ; déploiement Vercel (D32) ; … » |
| Mémoire projet | `knowledge/10-infrastructure/vercel.md` l. 51 | « Non vérifié : aucune fonction n'a été déployée. » |

Conclusion : toute URL de type `admin.<domaine>` ou `bouendji-admin.vercel.app`
serait **inventée**. Ne pas en donner.

## b) État réel du déploiement

| Brique | Où | Preuve | État |
|---|---|---|---|
| API | Dokku sur `aura-vps` (198.251.65.186), app `vpn-api` | `dokku apps:list`, `domains:report` | en ligne ; `GET /openapi.json` → **200**, `/reference` → 301 → **200** |
| Base | `vpn-db` (postgres Dokku) | `dokku postgres:connect vpn-db` répond | 2 comptes admin, 1 communauté, 1 app |
| Nœuds | `vpn-node1` (Francfort), `vpn-node2` (Paris) | handoff 2026-10-24 | actifs |
| Téléchargement APK | `vpn-dl` → `dl.numzer0.store` | `curl` → **200** | sert encore la beta.1 |
| APK R2 | `apps.numzer0.store` | `curl /` → **404** (normal sans objet) | domaine relié, aucun APK publié |
| Dashboard | **nulle part** | tableau ci-dessus | **non déployé** |
| Dernier commit | branche `api/prod-hardening` | `git log -1` | `2e53a5e`, 2026-10-25 07:51 +0100 |

Le dashboard **répond** : non — il n'a pas d'adresse.

## c) Ce qui reste à faire, dans l'ordre

1. **Créer le projet d'hébergement du dashboard.** Rien n'existe (preuves a).
   Sur Vercel, même motif que le projet `aura_stack` (monorepo, Root Directory
   dans `apps/`) : Root `apps/dashboard`, install et build à la racine du dépôt.
2. **Faire construire `@vpn/contract` avant le dashboard.** `packages/contract/package.json`
   l. 5-10 : `main: ./dist/index.js`, `types: ./dist/index.d.ts` ; `turbo.json`
   déclare `build.dependsOn: ["^build"]`. Sans build du contrat, le dashboard
   n'a pas de types ni de module à l'exécution.
3. **Poser deux variables serveur** (preuve : `apps/dashboard/src/server/api/config.ts`
   l. 13-19, qui lève « Configuration serveur incomplète ») :
   - `API_BASE_URL` = origine de l'API déployée ;
   - `DASHBOARD_ACCESS_KEY` = **la même valeur** que celle de `vpn-api`
     (elle est déjà présente côté API : `dokku config:show vpn-api` la liste).
   Aucune variable `NEXT_PUBLIC_*` (voulu, `.env.example`).
4. **Associer un domaine au dashboard.** Aucun sous-domaine n'existe
   (NXDOMAIN) ; il faut créer l'enregistrement DNS chez Cloudflare puis l'ajouter
   au projet. Le nom exact n'est pas décidé dans `knowledge/` — à trancher.
5. **Vérifier la protection d'accès et la session.** D79/D82 : cookie httpOnly +
   CSRF ; la **durée de session Next.js n'est pas tranchée** (D82, non tranché).
   Sur Vercel, vérifier que la *Deployment Protection* n'ajoute pas une seconde
   authentification devant l'application.
6. **Brancher le stockage des APK sur R2 dans l'API.** `apps/api/src/routes/builds.ts`
   l. 78 parle encore de « Vercel Blob, D62 » ; D100/D102 ont remplacé par R2.
   Tant que ce n'est pas fait, l'écran « Applications » du dashboard ne peut pas
   produire de lien d'APK.
7. **Publier `libbox.aar` sur la Release GitHub.** `gh release view libbox-1.14.3
   --json assets` → `{"assets":[]}` : **0 asset**. Le workflow
   `.github/workflows/android-brand.yml` (l. 131-144, committé) télécharge cet
   asset et échoue sans lui. Donc : pas de build d'APK par la CI, donc rien à
   afficher dans l'écran Builds.
8. **Poser les secrets R2** (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) —
   prérequis déclaré D102, et le workflow les exige (l. 205-206).
9. **Passer l'API en conditions réelles** (sinon le dashboard pilote un
   environnement de test) : `vpn-api` n'a **aucune** variable `FAPSHI_*`
   (`dokku config:show vpn-api`), donc `PAYMENT_PROVIDER=mock` et
   `NODE_ENV=development` ; D55 interdit ce régime en production.
10. **Compléter les écrans manquants du dashboard** : `dashboard-plan` § 4 lot L4
    (tiroirs, commissions, administrateurs, fichiers de secours émis, builds) —
    statuts à re-vérifier, plusieurs pages existent désormais dans
    `apps/dashboard/src/app`. `/kit` est encore là et devait être supprimé.
11. **Tester le dashboard contre l'API réelle.** Handoff : « Non vérifié : aucun
    de ces écrans contre l'API réelle (Postgres) ». Les tests actuels tournent
    sur un faux API.

## d) Ce qui bloque l'accès aujourd'hui

- **Pas d'adresse** : c'est le blocage principal (a).
- **Deux facteurs obligatoires à la connexion** : `X-Access-Key`
  (= `DASHBOARD_ACCESS_KEY`, injectée par le serveur Next.js) **et** un compte
  admin. Preuve : `POST /v1/admin/auth/login` sans clé →
  `401 {"code":"UNAUTHENTICATED","message":"Clé d'accès requise."}`.
- **Comptes existants** (requête en lecture seule sur `admin_users`) :
  `admin@example.com` et `tuekampius13@gmail.com`, tous deux `owner`, actifs.
  Mots de passe : `/root/vpn-api-admin.txt` et `/root/bouendji-owner.txt` sur le
  VPS, `0600 root` (les deux fichiers existent, `ls -l` vérifié). **Non
  recopiés ici.**
- **Contexte de navigation** : le dashboard route par communauté
  (`/…/[communityId]/…`) ; une seule communauté existe, `bouendji` (app
  `f3d5ee21-55f5-4885-bf6a-ba3af77ec70b`, « Bouendji VPN »).
- **Rien à voir avec un domaine non associé ou une protection d'accès** : ces
  deux points ne se posent pas encore, faute de déploiement.

## e) Incertain (à ne pas présenter comme vérifié)

- `vercel whoami` → `pneumapath1-2167`, équipe `freeteam5` : **est-ce le compte
  de l'utilisateur ?** Non établi. Si non, il faut un autre compte Vercel.
- Le dashboard **build-t-il sur Vercel** (Node 24, Next 16.4.2, `bun@1.3.14`,
  `cacheComponents`) ? Jamais essayé là-bas. Seul `next build` local est cité.
- L'accès **Cloudflare** pour créer le sous-domaine : D99 le disait manquant,
  D101 suggère que des enregistrements ont été créés depuis. Non vérifié.
- `apps.numzer0.store` : domaine R2 « Active » ou encore « Initializing » ?
  Non vérifié (D102/handoff).
- Le workflow `android-brand` est committé, mais le handoff le disait « non
  committé » : la mémoire est en retard sur le dépôt (constaté, pas corrigé).
- Les statuts de `dashboard-plan` § 3 datent d'avant l'arrivée des sous-agents
  `dash-*` : plusieurs écrans marqués « absent » ont désormais une page.
- L'URL `https://app.henshins.online` (projet Vercel `aura_stack`) redirige vers
  `https://henshins.online` : produit distinct, **pas** le dashboard VPN.

## Propositions pour les nœuds partagés (à intégrer par l'orchestrateur)

1. Nouveau nœud `10-infrastructure/dashboard-deploiement.md` : état « non
   déployé », preuves du tableau a), et la liste c) comme plan de déploiement.
2. `00-brief/handoff-2026-10-24.md` l. 74-75 : le point « déploiement Vercel »
   reste ouvert, mais le workflow `android-brand` est désormais committé.
3. `apps/dashboard/README.md` est en retard (liste « Non faits : forfaits,
   membres, comptes admin, fichier hors-ligne, builds, commissions » alors que
   les pages existent) ; à réaligner.
4. `dashboard-plan` § 3 : re-statuer les écrans après intégration des sous-agents
   `dash-*`.
5. Décider (question ouverte) du **nom du sous-domaine** du dashboard.

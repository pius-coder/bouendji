# Journal — dashboard-base-sonnet

## 2026-10-23T11:38:19Z · Création
- fait: charte créée
- portée: Implémenter apps/dashboard : BaseService OOP, services par groupe d'API, session, Server Actions, proxy.ts, squelette. Pas d'écrans métier. Propose, n'intègre pas.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-23T11:38:19Z · Lecture du contexte

- fait: Lu dashboard-ux, admin-access-flows, décisions D31-D81, admin.ts, contracts.ts, schemas.ts, contract/index.ts. Constat: packages/contract n'a AUCUN schéma zod (types TS seulement, partiellement périmés pour l'admin) ; openapi tags trop grossiers ('administration').
- etat: ok
- suite: Scaffolder apps/dashboard (create-next-app), lire docs Next installée

## 2026-10-23T12:47:05Z · Reprise : état réel vérifié

- fait: Scaffold create-next-app seul (Next 16.4.2, React 19.3.0, zod 3.25.76, pnpm i OK) : aucun BaseService/session/proxy/actions. Docs Next lues : refresh() (Server Actions only), CSRF natif (Origin vs Host, POST), cacheComponents => lecture cookies sous Suspense. API : enveloppe réelle {error:{code,message,details,retryAfter,requestId}} (http/schemas.ts), Idempotency-Key jamais lue par l'API (grep), DTO réels != openapi (devices: deviceId, users: name/locale, offline: {bundles}), openapi n'a qu'un tag 'administration' pour 38 routes.
- etat: ok
- suite: Écrire src/server/api (BaseService, erreurs, session, config), services par ressource, tests fake fetch

## 2026-10-23T13:03:58Z · BaseService, erreurs, session, 15 services

- fait: Écrits : src/server/api/{api-error,base-service,config,session}.ts ; src/server/services/*.service.ts (auth, communities, apps, plans, memberships, admins, subscribers, devices, offline-bundles, orders, commissions, payouts, network, audit, builds) + *.types.ts + index.ts (createServices/getServices). Tags admin(true|'key')/idempotent/paginate/timeout/revalidate ; revalidate interdit avec admin. Non encore vérifié (pas de typecheck lancé).
- etat: partiel
- suite: actions (auth + exemples), proxy.ts, layout/pages squelette, tests fake fetch, typecheck, build
- fichiers: apps/dashboard/src/server/**

## 2026-10-23T13:06:49Z · Décisions utilisateur : endpoints déclaratifs, zod, composants

- fait: Vérifié avant refonte : typecheck sans sortie, 17 tests BaseService passent, lint sans sortie (version à méthodes get/post à la main). Décisions reçues : (1) basePath par service ; (2) endpoint = chemin relatif + objet d'options, un seul process générique call(endpoint,input) ; (3) options : method, admin (auth), body/response/params/query (zod), paginate, idempotent, timeout, revalidate, refreshAfter (mutation) ; (4) validation zod côté Node avant tout appel API (tranche zod pour le dashboard, sans toucher packages/contract) ; (5) pages = composition de composants de src/components/, aucune logique d'affichage dans une page. Choix : un endpoint hors du dossier du service surcharge basePath (pas de chemin complet réécrit) ; refresh() de next/cache injecté via deps.afterMutation, déclenché par refreshAfter ; types .types.ts remplacés par .schema.ts (zod + z.infer).
- etat: ok
- suite: Réécrire base-service/endpoint, schémas zod, services, actions, composants, tests, build

## 2026-10-23T13:12:35Z · Refonte : noyau fait, services à réécrire

- fait: ÉTAT EXACT : écrits et à jour = src/server/api/{endpoint.ts (type Endpoint + endpoint() + CallInput/CallResult), base-service.ts (process générique call(), abstract basePath, validation zod params/query/body/response, refreshAfter via deps.afterMutation), schema-kit.ts, api-error.ts, config.ts, session.ts}. SUPPRIMÉS : tous les *.service.ts et *.types.ts de src/server/services (seul index.ts reste, obsolète). Tests test/base-service.test.ts encore à l'ancienne API (get/post), à réécrire. Actions (src/server/actions/*) et pages (src/app/*) encore à l'ancienne forme : appellent refresh() à la main, pages monolithiques.
- etat: partiel
- suite: 1) écrire services/*.schema.ts + *.service.ts (basePath + endpoints) 2) index.ts avec afterMutation=refresh 3) actions simplifiées 4) src/components/* + pages de composition 5) tests 6) typecheck, test, lint, build 7) README + rapport
- fichiers: apps/dashboard/src/server/api/*

## 2026-10-23T13:14:54Z · Services déclaratifs + actions réécrits

- fait: Écrits : 12 services (admin-auth, communities[+membres], plans[+apps], admins, subscribers, devices[+offline], orders[+commissions], payouts, network, audit, builds) avec basePath + endpoints {method,path relatif,params/query/body/response zod,paginate,idempotent,timeout,refreshAfter} ; *.schema.ts zod (bornes recopiées de admin.ts) ; index.ts avec afterMutation=refresh(). Actions simplifiées (validation = schéma du service). Non vérifié : typecheck/tests pas encore relancés depuis la refonte.
- etat: partiel
- suite: composants src/components + pages de composition, réécrire test/base-service.test.ts, typecheck/test/lint/build, README, rapport

## 2026-10-23T13:15:56Z · Consigne POO : patron de service

- fait: Reçu du coordinateur : méthodes de prototype (pas de champs fléchés), endpoints en private static readonly endpoints = {...} as const dans la classe, entrée par objet typé (type XInput = z.input<...>), noms verbes (login, getMe, listCommunities, createCommunity...). Corrigé aussi le typage CallInput/CallResult (infer sur les génériques d'Endpoint : l'ancien test E['params'] extends ZodTypeAny échouait, cause des erreurs tsc). Application à tous les services en cours.
- etat: partiel
- suite: réécrire les 11 services au patron, adapter actions/session-section (getMe), réécrire tests, typecheck/test/lint/build, README, rapport

## 2026-10-23T13:17:45Z · Patron POO appliqué à tous les services

- fait: BaseService(deps, config{basePath,admin?}) protected readonly ; 11 services réécrits : constructeur explicite, private static readonly endpoints, méthodes de prototype à entrée objet, verbes (login/getMe, listCommunities, createCommunity..., revokeDevice, issueOfflineBundle, preparePayout, setEndpointHealth, listAuditEntries, triggerBuild). Actions et session-section adaptées. tsc : plus d'erreur dans src/, restent celles de test/base-service.test.ts (ancienne API).
- etat: partiel
- suite: réécrire tests (sonde + vrais services), typecheck, test, lint, build, README, rapport

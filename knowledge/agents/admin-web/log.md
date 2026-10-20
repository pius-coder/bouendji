# Journal — admin-web

## 2026-10-20T17:42:30Z · Création
- fait: charte créée
- portée: Porter le dashboard en Next.js (App Router, TypeScript), export statique sous basePath /admin, servi par l API. Mêmes écrans, mêmes contrôles, mêmes garde-fous que apps/admin-legacy. Ne touche pas apps/api.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-20T19:06:24Z · Verification orchestrateur apres crash reseau

- fait: sous-agent mort (UNKNOWN_CERTIFICATE_VERIFICATION_ERROR) apres avoir ecrit app/, components/ et lib/ ; orchestrateur : typecheck exit 0, next build exit 0, out/ exporte, /admin/ 200, css 200, login 200 owner, /v1/admin/{me,pool,audit-log,communities} 200 ; script start inexistant retire
- etat: ok
- suite: aucun ; QA navigateur non faite (pas de Playwright)

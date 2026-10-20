# Journal — api-bundle

## 2026-10-20T15:02:56Z · Création
- fait: charte créée
- portée: Écrire les routes d authentification, d enrôlement d appareil, de tirage de bundle chiffré et de profil. Tests verts. Ne pas modifier app.ts.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-20T15:30:43Z · Routes auth, devices, bundle, me

- fait: Écrit routes/me.ts (gardes requireSession/requireBoundDevice, loadEntitlement, quota), routes/auth.ts (register/login/refresh rotatif/logout), routes/devices.ts (challenge, enrôlement 2 clés EC P-256, liste, révocation), routes/bundle.ts (enveloppe scellée, ETag, cache bundles)
- etat: partiel
- suite: typecheck puis tests auth.test.ts et bundle.test.ts

## 2026-10-20T16:49:14Z · Rapport et clôture

- fait: Rapport écrit (routes, formes exactes, enveloppe scellée, 18 tests, écarts contrat) ; tsc --noEmit exit 0 ; 18/18 tests verts ; test/support.ts ne doit plus enregistrer de routes
- etat: ok
- suite: clôture

## 2026-10-20T16:49:28Z · CLÔTURE
4 modules de routes + 2 suites (18 tests verts, tsc 0). Rapport: knowledge/agents/api-bundle/notes/rapport.md. Ecarts: /v1/devices/challenges vs /v1/device-challenges, enveloppe ECDH P-256 au lieu de JWE RSA, inscription sans verify-email, appareil d'autrui en 403, abonnement en 402, refresh non rejouable 5 min.

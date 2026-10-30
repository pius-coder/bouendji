# Journal — audit-android-engine

## 2026-10-29T19:06:03Z · Création
- fait: charte créée
- portée: Audit en lecture seule de lapp Android, axe : Moteur libbox sing-box et configuration TUN. Ne modifie aucun fichier de code.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-29T19:59:14Z · Lecture du périmètre moteur

- fait: Lu LibboxTunnelEngine.kt, LibboxPlatform.kt, TunnelEngine.kt, SingBoxConfig.kt, VpnTunnelService.kt, build.gradle.kts, build-libbox.ps1
- etat: ok
- suite: Confronter le JSON à la doc sing-box 1.14

## 2026-10-29T19:59:14Z · Validation JSON sing-box 1.14

- fait:  Champ par champ: tun, dns https/local, sniff/hijack-dns, final, default_domain_resolver, selector/urltest/vless/direct, clash_api valides en 1.14. Défaut P0 identifié: dns-local sans LocalDNSTransport Android.
- etat: ok
- suite: Vérifier IPv6, fd TUN, API Clash et changement de réseau

## 2026-10-29T19:59:14Z · IPv6, fd, Clash, réseau

- fait: IPv6 non routé (fuite); libbox duplique le fd (pas de double close); onLost efface l'interface par défaut; port Clash en course fait échouer le démarrage; première sonde à froid => NO_CONNECTION 30s.
- etat: ok
- suite: Écrire la note et clôturer

## 2026-10-29T19:59:14Z · CLOTURE partielle

- fait: Note audit.md écrite (verdict, P0/P1/P2/P3, réponses Q1-Q7, non examiné). Aucun build, AAR absent, rien exécuté. Analyse arrêtée sur ordre du temps imparti.
- etat: partiel
- suite: Prioriser le correctif DNS local, IPv6 et le moniteur réseau; compiler et tester sur Pixel 8.

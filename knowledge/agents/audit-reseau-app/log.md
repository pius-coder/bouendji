# Journal — audit-reseau-app

## 2026-10-30T06:32:39Z · Création
- fait: charte créée
- portée: Audit en lecture seule du flux reseau, axe : App verdicts clients et remonte de sante. Ne modifie aucun fichier de code.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-30T06:36:13Z · Lecture charte + decisions D47/D50/D63/D64/D145 + audit android 2026-10-29

- fait: Charte lue ; decisions.md lignes 338-351, 384-387, 845-860 lues ; android-audit-2026-10-29 relu (P0 #1 cleartext = contexte clef de la boucle)
- etat: ok
- suite: Lire le code app : VpnTunnelService, UsageMeter, LibboxTunnelEngine, ApiClient, AppController
- fichiers: knowledge/00-brief/decisions.md,30-clients/android-audit-2026-10-29.md

## 2026-10-30T06:36:19Z · Code app lu : chaine sonde->rapport

- fait: VpnTunnelService.kt:567-586 (probeAll rapporte TOUS les noeuds, :574 meter.report), :530-561 (supervise/backoff 30s-2min-10min), UsageMeter.kt:66-89 (file 200, lots 20, requeue reseau), ApiClient.kt:286-289,595-598 (DTO ConfigReportDto/TelemetryRequest), :92+519 (flush 60s), :411 (flush teardown). AppController.kt:796-844 : testLatency TCP direct ne produit AUCUN rapport serveur (ServerBus only)
- etat: ok
- suite: Lire le cote serveur : telemetry.ts + health.ts + servedEndpoints
- fichiers: apps/android/app/src/main/java/cm/bouendji/vpn/vpn/VpnTunnelService.kt,apps/android/app/src/main/java/cm/bouendji/vpn/vpn/UsageMeter.kt,apps/android/app/src/main/java/cm/bouendji/vpn/net/ApiClient.kt,apps/android/app/src/main/java/cm/bouendji/vpn/ui/AppController.kt

## 2026-10-30T06:36:27Z · Code serveur lu : verdicts et service

- fait: telemetry.ts:110-189 (device_id session, reported_at=now, configId inconnu=400 lot entier, verdict apres insertion + reconcileDeviceWitnesses), health.ts:31-52 (fenetre 10min, DOWN_QUORUM=3, WITNESS_FAILURES=2, PROBATION=30min), :72-86 (decideHealth), :117-136 (setHealth, down_since, D48), endpoints.ts:503-521 (servedEndpoints exclut down), :481 (heartbeat ne leve jamais un down, D47)
- etat: ok
- suite: Rediger notes/audit.md avec verdict, tableau chaine, P0/P1/P2, reponses Q1-Q8
- fichiers: apps/api/src/routes/telemetry.ts,apps/api/src/services/health.ts,apps/api/src/services/endpoints.ts

## 2026-10-30T06:36:34Z · CLÔTURE — audit flux reseau axe app

- fait: Audit livre dans notes/audit.md. Verdict : la chaine sonde->rapport->verdict->sante est conforme D47/D50/D63/D64 mais l'app n'attribue jamais un echec local au client (VpnTunnelService.kt:574) : tout echec de mesure vise le noeud. Q8 (boucle) = OUI et prouve par le code : tunnel sans sortie ou API Clash cassee -> ok=false sur TOUS les noeuds par probeAll en boucle -> 3 appareils distincts (health.ts:34,81-83) -> down partout -> servedEndpoints exclut down (endpoints.ts:514) -> bundles vides -> plus de tunnel -> plus de sondes ; retour seulement apres 30 min de probation + quorum de 3 succes via les vieux coffres. 2 P0, 3 P1, 1 P2 documentes. Verifie : lecture code fichier:ligne, aucun test execute. Incertain : ampleur reelle en prod, volumes runtime
- etat: ok
- suite: Orchestrateur : trancher O1 (conditionner les rapports d'echec a un probeSelector reussi) et O2 (ignorer les appareils ou tout echoue) ; Aucune modif code faite (lecture seule)
- fichiers: knowledge/agents/audit-reseau-app/notes/audit.md

# Audit performance / batterie / données — app Android

Statut : **partiel** (analyse interrompue sur ordre de l'orchestrateur, 2026-10-29).
Lecture seule, aucun build, aucune mesure sur appareil. Tout ce qui n'est pas
mesuré est marqué (estimation) ou (non vérifié).

## Verdict provisoire

L'app fait payer à l'utilisateur, en données et en batterie, le fonctionnement
de son propre mécanisme de surveillance. Trois causes se cumulent :

1. **écriture chiffrée + `commit()` trois fois par seconde** dans `UsageMeter` ;
2. **sondes HTTPS répétées** (selector 30 s, urltest 3 min × N nœuds) dont le
   trafic est compté dans le quota de l'utilisateur ;
3. **APK universel de 253 Mo** (94,7 % de bibliothèques natives), dont 85,5 Mo
   pour un ABI x86_64 qui ne sert qu'aux émulateurs.

Sur un forfait limité de 1 Go, une session laissée connectée 24 h/24 consomme
environ **77 Mo/jour** de trafic de sonde (estimation) : le forfait serait épuisé
en ~13 jours **sans aucune navigation**. C'est le point le plus grave pour le
Cameroun.

## Coût réseau (N = 13 nœuds, sélection `auto`, tunnel sain)

Hypothèse centrale : **8 Ko par sonde** (estimation : TLS vers le nœud + TLS
vers gstatic à travers le tunnel, sans reprise de session ; plage 5–12 Ko).

| Source | Déclencheur (fichier:ligne) | Fréquence | Req/h | Mo/h | Mo/j (24 h) |
|---|---|---|---|---|---|
| Sonde du selector | `VpnTunnelService.kt:463-467` → `:477-478` → `LibboxTunnelEngine.kt:110-113` | 30 s | 120 | 0,96 | 23 |
| `urltest` sur 13 sorties | `SingBoxConfig.kt:255-264` (`interval=3m`, 13 tags) | 3 min × 13 | 260 | 2,08 | 50 |
| `probeAll` au démarrage | `VpnTunnelService.kt:451` → `:481-500` | 13/start | 13 | 0,10 | 2,5 (1 reconnexion D25/h) |
| `probeAll` à chaque failover | `VpnTunnelService.kt:507-510` | 13/failover | — | 0,10/failover | — |
| Télémétrie | `VpnTunnelService.kt:432-433` (60 ticks) → `UsageMeter.kt:60-65` → `ApiClient.kt:279` | 60 s | 60 | 0,03–0,36 | 0,7–8,6 |
| `/connections` | `VpnTunnelService.kt:416-435` → `LibboxTunnelEngine.kt:129-135` | 1 s | 3 600 (loopback) | 0 | 0 |
| **Total** | | | **~453 traversant le nœud** | **~3,2–3,5** | **~77–84** |

Requêtes loopback en plus : ~3 600 `/connections` + ~380 `/delay` + 120–240
`/proxies` par heure.

Conséquences :

- **13 nœuds** : 380 sondes actives/h + 13 par cycle `probeAll`, soit ~91 Ko par
  cycle ; 4 en parallèle = 4 vagues, 1–3 s sain, jusqu'à 20 s si tout échoue
  (timeout 5 s × 4 vagues).
- **50 nœuds** (plafond D143) : `urltest` = 1 000 sondes/h → ~8 Mo/h, ~200 Mo/j.
  Le coût croît linéairement avec la taille du bundle. Non soutenable.
- Le trafic des sondes passe par le tunnel et est compté par
  `trafficTotals()` (`/connections`, totaux globaux) puis par `UsageMeter` :
  l'app se facture à elle-même dans le quota. Côté 3x-ui, le quota du client
  compte aussi ces octets.
- Un démarrage dont la première sonde échoue fait **deux `probeAll`** :
  `failover()` (`:510`) puis `probeAll()` inconditionnel (`:451`) = 26 sondes,
  ~208 Ko et jusqu'à 40 s avant le premier état honnête.

## Défauts

### P0

1. **`UsageMeter` : 3 écritures chiffrées + 3 `commit()` par seconde.**
   `VpnTunnelService.kt:430` appelle `onTotals` chaque seconde ;
   `UsageMeter.kt:23-33` fait `rollDay()` (1 déchiffrement) puis 3 ×
   `get` + `put` (`:30-32`) ; chaque `put` = AES-GCM Keystore + réécriture
   complète des `SharedPreferences` + fsync (`SecureStore.kt:87-98`, `:94`).
   → ~21 600 opérations Keystore/h et **10 800 fsync/h** ; le fichier réécrit
   contient aussi le coffre et les jetons (amplification d'écriture de l'ordre
   de 100 Mo/h, estimation). Batterie + usure flash + jank.
   Correctif : compteurs en mémoire, persistance toutes les 30–60 s et au
   `teardown`, `apply()` ou DataStore non chiffré pour les compteurs.

2. **APK universel de 253 Mo, dont 239,6 Mo de `.so` non compressés.**
   Mesuré sur `app/build/outputs/apk/debug/app-debug.apk` (252 999 899 o) :
   arm64 81,1 Mo, armeabi-v7a 73,0 Mo, **x86_64 85,5 Mo** (33,8 %), dex 27,1 Mo
   brut, images 1,8 Mo. `build.gradle.kts:82-85` ne définit ni `abiFilters` ni
   `splits`. Release estimé ~245 Mo. Sans x86_64 : ~167 Mo (−34 %) ; avec split
   ABI arm/arm64 : ~81–89 Mo par appareil (−65 %). Le `.so` est déjà strippé ;
   les tags de build embarqués incluent openvpn, openconnect, tailscale, usbip,
   naive, quic, wireguard (vérifié dans les chaînes du binaire) → build libbox
   minimal à tester. Compression mesurée du `.so` arm64 : 34,5 % (27,99 Mo) ;
   compresser les natives ferait ~92 Mo à télécharger mais 253 Mo installés.
   D138 (arm/arm64) n'exige pas x86_64 ; le split ne casse D138 que si le lien
   unique ne sert pas le bon APK (D144) → prévoir un fallback universel.

### P1

3. **`/connections` chaque seconde : nouvelle connexion TCP loopback + parse
   JSON complet.** `LibboxTunnelEngine.kt:202-225` crée un
   `HttpURLConnection`, `disconnect()` (`:224`) à chaque appel, puis
   `JSONObject` du corps entier (`:132`) pour n'en garder que 2 totaux.
   3 600 cycles/h, 1 Hz de réveil, 10–60 Ko de JSON/s (estimation), churn
   mémoire. L'AAR expose pourtant `Libbox.newCommandClient`,
   `CommandClientHandler.writeStatus(StatusMessage)` (uplink/downlink/totaux) et
   `writeConnectionEvents` (`ConnectionEvent.uplinkDelta/downlinkDelta`) —
   vérifié par `javap` sur `app/libs/libbox.aar!/classes.jar`. À câbler.
   Sinon : polling 5 s + interpolation, et garder la connexion ouverte.

4. **Sondes HTTPS trop fréquentes et mal coalescées.** `PROBE_INTERVAL_MS=30 s`
   (`:83`), `urltest 3m` (`SingBoxConfig.kt:262`) sur un URL HTTPS. Chaque
   sonde refait TLS vers le nœud puis vers gstatic. Un URL HTTP
   (`generate_204`) diviserait les octets par ~2–3. `urltest` teste tous les
   nœuds même si l'utilisateur a choisi un serveur fixe (l'`auto` reste créé,
   `SingBoxConfig.kt:191-192` et `:255-264`) ; `idle_timeout` par défaut 30 min
   peut l'arrêter ensuite (non vérifié sur appareil). `refreshActive` toutes les
   30 s ajoute 1–2 GET loopback (sans données).

5. **Boucle de trafic bloquée par la télémétrie.** `meter.flush(...)` est appelé
   **dans** la boucle 1 Hz (`VpnTunnelService.kt:433`), avant `delay(1_000)`
   (`:434`). `ApiClient` a un `callTimeout` de 30 s (`ApiClient.kt:92`) : sur
   réseau mort, l'échantillonnage et le compteur de secondes sont gelés jusqu'à
   30 s chaque minute. `UsageMeter.flush` doit être lancé dans un job séparé,
   avec single-flight.

6. **Démarrage : 1,1 s de splash artificiel + 5 appels séquentiels + lectures
   du coffre en double.** `AppController.kt:257` (`delay(1_100)`),
   `:282` (timeout 4 s), `:286-302` (plans → me → devices → subscription →
   bundle, séquentiels), `:341-368`. Le coffre est déchiffré au moins 4 fois
   avant connexion (`MainActivity.kt:51`, `AppController.kt:548-549`,
   `:366`, `:367`) et une 5e fois au `connectInternal`
   (`VpnTunnelService.kt:276`). `refresh.join()` (`:263`) retarde l'auto-connexion
   jusqu'à 4 s. Rotation d'écran : aucun `configChanges`
   (`AndroidManifest.xml:50-55`) → tout `boot()` + `refreshAll()` est rejoué.
   Paralléliser plans/me/devices/subscription, supprimer le delay, montrer
   l'écran avec le cache.

7. **UI : 3 recompositions/s sur Accueil + guilloché à 60 fps.**
   `Home.kt:95-98` (`now` 1 Hz), `:91`/`:103-112` (trafic + débit 1 Hz),
   `:209-242` lisent ces états dans le corps de `HomeScreen` → recomposition
   complète ~3×/s. `Guilloche(Guil.RING, spinSeconds=80)` (`:322-332`) anime en
   boucle 17 tracés × 721 points = **12 257 segments redessinés à chaque frame**
   (`Guilloche.kt:94-130`) même tunnel connecté et immobile. Sur un appareil
   d'entrée de gamme : GPU/CPU en continu, chauffe, jank. Isoler chrono/débit
   dans des composables enfants, arrêter l'animation quand l'écran est inactif,
   ou rotation via `graphicsLayer` (pas de re-tessellation).

8. **Liste des serveurs non lazy + 26 émissions par cycle de sonde.**
   `Servers.kt:222-232` utilise `Column`/`verticalScroll` (`Shell.kt:288-305`) :
   toutes les lignes sont composées et mesurées. `probeAll` fait 2
   `ServerBus.update` par nœud (`VpnTunnelService.kt:486-495`) = 26 émissions
   par cycle → jusqu'à 26 recompositions complètes de la liste pendant la
   connexion/bascule, au pire moment. `LazyColumn` + clés + mise à jour groupée.

### P2

9. **Keystore sur le thread principal au démarrage.** `VpnApplication.kt:29`
   construit `AppContainer` sur le main : `SecureStore.kt:50` et
   `DeviceKeys.kt:49` font chacune `KeyStore.load(null)`. Coût à froid
   (estimation 50–200 ms) avant la première frame.
10. **`commit()` sur le main à chaque choix de serveur.**
    `VpnTunnelService.kt:178` (`ACTION_SELECT`) écrit la préférence sur le main,
    alors que `AppController.kt:573` l'écrit déjà sur IO : double écriture,
    fsync sur le main.
11. **Lecture de 256 Ko sur le main à l'ouverture d'un `.bvpn`.**
    `MainActivity.kt:39`/`:97` → `ImportInbox.kt:24-38` lit le flux
    `ContentResolver` sur le main (ANR possible sur stockage lent/cloud).
12. **Timeout de 4 s qui n'annule pas les appels OkHttp.**
    `withTimeoutOrNull(4_000)` (`AppController.kt:282`) rend la main mais
    `execute()` (`ApiClient.kt:467`) continue jusqu'à 30 s ; les ouvertures
    répétées de l'onglet Serveurs (`:559-568`) peuvent empiler plusieurs
    rafales de 5 appels sur réseau lent.
13. **Chargement du moteur au démarrage pour rien.**
    `MainActivity.kt:50` appelle `Libbox.version()` → charge le `.so` de 81 Mo
    même si l'utilisateur ne se connecte pas (estimation 200–800 ms de cold
    start, pression mémoire/page cache).

### P3

14. Images PNG 1,8 Mo décodées en 800×731 (2,3 Mo heap chacune) : WebP/redimensionnement.
15. `Mascot` (`Intro.kt:113-119`) et `PermArt` (`Kit.kt:644-653`) ignorent
    `reduceMotion` et tournent en boucle.
16. `AnimatedContent` 320 ms compose deux écrans pendant la transition (`Shell.kt:157-171`).
17. `collectAsState` non lifecycle-aware (`Shell.kt:147`, `Home.kt:89-94`).

## Vérifié / incertain

**Vérifié par lecture ou mesure locale :**
- tailles APK/ABI/dex/images (fichier `app-debug.apk` présent, 253 Mo) ;
- ratio de compression du `.so` arm64 (34,5 %, mesuré par zlib) ;
- tags de build libbox et version Go 1.25.5 (chaînes du binaire) ;
- API `CommandClient`/`StatusMessage`/`ConnectionEvent` (javap sur l'AAR) ;
- chaînes d'appel et constantes citées (fichier:ligne) ;
- pas de `vault.read()`, `SingBoxConfig.build()` ni `Socket.connect` sur le main
  (hors Keystore/ImportInbox listés ci-dessus) — le gros du travail est sur
  IO/Default.

**Estimations :** 8 Ko/sonde (5–12), 3,2 Mo/h, 77 Mo/j, coûts CPU/batterie,
temps de démarrage, taille release ~245 Mo, gain d'un build libbox minimal.

**Non vérifié :** comportement réel d'`urltest` sur appareil (nombre exact de
sondes, `idle_timeout`), faisabilité du câblage `CommandClient` dans ce montage,
mesure batterie/radio réelle, taille et installation d'un APK release/split,
valeurs réelles de `max_session_seconds` du bundle (le `min` de
`SingBoxConfig.kt:316` peut imposer des reconnexions bien plus fréquentes que
55 min et multiplier les `probeAll`).

## Non examiné (interruption)

- `Plans.kt`, `Profile.kt`, `Auth.kt` au-delà de survol (animations, listes).
- `ThemeArt.kt` pour tous les thèmes autres que « billet ».
- Coût de la télémétrie côté serveur (1 440 requêtes/j/utilisateur).
- Politique de cache DNS (le cache sing-box est actif par défaut, 1024 entrées,
  donc pas de défaut retenu).
- Tests sur Pixel 8, `batterystats`, profilage Macrobenchmark, radio state.
- Interaction avec D25/D50/D141 et choix produit (fréquence de sonde vs
  vitesse de bascule).

## Recommandations chiffrées (ordre)

1. `UsageMeter` : persistance 30–60 s → **−99 %** des fsync/Keystore.
2. APK : retirer x86_64 du release (167 Mo), puis split arm/arm64 (81–89 Mo) ;
   tester un libbox sans openvpn/openconnect/tailscale/usbip/naive/quic/wireguard.
3. Sondes : intervalle selector 60–120 s, `urltest` 10–15 min (ou budget
   `N × 60/intervalle`), URL HTTP pour la latence → **−70 à −90 %** des octets.
4. `/connections` : `CommandClient` (`writeStatus`) ou polling 5 s → −80 % CPU.
5. UI : chrono/débit isolés, guilloché figé après 3 s ou à 15 fps, `LazyColumn`.
6. Démarrage : suppression du delay 1,1 s, appels parallèles, une seule lecture
   du coffre, réglages non chiffrés.
7. Corriger le double `probeAll` au démarrage et ne pas bloquer la boucle de
   trafic par `flush`.

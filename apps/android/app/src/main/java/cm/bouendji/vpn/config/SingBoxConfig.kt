package cm.bouendji.vpn.config

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import java.net.ServerSocket
import java.security.SecureRandom
import cm.bouendji.vpn.crypto.B64
import cm.bouendji.vpn.util.IsoTime

/* ------------------------------------------------------------------- modèle */

/**
 * Une configuration telle que le serveur l'envoie **à l'intérieur** du chiffré
 * (`BundleConfig`, `routes/bundle.ts:34`).
 *
 * `maxSessionSeconds` vient du serveur (D25, `env.ingest.reconnectAfterSeconds`)
 * et n'est jamais une constante de l'app. Le défaut ci-dessous n'existe que
 * pour un serveur antérieur au champ — il ne doit jamais servir.
 *
 * `toString()` masque l'URI : une data class qui se journalise est un incident
 * de sécurité en attente.
 */
@Serializable
data class BundleConfig(
    val id: String,
    val label: String,
    val uri: String,
    val expiresAt: String,
    val region: String = "",
    val maxSessionSeconds: Int = DEFAULT_MAX_SESSION_SECONDS,
) {
    override fun toString(): String =
        "BundleConfig(id=$id, label=$label, region=$region, expiresAt=$expiresAt, uri=<masqué>)"

    companion object {
        /** Repli seulement : la valeur réelle voyage dans le bundle. */
        const val DEFAULT_MAX_SESSION_SECONDS = 3_300
    }
}

/** Clair du bundle (`BundlePlaintext`, `routes/bundle.ts:39`). */
@Serializable
data class BundlePayload(
    val revision: Long,
    val issuedAt: String,
    val expiresAt: String,
    val configs: List<BundleConfig> = emptyList(),
) {
    fun expiresAtMs(): Long = parseInstant(expiresAt) ?: 0L
}

fun parseInstant(value: String): Long? = IsoTime.parseMs(value)

/* ------------------------------------------------------------------ une sortie */

/**
 * Sortie VLESS décodée. Champs strictement ceux que le serveur écrit
 * (`buildVlessUri`, `apps/api/src/lib/vless.ts:22`) :
 *
 *     vless://<uuid>@<hôte>:<port>?encryption=none&type=ws&security=tls
 *            &sni=…&fp=chrome&alpn=…&host=…&path=…[#libellé]
 *
 * Tout paramètre inconnu est ignoré ; une URI qui ne correspond pas à cette
 * forme est refusée plutôt que devinée.
 */
data class VlessEndpoint(
    val uuid: String,
    val host: String,
    val port: Int,
    val tls: Boolean,
    val sni: String?,
    val wsPath: String,
    val hostHeader: String?,
    val fingerprint: String?,
    val alpn: String?,
) {
    override fun toString(): String =
        "VlessEndpoint(host=$host, port=$port, tls=$tls, sni=$sni, path=$wsPath, uuid=<masqué>)"
}

/**
 * Construit la configuration sing-box **en mémoire**, à partir du bundle
 * déchiffré. Rien n'est écrit sur disque : l'appelant passe le JSON à
 * [cm.bouendji.vpn.vpn.TunnelEngine] et le jette.
 *
 * Forme produite (volontairement minimale : chaque clé non indispensable est une
 * supposition de plus sur une version de sing-box qui n'a jamais été testée ici) :
 *
 *   outbounds : selector « proxy » -> [auto, n1..nN]
 *               urltest  « auto »  -> [n1..nN]          (si ≥ 2 sorties)
 *               vless « nK »       -> une par configuration
 *               direct / block
 *   inbounds  : tun « tun-in »
 *   route     : final = proxy
 *
 * Toutes les configurations existent comme sorties dès le départ : basculer,
 * c'est déplacer le selector, pas recharger la configuration (nœud
 * `singbox-engine`). D'où l'usage du `urltest` pour classer, et de l'API Clash
 * pour tester **une** sortie sans interrompre le trafic.
 */
object SingBoxConfig {

    const val SELECTOR_TAG = "proxy"
    const val AUTO_TAG = "auto"
    const val TUN_TAG = "tun-in"

    /** Préfixe des tags de sortie : n1, n2, … (jamais le libellé, qui peut contenir n'importe quoi). */
    private const val NODE_PREFIX = "n"

    val URI_REGEX = Regex("^vless://([^@]+)@(\\[[^\\]]+\\]|[^:/?#]+):(\\d+)\\?([^#]*)(?:#(.*))?$")

    /** Options TUN : la moitié non vérifiable sans `libbox` (voir TODO dans TunnelEngine.kt). */
    data class TunOptions(
        val address: String = "172.19.0.1/30",
        val mtu: Int = 1500,
        val stack: String = "system",
        val autoRoute: Boolean = false,
    )

    data class TunnelPlan(
        /** JSON complet, à garder uniquement en mémoire. */
        val json: String,
        val nodeTags: List<String>,
        /** `configIds[i]` est l'identifiant serveur (`endpoints.id`) de la sortie `nodeTags[i]` : clé de la télémétrie. */
        val configIds: List<String>,
        /**
         * D67, échéance « douce » : la première configuration qui expire. À
         * cette heure on retire le bundle et on reconstruit, **sans** vider le
         * coffre ni annoncer d'expiration.
         */
        val nextConfigExpiryMs: Long,
        /**
         * Échéance de l'enveloppe = `min(fin des droits, dernière config)` (D49).
         * Seule une fin de droits confirmée y provoque « expiré » (D67).
         */
        val bundleExpiresAtMs: Long,
        /** Reconnexion préventive : `maxSessionSeconds - 60` (D25). */
        val reconnectAfterSeconds: Int,
        val clashApiPort: Int?,
        val clashApiSecret: String?,
        val droppedExpired: Int,
    )

    /**
     * @return `null` si aucune configuration n'est utilisable (toutes expirées
     *   ou illisibles). L'appelant doit alors afficher « aucune connexion
     *   disponible » — jamais « protégé ».
     */
    fun build(
        payload: BundlePayload,
        nowMs: Long = System.currentTimeMillis(),
        tun: TunOptions = TunOptions(),
        exposeClashApi: Boolean = true,
    ): TunnelPlan? {
        val usable = payload.configs.mapNotNull { config ->
            val expiry = parseInstant(config.expiresAt) ?: return@mapNotNull null
            if (expiry <= nowMs) return@mapNotNull null
            val endpoint = parseVless(config.uri) ?: return@mapNotNull null
            Triple(config, endpoint, expiry)
        }
        if (usable.isEmpty()) return null

        val dropped = payload.configs.size - usable.size
        val nodeTags = usable.indices.map { "$NODE_PREFIX${it + 1}" }

        val clashPort = if (exposeClashApi) pickLoopbackPort() else null
        val clashSecret = if (clashPort != null) randomSecret() else null

        val json = buildJsonObject {
            putJsonObject("log") {
                put("level", "warn")
                put("timestamp", true)
            }

            putJsonArray("inbounds") {
                add(
                    buildJsonObject {
                        put("type", "tun")
                        put("tag", TUN_TAG)
                        putJsonArray("address") { add(tun.address) }
                        put("mtu", tun.mtu)
                        put("stack", tun.stack)
                        put("auto_route", tun.autoRoute)
                        put("strict_route", false)
                        // Sniffing : sans lui, un nom d'hôte dans le tunnel part
                        // en adresse IP et les règles DNS ne servent à rien.
                        put("sniff", true)
                    },
                )
            }

            putJsonArray("outbounds") {
                // 1. Le selector que l'app déplace pour basculer.
                add(
                    buildJsonObject {
                        put("type", "selector")
                        put("tag", SELECTOR_TAG)
                        putJsonArray("outbounds") {
                            if (nodeTags.size >= 2) add(AUTO_TAG)
                            nodeTags.forEach { add(it) }
                        }
                        put("default", if (nodeTags.size >= 2) AUTO_TAG else nodeTags.first())
                    },
                )

                // 2. Le classement automatique, si plusieurs sorties.
                if (nodeTags.size >= 2) {
                    add(
                        buildJsonObject {
                            put("type", "urltest")
                            put("tag", AUTO_TAG)
                            putJsonArray("outbounds") { nodeTags.forEach { add(it) } }
                            put("url", "https://www.gstatic.com/generate_204")
                            put("interval", "3m")
                            put("tolerance", 80)
                        },
                    )
                }

                // 3. Une sortie par configuration du bundle.
                usable.forEachIndexed { index, (config, endpoint, _) ->
                    add(vlessOutbound(nodeTags[index], config, endpoint))
                }

                // 4. Les deux sorties attendues par sing-box.
                add(
                    buildJsonObject {
                        put("type", "direct")
                        put("tag", "direct")
                    },
                )
                add(
                    buildJsonObject {
                        put("type", "block")
                        put("tag", "block")
                    },
                )
            }

            putJsonObject("route") {
                put("final", SELECTOR_TAG)
                // Sans cela, un changement de réseau peut laisser sing-box
                // attaché à une interface morte.
                put("auto_detect_interface", true)
            }

            if (clashPort != null) {
                putJsonObject("experimental") {
                    putJsonObject("clash_api") {
                        // Boucle locale uniquement : le port n'est joignable que
                        // depuis l'appareil, et le secret est tiré par build.
                        put("external_controller", "127.0.0.1:$clashPort")
                        put("secret", clashSecret!!)
                    }
                }
            }
        }

        val maxSession = usable.minOf { it.first.maxSessionSeconds.coerceAtLeast(120) }
        val lastConfig = usable.maxOf { it.third }
        val envelope = payload.expiresAtMs().takeIf { it > 0 } ?: lastConfig

        return TunnelPlan(
            json = json.toString(),
            nodeTags = nodeTags,
            configIds = usable.map { it.first.id },
            nextConfigExpiryMs = usable.minOf { it.third },
            bundleExpiresAtMs = minOf(envelope, lastConfig),
            // D25 : se reconnecter avant la coupure imposée, pas au moment où
            // elle arrive. 60 s de marge, jamais moins de 60 s de session.
            reconnectAfterSeconds = (maxSession - 60).coerceAtLeast(60),
            clashApiPort = clashPort,
            clashApiSecret = clashSecret,
            droppedExpired = dropped,
        )
    }

    /** Une sortie VLESS-over-WS, TLS optionnel. */
    private fun vlessOutbound(tag: String, config: BundleConfig, endpoint: VlessEndpoint): JsonObject =
        buildJsonObject {
            put("type", "vless")
            put("tag", tag)
            put("server", endpoint.host)
            put("server_port", endpoint.port)
            put("uuid", endpoint.uuid)
            put("packet_encoding", "xudp")

            putJsonObject("transport") {
                put("type", "ws")
                put("path", endpoint.wsPath)
                // L'en-tête Host doit être celui routé par le proxy/CDN en
                // amont, pas le nom résolu : le serveur l'écrit dans `host`.
                val hostHeader = endpoint.hostHeader ?: endpoint.sni
                if (hostHeader != null) {
                    putJsonObject("headers") { put("Host", hostHeader) }
                }
            }

            if (endpoint.tls) {
                putJsonObject("tls") {
                    put("enabled", true)
                    put("server_name", endpoint.sni ?: endpoint.host)
                    // Le paramètre `alpn` de l'URI est une liste séparée par des
                    // virgules ; sing-box attend un tableau.
                    endpoint.alpn?.split(',')?.map { it.trim() }?.filter { it.isNotEmpty() }?.let { list ->
                        if (list.isNotEmpty()) putJsonArray("alpn") { list.forEach { add(it) } }
                    }
                    // uTLS : même empreinte TLS qu'un navigateur, sinon un
                    // filtrage sur la poignée de main suffit à bloquer le nœud.
                    endpoint.fingerprint?.let { fingerprint ->
                        putJsonObject("utls") {
                            put("enabled", true)
                            put("fingerprint", fingerprint)
                        }
                    }
                }
            }

            // `label` et `id` ne sont pas transmis à sing-box : ils servent à
            // l'UI et au journal, pas au moteur.
            put("domain_strategy", "prefer_ipv4")
            put("connect_timeout", "10s")
        }

    /* ------------------------------------------------------------- analyse URI */

    /**
     * Décodage strict. Refuse tout ce qui n'est pas la forme écrite par le
     * serveur : mieux vaut une sortie en moins qu'une sortie inventée.
     */
    fun parseVless(uri: String): VlessEndpoint? {
        val match = URI_REGEX.matchEntire(uri.trim()) ?: return null
        val uuid = match.groupValues[1]
        val rawHost = match.groupValues[2].removePrefix("[").removeSuffix("]")
        val port = match.groupValues[3].toIntOrNull() ?: return null
        if (uuid.isEmpty() || rawHost.isEmpty() || port !in 1..65535) return null

        val params = parseQuery(match.groupValues[4])
        val security = params["security"]?.lowercase() ?: "none"
        val transport = params["type"]?.lowercase() ?: "tcp"
        if (transport != "ws") return null
        if (params["encryption"] != null && params["encryption"] != "none") return null

        val tls = security == "tls" || security == "reality"
        if (security == "reality") return null // non produit par le serveur, non supporté ici

        val path = params["path"]?.takeIf { it.startsWith("/") } ?: "/"

        return VlessEndpoint(
            uuid = uuid,
            host = rawHost,
            port = port,
            tls = tls,
            sni = params["sni"] ?: params["host"],
            wsPath = path,
            hostHeader = params["host"],
            fingerprint = params["fp"],
            alpn = params["alpn"],
        )
    }

    private fun parseQuery(raw: String): Map<String, String> {
        if (raw.isEmpty()) return emptyMap()
        val out = LinkedHashMap<String, String>()
        for (pair in raw.split('&')) {
            if (pair.isEmpty()) continue
            val index = pair.indexOf('=')
            val key = if (index < 0) pair else pair.substring(0, index)
            val value = if (index < 0) "" else pair.substring(index + 1)
            out[java.net.URLDecoder.decode(key, "UTF-8")] =
                java.net.URLDecoder.decode(value, "UTF-8")
        }
        return out
    }

    /* ----------------------------------------------------------------- loopback */

    /**
     * Port libre sur la boucle locale pour l'API Clash. Le port est fermé
     * aussitôt puis réutilisé par sing-box : une course est possible mais
     * étroite, et la conséquence serait un test de latence indisponible, jamais
     * un tunnel cassé.
     */
    private fun pickLoopbackPort(): Int =
        runCatching {
            ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1")).use { it.localPort }
        }.getOrDefault(DEFAULT_CLASH_PORT)

    private fun randomSecret(): String {
        val bytes = ByteArray(18)
        SecureRandom().nextBytes(bytes)
        return B64.encodeUrl(bytes)
    }

    private const val DEFAULT_CLASH_PORT = 20_990

    /** Sérialise le modèle local : utilisé par le stockage chiffré, jamais par l'API. */
    val BUNDLE_JSON: Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        encodeDefaults = true
    }
}

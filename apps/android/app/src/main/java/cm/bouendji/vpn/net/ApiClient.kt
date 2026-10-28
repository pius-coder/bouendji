package cm.bouendji.vpn.net

import android.os.Build
import cm.bouendji.vpn.config.BundlePayload
import cm.bouendji.vpn.crypto.DeviceEnvelope
import cm.bouendji.vpn.crypto.DeviceKeys
import cm.bouendji.vpn.crypto.SecureStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Headers
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.concurrent.TimeUnit

/**
 * Client HTTP signé.
 *
 * Ce fichier est le miroir de `apps/api/src/lib/auth.ts` et des fichiers de
 * `apps/api/src/routes`. Il
 * n'invente aucun en-tête, aucune route, aucun code d'erreur :
 *
 *   en-têtes  `X-App-Id`, `User-Agent: vpn-android` (contrat leurre, D43),
 *             `X-Device-Token`, `X-Device-Timestamp`, `X-Device-Nonce`,
 *             `X-Device-Signature` (`verifyDeviceProof`, lignes 123-156)
 *   erreurs   enveloppe `{ error: { code, message, details?, retryAfter? } }`
 *   routes    `/v1/devices/challenges`, `/v1/devices/enroll`, `/v1/auth/login`,
 *             `/v1/me`, `/v1/me/subscription`, `/v1/me/devices`,
 *             `/v1/configuration-bundles/current`
 *
 * Trois règles de conduite :
 *
 * 1. **On signe les octets envoyés.** Le corps est sérialisé une fois en
 *    `String`, haché, signé, puis envoyé tel quel. Re-sérialiser après coup
 *    ferait diverger l'ordre des champs et la signature serait refusée.
 * 2. **L'URL de base ne porte pas de chemin.** Le serveur signe `req.url`, donc
 *    `/v1/me` ; un préfixe (`https://hôte/api`) produirait une signature valide
 *    pour un chemin que le serveur ne voit jamais. On refuse au démarrage.
 * 3. **Un seul rejeu maximum.** Sur `401 UNAUTHENTICATED`, on rafraîchit la
 *    session une fois puis on réessaie, avec un **nonce neuf** (le serveur
 *    mémorise les nonces : rejouer le même donnerait « Requête rejouée »).
 */
class ApiClient(
    baseUrl: String,
    private val appId: String,
    private val auth: DeviceAuth,
    private val keys: DeviceKeys,
    private val store: SecureStore,
    private val http: OkHttpClient = defaultHttpClient(),
    private val json: Json = JSON,
) {

    companion object {
        private val JSON_MEDIA = "application/json; charset=utf-8".toMediaType()

        val JSON: Json = Json {
            ignoreUnknownKeys = true
            explicitNulls = false
            encodeDefaults = true
        }

        /**
         * `POST` sans données : OkHttp refuse un corps nul pour ces méthodes, et
         * un `application/json` vide fait échouer le parseur du serveur. On
         * envoie donc `{}` — et c'est **ce texte** qui entre dans la signature,
         * puisque le serveur hache le corps brut qu'il a reçu.
         */
        private const val EMPTY_JSON = "{}"

        private val BODY_METHODS = setOf("POST", "PUT", "PATCH")

        private const val KEY_ACCESS_TOKEN = "auth.accessToken"
        private const val KEY_REFRESH_TOKEN = "auth.refreshToken"
        private const val KEY_ACCESS_EXPIRES = "auth.accessExpiresAt"
        private const val KEY_BUNDLE_ETAG = "bundle.etag"

        fun defaultHttpClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .writeTimeout(20, TimeUnit.SECONDS)
            .callTimeout(30, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()

        /** Le bundle est scellé avec la clé AGREE : sans ECDH, rien n'est déchiffrable. */
        fun canOpenBundles(): Boolean = DeviceKeys.supportsAgreement()
    }

    /** URL de base validée : https, pas de chemin, pas de query. */
    val baseUrl: String = normalizeBaseUrl(baseUrl)

    /* --------------------------------------------------------------- session */

    fun accessToken(): String? = store.getString(KEY_ACCESS_TOKEN)

    fun refreshToken(): String? = store.getString(KEY_REFRESH_TOKEN)

    fun saveSession(session: SessionResponse) {
        store.putString(KEY_ACCESS_TOKEN, session.accessToken)
        store.putString(KEY_REFRESH_TOKEN, session.refreshToken)
        store.putString(KEY_ACCESS_EXPIRES, session.accessExpiresAt)
        store.remove(KEY_BUNDLE_ETAG)
    }

    fun hasSession(): Boolean = accessToken() != null || refreshToken() != null

    fun clearSession() {
        store.remove(KEY_ACCESS_TOKEN)
        store.remove(KEY_REFRESH_TOKEN)
        store.remove(KEY_ACCESS_EXPIRES)
        store.remove(KEY_BUNDLE_ETAG)
    }

    /* ------------------------------------------------------------------ routes */

    /**
     * Enrôlement en deux temps, tel que l'exige le serveur : un challenge
     * public fixe le nonce, puis la clé SIGN prouve sa possession en signant la
     * forme canonique de la requête d'enrôlement avec **ce** nonce
     * (`routes/devices.ts:149`).
     */
    suspend fun enroll(
        deviceName: String,
        appVersion: String,
        androidVersion: Int = Build.VERSION.SDK_INT,
        integrityToken: String? = null,
    ): EnrollResponse {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            keys.ensureAgreementKey()
        } else {
            throw ApiException(
                status = 0,
                code = ApiCodes.DEVICE_PROOF_INVALID,
                message = "Cet appareil (Android ${Build.VERSION.SDK_INT}) ne peut pas générer de clé " +
                    "d'accord : l'enrôlement exige Android 12 ou plus récent.",
            )
        }
        keys.ensureSigningKey()

        val installationId = auth.installationId()
        val challenge = challenge("enroll")

        val payload = EnrollRequest(
            challengeId = challenge.challengeId,
            installationId = installationId,
            deviceName = deviceName,
            platform = "android",
            signingKey = keys.signingPublicKeySpkiB64(),
            agreementKey = keys.agreementPublicKeySpkiB64(),
            appVersion = appVersion,
            androidVersion = androidVersion,
            integrityToken = integrityToken,
        )
        val body = json.encodeToString(EnrollRequest.serializer(), payload)

        val proof = auth.proof(
            method = "POST",
            path = ApiPaths.ENROLL,
            body = body,
            nonceOverride = challenge.nonce,
        )

        val headers = buildMap {
            putAll(proof.asHeaders())
            // À ce stade l'appareil n'existe pas encore côté serveur : le jeton
            // est absent, et la route ne le demande pas.
            auth.deviceToken()?.let { put(HEADER_DEVICE_TOKEN, it) }
        }

        val response = send(
            method = "POST",
            path = ApiPaths.ENROLL,
            body = body,
            bearer = null,
            extraHeaders = headers,
            requireDeviceToken = false,
        )
        val parsed = decode(response, "enrôlement", EnrollResponse.serializer())
        auth.rememberDevice(parsed.deviceId, parsed.deviceToken)
        auth.syncClock(parsed.serverTime)
        return parsed
    }

    /** Challenge public — aucun droit, aucun en-tête requis. */
    suspend fun challenge(purpose: String): ChallengeResponse {
        val body = json.encodeToString(
            ChallengeRequest.serializer(),
            ChallengeRequest(installationId = auth.installationId(), purpose = purpose),
        )
        val response = send(
            method = "POST",
            path = ApiPaths.CHALLENGES,
            body = body,
            bearer = null,
            extraHeaders = emptyMap(),
            requireDeviceToken = false,
        )
        val parsed = decode(response, "challenge", ChallengeResponse.serializer())
        auth.syncClock(parsed.serverTime)
        return parsed
    }

    /** Inscription. Exige un appareil enrôlé (jeton + preuve). */
    suspend fun register(
        appId: String,
        email: String? = null,
        password: String,
        name: String,
        phone: String,
        locale: String? = null,
        referralCode: String? = null,
    ): SessionResponse {
        val body = json.encodeToString(
            RegisterRequest.serializer(),
            RegisterRequest(
                appId = appId,
                email = email,
                password = password,
                name = name,
                phone = phone,
                locale = locale,
                referralCode = referralCode?.trim()?.takeIf { it.isNotEmpty() },
            ),
        )
        val session = decode(authed("POST", ApiPaths.REGISTER, body, bearer = null), "inscription", SessionResponse.serializer())
        saveSession(session)
        return session
    }

    /** D53 : `appId` lève l'ambiguïté d'une même adresse sur deux marques. */
    suspend fun login(appId: String, identifier: String, password: String): SessionResponse {
        val body = json.encodeToString(LoginRequest.serializer(), LoginRequest(appId = appId, identifier = identifier.trim(), password = password))
        val session = decode(authed("POST", ApiPaths.LOGIN, body, bearer = null), "connexion", SessionResponse.serializer())
        saveSession(session)
        return session
    }

    /**
     * Rotation du refresh. Rejouer un ancien jeton révoque toute la famille
     * côté serveur : cet appel ne doit être tenté qu'une fois par expiration.
     */
    suspend fun refresh(): SessionResponse {
        val token = refreshToken() ?: throw ApiException(401, ApiCodes.UNAUTHENTICATED, "Session absente.")
        val body = json.encodeToString(RefreshRequest.serializer(), RefreshRequest(refreshToken = token))
        val session = decode(authed("POST", ApiPaths.REFRESH, body, bearer = null), "renouvellement", SessionResponse.serializer())
        saveSession(session)
        return session
    }

    suspend fun logout() {
        if (!hasSession()) return
        runCatching { authed("POST", ApiPaths.LOGOUT, body = null) }
        clearSession()
    }

    suspend fun me(): MeResponse = decode(authed("GET", ApiPaths.ME, null), "compte", MeResponse.serializer())

    /** Données protégées et temps en ligne, sommés sur les appareils du compte. */
    suspend fun stats(): StatsDto = decode(authed("GET", ApiPaths.ME_STATS, null), "statistiques", StatsDto.serializer())

    /** Code parrain du compte, tiré à la première lecture. */
    suspend fun referral(): ReferralDto = decode(authed("GET", ApiPaths.ME_REFERRAL, null), "parrainage", ReferralDto.serializer())

    /**
     * Usage du jour (total, pas un delta : le serveur garde le maximum) et rapports
     * par configuration (témoin différentiel, D63). 20 rapports au plus (D64).
     */
    suspend fun telemetry(usage: UsageDto?, reports: List<ConfigReportDto>) {
        val body = json.encodeToString(TelemetryRequest.serializer(), TelemetryRequest(usage, reports.take(20).ifEmpty { null }))
        authed("POST", ApiPaths.TELEMETRY, body)
    }

    suspend fun subscription(): SubscriptionResponse =
        decode(authed("GET", ApiPaths.ME_SUBSCRIPTION, null), "abonnement", SubscriptionResponse.serializer())

    suspend fun devices(): DevicesResponse =
        decode(authed("GET", ApiPaths.ME_DEVICES, null), "appareils", DevicesResponse.serializer())

    /** Catalogue public de la marque embarquee dans l'APK. */
    suspend fun plans(appId: String): PlansResponse {
        val path = ApiPaths.APPS + "/" + appId + "/plans"
        return decode(
            send("GET", path, null, null, emptyMap(), requireDeviceToken = false),
            "forfaits",
            PlansResponse.serializer(),
        )
    }

    suspend fun createOrder(
        planId: String,
        planRevision: Int,
        nightWindow: String? = null,
        custom: CustomChoiceDto? = null,
    ): OrderDto {
        val body = json.encodeToString(
            CreateOrderRequest.serializer(),
            CreateOrderRequest(planId = planId, planRevision = planRevision, nightWindow = nightWindow, custom = custom),
        )
        return decode(authed("POST", ApiPaths.ORDERS, body), "commande", OrderDto.serializer())
    }

    suspend fun order(orderId: String, refresh: Boolean = false): OrderDto {
        val path = ApiPaths.ORDERS + "/" + orderId + if (refresh) "?refresh=1" else ""
        return decode(authed("GET", path, null), "commande", OrderDto.serializer())
    }

    /** Promotion de l'appareil courant quand une place s'est libérée. */
    suspend fun activateCurrentDevice(): DeviceDto =
        decode(authed("POST", ApiPaths.ME_DEVICE_ACTIVATE, null), "activation", DeviceDto.serializer())

    suspend fun revokeDevice(deviceId: String) {
        authed("DELETE", ApiPaths.ME_DEVICES + "/" + deviceId, body = null)
    }

    /** Signale au serveur qu'un fichier de secours a été importé (observation admin, offline-bundle). */
    suspend fun markOfflineConsumed(bundleId: String) {
        authed("POST", ApiPaths.OFFLINE_BUNDLES + "/" + bundleId + "/consumed", body = null)
    }

    /* ------------------------------------------------------------------- bundle */

    /**
     * Tirage du bundle chiffré.
     *
     * `If-None-Match` évite de retélécharger un contenu identique : l'ETag
     * dépend de compte + appareil + révision, pas des octets du chiffré
     * (`bundleEtag`, `routes/bundle.ts:82`), donc il est stable entre deux
     * scellements.
     */
    suspend fun fetchBundle(knownEtag: String? = store.getString(KEY_BUNDLE_ETAG)): BundleFetch {
        val response = authed(
            method = "GET",
            path = ApiPaths.BUNDLE,
            body = null,
            extraHeaders = if (knownEtag != null) mapOf("If-None-Match" to knownEtag) else emptyMap(),
        )
        if (response.status == 304) return BundleFetch.NotModified

        val dto = decode(response, "bundle", BundleResponse.serializer())
        val deviceId = auth.deviceId()
            ?: throw ApiException(401, ApiCodes.UNAUTHENTICATED, "Appareil non enrôlé.")

        val plain = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                DeviceEnvelope.open(
                    keys = keys,
                    deviceId = deviceId,
                    revision = dto.revision,
                    ephemeralKeyB64 = dto.envelope.ephemeralKey,
                    saltB64 = dto.envelope.salt,
                    ivB64 = dto.envelope.iv,
                    ciphertextB64 = dto.envelope.ciphertext,
                    tagB64 = dto.envelope.tag,
                    digestB64 = dto.envelope.digest,
                )
            } catch (error: DeviceEnvelope.OpenException) {
                throw ApiException(0, ApiCodes.DEVICE_PROOF_INVALID, error.message ?: "Bundle indéchiffrable.", cause = error)
            }
        } else {
            throw ApiException(0, ApiCodes.DEVICE_PROOF_INVALID, "Déchiffrement impossible : Android 12 requis.")
        }

        val payload = try {
            json.decodeFromString(BundlePayload.serializer(), plain.toString(Charsets.UTF_8))
        } catch (error: Exception) {
            throw ApiException(0, ApiCodes.INTERNAL, "Contenu du bundle illisible.", cause = error)
        } finally {
            // Le clair ne survit pas à cet appel : il est stocké chiffré par
            // l'appelant (ConfigVault) et jamais en clair sur disque.
            plain.fill(0)
        }

        // Un bundle sans configuration est un retrait légitime, pas une panne :
        // on le propage tel quel et l'UI dira « aucune connexion disponible ».
        val etag = response.headers["etag"]
        if (etag != null) store.putString(KEY_BUNDLE_ETAG, etag)
        return BundleFetch.Fresh(payload = payload, etag = etag, revision = dto.revision)
    }

    fun forgetBundleEtag() = store.remove(KEY_BUNDLE_ETAG)

    /* ------------------------------------------------------------- mécanique */

    private suspend fun authed(
        method: String,
        path: String,
        body: String?,
        bearer: String? = null,
        extraHeaders: Map<String, String> = emptyMap(),
    ): RawResponse {
        val token = bearer ?: accessToken()
        var response = sendSigned(method, path, body, token, extraHeaders)

        if (response.status == 401 && response.errorCode() == ApiCodes.UNAUTHENTICATED && refreshToken() != null) {
            // Une seule tentative : si le refresh échoue aussi, la session est
            // morte et l'UI doit redemander les identifiants.
            val renewed = try {
                refresh()
            } catch (error: ApiException) {
                if (error.status == 401 || error.code == ApiCodes.DEVICE_PROOF_INVALID) clearSession()
                throw error
            }
            response = sendSigned(method, path, body, renewed.accessToken, extraHeaders)
        }

        if (response.status == 401 && response.errorCode() == ApiCodes.UNAUTHENTICATED) clearSession()
        return response
    }

    private suspend fun sendSigned(
        method: String,
        path: String,
        body: String?,
        bearer: String?,
        extraHeaders: Map<String, String>,
    ): RawResponse {
        // Le texte signé doit être exactement le texte envoyé : on choisit donc
        // le corps *avant* de calculer la preuve.
        val payload = body ?: if (method.uppercase() in BODY_METHODS) EMPTY_JSON else ""
        // Le serveur signe `req.url.split("?")[0]` : la query part dans l'URL, pas dans la preuve.
        val proof = auth.proof(method, path.substringBefore('?'), payload)
        val headers = buildMap {
            putAll(proof.asHeaders())
            auth.deviceToken()?.let { put(HEADER_DEVICE_TOKEN, it) }
            putAll(extraHeaders)
        }
        return send(method, path, payload.takeIf { it.isNotEmpty() }, bearer, headers, requireDeviceToken = true)
    }

    private suspend fun send(
        method: String,
        path: String,
        body: String?,
        bearer: String?,
        extraHeaders: Map<String, String>,
        requireDeviceToken: Boolean,
    ): RawResponse {
        if (requireDeviceToken && auth.deviceToken() == null) {
            throw ApiException(401, ApiCodes.DEVICE_PROOF_INVALID, "Appareil non enrôlé : enrôlement requis.")
        }

        return withContext(Dispatchers.IO) {
            val requestBody = body?.toByteArray(Charsets.UTF_8)?.toRequestBody(JSON_MEDIA)
            val builder = Request.Builder()
                .url(baseUrl + path)
                .method(method, requestBody)

            if (body != null) builder.header("Content-Type", "application/json; charset=utf-8")
            builder.header("Accept", "application/json")
            builder.header("User-Agent", "vpn-android")
            builder.header(HEADER_APP_ID, appId)
            if (bearer != null) builder.header("Authorization", "Bearer $bearer")
            for ((name, value) in extraHeaders) builder.header(name, value)

            val response = try {
                http.newCall(builder.build()).execute()
            } catch (error: IOException) {
                throw ApiException(0, ApiCodes.NETWORK, "Serveur injoignable.", cause = error)
            }
            response.use {
                val raw = it.body?.string() ?: ""
                syncClockFromHeaders(it.headers)
                RawResponse(status = it.code, body = raw, headers = it.headers)
            }
        }
    }

    /**
     * L'en-tête `Date` de chaque réponse donne l'heure serveur gratuitement :
     * c'est ce qui garde la preuve dans la tolérance de ±120 s même sur un
     * téléphone dont l'horloge dérive de plusieurs minutes.
     */
    private fun syncClockFromHeaders(headers: Headers) {
        val value = headers["date"] ?: return
        val instant = runCatching {
            ZonedDateTime.parse(value, DateTimeFormatter.RFC_1123_DATE_TIME)
                .withZoneSameInstant(ZoneOffset.UTC)
                .toInstant()
        }.getOrNull() ?: return
        auth.syncClock(instant.toString())
    }

    private fun <T> decode(response: RawResponse, what: String, deserializer: DeserializationStrategy<T>): T {
        if (response.status !in 200..299) throw response.toException()
        return try {
            json.decodeFromString(deserializer, response.body)
        } catch (error: Exception) {
            throw ApiException(response.status, ApiCodes.INTERNAL, "Réponse illisible ($what).", cause = error)
        }
    }

    private fun normalizeBaseUrl(raw: String): String {
        val trimmed = raw.trim().trimEnd('/')
        val uri = runCatching { java.net.URI(trimmed) }.getOrNull()
            ?: throw IllegalArgumentException("URL d'API invalide : $raw")
        require(uri.scheme == "https") { "L'API doit être servie en https (reçu : ${uri.scheme})." }
        require(uri.path.isNullOrEmpty() || uri.path == "/") {
            "L'URL d'API ne doit pas porter de chemin : la signature couvre le chemin exact."
        }
        require(uri.query == null) { "L'URL d'API ne doit pas porter de query." }
        return trimmed
    }

    /* ------------------------------------------------------------------ DTOs */

    @Serializable
    data class ChallengeRequest(val installationId: String, val purpose: String)

    @Serializable
    data class ChallengeResponse(
        val challengeId: String,
        val nonce: String,
        val expiresAt: String,
        val serverTime: String,
    )

    @Serializable
    data class EnrollRequest(
        val challengeId: String,
        val installationId: String,
        val deviceName: String,
        val platform: String,
        val signingKey: String,
        val agreementKey: String,
        val appVersion: String,
        val androidVersion: Int,
        val integrityToken: String? = null,
    )

    @Serializable
    data class EnrollResponse(
        val deviceId: String,
        val deviceToken: String,
        val serverTime: String,
        val status: String = "enrolled",
    )

    @Serializable
    data class RegisterRequest(
        val appId: String,
        val email: String? = null,
        val phone: String? = null,
        val password: String,
        val name: String,
        /** D53 : obligatoire, normalisé côté serveur (8 à 15 chiffres, `+` optionnel). */
        val phone: String,
        val locale: String? = null,
        /** Code parrain facultatif ; inconnu = 400 côté serveur. */
        val referralCode: String? = null,
    )

    @Serializable
    data class StatsDto(
        val bytesUp: Long = 0,
        val bytesDown: Long = 0,
        val seconds: Long = 0,
        val todayBytes: Long = 0,
        val todaySeconds: Long = 0,
    )

    @Serializable
    data class ReferralDto(val code: String, val invited: Int = 0)

    @Serializable
    data class UsageDto(val day: String, val bytesUp: Long, val bytesDown: Long, val seconds: Int)

    @Serializable
    data class ConfigReportDto(val configId: String, val ok: Boolean, val latencyMs: Int? = null)

    @Serializable
    data class TelemetryRequest(val usage: UsageDto? = null, val reports: List<ConfigReportDto>? = null)

    @Serializable
    data class LoginRequest(val appId: String, val identifier: String? = null, val email: String? = null, val phone: String? = null, val password: String)

    @Serializable
    data class RefreshRequest(val refreshToken: String)

    @Serializable
    data class UserDto(
        val id: String,
        val email: String? = null,
        val phone: String? = null,
        val name: String,
        val locale: String = "fr",
        val emailVerified: Boolean = false,
        val communityId: String = "",
        val createdAt: String = "",
    )

    @Serializable
    data class DeviceDto(
        val id: String,
        val name: String,
        val platform: String = "android",
        val status: String,
        val current: Boolean = false,
        val lastSeenAt: String? = null,
        val createdAt: String = "",
    )

    @Serializable
    data class EntitlementDto(
        val active: Boolean,
        val planCode: String? = null,
        val planName: String? = null,
        val startsAt: String? = null,
        val endsAt: String? = null,
        val daysRemaining: Int = 0,
        val deviceLimit: Int = 1,
        val activationPending: Boolean = false,
        /** Type de serveurs que le forfait actif donne (D45). */
        val endpointTier: String = "free-labs",
        /* R6 : présents seulement dans `GET /v1/me/subscription`. */
        val family: String? = null,
        val quotaBytes: Long? = null,
        val usedBytes: Long = 0,
        val remainingBytes: Long? = null,
        val nightWindow: String? = null,
        /** `active`, `exhausted` ou `expired`. */
        val state: String? = null,
    )

    @Serializable
    data class SubscriptionDto(
        val id: String,
        val planId: String,
        val planCode: String,
        val planName: String,
        val startsAt: String,
        val endsAt: String,
        val deviceLimit: Int,
    )

    @Serializable
    data class SessionResponse(
        val accessToken: String,
        val refreshToken: String,
        val accessExpiresAt: String,
        val refreshExpiresAt: String,
        val user: UserDto,
        val device: DeviceDto,
    )

    @Serializable
    data class CommunityDto(val id: String, val slug: String = "", val name: String = "")

    @Serializable
    data class MeResponse(
        val user: UserDto,
        val community: CommunityDto,
        val entitlement: EntitlementDto,
        val subscription: SubscriptionDto? = null,
        val device: DeviceDto,
        val devicesUsed: Int = 1,
        val devicesLimit: Int = 1,
    )

    @Serializable
    data class SubscriptionResponse(
        val entitlement: EntitlementDto,
        val subscription: SubscriptionDto? = null,
    )

    @Serializable
    data class DevicesResponse(val items: List<DeviceDto> = emptyList())

    @Serializable
    data class CatalogAppDto(val id: String, val name: String)

    @Serializable
    data class PlanDto(
        val id: String,
        val code: String,
        val name: String,
        val description: String,
        val priceXaf: Int,
        val durationDays: Int,
        val deviceLimit: Int,
        val badge: String? = null,
        val featured: Boolean = false,
        val sortOrder: Int = 0,
        val revision: Int,
        /** D45 : `free-labs` = illimité, `paid-gcp` = limité. */
        val endpointTier: String = "free-labs",
        /** D115/D127 : `limited`, `limited_night` ou `custom` (sur mesure). Absent sur une API ancienne. */
        val family: String = "limited",
        /** Octets ; `null` = sans quota. */
        val quotaBytes: Long? = null,
        /** Plages de nuit proposées, prix ajouté au forfait. */
        val nightOptions: List<NightOptionDto> = emptyList(),
        /** D127 : bornes et prix de l'offre sur mesure ; `null` pour un forfait classique. */
        val custom: CustomTermsDto? = null,
    ) {
        val isCustom: Boolean get() = family == "custom" && custom != null
        val isUnlimited: Boolean get() = family == "unlimited"
    }

    @Serializable
    data class NightOptionDto(val window: String, val priceXaf: Int)

    /**
     * Offre sur mesure (D127). L'app place les curseurs dans ces bornes et affiche
     * une estimation avec la même formule que le serveur ; le montant facturé est
     * celui que renvoie la commande.
     */
    @Serializable
    data class CustomTermsDto(
        val pricePerGb1dXaf: Int,
        val pricePerGb30dXaf: Int,
        val minGb: Int,
        val maxGb: Int,
        val stepGb: Int = 1,
        val minDays: Int,
        val maxDays: Int,
    ) {
        /** Même calcul que `customPriceXaf` (apps/api/src/services/customOffer.ts). */
        fun priceXaf(gb: Int, days: Int): Int {
            val perGb = pricePerGb1dXaf + (pricePerGb30dXaf - pricePerGb1dXaf) * (days - 1) / 29.0
            return (kotlin.math.ceil(gb * perGb / 50.0 - 1e-9) * 50).toInt()
        }
    }

    @Serializable
    data class PlansResponse(val app: CatalogAppDto, val items: List<PlanDto> = emptyList())

    @Serializable
    data class CustomChoiceDto(val gb: Int, val days: Int)

    @Serializable
    private data class CreateOrderRequest(
        val planId: String,
        val planRevision: Int,
        val nightWindow: String? = null,
        val custom: CustomChoiceDto? = null,
    )

    @Serializable
    data class MoneyDto(val amount: Int, val currency: String = "XAF")

    @Serializable
    data class CheckoutDto(val url: String, val expiresAt: String? = null)

    @Serializable
    data class OrderDto(
        val orderId: String,
        val planId: String,
        val planRevision: Int,
        val price: MoneyDto,
        val status: String,
        val activationStatus: String,
        val createdAt: String,
        val expiresAt: String? = null,
        val paidAt: String? = null,
        val checkout: CheckoutDto? = null,
        val failureCode: String? = null,
        val pollAfterSeconds: Int = 15,
        val nightWindow: String? = null,
        val custom: CustomChoiceDto? = null,
    )

    @Serializable
    data class SealedEnvelopeDto(
        val version: Int,
        val ephemeralKey: String,
        val salt: String,
        val iv: String,
        val ciphertext: String,
        val tag: String,
        val digest: String? = null,
    )

    /** Réponse de `GET /v1/configuration-bundles/current` (`routes/bundle.ts:46`). */
    @Serializable
    data class BundleResponse(
        val revision: Long,
        val issuedAt: String,
        val expiresAt: String,
        val configCount: Int,
        val envelope: SealedEnvelopeDto,
    )

    /** Erreur normalisée de l'API. */
    @Serializable
    data class ErrorEnvelope(val error: ErrorBody)

    @Serializable
    data class ErrorBody(
        val code: String,
        val message: String,
        val details: Map<String, String> = emptyMap(),
        val retryAfter: Int? = null,
    )
}

/* ------------------------------------------------------------------ sorties */

sealed interface BundleFetch {
    /** 304 : la révision n'a pas bougé, le contenu en cache reste valable. */
    data object NotModified : BundleFetch

    data class Fresh(val payload: BundlePayload, val etag: String?, val revision: Long) : BundleFetch
}

/* ------------------------------------------------------------------- erreurs */

/**
 * Exception unique du client. `status == 0` signifie « pas de réponse HTTP » :
 * réseau coupé, ou refus local avant l'envoi (appareil non enrôlé, plateforme
 * trop ancienne).
 */
class ApiException(
    val status: Int,
    val code: String,
    override val message: String,
    val details: Map<String, String> = emptyMap(),
    val retryAfterSeconds: Int? = null,
    cause: Throwable? = null,
) : Exception(message, cause) {

    val isDeviceRevoked: Boolean get() = code == ApiCodes.DEVICE_REVOKED
    val needsSubscription: Boolean get() = code == ApiCodes.SUBSCRIPTION_REQUIRED
    val needsEnrolment: Boolean get() = code == ApiCodes.DEVICE_PROOF_INVALID
    val deviceLimitReached: Boolean get() = code == ApiCodes.DEVICE_LIMIT_REACHED
    val isNetwork: Boolean get() = status == 0 && code == ApiCodes.NETWORK
}

/** Codes réellement produits par le serveur (`apps/api/src/lib/errors.ts`). */
object ApiCodes {
    const val VALIDATION_FAILED = "VALIDATION_FAILED"
    const val UNAUTHENTICATED = "UNAUTHENTICATED"
    const val FORBIDDEN = "FORBIDDEN"
    const val NOT_FOUND = "NOT_FOUND"
    const val CONFLICT = "CONFLICT"
    const val DEVICE_LIMIT_REACHED = "DEVICE_LIMIT_REACHED"
    const val DEVICE_REVOKED = "DEVICE_REVOKED"
    const val DEVICE_PROOF_INVALID = "DEVICE_PROOF_INVALID"
    const val SUBSCRIPTION_REQUIRED = "SUBSCRIPTION_REQUIRED"

    /** Locaux : jamais renvoyés par le serveur. */
    const val NETWORK = "NETWORK_UNAVAILABLE"
    const val INTERNAL = "INTERNAL"
}

private class RawResponse(
    val status: Int,
    val body: String,
    val headers: Headers,
) {
    fun errorCode(): String? = runCatching {
        val parsed = ApiClient.JSON.parseToJsonElement(body) as JsonObject
        parsed["error"]?.jsonObject?.get("code")?.jsonPrimitive?.content
    }.getOrNull()

    fun toException(): ApiException {
        val parsed = runCatching {
            ApiClient.JSON.decodeFromString(ApiClient.ErrorEnvelope.serializer(), body)
        }.getOrNull()

        return if (parsed != null) {
            ApiException(
                status = status,
                code = parsed.error.code,
                message = parsed.error.message,
                details = parsed.error.details,
                retryAfterSeconds = parsed.error.retryAfter,
            )
        } else {
            ApiException(
                status = status,
                code = if (status >= 500) ApiCodes.INTERNAL else ApiCodes.VALIDATION_FAILED,
                message = "Réponse inattendue du serveur (HTTP $status).",
            )
        }
    }
}

/* ------------------------------------------------------------------- chemins */

/**
 * Chemins exacts. Aucun n'est deviné : chacun existe dans `apps/api/src/routes`.
 * Toute modification côté serveur se répercute ici, et nulle part ailleurs.
 */
object ApiPaths {
    const val APPS = "/v1/apps"
    const val ORDERS = "/v1/orders"
    const val CHALLENGES = "/v1/devices/challenges"
    const val ENROLL = "/v1/devices/enroll"
    const val REGISTER = "/v1/auth/register"
    const val LOGIN = "/v1/auth/login"
    const val REFRESH = "/v1/auth/refresh"
    const val LOGOUT = "/v1/auth/logout"
    const val ME = "/v1/me"
    const val ME_STATS = "/v1/me/stats"
    const val OFFLINE_BUNDLES = "/v1/offline-bundles"
    const val ME_REFERRAL = "/v1/me/referral"
    const val TELEMETRY = "/v1/me/telemetry"
    const val ME_SUBSCRIPTION = "/v1/me/subscription"
    const val ME_DEVICES = "/v1/me/devices"
    const val ME_DEVICE_ACTIVATE = "/v1/me/devices/current/activate"
    const val BUNDLE = "/v1/configuration-bundles/current"
}

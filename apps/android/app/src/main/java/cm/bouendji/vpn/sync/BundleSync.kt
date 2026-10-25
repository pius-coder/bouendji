package cm.bouendji.vpn.sync

import cm.bouendji.vpn.access.AccessState
import cm.bouendji.vpn.config.BundlePayload
import cm.bouendji.vpn.net.ApiException
import cm.bouendji.vpn.net.BundleFetch
import cm.bouendji.vpn.offline.ConfigVault

/**
 * Un seul chemin pour tirer le bundle, partagé par l'interface et le service.
 *
 * Règles appliquées :
 *
 * - **D61** : un bundle **vide** n'écrase pas la liste locale. Il est signalé
 *   ([Outcome.EmptyKeptLocal]) et l'interface affiche un bandeau, jamais un
 *   écran plein.
 * - **D67** : seule une preuve de fin de droits (`SUBSCRIPTION_REQUIRED`) vide
 *   le coffre ; une erreur réseau ne touche à rien.
 * - Appareil révoqué (`DEVICE_REVOKED`) : le coffre est vidé, l'accès ne doit
 *   plus être présenté.
 */
class BundleSync(
    private val fetch: suspend () -> BundleFetch,
    private val vault: ConfigVault,
    private val access: AccessState,
) {

    sealed interface Outcome {
        /** Nouvelle liste enregistrée. [changed] : le jeu de configurations a bougé. */
        data class Updated(val count: Int, val changed: Boolean) : Outcome
        data object NotModified : Outcome
        /** D61 : le serveur n'a rien servi ; la liste locale est conservée. */
        data class EmptyKeptLocal(val localUsable: Int) : Outcome
        data object RightsEnded : Outcome
        data object Revoked : Outcome
        /** Ni le réseau ni le serveur n'ont tranché : rien n'est modifié. */
        data class Failed(val error: Throwable) : Outcome
    }

    suspend fun sync(nowMs: Long = System.currentTimeMillis()): Outcome {
        val result = try {
            fetch()
        } catch (error: ApiException) {
            return when {
                error.needsSubscription -> {
                    access.markEnded()
                    vault.clear()
                    Outcome.RightsEnded
                }
                error.isDeviceRevoked -> {
                    vault.clear()
                    Outcome.Revoked
                }
                else -> Outcome.Failed(error)
            }
        } catch (error: Exception) {
            return Outcome.Failed(error)
        }

        return when (result) {
            BundleFetch.NotModified -> Outcome.NotModified
            is BundleFetch.Fresh -> apply(result.payload, nowMs)
        }
    }

    private fun apply(payload: BundlePayload, nowMs: Long): Outcome {
        if (payload.configs.isEmpty()) return Outcome.EmptyKeptLocal(vault.usableCount(nowMs))
        val before = vault.read()
        if (!vault.save(payload)) return Outcome.Failed(IllegalStateException("Écriture du coffre refusée."))
        return Outcome.Updated(payload.configs.size, changed = signature(before) != signature(payload))
    }

    private fun signature(payload: BundlePayload?): String =
        payload?.configs?.joinToString(",") { "${it.id}@${it.expiresAt}" }.orEmpty()
}

package cm.bouendji.vpn.access

import cm.bouendji.vpn.util.KeyValueStore

/**
 * Ce que l'appareil sait de ses droits, hors réseau.
 *
 * D67 : deux échéances côté appareil. Celle-ci est la **fin des droits**
 * (`entitlement.endsAt` de `GET /v1/me`), la seule qui autorise l'application à
 * dire « votre accès a expiré ». L'autre — l'expiration d'un nœud — ne doit
 * déclencher qu'un nouveau tirage du bundle.
 *
 * La valeur est mémorisée à chaque lecture de `/v1/me`, pour que le service VPN
 * puisse trancher sans réseau quand l'enveloppe arrive à échéance.
 */
class AccessState(private val store: KeyValueStore) {

    companion object {
        private const val KEY_RIGHTS_END = "access.rightsEndsAtMs"
        private const val KEY_RIGHTS_ENDED = "access.rightsEnded"
    }

    /** Fin des droits connue, ou `null` si l'app ne l'a jamais lue. */
    fun rightsEndsAtMs(): Long? = store.getString(KEY_RIGHTS_END)?.toLongOrNull()

    /** Le serveur a répondu « abonnement requis » (`SUBSCRIPTION_REQUIRED`). */
    fun rightsEndedByServer(): Boolean = store.getString(KEY_RIGHTS_ENDED) == "1"

    /** Lecture de `/v1/me` : droits actifs jusqu'à [endsAtMs], ou inactifs. */
    fun remember(active: Boolean, endsAtMs: Long?) {
        if (active && endsAtMs != null) {
            store.putString(KEY_RIGHTS_END, endsAtMs.toString())
            store.remove(KEY_RIGHTS_ENDED)
        } else {
            markEnded()
        }
    }

    fun markEnded() {
        store.putString(KEY_RIGHTS_ENDED, "1")
    }

    fun clear() {
        store.remove(KEY_RIGHTS_END)
        store.remove(KEY_RIGHTS_ENDED)
    }
}

/** Ce que l'app doit faire quand l'enveloppe du bundle arrive à échéance. */
enum class ExpiryVerdict {
    /** Les droits sont finis : « expiré », coffre vidé. */
    RIGHTS_ENDED,

    /** Les droits courent encore : seuls les nœuds sont morts. Nouveau tirage, bandeau si rien. */
    REFRESH,
}

object ExpiryPolicy {

    /**
     * D67. On ne déclare « expiré » que sur une preuve : réponse serveur
     * `SUBSCRIPTION_REQUIRED`, ou fin des droits connue et dépassée. Une fin de
     * droits inconnue ne vaut pas preuve : on retente le serveur.
     */
    fun atBundleExpiry(nowMs: Long, rightsEndsAtMs: Long?, endedByServer: Boolean): ExpiryVerdict = when {
        endedByServer -> ExpiryVerdict.RIGHTS_ENDED
        rightsEndsAtMs != null && rightsEndsAtMs <= nowMs -> ExpiryVerdict.RIGHTS_ENDED
        else -> ExpiryVerdict.REFRESH
    }
}

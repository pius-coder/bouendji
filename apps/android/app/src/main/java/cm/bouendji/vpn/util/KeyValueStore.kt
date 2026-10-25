package cm.bouendji.vpn.util

/**
 * Le strict nécessaire d'un stockage clé → texte.
 *
 * En production : [cm.bouendji.vpn.crypto.SecureStore] (chiffré par le
 * Keystore). En test : [MemoryStore]. Les règles métier (coffre, droits, file
 * de télémétrie) ne dépendent que de cette interface, donc elles se testent
 * sur la JVM sans appareil.
 */
interface KeyValueStore {
    fun getString(key: String): String?
    fun putString(key: String, value: String): Boolean
    fun remove(key: String)
    fun contains(key: String): Boolean = getString(key) != null
}

/** Stockage en mémoire : tests unitaires et valeurs éphémères. */
class MemoryStore : KeyValueStore {
    private val values = LinkedHashMap<String, String>()
    @Synchronized override fun getString(key: String): String? = values[key]
    @Synchronized override fun putString(key: String, value: String): Boolean { values[key] = value; return true }
    @Synchronized override fun remove(key: String) { values.remove(key) }
}

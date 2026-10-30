package cm.bouendji.vpn.config

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tests JVM du contrat de configuration — le seul endroit de l'app qui décide
 * quels nœuds existent et comment ils sont écrits pour sing-box.
 *
 * Aucun lien réel n'est présent : l'URI est reconstruite à l'exécution avec un
 * UUID nul, pour ne jamais versionner un `vless://` exploitable.
 */
class SingBoxConfigTest {

    private val uuid = "00000000-0000-4000-8000-000000000000"

    private fun link(
        host: String = "node.example.test",
        port: Int = 443,
        query: String = "encryption=none&security=tls&type=ws&path=%2Fws%2Fdemo&sni=node.example.test&fp=chrome",
    ): String = "vless" + "://" + uuid + "@" + host + ":" + port + "?" + query

    private fun payload(vararg configs: BundleConfig, expiresAt: String = "2030-01-01T00:00:00Z") =
        BundlePayload(
            revision = 1,
            issuedAt = "2026-01-01T00:00:00Z",
            expiresAt = expiresAt,
            configs = configs.toList(),
        )

    private fun config(
        id: String = "cfg-1",
        expiresAt: String = "2030-01-01T00:00:00Z",
        uri: String = link(),
        tier: String = "free-labs",
    ) = BundleConfig(
        id = id,
        label = "Test",
        uri = uri,
        expiresAt = expiresAt,
        region = "fr",
        endpointTier = tier,
    )

    @Test
    fun canonicalWebSocketLinkIsParsed() {
        val endpoint = SingBoxConfig.parseVless(link())
        assertNotNull(endpoint)
        assertEquals("node.example.test", endpoint!!.host)
        assertEquals(443, endpoint.port)
        assertEquals("/ws/demo", endpoint.wsPath)
        assertTrue(endpoint.tls)
    }

    @Test
    fun realityAndNonWebSocketTransportsAreRejected() {
        assertNull(SingBoxConfig.parseVless(link(query = "encryption=none&security=reality&type=ws&path=%2Fws")))
        assertNull(SingBoxConfig.parseVless(link(query = "encryption=none&security=tls&type=grpc")))
        assertNull(SingBoxConfig.parseVless(link(query = "encryption=aes-128-gcm&security=tls&type=ws")))
    }

    @Test
    fun invalidPortAndMissingUuidAreRejected() {
        assertNull(SingBoxConfig.parseVless(link(port = 0)))
        assertNull(SingBoxConfig.parseVless("vless" + "://" + "@node.example.test:443?type=ws"))
    }

    @Test
    fun expiredConfigIsDropped() {
        val plan = SingBoxConfig.build(
            payload = payload(
                config(id = "old", expiresAt = "2020-01-01T00:00:00Z"),
                config(id = "new"),
            ),
            exposeClashApi = false,
        )
        assertNotNull(plan)
        assertEquals(1, plan!!.nodes.size)
        assertEquals("new", plan.nodes.single().configId)
        assertEquals(1, plan.droppedExpired)
    }

    @Test
    fun ipv6TunAddressIsWrittenWhenProvided() {
        val plan = SingBoxConfig.build(
            payload = payload(config()),
            exposeClashApi = false,
            tun = SingBoxConfig.TunOptions(address = "172.19.0.1/30", addressV6 = "fd00:1:fd00:1::1/64"),
        )
        assertNotNull(plan)
        assertTrue(plan!!.json.contains("fd00:1:fd00:1::1/64"))
        assertTrue(plan.json.contains("selector"))
        assertTrue(plan.json.contains("urltest").not())
    }

    @Test
    fun planExpiresAtEarliestNodeNotLatest() {
        val plan = SingBoxConfig.build(
            payload = payload(
                config(id = "early", expiresAt = "2027-01-01T00:00:00Z"),
                config(id = "late", expiresAt = "2030-01-01T00:00:00Z"),
            ),
            exposeClashApi = false,
        )
        assertNotNull(plan)
        val early = parseInstant("2027-01-01T00:00:00Z")!!
        assertEquals(early, plan!!.expiresAtMs)
    }

    @Test
    fun nodesOfKeepsStableTagsAndTierFallback() {
        val nodes = SingBoxConfig.nodesOf(payload(config(id = "xui-1", tier = "paid-gcp"), config(id = "plain")))
        assertEquals(listOf("xui-1", "plain"), nodes.map { it.configId })
        assertEquals(listOf("n1", "n2"), nodes.map { it.tag })
        assertEquals("paid-gcp", nodes[0].endpointTier)
        assertEquals("free-labs", nodes[1].endpointTier)
    }

    @Test
    fun emptyPayloadBuildsNothing() {
        val plan = SingBoxConfig.build(payload(), exposeClashApi = false)
        assertNull(plan)
        assertFalse(SingBoxConfig.nodesOf(payload()).isNotEmpty())
    }
}

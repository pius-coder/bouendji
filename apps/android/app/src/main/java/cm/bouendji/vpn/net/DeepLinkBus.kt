package cm.bouendji.vpn.net

import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.receiveAsFlow

/**
 * Retour de paiement (deep link `cm.bouendji.vpn://pay?orderId=…`).
 *
 * Un `Channel` conflated et non un `SharedFlow` sans replay : l'intent est
 * reçu dans `MainActivity.onCreate`, avant que le collecteur ne soit installé.
 * Avec un flux sans tampon, l'événement était perdu au démarrage à froid —
 * l'utilisateur payait et l'app ne le savait jamais.
 *
 * `receiveAsFlow` est à consommateur unique : seul `AppController.boot()`
 * collecte, et il démarre une fois par processus.
 */
object DeepLinkBus {
    private val _paymentReturn = Channel<String?>(Channel.CONFLATED)
    val paymentReturn = _paymentReturn.receiveAsFlow()

    fun emitPaymentReturn(orderId: String?) {
        _paymentReturn.trySend(orderId)
    }
}

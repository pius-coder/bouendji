package cm.bouendji.vpn.net

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

object DeepLinkBus {
    private val _paymentReturn = MutableSharedFlow<String?>(extraBufferCapacity = 1)
    val paymentReturn = _paymentReturn.asSharedFlow()

    fun emitPaymentReturn(orderId: String?) {
        _paymentReturn.tryEmit(orderId)
    }
}

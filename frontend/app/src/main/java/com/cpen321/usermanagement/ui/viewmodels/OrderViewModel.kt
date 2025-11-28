package com.cpen321.usermanagement.ui.viewmodels

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.cpen321.usermanagement.data.local.models.Order
import com.cpen321.usermanagement.data.remote.models.OrderRequest
import com.cpen321.usermanagement.data.remote.models.CreateReturnJobRequest
import com.cpen321.usermanagement.data.remote.models.CreateReturnJobResponse
import com.cpen321.usermanagement.data.repository.OrderRepository
import com.cpen321.usermanagement.network.SocketClient
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * OrderViewModel
 * - Single source of truth for the current active order and order-related actions
 * - Wraps OrderRepository and exposes StateFlows for the UI to observe
 * - Listens to socket events for order updates at ViewModel scope (survives navigation)
 */
data class OrderUiState(
    val isManaging: Boolean = false,
    val selectedOrder: Order? = null,
    val isSubmitting: Boolean = false,
    val error: String? = null,
    val successMessage: String? = null
)


@HiltViewModel
class OrderViewModel @Inject constructor(
    private val repository: OrderRepository,
    private val socketClient: SocketClient
) : ViewModel() {

    // UI state

    private val _uiState = MutableStateFlow(OrderUiState())
    val uiState: StateFlow<OrderUiState> = _uiState.asStateFlow()
    private val _isSubmitting = MutableStateFlow(false)

    // Active order state exposed to UI
    private val _activeOrder = MutableStateFlow<Order?>(null)
    val activeOrder: StateFlow<Order?> = _activeOrder.asStateFlow()

    // All orders list for management screens
    private val _orders = MutableStateFlow<List<Order>>(emptyList())
    val orders: StateFlow<List<Order>> = _orders.asStateFlow()

    init {
        // Listen for order socket events at ViewModel scope (survives navigation)
        listenForOrderUpdates()
    }

    private fun listenForOrderUpdates() {
        viewModelScope.launch {
            socketClient.events.collect { event ->
                when (event.name) {
                    "order.created", "order.updated" -> {
                        Log.d("OrderViewModel", "Received ${event.name}, refreshing orders")
                        // Refresh both active order and all orders list
                        refreshActiveOrder()
                        refreshAllOrders()
                    }
                }
            }
        }
    }

    suspend fun submitOrder(orderRequest: OrderRequest, paymentIntentId: String? = null): Result<Order> {
        _isSubmitting.value = true
        return try {
            val result = repository.submitOrder(orderRequest, paymentIntentId)
            result
        } catch (e: java.io.IOException) {
            android.util.Log.e("OrderViewModel", "Network error submitting order", e)
            Result.failure(e)
        } catch (e: retrofit2.HttpException) {
            android.util.Log.e("OrderViewModel", "HTTP error submitting order: ${e.code()}", e)
            Result.failure(e)
        } finally {
            _isSubmitting.value = false
        }
    }

    suspend fun getQuote(address: com.cpen321.usermanagement.data.local.models.Address): Result<com.cpen321.usermanagement.data.local.models.GetQuoteResponse> {
        return try {
            val result = repository.getQuote(address)
            result
        } catch (e: java.io.IOException) {
            android.util.Log.e("OrderViewModel", "Network error getting quote", e)
            Result.failure(e)
        } catch (e: retrofit2.HttpException) {
            android.util.Log.e("OrderViewModel", "HTTP error getting quote: ${e.code()}", e)
            Result.failure(e)
        }
    }


    /**
     * Non-suspending refresh helpers the UI can call. These launch coroutines
     * internally and update StateFlows that the composables observe.
     */
    fun refreshActiveOrder() {
        viewModelScope.launch {
            try {
                val o = repository.getActiveOrder()
                _activeOrder.value = o
            } catch (_: Exception) {
                // ignore or surface as needed
            }
        }
    }

    fun refreshAllOrders() {
        viewModelScope.launch {
            try {
                val list = repository.getAllOrders()
                _orders.value = list ?: emptyList()
            } catch (_: Exception) {
                // ignore or surface as needed
            }
        }
    }

    fun startManaging(order: Order) {
        _uiState.value = _uiState.value.copy(
            isManaging = true,
            selectedOrder = order
        )
    }

    fun stopManaging() {
        _uiState.value = _uiState.value.copy(
            isManaging = false,
            selectedOrder = null
        )
    }


    fun onManageOrder(order: Order) {
        // route to the toggle so UI reacts
        startManaging(order)
    }

    fun cancelOrder(onDone: (Throwable?) -> Unit = {}) {
        viewModelScope.launch {
            try {
                repository.cancelOrder()   // suspend
                // Update UI state if needed
                onDone(null)
            } catch (e: java.io.IOException) {
                android.util.Log.e("OrderViewModel", "Network error cancelling order", e)
                onDone(e)
            } catch (e: retrofit2.HttpException) {
                android.util.Log.e("OrderViewModel", "HTTP error cancelling order: ${e.code()}", e)
                onDone(e)
            }
        }
    }
    
    suspend fun createReturnJob(request: CreateReturnJobRequest): CreateReturnJobResponse {
        return repository.createReturnJob(request)
    }
}


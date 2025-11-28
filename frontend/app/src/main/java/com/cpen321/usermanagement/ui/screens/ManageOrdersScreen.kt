package com.cpen321.usermanagement.ui.screens

import android.content.Context
import androidx.compose.runtime.Composable
import com.cpen321.usermanagement.ui.viewmodels.OrderViewModel
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.platform.LocalContext
import dagger.hilt.android.EntryPointAccessors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.cpen321.usermanagement.data.local.models.Order
import com.cpen321.usermanagement.data.local.models.OrderStatus
import com.cpen321.usermanagement.data.local.models.displayText
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.material3.Icon
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import com.cpen321.usermanagement.utils.TimeUtils
import com.cpen321.usermanagement.R
import com.cpen321.usermanagement.ui.components.common.MessageSnackbar
import com.cpen321.usermanagement.ui.components.common.MessageSnackbarState
import com.cpen321.usermanagement.ui.viewmodels.ProfileUiState
import com.cpen321.usermanagement.ui.viewmodels.ProfileViewModel
import kotlinx.coroutines.delay
import com.cpen321.usermanagement.di.SocketClientEntryPoint

private data class ManageOrdersScreenData(
    val orders: List<Order>,
    val uiState: ProfileUiState,
    val snackBarHostState: SnackbarHostState,
    val onSuccessMessageShown: () -> Unit,
    val onErrorMessageShown: () -> Unit
)

private data class ManageOrdersScreenActions(
    val onBackClick: () -> Unit,
    val onManageOrderClick: (Order) -> Unit
)

@Composable
private fun OrderUpdateSocketListener(
    appContext: Context,
    snackBarHostState: SnackbarHostState
) {
    LaunchedEffect(true) {
        val entry = EntryPointAccessors.fromApplication(
            appContext,
            SocketClientEntryPoint::class.java
        )
        val socketClient = entry.socketClient()

        socketClient.events.collect { ev ->
            when (ev.name) {
                "order.updated" -> {
                    val orderData = when {
                        ev.payload == null -> null
                        ev.payload.has("order") -> ev.payload.optJSONObject("order")
                        else -> ev.payload
                    }

                    val orderStatus = orderData?.optString("status")
                    
                    val message = when (orderStatus) {
                        "CANCELLED" -> "Order cancelled successfully. Refund has been processed."
                        else -> null
                    }

                    message?.let {
                        launch {
                            snackBarHostState.showSnackbar(
                                message = it,
                                duration = SnackbarDuration.Long
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ManageOrdersScreen(
    orderViewModel: OrderViewModel,
    profileViewModel: ProfileViewModel,
    onBackClick: () -> Unit,
) {
    val uiState by profileViewModel.uiState.collectAsState()
    val snackBarHostState = remember { SnackbarHostState() }
    val appCtx = LocalContext.current.applicationContext
    val orderUi by orderViewModel.uiState.collectAsState()
    val ordersState by orderViewModel.orders.collectAsState()

    LaunchedEffect(Unit) {
        orderViewModel.refreshAllOrders()
    }

    OrderUpdateSocketListener(
        appContext = appCtx,
        snackBarHostState = snackBarHostState
    )

    ManageOrdersContent(
        data = ManageOrdersScreenData(
            orders = ordersState,
            uiState = uiState,
            snackBarHostState = snackBarHostState,
            onSuccessMessageShown = profileViewModel::clearSuccessMessage,
            onErrorMessageShown = profileViewModel::clearError
        ),
        actions = ManageOrdersScreenActions(
            onBackClick = onBackClick,
            onManageOrderClick = {order -> orderViewModel.onManageOrder(order) }
        )
    )

    // Simple toggleable panel (bottom sheet or inline card)
    if (orderUi.isManaging && orderUi.selectedOrder != null) {
        ManageOrderSheet(
            order = orderUi.selectedOrder!!,
            orderViewModel,
            snackBarHostState = snackBarHostState,
            onClose = { orderViewModel.stopManaging() },
            onOrderCancelled = {
                // refresh list via ViewModel helper
                orderViewModel.refreshAllOrders()
            }
        )
    }
}

@Composable
private fun ManageOrdersContent(
    data: ManageOrdersScreenData,
    actions: ManageOrdersScreenActions,
    modifier: Modifier = Modifier
) {
    Scaffold(
        modifier = modifier,
        topBar = {
            ManageOrdersTopBar(onBackClick = actions.onBackClick)
        },
        snackbarHost = {
            MessageSnackbar(
                hostState = data.snackBarHostState,
                messageState = MessageSnackbarState(
                    successMessage = data.uiState.successMessage,
                    errorMessage = data.uiState.errorMessage,
                    onSuccessMessageShown = data.onSuccessMessageShown,
                    onErrorMessageShown = data.onErrorMessageShown
                )
            )
        }
    ) { paddingValues ->
        Box(modifier = Modifier.padding(paddingValues)) {
            ManageOrdersBody(
                data.orders,
                actions.onManageOrderClick
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ManageOrdersTopBar(
    onBackClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    TopAppBar(
        modifier = modifier,
        title = {
            Text(
                text = stringResource(R.string.manage_orders),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Medium
            )
        },
        navigationIcon = {
            IconButton(onClick = onBackClick) {
                Icon(
                    painter = painterResource(id = R.drawable.ic_arrow_back),
                    contentDescription = "Back"
                )
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = MaterialTheme.colorScheme.surface,
            titleContentColor = MaterialTheme.colorScheme.onSurface
        )
    )
}


@Composable 
fun ManageOrdersBody(
    orders: List<Order>,
    onManageOrdersClick : (Order)-> Unit
){

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text(
            text = "Order History",
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.padding(bottom = 16.dp)
        )
        if (orders.isEmpty()) {
            Text("No orders found.", style = MaterialTheme.typography.bodyMedium)
        } else {
            LazyColumn {
                items(orders) { order ->
                    OrderListItem(
                        order,
                        onManageOrdersClick as (Order) -> Unit
                    )
                }
            }
        }
    }

}

@Composable
fun OrderListItem(
    order: Order,
    onManageOrderClick: (Order) -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .testTag("order_list_item_${order.status.name}"),
        elevation = CardDefaults.cardElevation(2.dp),
        onClick = { onManageOrderClick(order) }
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Order #${order.id?.takeLast(6) ?: "N/A"}", 
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = order.status.displayText, 
                    style = MaterialTheme.typography.bodyMedium,
                    color = when (order.status) {
                        OrderStatus.COMPLETED -> MaterialTheme.colorScheme.primary
                        OrderStatus.CANCELLED -> MaterialTheme.colorScheme.error
                        OrderStatus.IN_STORAGE -> MaterialTheme.colorScheme.tertiary
                        OrderStatus.PENDING -> MaterialTheme.colorScheme.onSurface // Better visibility for pending
                        else -> MaterialTheme.colorScheme.onSurfaceVariant
                    }
                )
            }
            Text(
                text = "›",
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 8.dp)
            )
        }
    }
}

@Composable
fun ManageOrderSheet(
    order: Order,
    orderViewModel: OrderViewModel,
    snackBarHostState: SnackbarHostState,
    onClose: () -> Unit,
    onOrderCancelled: () -> Unit = {}
) {
    val scope = rememberCoroutineScope()
    val canCancel = order.status == OrderStatus.PENDING
    
    AlertDialog(
        onDismissRequest = onClose,
        title = { 
            Text(
                "Order Details",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            ) 
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                OrderDetailsContent(order)
                
                if (canCancel) {
                    CancelOrderButton(
                        orderViewModel = orderViewModel,
                        snackBarHostState = snackBarHostState,
                        onOrderCancelled = onOrderCancelled,
                        onClose = onClose,
                        scope = scope
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onClose) { Text("Close") }
        }
    )
}

@Composable
private fun OrderDetailsContent(order: Order) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        DetailRow(label = "Order ID", value = order.id ?: "N/A")
        
        OrderStatusRow(order)
        
        HorizontalDivider()
        
        DetailRow(label = "Volume", value = "${order.volume} m³")
        DetailRow(label = "Price", value = "$${String.format("%.2f", order.price)}")
        
        HorizontalDivider()
        
        OrderAddressesSection(order)
        
        HorizontalDivider()
        
        DetailRow(label = "Pickup Date", value = TimeUtils.formatDateTime(order.pickupTime))
        DetailRow(label = "Return Date", value = TimeUtils.formatDateTime(order.returnTime))
    }
}

@Composable
private fun OrderStatusRow(order: Order) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "Status:",
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium
        )
        Text(
            text = order.status.displayText,
            style = MaterialTheme.typography.bodyMedium,
            color = when (order.status) {
                OrderStatus.COMPLETED -> MaterialTheme.colorScheme.primary
                OrderStatus.CANCELLED -> MaterialTheme.colorScheme.error
                OrderStatus.IN_STORAGE -> MaterialTheme.colorScheme.tertiary
                OrderStatus.PENDING -> MaterialTheme.colorScheme.onSurface
                else -> MaterialTheme.colorScheme.onSurfaceVariant
            },
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun OrderAddressesSection(order: Order) {
    AddressField(label = "Pickup Address", address = order.studentAddress.formattedAddress)
    AddressField(label = "Storage Address", address = order.warehouseAddress.formattedAddress)
    
    order.returnAddress?.let { returnAddr ->
        AddressField(label = "Return Address", address = returnAddr.formattedAddress)
    }
}

@Composable
private fun AddressField(label: String, address: String) {
    Text(
        text = label,
        style = MaterialTheme.typography.bodySmall,
        fontWeight = FontWeight.Medium,
        modifier = Modifier.padding(top = if (label == "Pickup Address") 0.dp else 8.dp)
    )
    Text(
        text = address,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
}

@Composable
private fun CancelOrderButton(
    orderViewModel: OrderViewModel,
    snackBarHostState: SnackbarHostState,
    onOrderCancelled: () -> Unit,
    onClose: () -> Unit,
    scope: CoroutineScope
) {
    Button(
        onClick = {
            orderViewModel.cancelOrder() { err ->
                if (err == null) {
                    onOrderCancelled()
                    onClose()
                } else {
                    scope.launch {
                        snackBarHostState.showSnackbar(
                            message = "Failed to cancel order: ${err.message ?: "Unknown error"}",
                            duration = SnackbarDuration.Long
                        )
                    }
                }
            }
        },
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 8.dp)
            .testTag("cancel_order_button"),
        colors = ButtonDefaults.buttonColors(
            containerColor = MaterialTheme.colorScheme.error
        )
    ) {
        Text("Cancel Order")
    }
}

@Composable
private fun DetailRow(
    label: String,
    value: String,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "$label:",
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

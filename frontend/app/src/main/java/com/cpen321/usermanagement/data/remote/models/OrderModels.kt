package com.cpen321.usermanagement.data.remote.models

import com.cpen321.usermanagement.data.local.models.BoxQuantity


data class OrderRequest(
    val boxQuantities: List<BoxQuantity>,
    val currentAddress: String,
    val pickupTime: String, // ISO string format with date and time
    val returnDate: String,
    val totalPrice: Double // Price calculated by UI using backend pricing rules
)

data class CreateOrderRequest(
    val studentId: String,
    val volume: Double,
    val totalPrice: Double,
    val studentAddress: com.cpen321.usermanagement.data.local.models.Address,
    val warehouseAddress: com.cpen321.usermanagement.data.local.models.Address,
    val pickupTime: String, // ISO string format
    val returnTime: String,  // ISO string format
    val paymentIntentId: String? = null // Stripe payment intent ID for refunds
)

data class CancelOrderRequest(
    val studentId: String?
)

data class CancelOrderResponse(
    val success: Boolean,
    val message: String
)

data class CreateReturnJobRequest(
    val returnAddress: Address? = null,
    val actualReturnDate: String? = null // ISO string format
)

data class CreateReturnJobResponse(
    val success: Boolean,
    val message: String,
    val lateFee: Double? = null,
    val refundAmount: Double? = null
)

// OrderDto.kt
data class OrderDto(
    val id: String,
    val studentId: String,
    val moverId: String?,
    val status: String,
    val volume: Double,
    val totalPrice: Double,
    val studentAddress: Address,
    val warehouseAddress: Address,
    val returnAddress: Address?,
    val pickupTime: String,
    val returnTime: String
)

data class GetAllOrdersResponse(
    val success: Boolean,
    val orders: List<OrderDto>,
    val message: String
)
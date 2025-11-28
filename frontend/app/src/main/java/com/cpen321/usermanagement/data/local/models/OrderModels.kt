package com.cpen321.usermanagement.data.local.models

import com.google.gson.annotations.SerializedName
import com.cpen321.usermanagement.data.remote.models.Address

enum class OrderStatus {
    PENDING,
    ACCEPTED,
    PICKED_UP,
    IN_STORAGE,
    CANCELLED,
    RETURNED,
    COMPLETED
}

data class Order(
    @SerializedName("id") val id: String? = null,
    @SerializedName("studentId") val studentId: String,
    @SerializedName("moverId") val moverId: String? = null,
    @SerializedName("status") val status: OrderStatus,
    @SerializedName("volume") val volume: Double,
    @SerializedName("price") val price: Double,
    @SerializedName("studentAddress") val studentAddress: Address,
    @SerializedName("warehouseAddress") val warehouseAddress: Address,
    @SerializedName("returnAddress") val returnAddress: Address? = null,
    @SerializedName("pickupTime") val pickupTime: String, // ISO date string
    @SerializedName("returnTime") val returnTime: String  // ISO date string
)

// Helper extension to get status display text
val OrderStatus.displayText: String
    get() = when (this) {
        OrderStatus.PENDING -> "Pending Confirmation"
        OrderStatus.ACCEPTED -> "Accepted"
        OrderStatus.PICKED_UP -> "Picked Up"
        OrderStatus.IN_STORAGE -> "In Storage"
        OrderStatus.CANCELLED -> "Cancelled"
        OrderStatus.RETURNED -> "Returned"
        OrderStatus.COMPLETED -> "Completed"
    }
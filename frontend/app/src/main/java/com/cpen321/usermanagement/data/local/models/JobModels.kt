package com.cpen321.usermanagement.data.local.models

import com.cpen321.usermanagement.data.remote.models.Address
import java.time.LocalDateTime

data class Job(
    val id: String,
    val orderId: String? = null,
    val studentId: String? = null,
    val moverId: String? = null,
    val jobType: JobType,
    val status: JobStatus,
    val volume: Double,
    val price: Double,
    val pickupAddress: Address,
    val dropoffAddress: Address,
    val calendarEventLink: String ?= null,
    val scheduledTime: LocalDateTime,
    val createdAt: LocalDateTime? = null,
    val updatedAt: LocalDateTime? = null
)

enum class JobType(val value: String) {
    STORAGE("STORAGE"),
    RETURN("RETURN")
}

enum class JobStatus(val value: String) {
    AVAILABLE("AVAILABLE"),
    AWAITING_STUDENT_CONFIRMATION("AWAITING_STUDENT_CONFIRMATION"),
    ACCEPTED("ACCEPTED"),
    PICKED_UP("PICKED_UP"),
    IN_STORAGE("IN_STORAGE"),
    COMPLETED("COMPLETED"),
    CANCELLED("CANCELLED"),
}


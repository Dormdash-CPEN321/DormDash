package com.cpen321.usermanagement.data.remote.dto

import com.google.gson.annotations.SerializedName

data class Address(
    val lat: Double,
    val lon: Double,
    val formattedAddress: String
)



data class JobDto(
    val id: String,
    val orderId: String,
    val studentId: String,
    val moverId: String? = null,
    val jobType: String,
    val status: String,
    val volume: Double,
    val price: Double,
    val pickupAddress: Address,
    val dropoffAddress: Address,
    val calendarEventLink: String? = null,
    val scheduledTime: String,
    val createdAt: String,
    val updatedAt: String
)

data class JobListResponse(
    val jobs: List<JobDto>
)

data class JobResponse(
    val job: JobDto
)

data class UpdateJobStatusRequest(
    val status: String,
    val moverId: String? = null
)

enum class JobStatus(val value: String) {
    AVAILABLE("AVAILABLE"),
    ACCEPTED("ACCEPTED"),
    AWAITING_STUDENT_CONFIRMATION("AWAITING_STUDENT_CONFIRMATION"),
    PICKED_UP("PICKED_UP"),
   // IN_STORAGE("IN_STORAGE"),
    COMPLETED("COMPLETED"),
    CANCELLED("CANCELLED")
}

enum class JobType(val value: String) {
    STORAGE("STORAGE"),
    RETURN("RETURN")
}

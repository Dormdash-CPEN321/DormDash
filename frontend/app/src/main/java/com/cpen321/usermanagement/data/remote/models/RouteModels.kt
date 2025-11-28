package com.cpen321.usermanagement.data.remote.models

data class JobInRoute(
    val jobId: String,
    val orderId: String,
    val studentId: String,
    val jobType: String,
    val volume: Double,
    val price: Double,
    val pickupAddress: Address,
    val dropoffAddress: Address,
    val scheduledTime: String,
    val estimatedStartTime: String,
    val estimatedDuration: Int, // in minutes
    val distanceFromPrevious: Double, // in km
    val travelTimeFromPrevious: Int // in minutes
)

data class RouteMetrics(
    val totalEarnings: Double,
    val totalJobs: Int,
    val totalDistance: Double, // in km
    val totalDuration: Int, // in minutes
    val earningsPerHour: Double
)

data class StartLocation(
    val lat: Double,
    val lon: Double
)

data class SmartRouteData(
    val route: List<JobInRoute>,
    val metrics: RouteMetrics,
    val startLocation: StartLocation
)

data class SmartRouteResponse(
    val message: String,
    val data: SmartRouteData? = null
)

package com.cpen321.usermanagement.data.remote.api

import com.cpen321.usermanagement.data.remote.models.SmartRouteResponse
import retrofit2.Response
import retrofit2.http.GET
import retrofit2.http.Query

interface RouteInterface {
    @GET("routePlanner/smart")
    suspend fun getSmartRoute(
        @Query("currentLat") currentLat: Double,
        @Query("currentLon") currentLon: Double,
        @Query("maxDuration") maxDuration: Int? = null
    ): Response<SmartRouteResponse>
}

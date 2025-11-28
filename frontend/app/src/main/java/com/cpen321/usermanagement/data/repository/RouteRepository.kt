package com.cpen321.usermanagement.data.repository

import android.util.Log
import com.cpen321.usermanagement.data.remote.api.RouteInterface
import com.cpen321.usermanagement.data.remote.models.SmartRouteData
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RouteRepository @Inject constructor(
    private val routeInterface: RouteInterface
) {
    suspend fun getSmartRoute(currentLat: Double, currentLon: Double, maxDuration: Int? = null): Result<SmartRouteData> {
        return try {
            val response = routeInterface.getSmartRoute(currentLat, currentLon, maxDuration)
            
            if (response.isSuccessful) {
                val smartRouteResponse = response.body()
                if (smartRouteResponse?.data != null) {
                    Result.success(smartRouteResponse.data)
                } else {
                    Result.failure(Exception(smartRouteResponse?.message ?: "No route data available"))
                }
            } else {
                val errorMessage = response.errorBody()?.string() ?: "Failed to fetch smart route"
                Log.e("RouteRepository", "Error: $errorMessage")
                Result.failure(Exception(errorMessage))
            }
        } catch (e: java.io.IOException) {
            Log.e("RouteRepository", "Network error fetching smart route", e)
            Result.failure(e)
        } catch (e: retrofit2.HttpException) {
            Log.e("RouteRepository", "HTTP error fetching smart route: ${e.code()}", e)
            Result.failure(e)
        } catch (e: com.google.gson.JsonSyntaxException) {
            Log.e("RouteRepository", "JSON parsing error in route response", e)
            Result.failure(e)
        }
    }
}

package com.cpen321.usermanagement.data.remote.api

import com.cpen321.usermanagement.data.remote.dto.ApiResponse
import retrofit2.Response
import retrofit2.http.POST

/**
 * Development API Service
 * 
 * Provides endpoints for triggering backend development scripts.
 * Used for testing and development purposes only.
 */
interface DevApiService {

    /**
     * Trigger seeding of 10 test jobs for Smart Route testing
     */
    @POST("dev/seed-jobs")
    suspend fun seedTestJobs(): Response<ApiResponse<Map<String, Any>>>

    /**
     * Trigger seeding of 2 availability test jobs (1 within, 1 outside availability)
     */
    @POST("dev/seed-availability-jobs")
    suspend fun seedAvailabilityTestJobs(): Response<ApiResponse<Map<String, Any>>>

    /**
     * Trigger clearing of all jobs from the database
     */
    @POST("dev/clear-jobs")
    suspend fun clearJobs(): Response<ApiResponse<Map<String, Any>>>
}

package com.cpen321.usermanagement.data.remote.api

import com.cpen321.usermanagement.data.remote.dto.ApiResponse
import com.cpen321.usermanagement.data.remote.dto.JobListResponse
import com.cpen321.usermanagement.data.remote.dto.JobResponse
import com.cpen321.usermanagement.data.remote.dto.UpdateJobStatusRequest
import retrofit2.Response
import retrofit2.http.*

interface JobApiService {
    @GET("jobs/available")
    suspend fun getAvailableJobs(): Response<ApiResponse<JobListResponse>>
    
    @GET("jobs/mover")
    suspend fun getMoverJobs(): Response<ApiResponse<JobListResponse>>
    
    @GET("jobs/student")
    suspend fun getStudentJobs(): Response<ApiResponse<JobListResponse>>

    @PATCH("jobs/{id}/status")
    suspend fun updateJobStatus(
        @Path("id") jobId: String,
        @Body request: UpdateJobStatusRequest
    ): Response<ApiResponse<JobResponse>>

    @POST("jobs/{id}/arrived")
    suspend fun requestPickupConfirmation(@Path("id") jobId: String): Response<ApiResponse<Any>>

    @POST("jobs/{id}/confirm-pickup")
    suspend fun confirmPickup(@Path("id") jobId: String): Response<ApiResponse<Any>>

    @POST("jobs/{id}/delivered")
    suspend fun requestDeliveryConfirmation(@Path("id") jobId: String): Response<ApiResponse<Any>>

    @POST("jobs/{id}/confirm-delivery")
    suspend fun confirmDelivery(@Path("id") jobId: String): Response<ApiResponse<Any>>
}

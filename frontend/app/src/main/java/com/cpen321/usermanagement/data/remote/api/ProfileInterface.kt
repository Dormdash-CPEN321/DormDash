package com.cpen321.usermanagement.data.remote.api

import com.cpen321.usermanagement.data.remote.models.ApiResponse
import com.cpen321.usermanagement.data.remote.models.ProfileData
import com.cpen321.usermanagement.data.remote.models.UpdateProfileRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST

interface UserInterface {
    @GET("user/profile")
    suspend fun getProfile(
    ): Response<ApiResponse<ProfileData>>

    @POST("user/profile")
    suspend fun updateProfile(
        @Body request: UpdateProfileRequest
    ): Response<ApiResponse<ProfileData>>

    @DELETE("user/profile")
    suspend fun deleteProfile(
    ) : Response<ApiResponse<Unit>>

    @POST("user/cash-out")
    suspend fun cashOut(
        @Header("Authorization") authHeader: String
    ): Response<ApiResponse<ProfileData>>
}
package com.cpen321.usermanagement.data.repository

import android.content.Context
import android.util.Log
import com.cpen321.usermanagement.data.local.preferences.TokenManager
import com.cpen321.usermanagement.data.remote.api.RetrofitClient
import com.cpen321.usermanagement.data.remote.api.UserInterface
import com.cpen321.usermanagement.data.remote.dto.UpdateProfileRequest
import com.cpen321.usermanagement.data.remote.dto.User
import com.cpen321.usermanagement.utils.JsonUtils.parseErrorMessage
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ProfileRepositoryImpl @Inject constructor(
    @ApplicationContext private val context: Context,
    private val userInterface: UserInterface,
    private val tokenManager: TokenManager
) : ProfileRepository {

    companion object {
        private const val TAG = "ProfileRepositoryImpl"
    }

    override suspend fun getProfile(): Result<User> {
        return try {
            val response = userInterface.getProfile() // Auth header is handled by interceptor
            if (response.isSuccessful && response.body()?.data != null) {
                Result.success(response.body()!!.data!!.user)
            } else {
                val errorBodyString = response.errorBody()?.string()
                val errorMessage =
                    parseErrorMessage(errorBodyString, "Failed to fetch user information.")
                Log.e(TAG, "Failed to get profile: $errorMessage")
                tokenManager.clearToken()
                RetrofitClient.setAuthToken(null)
                Result.failure(Exception(errorMessage))
            }
        } catch (e: java.net.SocketTimeoutException) {
            Log.e(TAG, "Network timeout while getting profile", e)
            Result.failure(e)
        } catch (e: java.net.UnknownHostException) {
            Log.e(TAG, "Network connection failed while getting profile", e)
            Result.failure(e)
        } catch (e: java.io.IOException) {
            Log.e(TAG, "IO error while getting profile", e)
            Result.failure(e)
        } catch (e: retrofit2.HttpException) {
            Log.e(TAG, "HTTP error while getting profile: ${e.code()}", e)
            Result.failure(e)
        }
    }

    override suspend fun updateProfile(name: String, bio: String, profilePicture: String): Result<User> {
        return try {
            val updateRequest = UpdateProfileRequest(name = name, bio = bio, profilePicture = profilePicture)
            val response = userInterface.updateProfile(updateRequest) // Auth header is handled by interceptor
            if (response.isSuccessful && response.body()?.data != null) {
                Result.success(response.body()!!.data!!.user)
            } else {
                val errorBodyString = response.errorBody()?.string()
                val errorMessage = parseErrorMessage(errorBodyString, "Failed to update profile.")
                Log.e(TAG, "Failed to update profile: $errorMessage")
                Result.failure(Exception(errorMessage))
            }
        } catch (e: java.net.SocketTimeoutException) {
            Log.e(TAG, "Network timeout while updating profile", e)
            Result.failure(e)
        } catch (e: java.net.UnknownHostException) {
            Log.e(TAG, "Network connection failed while updating profile", e)
            Result.failure(e)
        } catch (e: java.io.IOException) {
            Log.e(TAG, "IO error while updating profile", e)
            Result.failure(e)
        } catch (e: retrofit2.HttpException) {
            Log.e(TAG, "HTTP error while updating profile: ${e.code()}", e)
            Result.failure(e)
        }
    }

    override suspend fun deleteProfile(): Result<Unit> {
        return try {
            val response = userInterface.deleteProfile() // Auth header is handled by interceptor
            if (response.isSuccessful) {
                tokenManager.clearToken()
                RetrofitClient.setAuthToken(null)
                Result.success(Unit)
            } else {
                val errorBodyString = response.errorBody()?.string()
                val errorMessage = parseErrorMessage(errorBodyString, "Failed to delete profile.")
                Log.e(TAG, "Failed to delete profile: $errorMessage")
                Result.failure(Exception(errorMessage))
            }
        } catch (e: java.net.SocketTimeoutException) {
            Log.e(TAG, "Network timeout while deleting profile", e)
            Result.failure(e)
        } catch (e: java.net.UnknownHostException) {
            Log.e(TAG, "Network connection failed while deleting profile", e)
            Result.failure(e)
        } catch (e: java.io.IOException) {
            Log.e(TAG, "IO error while deleting profile", e)
            Result.failure(e)
        } catch (e: retrofit2.HttpException) {
            Log.e(TAG, "HTTP error while deleting profile: ${e.code()}", e)
            Result.failure(e)
        }
    }

    override suspend fun updateMoverAvailability(availability: Map<String, List<List<String>>>): Result<User> {
        return try {
            val updateRequest = UpdateProfileRequest(availability = availability)
            val response = userInterface.updateProfile(updateRequest)
            if (response.isSuccessful && response.body()?.data != null) {
                Result.success(response.body()!!.data!!.user)
            } else {
                val errorBodyString = response.errorBody()?.string()
                val errorMessage = parseErrorMessage(errorBodyString, "Failed to update availability.")
                Log.e(TAG, "Failed to update availability: $errorMessage")
                Result.failure(Exception(errorMessage))
            }
        } catch (e: java.net.SocketTimeoutException) {
            Log.e(TAG, "Network timeout while updating availability", e)
            Result.failure(e)
        } catch (e: java.net.UnknownHostException) {
            Log.e(TAG, "Network connection failed while updating availability", e)
            Result.failure(e)
        } catch (e: java.io.IOException) {
            Log.e(TAG, "IO error while updating availability", e)
            Result.failure(e)
        } catch (e: retrofit2.HttpException) {
            Log.e(TAG, "HTTP error while updating availability: ${e.code()}", e)
            Result.failure(e)
        }
    }

    override suspend fun cashOut(): Result<User> {
        return try {
            val response = userInterface.cashOut("")
            if (response.isSuccessful && response.body()?.data != null) {
                Result.success(response.body()!!.data!!.user)
            } else {
                val errorBodyString = response.errorBody()?.string()
                val errorMessage = parseErrorMessage(errorBodyString, "Failed to cash out.")
                Log.e(TAG, "Failed to cash out: $errorMessage")
                Result.failure(Exception(errorMessage))
            }
        } catch (e: java.net.SocketTimeoutException) {
            Log.e(TAG, "Network timeout while cashing out", e)
            Result.failure(e)
        } catch (e: java.net.UnknownHostException) {
            Log.e(TAG, "Network connection failed while cashing out", e)
            Result.failure(e)
        } catch (e: java.io.IOException) {
            Log.e(TAG, "IO error while cashing out", e)
            Result.failure(e)
        } catch (e: retrofit2.HttpException) {
            Log.e(TAG, "HTTP error while cashing out: ${e.code()}", e)
            Result.failure(e)
        }
    }
}

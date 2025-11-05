package com.cpen321.usermanagement.fakes

import android.content.Context
import com.cpen321.usermanagement.data.remote.dto.AuthData
import com.cpen321.usermanagement.data.remote.dto.User
import com.cpen321.usermanagement.data.repository.AuthRepository
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

/**
 * Fake implementation of AuthRepository for testing.
 * Pre-configured with a logged-in mover user.
 */
class FakeAuthRepository : AuthRepository {

    private var isAuthenticated = true
    private var storedToken: String? = "fake_test_token_12345"
    private val fakeUser = User(
        _id = "test_mover_id_123",
        userRole = "mover",
        email = "testmover@test.com",
        name = "Test Mover",
        bio = "Test mover bio",
        profilePicture = "https://via.placeholder.com/150",
        availability = mapOf(
            "MONDAY" to listOf(listOf("09:00", "17:00")),
            "TUESDAY" to listOf(listOf("09:00", "17:00")),
            "WEDNESDAY" to listOf(listOf("09:00", "17:00")),
            "THURSDAY" to listOf(listOf("09:00", "17:00")),
            "FRIDAY" to listOf(listOf("09:00", "17:00"))
        ),
        capacity = 10.0f,
        carType = "Sedan",
        plateNumber = "TEST123",
        credits = 100.0f
    )

    override suspend fun signInWithGoogle(context: Context): Result<GoogleIdTokenCredential> {
        val fakeCredential = GoogleIdTokenCredential(
            id = "fake-google-id",
            idToken = "fake-id-token-12345",
            displayName = "Test User",
            familyName = "User",
            givenName = "Test",
            profilePictureUri = null,
            phoneNumber = ""
        )
        return Result.success(fakeCredential)
    }

    override suspend fun googleSignIn(tokenId: String): Result<AuthData> {
        return Result.success(AuthData(
            token = storedToken!!,
            user = fakeUser
        ))
    }

    override suspend fun googleSignUp(tokenId: String): Result<AuthData> {
        return Result.success(AuthData(
            token = storedToken!!,
            user = fakeUser
        ))
    }

    override suspend fun selectUserRole(role: String): Result<User> {
        return Result.success(fakeUser.copy(userRole = role))
    }

    override suspend fun clearToken(): Result<Unit> {
        storedToken = null
        isAuthenticated = false
        return Result.success(Unit)
    }

    override suspend fun doesTokenExist(): Boolean {
        return storedToken != null
    }

    override suspend fun getStoredToken(): String? {
        return storedToken
    }

    override suspend fun getCurrentUser(): User? {
        return if (isAuthenticated) fakeUser else null
    }

    override suspend fun isUserAuthenticated(): Boolean {
        return isAuthenticated && storedToken != null
    }
}


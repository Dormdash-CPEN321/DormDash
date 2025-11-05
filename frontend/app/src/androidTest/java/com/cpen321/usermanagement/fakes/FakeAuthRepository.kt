package com.cpen321.usermanagement.fakes

import android.content.Context
import com.cpen321.usermanagement.data.remote.dto.AuthData
import com.cpen321.usermanagement.data.remote.dto.User
import com.cpen321.usermanagement.data.repository.AuthRepository
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

/**
 * Fake implementation of AuthRepository for testing.
 * Starts signed out by default - tests can call resetToSignedIn() if needed.
 */
class FakeAuthRepository : AuthRepository {

    private var isAuthenticated = false
    private var storedToken: String? = null
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

    /**
     * Reset to signed-out state for auth flow tests
     */
    fun resetToSignedOut() {
        isAuthenticated = false
        storedToken = null
    }

    /**
     * Reset to signed-in state
     */
    fun resetToSignedIn() {
        isAuthenticated = true
        storedToken = "fake_test_token_12345"
    }

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
        isAuthenticated = true
        storedToken = "fake_test_token_12345"
        return Result.success(AuthData(
            token = storedToken!!,
            user = fakeUser
        ))
    }

    override suspend fun googleSignUp(tokenId: String): Result<AuthData> {
        isAuthenticated = true
        storedToken = "fake_test_token_12345"
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


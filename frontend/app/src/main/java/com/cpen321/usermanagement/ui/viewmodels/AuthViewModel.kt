package com.cpen321.usermanagement.ui.viewmodels

import android.content.Context
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.cpen321.usermanagement.data.remote.dto.AuthData
import com.cpen321.usermanagement.data.remote.dto.User
import com.cpen321.usermanagement.data.repository.AuthRepository
import com.cpen321.usermanagement.network.SocketClient
import com.cpen321.usermanagement.ui.navigation.NavRoutes
import com.cpen321.usermanagement.ui.navigation.NavigationStateManager
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import com.cpen321.usermanagement.MyFirebaseMessagingService

data class AuthUiState(
    // Loading states
    val isSigningIn: Boolean = false,
    val isSigningUp: Boolean = false,
    val isCheckingAuth: Boolean = true,

    // Auth states
    val isAuthenticated: Boolean = false,
    val user: User? = null,

    // Message states
    val errorMessage: String? = null,
    val successMessage: String? = null,

    // Control flags
    val shouldSkipAuthCheck: Boolean = false
)

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val navigationStateManager: NavigationStateManager,
    private val socketClient: SocketClient
) : ViewModel() {

    companion object {
        private const val TAG = "AuthViewModel"
    }

    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState: StateFlow<AuthUiState> = _uiState.asStateFlow()

    init {
        if (!_uiState.value.shouldSkipAuthCheck) {
            checkAuthenticationStatus()
        }
    }

    private fun checkAuthenticationStatus() {
        viewModelScope.launch {
            try {
                _uiState.value = _uiState.value.copy(isCheckingAuth = true)
                updateNavigationState(isLoading = true)

                val isAuthenticated = authRepository.isUserAuthenticated()
                val user = if (isAuthenticated) authRepository.getCurrentUser() else null
                val needsProfileCompletion = user?.bio == null || user.bio.isBlank()
                val needsRoleSelection = user?.userRole == null

                _uiState.value = _uiState.value.copy(
                    isAuthenticated = isAuthenticated,
                    user = user,
                    isCheckingAuth = false
                )

                updateNavigationState(
                    isAuthenticated = isAuthenticated,
                    needsProfileCompletion = needsProfileCompletion,
                    needsRoleSelection = needsRoleSelection,
                    isLoading = false,
                    userRole = user?.userRole
                )

                // Connect to socket if authenticated
                if (isAuthenticated) {
                    // get stored token (suspend)
                    val token = authRepository.getStoredToken()
                    if (token != null){
                        socketClient.connect("Bearer $token")
                    }
                    // send FCM token to backend
                    MyFirebaseMessagingService().fetchAndSendFcmToken("CHECK_AUTH")
                }
            } catch (e: java.net.SocketTimeoutException) {
                handleAuthError("Network timeout. Please check your connection.", e)
            } catch (e: java.net.UnknownHostException) {
                handleAuthError("No internet connection. Please check your network.", e)
            } catch (e: java.io.IOException) {
                handleAuthError("Connection error. Please try again.", e)
            }
        }
    }

    private fun updateNavigationState(
        isAuthenticated: Boolean = false,
        needsProfileCompletion: Boolean = false,
        needsRoleSelection: Boolean = false,
        isLoading: Boolean = false,
        userRole: String? = null
    ) {
        navigationStateManager.updateAuthenticationState(
            isAuthenticated = isAuthenticated,
            needsProfileCompletion = needsProfileCompletion,
            isLoading = isLoading,
            currentRoute = NavRoutes.LOADING,
            needsRoleSelection = needsRoleSelection,
            userRole = userRole
        )
    }

    private fun handleAuthError(errorMessage: String, exception: Exception) {
        Log.e(TAG, "Authentication check failed: $errorMessage", exception)
        _uiState.value = _uiState.value.copy(
            isCheckingAuth = false,
            isAuthenticated = false,
            errorMessage = errorMessage
        )
        updateNavigationState()
    }

    suspend fun signInWithGoogle(context: Context): Result<GoogleIdTokenCredential> {
        return authRepository.signInWithGoogle(context)
    }

    private fun handleGoogleAuthResult(
        credential: GoogleIdTokenCredential,
        isSignUp: Boolean,
        authOperation: suspend (String) -> Result<AuthData>
    ) {
        viewModelScope.launch {
            // Update loading state based on operation type
            _uiState.value = _uiState.value.copy(
                isSigningIn = !isSignUp,
                isSigningUp = isSignUp
            )

            authOperation(credential.idToken)
                .onSuccess { authData ->
                    val needsProfileCompletion =
                        authData.user.bio == null || authData.user.bio.isBlank()
                    val needsRoleSelection = authData.user.userRole == null

                    _uiState.value = _uiState.value.copy(
                        isSigningIn = false,
                        isSigningUp = false,
                        isAuthenticated = true,
                        user = authData.user,
                        errorMessage = null
                    )

                    // Trigger navigation through NavigationStateManager
                    navigationStateManager.updateAuthenticationState(
                        isAuthenticated = true,
                        needsProfileCompletion = needsProfileCompletion,
                        isLoading = false,
                        currentRoute = NavRoutes.AUTH,
                        needsRoleSelection = needsRoleSelection,
                        userRole = authData.user.userRole
                    )

                    // Connect to socket as client
                    val token = authData.token
                    socketClient.connect("Bearer $token")
                }
                .onFailure { error ->
                    val operationType = if (isSignUp) "sign up" else "sign in"
                    Log.e(TAG, "Google $operationType failed", error)
                    _uiState.value = _uiState.value.copy(
                        isSigningIn = false,
                        isSigningUp = false,
                        errorMessage = error.message
                    )
                }
        }
    }
    fun handleGoogleSignInResult(credential: GoogleIdTokenCredential) {
        handleGoogleAuthResult(credential, isSignUp = false) { idToken ->
            val result = authRepository.googleSignIn(idToken)

            result.onSuccess { authData ->
                // Get the FCM token and send it to backend
                MyFirebaseMessagingService().fetchAndSendFcmToken("SIGN_IN")
            }

            result // return the original result to handleGoogleAuthResult
        }
    }

    fun handleGoogleSignUpResult(credential: GoogleIdTokenCredential) {
        handleGoogleAuthResult(credential, isSignUp = true) { idToken ->
             val result = authRepository.googleSignUp(idToken)

            result.onSuccess { authData ->
                MyFirebaseMessagingService().fetchAndSendFcmToken("SIGN_UP")
            }

            result // return the original result to handleGoogleAuthResult
        }
    }

    fun selectUserRole(role: String) {
        viewModelScope.launch {
            authRepository.selectUserRole(role)
                .onSuccess { user ->
                    // Update UI state with the user containing the role
                    _uiState.value = _uiState.value.copy(user = user)
                    
                    // Navigate to appropriate role-specific home screen
                    val needsProfileCompletion = user.bio.isNullOrBlank()
                    val userRole = user.userRole ?: role // Use the role from user or fallback to selected role
                    navigationStateManager.handleRoleSelection(
                        userRole = userRole,
                        message = "Welcome! Your role has been set to ${userRole.lowercase().replaceFirstChar { it.uppercase() }}",
                        needsProfileCompletion = needsProfileCompletion
                    )
                }
                .onFailure { error ->
                    Log.e(TAG, "Role selection failed", error)
                    _uiState.value = _uiState.value.copy(errorMessage = error.message)
                }
        }
    }

    fun handleSignout(){
        viewModelScope.launch {
            // Clear FCM token from backend before logging out
            try {
                Log.d(TAG, "Starting logout process - clearing FCM token")
                val fcmService = MyFirebaseMessagingService()
                fcmService.clearFcmTokenFromBackend()
                Log.d(TAG, "✅ FCM token cleared successfully on logout")
            } catch (e: java.io.IOException) {
                Log.e(TAG, "❌ Network error clearing FCM token on logout: ${e.message}", e)
                // Continue with logout even if FCM token clearing fails
            } catch (e: retrofit2.HttpException) {
                Log.e(TAG, "❌ HTTP error clearing FCM token on logout: ${e.code()}", e)
                // Continue with logout even if FCM token clearing fails
            }
            
            Log.d(TAG, "Clearing auth token and disconnecting socket")
            authRepository.clearToken()
            socketClient.disconnect()
            _uiState.value  = AuthUiState(
                isAuthenticated = false,
                isCheckingAuth = false,
                shouldSkipAuthCheck = true
            )
            navigationStateManager.updateAuthenticationState(
                isAuthenticated = false,
                needsProfileCompletion = false,
                isLoading = false,
                currentRoute = NavRoutes.AUTH
            )
            Log.d(TAG, "✅ Logout complete")
        }
    }
    fun handleAccountDeletion() {
        viewModelScope.launch {
            // Clear FCM token from backend before account deletion
            try {
                val fcmService = MyFirebaseMessagingService()
                fcmService.clearFcmTokenFromBackend()
                Log.d(TAG, "FCM token cleared on account deletion")
            } catch (e: java.io.IOException) {
                Log.e(TAG, "Network error clearing FCM token on account deletion", e)
                // Continue with account deletion even if FCM token clearing fails
            } catch (e: retrofit2.HttpException) {
                Log.e(TAG, "HTTP error clearing FCM token on account deletion", e)
                // Continue with account deletion even if FCM token clearing fails
            }
            
            authRepository.clearToken()
            socketClient.disconnect()
            _uiState.value = AuthUiState(
                isAuthenticated = false,
                isCheckingAuth = false,
                shouldSkipAuthCheck = true // Skip auth check after manual sign out
            )
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(errorMessage = null)
    }

    fun setSuccessMessage(message: String) {
        _uiState.value = _uiState.value.copy(successMessage = message)
    }

    fun clearSuccessMessage() {
        _uiState.value = _uiState.value.copy(successMessage = null)
    }
}

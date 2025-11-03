package com.cpen321.usermanagement.ui.navigation

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

sealed class NavigationEvent {
    object NavigateToAuth : NavigationEvent()
    object NavigateToMain : NavigationEvent()
    object NavigateToProfileCompletion : NavigationEvent()
    object NavigateToProfile : NavigationEvent()
    object NavigateToManageProfile : NavigationEvent()

    object NavigateToManageOrders : NavigationEvent()
    data class NavigateToAuthWithMessage(val message: String) : NavigationEvent()
    data class NavigateToMainWithMessage(val message: String) : NavigationEvent()
    object NavigateBack : NavigationEvent()
    object ClearBackStack : NavigationEvent()
    object NoNavigation : NavigationEvent()
    object NavigateToRoleSelection : NavigationEvent()
    object NavigateToStudentMain : NavigationEvent()
    object NavigateToMoverMain : NavigationEvent()
    data class NavigateToStudentMainWithMessage(val message: String) : NavigationEvent()
    data class NavigateToMoverMainWithMessage(val message: String) : NavigationEvent()
}

data class NavigationState(
    val currentRoute: String = NavRoutes.LOADING,
    val isAuthenticated: Boolean = false,
    val needsProfileCompletion: Boolean = false,
    val isLoading: Boolean = true,
    val isNavigating: Boolean = false,
    val needsRoleSelection: Boolean = false,
    val userRole: String? = null
)

@Singleton
class NavigationStateManager @Inject constructor() {

    private val _navigationEvent = MutableStateFlow<NavigationEvent>(NavigationEvent.NoNavigation)
    val navigationEvent: StateFlow<NavigationEvent> = _navigationEvent.asStateFlow()

    private val _navigationState = MutableStateFlow(NavigationState())

    /**
     * Updates the authentication state and triggers appropriate navigation
     */
    fun updateAuthenticationState(
        isAuthenticated: Boolean,
        needsProfileCompletion: Boolean,
        isLoading: Boolean = false,
        currentRoute: String = _navigationState.value.currentRoute,
        needsRoleSelection: Boolean = false,
        userRole: String? = null
    ) {
        val newState = _navigationState.value.copy(
            isAuthenticated = isAuthenticated,
            needsProfileCompletion = needsProfileCompletion,
            isLoading = isLoading,
            currentRoute = currentRoute,
            needsRoleSelection = needsRoleSelection,
            userRole = userRole
        )
        _navigationState.value = newState

        // Trigger navigation based on state
        if (!isLoading) {
            handleAuthenticationNavigation(currentRoute, isAuthenticated, needsProfileCompletion, needsRoleSelection)
        }
    }

    private fun handleAuthenticationNavigation(
        currentRoute: String,
        isAuthenticated: Boolean,
        needsProfileCompletion: Boolean, 
        needsRoleSelection: Boolean = false
    ) {
        when {
            // From loading screen after auth check
            currentRoute == NavRoutes.LOADING -> {
                if (isAuthenticated) {
                    if(needsRoleSelection){
                        navigateToRoleSelection()
                    } else if (needsProfileCompletion) {
                        navigateToProfileCompletion()
                    } else {
                        // User is authenticated and has a role, navigate to role-specific screen
                        navigateToRoleBasedMainScreen()
                    }
                } else {
                    navigateToAuth()
                }
            }
            // From auth screen after successful login
            currentRoute.startsWith(NavRoutes.AUTH) && isAuthenticated -> {
                if (needsRoleSelection) {
                    navigateToRoleSelection()
                } else if (needsProfileCompletion) {
                    navigateToProfileCompletion()
                } else {
                    // User is authenticated and has a role, navigate to role-specific screen
                    navigateToRoleBasedMainScreen()
                }
            }
        }
    }

    private fun navigateToRoleBasedMainScreen() {
        val currentUserRole = _navigationState.value.userRole
        when (currentUserRole?.uppercase()) {
            "STUDENT" -> navigateToStudentMain()
            "MOVER" -> navigateToMoverMain()
            else -> navigateToMain() // Fallback to generic main screen
        }
    }

    /**
     * Navigate to auth screen
     */
    fun navigateToAuth(message: String? = null) {
        _navigationEvent.value = if (message != null) {
            NavigationEvent.NavigateToAuthWithMessage(message)
        } else {
            NavigationEvent.NavigateToAuth
        }
        _navigationState.value = _navigationState.value.copy(currentRoute = NavRoutes.AUTH)
    }

    /*
    * Navigate to role selection
    */
    fun navigateToRoleSelection() {
        _navigationEvent.value = NavigationEvent.NavigateToRoleSelection
        _navigationState.value = _navigationState.value.copy(currentRoute = NavRoutes.ROLE_SELECTION)
    }

    /**
     * Navigate to main screen
     */
    fun navigateToMain(message: String? = null) {
        _navigationEvent.value = if (message != null) {
            NavigationEvent.NavigateToMainWithMessage(message)
        } else {
            NavigationEvent.NavigateToMain
        }
        _navigationState.value = _navigationState.value.copy(currentRoute = NavRoutes.MAIN)
    }

    /**
     * Navigate to student main screen
     */
    fun navigateToStudentMain(message: String? = null) {
        _navigationEvent.value = if (message != null) {
            NavigationEvent.NavigateToStudentMainWithMessage(message)
        } else {
            NavigationEvent.NavigateToStudentMain
        }
        _navigationState.value = _navigationState.value.copy(currentRoute = NavRoutes.STUDENT)
    }

    /**
     * Navigate to mover main screen
     */
    fun navigateToMoverMain(message: String? = null) {
        _navigationEvent.value = if (message != null) {
            NavigationEvent.NavigateToMoverMainWithMessage(message)
        } else {
            NavigationEvent.NavigateToMoverMain
        }
        _navigationState.value = _navigationState.value.copy(currentRoute = NavRoutes.MOVER)
    }

    /**
     * Navigate to profile completion screen
     */
    fun navigateToProfileCompletion() {
        _navigationEvent.value = NavigationEvent.NavigateToProfileCompletion
        _navigationState.value =
            _navigationState.value.copy(currentRoute = NavRoutes.PROFILE_COMPLETION)
    }

    /**
     * Navigate to profile screen
     */
    fun navigateToProfile() {
        _navigationEvent.value = NavigationEvent.NavigateToProfile
        _navigationState.value = _navigationState.value.copy(currentRoute = NavRoutes.PROFILE)
    }

    /**
     * Navigate to manage profile screen
     */
    fun navigateToManageProfile() {
        _navigationEvent.value = NavigationEvent.NavigateToManageProfile
        _navigationState.value =
            _navigationState.value.copy(currentRoute = NavRoutes.MANAGE_PROFILE)
    }

   

    /**
     * Navigate to Job History Screen
     */
    fun navigateToManageOrders(){
        _navigationEvent.value = NavigationEvent.NavigateToManageOrders
        _navigationState.value =
            _navigationState.value.copy(currentRoute = NavRoutes.JOB_HISTORY)
    }


    /**
     * Navigate back
     */
    fun navigateBack() {
        _navigationEvent.value = NavigationEvent.NavigateBack
    }

    /**
     * Handle sign out
     */
    fun handleSignOut(){
        _navigationState.value = _navigationState.value.copy(isNavigating = true)

        updateAuthenticationState(
            isAuthenticated = false,
            needsProfileCompletion = false,
            isLoading = false
        )
        navigateToAuth("Signed Out Successfully")
    }

    /**
     * Handle account deletion
     */
    fun handleAccountDeletion() {
        _navigationState.value = _navigationState.value.copy(isNavigating = true)

        updateAuthenticationState(
            isAuthenticated = false,
            needsProfileCompletion = false,
            isLoading = false
        )
        navigateToAuth("Account deleted successfully!")
    }

    /**
     * Handle profile completion
     */
    fun handleProfileCompletion(message: String? = null) {
        _navigationState.value = _navigationState.value.copy(needsProfileCompletion = false)
        // Navigate to role-specific screen based on user role
        val currentUserRole = _navigationState.value.userRole
        when (currentUserRole?.uppercase()) {
            "STUDENT" -> navigateToStudentMain(message)
            "MOVER" -> navigateToMoverMain(message)
            else -> navigateToMain(message) // Fallback to generic main screen
        }
    }

    /**
     * Handle role selection completion
     */
    fun handleRoleSelection(userRole: String, needsProfileCompletion: Boolean, message: String? = null) {
        // Update navigation state with the selected user role
        _navigationState.value = _navigationState.value.copy(
            needsRoleSelection = false,
            userRole = userRole
        )
        
        if (needsProfileCompletion) {
            navigateToProfileCompletion()
        } else {
            // Navigate to role-specific main screen with optional message
            when (userRole.uppercase()) {
                "STUDENT" -> navigateToStudentMain(message)
                "MOVER" -> navigateToMoverMain(message)
                else -> navigateToMain(message) // Fallback to generic main screen
            }
        }
    }

    /**
     * Get the current user role
     */
    fun getCurrentUserRole(): String? {
        return _navigationState.value.userRole
    }

    /**
     * Reset navigation events after handling
     */
    fun clearNavigationEvent() {
        _navigationEvent.value = NavigationEvent.NoNavigation
        // Clear navigating flag when navigation is complete
        _navigationState.value = _navigationState.value.copy(isNavigating = false)
    }
}

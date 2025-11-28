package com.cpen321.usermanagement.performance.UIResponsivness

import androidx.compose.ui.test.*
import android.content.Intent
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Until
import com.cpen321.usermanagement.MainActivity
import com.cpen321.usermanagement.utils.BaseTestSetup
import com.cpen321.usermanagement.utils.TestAccountHelper
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Before
import org.junit.After


/**
 * Base class for UI responsiveness/performance tests.
 * Extends BaseTestSetup to inherit common test infrastructure.
 * Uses TestAccountHelper for authentication with specific roles.
 * 
 * Subclasses must override getTestEmail(), getTestPassword(), and getRoleSelector()
 * to provide role-specific authentication.
 */
@HiltAndroidTest
abstract class UIResponsivnessTestBase : BaseTestSetup() {

    protected val appPackage = "com.cpen321.usermanagement"
    private val launchTimeout = 5000L
    protected val timeout = 100L // 0.1 seconds timeout for elements to appear

    /**
     * Return the test email for this role (student or mover).
     */
    protected abstract fun getTestEmail(): String

    /**
     * Return the test password for this role (student or mover).
     */
    protected abstract fun getTestPassword(): String

    /**
     * Return the role selector function for this role.
     */
    protected abstract fun getRoleSelector(): (ComposeTestRule) -> Unit

    @Before
    override fun baseSetup() {
        super.baseSetup()
        
        // Check if we're already signed in by looking for role-specific screens
        val alreadySignedIn = isAlreadySignedIn()
        
        if (!alreadySignedIn) {
            signIn()
        }
    }

    /**
     * Check if already signed in by looking for main screen indicators.
     */
    private fun isAlreadySignedIn(): Boolean {
        val completeProfileNodes = composeTestRule
            .onAllNodesWithText("Complete Your Profile", useUnmergedTree = true)
            .fetchSemanticsNodes()

        if (completeProfileNodes.isNotEmpty()) {
            // Skip profile completion
            composeTestRule
                .onNodeWithText("Skip", useUnmergedTree = true)
                .performClick()
            composeTestRule.waitForIdle()
            return true
        }

        // Check for DormDash main screen
        val mainScreenNodes = composeTestRule
            .onAllNodesWithText("DormDash", useUnmergedTree = true)
            .fetchSemanticsNodes()

        return mainScreenNodes.isNotEmpty()
    }

    /**
     * Signs in with the appropriate test account based on role.
     */
    private fun signIn() {
        // First ensure the account exists
        setupTestAccount()

        // Then sign in
        TestAccountHelper.signIn(
            composeTestRule = composeTestRule,
            device = device,
            email = getTestEmail(),
            roleSelector = getRoleSelector()
        )
    }

    /**
     * Sets up the test account for the appropriate role.
     */
    private fun setupTestAccount() {
        TestAccountHelper.setupTestAccount(
            composeTestRule = composeTestRule,
            device = device,
            email = getTestEmail(),
            password = getTestPassword(),
            roleSelector = getRoleSelector()
        )
    }

    @After
    fun resetToHome() {
        try {
            repeat(5) {
                val isHomeScreen = composeTestRule.onAllNodesWithText("DormDash", useUnmergedTree = true)
                    .fetchSemanticsNodes().isNotEmpty()

                if (isHomeScreen) return

                device.pressBack()
                composeTestRule.waitForIdle()
            }

            // Final verification — wait up to 3 seconds for "Your orders" to appear
            composeTestRule.waitUntil(timeoutMillis = 3000) {
                composeTestRule.onAllNodesWithText("DormDash", useUnmergedTree = true)
                    .fetchSemanticsNodes().isNotEmpty()
            }

        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}

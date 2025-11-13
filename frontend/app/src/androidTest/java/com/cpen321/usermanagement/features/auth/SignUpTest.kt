package com.cpen321.usermanagement.features.auth

import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Until
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Test suite for the Sign-Up functionality.
 * 
 * Tests the new user registration flow using a dedicated test Google account.
 * The setupTestAccount() helper creates a new account if it doesn't exist on
 * the device, ensuring tests work on fresh emulators.
 */
@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class SignUpTest: AuthTestBase() {

    /**
     * Verifies that the authentication screen displays both sign-in and sign-up buttons.
     * 
     * This is the same check as SignInTest to ensure consistency across test suites.
     */
    @Test
    fun authScreen_showsBothButtons() {
        composeTestRule.waitForIdle()

        // Both buttons should be visible simultaneously
        composeTestRule.onNodeWithText("Sign in with Google", useUnmergedTree = true)
            .assertExists()
        composeTestRule.onNodeWithText("Sign up with Google", useUnmergedTree = true)
            .assertExists()
    }

    /**
     * Tests the complete sign-up flow for a new user.
     * 
     * Test Steps:
     * 1. Calls setupTestAccount() which:
     *    - Clicks "Sign up with Google" button
     *    - Waits for Google account picker
     *    - Either selects existing test account OR adds it via "Add another account"
     *    - Enters test email and password via UI Automator if adding new account
     *    - Handles consent screens and "Skip" prompts
     *    - Skips "Complete Your Profile" popup if shown
     * 2. Verifies successful sign-up by checking for the DormDash title on main screen
     * 
     * Expected Result: New user is registered and main screen is displayed
     */
    @Test
    fun test_SignUp_NavigateToMainScreen() {
        // Use setupTestAccount() which looks for test account and adds it if needed, and signs up
        setupTestAccount()

        // Verify we're on main screen
        composeTestRule.onNodeWithText("DormDash", useUnmergedTree = true)
            .assertExists("Title should exist")
    }

    /*
    * Test for failure scenario 4a
    * Account Should already be Set up
     */
    @Test
    fun testSignUp_AfterAccountSetUp_UserAlreadyExists(){
        composeTestRule.onNodeWithText("Sign up with Google", useUnmergedTree = true)
            .assertExists("Sign up button should exist")
            .performClick()

        // Wait for Google account picker dialog to appear
        val accountPickerAppeared = device.wait(
            Until.hasObject(By.pkg("com.google.android.gms")),
            10_000
        )

        if (accountPickerAppeared) {
            Thread.sleep(1000) // Wait for UI to settle

            val testEmail = getTestEmail()

            // Look for the test account email
            val testAccountElement = device.findObject(By.text(testEmail))

            if (testAccountElement != null) {
                // Account exists, click it
                testAccountElement.click()
                Thread.sleep(2000) // Wait for consent screen to load

                // Verify error message is displayed
                composeTestRule.onNodeWithText(
                    "User already exists, please sign in instead.",
                    useUnmergedTree = true
                ).assertExists("Error message should be displayed for existing user trying to sign up again")
            }
        }
    }

}
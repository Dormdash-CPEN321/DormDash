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
 * Test suite for the Sign-In functionality.
 * 
 * Tests the student sign-in flow using a dedicated test Google account
 * configured in test.properties. These tests use UI Automator to interact
 * with the Google Sign-In system UI outside of the app.
 */
@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class SignInTest : AuthTestBase() {

    /**
     * Verifies that the authentication screen displays both sign-in and sign-up buttons.
     * 
     * This test ensures the initial auth screen is properly rendered with both
     * authentication options visible to the user.
     */
    @Test
    fun authScreen_showsBothButtons() {
        composeTestRule.waitForIdle()

        // Both buttons should be visible simultaneously
        composeTestRule.onNodeWithText("Sign in with Google", useUnmergedTree = true)
            .assertExists("Sign in button should exist")
        composeTestRule.onNodeWithText("Sign up with Google", useUnmergedTree = true)
            .assertExists("Sign up button should exist")
    }

    /**
     * Tests the complete sign-in flow for an existing user.
     * 
     * Test Steps:
     * 1. Calls signIn() helper which:
     *    - Clicks "Sign in with Google" button
     *    - Waits for Google account picker
     *    - Selects the test account from test.properties
     *    - Handles any consent screens if present
     * 2. Verifies successful sign-in by checking for the DormDash title
     * 
     * Expected Result: User is signed in and main screen is displayed
     */
    @Test
    fun test_SignIn() {
        // Use the signIn() function which looks for the test account
        signIn()

        // Verify we're signed in by checking for the title
        composeTestRule.onNodeWithText("DormDash", useUnmergedTree = true)
            .assertExists("Title should exist after sign in")
    }
}
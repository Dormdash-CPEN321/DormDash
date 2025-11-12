package com.cpen321.usermanagement.features.auth

import androidx.compose.ui.test.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Test suite for the Delete Account functionality.
 * 
 * Tests that users can permanently delete their account and all associated data.
 * After deletion, users are returned to the authentication screen.
 */
@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class DeleteAccountTest : AuthTestBase() {

    /**
     * Tests the complete account deletion flow.
     * 
     * Test Steps:
     * 1. Signs in using the test account
     * 2. Navigates to profile screen by clicking the profile button
     * 3. Waits for profile screen to fully load
     * 4. Clicks the "Delete Account" button
     * 5. Confirms deletion in the confirmation dialog
     * 6. Waits for navigation back to auth screen
     * 7. Verifies presence of "Sign in with Google" button
     * 
     * Expected Result: Account is deleted, all data removed, and user returned to auth screen
     * 
     * Note: This permanently deletes the test account from the backend. The account
     * can be recreated by running SignUpTest again.
     */
    @Test
    fun deleteAccountTest_returnsToAuthScreen() {
        // Step 1: Sign in
        signIn()

        composeTestRule.waitForIdle()
        
        // Step 2: Click on the profile icon to navigate to profile screen
        composeTestRule
            .onNodeWithTag("ProfileButton")
            .assertExists("Profile button should exist")
            .performClick()

        // Step 3: Wait for profile screen to load
        composeTestRule.waitUntil(timeoutMillis = 10_000) {
            composeTestRule
                .onAllNodesWithText("Manage Profile", useUnmergedTree = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }

        // Step 4: Find and click the "Delete Account" button
        composeTestRule
            .onNodeWithText("Delete Account", useUnmergedTree = true)
            .assertExists("Delete Account button should exist on profile screen")
            .performClick()

        // Step 5: Confirm deletion in the dialog
        composeTestRule
            .onNodeWithText("Confirm", useUnmergedTree = true)
            .assertExists("Confirm button should exist in deletion dialog")
            .performClick()

        // Step 6: Wait for navigation back to auth screen
        composeTestRule.waitUntil(timeoutMillis = 10_000) {
            composeTestRule
                .onAllNodesWithText("DormDash", useUnmergedTree = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }

        // Step 7: Assert we're back on the auth screen by checking for sign-in button
        composeTestRule
            .onNodeWithText("Sign in with Google", useUnmergedTree = true)
            .assertExists("Should return to auth screen after account deletion")
    }
}

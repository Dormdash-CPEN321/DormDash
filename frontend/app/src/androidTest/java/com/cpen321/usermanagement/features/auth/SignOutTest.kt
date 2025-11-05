package com.cpen321.usermanagement.features.auth

import androidx.compose.ui.test.*
import androidx.test.ext.junit.runners.AndroidJUnit4
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Test
import org.junit.runner.RunWith

@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class SignOutTest : AuthTestBase() {

    @Test
    fun signOut_returnsToAuthScreen() {
        // Step 1: Sign in first
        signIn()

        // Step 2: Click on the profile icon to navigate to profile screen
        composeTestRule
            .onNodeWithTag("ProfileButton")
            .assertExists("Profile button should exist")
            .performClick()

        // Step 3: Wait for profile screen to load
        composeTestRule.waitForIdle()

        // Step 4: Find and click the "Sign Out" button
        composeTestRule
            .onNodeWithText("Sign Out", useUnmergedTree = true)
            .assertExists("Sign Out button should exist on profile screen")
            .performClick()

        // Step 5: Wait for navigation back to auth screen
        composeTestRule.waitUntil(timeoutMillis = 10_000) {
            composeTestRule
                .onAllNodesWithText("DormDash", useUnmergedTree = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }

        // Step 6: Assert we're back on the auth screen by checking for sign-in button
        composeTestRule
            .onNodeWithText("Sign in with Google", useUnmergedTree = true)
            .assertExists("Should return to auth screen after sign out")
    }
}

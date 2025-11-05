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

@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class SignInTest : AuthTestBase() {

    override val startSignedOut: Boolean = true

    @Test
    fun authScreen_showsBothButtons() {
        composeTestRule.waitForIdle()

        // Both buttons should be visible simultaneously
        composeTestRule.onNodeWithText("Sign in with Google", useUnmergedTree = true)
            .assertExists("Sign in button should exist")
        composeTestRule.onNodeWithText("Sign up with Google", useUnmergedTree = true)
            .assertExists("Sign up button should exist")
    }

    @Test
    fun test_SignIn(){
        // Click the sign-in button
        composeTestRule.onNodeWithText("Sign in with Google", useUnmergedTree = true)
            .performClick()

        // Wait for Google account picker dialog to appear (timeout: 10 seconds)
        val accountPickerAppeared = device.wait(
            Until.hasObject(By.pkg("com.google.android.gms")),
            10_000
        )

        if (accountPickerAppeared) {
            // Wait briefly for account items to become clickable
            device.wait(Until.hasObject(By.clickable(true)), 3_000)

            // Choose the first clickable object (account entry). You may need to refine selector per device.
            val firstClickable = device.findObject(By.clickable(true))
            firstClickable?.click()
        }

        composeTestRule.waitForIdle()

        // Check if "Complete Your Profile" popup appears and skip it if present
        val completeProfileNodes = composeTestRule
            .onAllNodesWithText("Complete Your Profile", useUnmergedTree = true)
            .fetchSemanticsNodes()

        if (completeProfileNodes.isNotEmpty()) {
            // Try to find and click "Skip" or "Later" button
            composeTestRule
                .onNodeWithText("Skip", useUnmergedTree = true)
                .performClick()
        }

        composeTestRule.waitForIdle()

        // Wait for sign-in flow to complete
        composeTestRule.waitUntil(timeoutMillis = 3000) {
            composeTestRule
                .onAllNodesWithText("DormDash", useUnmergedTree = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }

        // title is rendered as two Text nodes (app name + role). Assert both parts separately:
        composeTestRule.onNodeWithText("DormDash", useUnmergedTree = true).assertExists("Title Should Exist")
    }
}
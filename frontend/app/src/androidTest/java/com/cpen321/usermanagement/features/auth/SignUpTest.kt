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
class SignUpTest: AuthTestBase() {

    override val startSignedOut: Boolean = true

    @Test
    fun authScreen_showsBothButtons() {
        composeTestRule.waitForIdle()

        // Both buttons should be visible simultaneously
        composeTestRule.onNodeWithText("Sign in with Google", useUnmergedTree = true)
            .assertExists()
        composeTestRule.onNodeWithText("Sign up with Google", useUnmergedTree = true)
            .assertExists()
    }

    @Test
    fun test_SignUp_NavigateToMainScreen(){
        // Click the sign-in button
        composeTestRule.onNodeWithText("Sign up with Google", useUnmergedTree = true)
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

        // Wait for sign-up flow to complete
        composeTestRule.waitUntil(timeoutMillis = 3000) {
            composeTestRule
                .onAllNodesWithText("I'm a Student", useUnmergedTree = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }

        // choose student role for first account
        composeTestRule.onNodeWithText("I'm a Student", useUnmergedTree = true).assertExists("Role button should exist").performClick()

        // skip bio
        composeTestRule.waitUntil(timeoutMillis = 10_000) {
            composeTestRule
                .onAllNodesWithText("Skip", useUnmergedTree = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }
        composeTestRule.onNodeWithText("Skip", useUnmergedTree = true).assertExists("Skip button should exist").performClick()

        // title is rendered as two Text nodes (app name + role). Assert both parts separately:
        composeTestRule.onNodeWithText("DormDash", useUnmergedTree = true).assertExists("Title should exist")
    }



}
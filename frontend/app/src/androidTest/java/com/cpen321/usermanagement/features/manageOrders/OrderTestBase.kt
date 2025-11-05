package com.cpen321.usermanagement.features.manageOrders

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import com.cpen321.usermanagement.MainActivity
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Before
import org.junit.Rule
import org.junit.runner.RunWith

@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
abstract class OrderTestBase {

    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    protected lateinit var device: UiDevice

    @Before
    fun baseSetup() {
        hiltRule.inject()
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())

        // Wait for the app to settle after injection
        // The FakeAuthRepository automatically provides a logged-in mover
        composeTestRule.waitForIdle()

        // Grant notification permission automatically
        grantNotificationPermission()

        //always need to be signed in for these use cases
        signIn()

    }
    protected fun grantNotificationPermission() {
        device.wait(
            androidx.test.uiautomator.Until.findObject(
                androidx.test.uiautomator.By.text("Allow")
            ),
            5000
        )?.click()
    }

    fun signIn(){
        composeTestRule.waitForIdle()

        val isNotAuthenticated = composeTestRule
            .onAllNodesWithText("Sign in with Google")
            .fetchSemanticsNodes()
            .isNotEmpty()

        if (isNotAuthenticated) {
            // Click the sign-in button
            composeTestRule.onNodeWithText("Sign in with Google", useUnmergedTree = true)
                .assertExists("Sign in button should exist (OrderTestBase)")
                .performClick()

            // Wait for Google account picker dialog to appear
            val accountPickerAppeared = device.wait(
                Until.hasObject(By.pkg("com.google.android.gms")),
                10_000
            )

            if (accountPickerAppeared) {
                // Wait briefly for account items to become clickable
                device.wait(Until.hasObject(By.clickable(true)), 3_000)

                // Choose the first clickable object (account entry)
                val firstClickable = device.findObject(By.clickable(true))
                firstClickable?.click()
            }

            // Wait for sign-in flow to complete
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

            // Wait for main screen to appear
            composeTestRule.waitUntil(timeoutMillis = 5000) {
                composeTestRule
                    .onAllNodesWithText("DormDash", useUnmergedTree = true)
                    .fetchSemanticsNodes()
                    .isNotEmpty()
            }
        } else {
            // authenticated already
            return
        }
    }
}
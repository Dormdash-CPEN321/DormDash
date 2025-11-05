package com.cpen321.usermanagement.features.auth

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
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
import org.junit.Test
import org.junit.runner.RunWith

@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class SignOutTest {

    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    protected lateinit var device: UiDevice

    @Before
    fun baseSetup() {
        hiltRule.inject()
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())


        composeTestRule.waitForIdle()

        // Grant notification permission automatically
        grantNotificationPermission()
    }

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
        composeTestRule.waitForIdle()

        // Step 6: Assert we're back on the auth screen by checking for sign-in button
        composeTestRule
            .onNodeWithText("Sign in with Google", useUnmergedTree = true)
            .assertExists("Should return to auth screen after sign out")
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
        // Click the sign-in button
        composeTestRule.onNodeWithText("Sign in with Google", useUnmergedTree = true)
            .assertExists()
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

        // Wait for sign-in flow to complete and main screen to appear
        composeTestRule.waitUntil(timeoutMillis = 10_000) {
            composeTestRule
                .onAllNodesWithText("DormDash", useUnmergedTree = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }
    }
}

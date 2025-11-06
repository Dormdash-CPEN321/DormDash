package com.cpen321.usermanagement

import android.content.Intent
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Before
import org.junit.Rule
import org.junit.runner.RunWith

/**
 * Base class for Find Jobs feature tests.
 * Provides common setup and utilities for testing.
 *
 */
@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
abstract class FindJobsTestBase {

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
        composeTestRule.waitForIdle()

        // Grant notification permission automatically
        grantNotificationPermission()

        // Always need to be signed in as a mover for find jobs use cases
        signInAsMover()
    }

    protected fun grantNotificationPermission() {
        device.wait(
            Until.findObject(By.text("Allow")),
            5000
        )?.click()
    }

    private fun signInAsMover() {
        composeTestRule.waitForIdle()

        val isNotAuthenticated = composeTestRule
            .onAllNodesWithText("Sign in with Google")
            .fetchSemanticsNodes()
            .isNotEmpty()

        if (isNotAuthenticated) {
            // Click the sign-in button
            composeTestRule.onNodeWithText("Sign in with Google", useUnmergedTree = true)
                .assertExists("Sign in button should exist (FindJobsTestBase)")
                .performClick()

            // Wait for Google account picker dialog to appear
            val accountPickerAppeared = device.wait(
                Until.hasObject(By.pkg("com.google.android.gms")),
                10_000
            )

            if (accountPickerAppeared) {
                // Wait briefly for account items to become clickable
                device.wait(Until.hasObject(By.clickable(true)), 3_000)

                // Choose the first clickable object (account entry - assumed to be a mover)
                val firstClickable = device.findObject(By.clickable(true))
                firstClickable?.click()
            }

            // Wait for sign-in flow to complete
            composeTestRule.waitForIdle()
            Thread.sleep(2000)

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
        }
        // If already authenticated, continue
    }

    /**
     * Grant location permission using UI Automator
     */
    protected fun grantLocationPermission() {
        // Wait for permission dialog and click "While using the app" or "Only this time"
        device.wait(
            androidx.test.uiautomator.Until.findObject(
                androidx.test.uiautomator.By.text("While using the app")
            ),
            5000
        )?.click()
            ?: device.wait(
                androidx.test.uiautomator.Until.findObject(
                    androidx.test.uiautomator.By.text("Only this time")
                ),
                5000
            )?.click()
    }

    /**
     * Deny location permission using UI Automator
     */
    protected fun denyLocationPermission() {
        device.wait(
            androidx.test.uiautomator.Until.findObject(
                androidx.test.uiautomator.By.text("Don't allow")
            ),
            5000
        )?.click()
            ?: device.wait(
                androidx.test.uiautomator.Until.findObject(
                    androidx.test.uiautomator.By.text("Deny")
                ),
                5000
            )?.click()
    }
}
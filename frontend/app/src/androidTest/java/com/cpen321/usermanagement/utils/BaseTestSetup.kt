package com.cpen321.usermanagement.utils

import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import com.cpen321.usermanagement.MainActivity
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Before
import org.junit.Rule

/**
 * Base class for all Android instrumented tests.
 * Provides common setup including Hilt injection, Compose test rule, and UI device access.
 * 
 * All test base classes should extend this to avoid duplication of setup code.
 */
@HiltAndroidTest
abstract class BaseTestSetup {

    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    protected lateinit var device: UiDevice

    /**
     * Base setup executed before each test.
     * Initializes Hilt injection, UI device, and grants notification permissions.
     */
    @Before
    open fun baseSetup() {
        hiltRule.inject()
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())

        // Wait for the app to settle after launching
        composeTestRule.waitForIdle()

        // Grant notification permission automatically
        grantNotificationPermission()
    }

    /**
     * Grants notification permission by clicking "Allow" if the permission dialog appears.
     */
    protected fun grantNotificationPermission() {
        device.wait(
            Until.findObject(By.text("Allow")),
            5000
        )?.click()
    }
}

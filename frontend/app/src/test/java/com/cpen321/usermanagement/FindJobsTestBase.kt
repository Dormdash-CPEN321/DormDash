package com.cpen321.usermanagement

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import org.junit.Before
import org.junit.Rule
import org.junit.runner.RunWith

/**
 * Base class for Find Jobs feature tests.
 * Provides common setup and utilities for testing.
 */
@RunWith(AndroidJUnit4::class)
abstract class FindJobsTestBase {
    
    @get:Rule
    val composeTestRule = createAndroidComposeRule<MainActivity>()
    
    protected lateinit var device: UiDevice
    
    @Before
    fun baseSetup() {
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        
        // TODO: Add authentication/login flow here if needed
        // This should navigate to a state where the mover is logged in
        // and ready to access the "Find Jobs" feature
    }
    
    /**
     * Navigate to Find Jobs screen from home
     */
    protected fun navigateToFindJobs() {
        // TODO: Implement navigation to Find Jobs screen
        // This will depend on your app's navigation structure
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

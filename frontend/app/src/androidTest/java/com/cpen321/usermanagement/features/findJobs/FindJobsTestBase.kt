package com.cpen321.usermanagement

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeUp
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Until
import com.cpen321.usermanagement.utils.BaseTestSetup
import com.cpen321.usermanagement.utils.TestAccountHelper
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Before
import org.junit.runner.RunWith

/**
 * Base class for Find Jobs feature tests.
 * Extends BaseTestSetup for standard test configuration.
 * 
 */
@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
abstract class FindJobsTestBase : BaseTestSetup() {

    companion object {
        fun getTestEmail(): String = TestAccountHelper.getMoverEmail()
        fun getTestPassword(): String = TestAccountHelper.getMoverPassword()
    }

    @Before
    override fun baseSetup() {
        super.baseSetup()

        // Always need to be signed in as a mover for find jobs use cases
        // Check if we already see bio screen and sign in if not
        val completeProfileNodes = composeTestRule
            .onAllNodesWithText("Complete Your Profile", useUnmergedTree = true)
            .fetchSemanticsNodes()

        if (completeProfileNodes.isEmpty()) {
            signInAsMover()
        } else {
            composeTestRule
                .onNodeWithText("Skip", useUnmergedTree = true)
                .performClick()
            composeTestRule.waitForIdle()
        }
    }

    /**
     * Sets up the mover test account by either signing up or adding the account to the device.
     * Call this when you want to ensure the test account exists (for sign-up tests).
     * Uses the MOVER account credentials from test.properties.
     */
    fun setupTestAccount() {
        TestAccountHelper.setupTestAccount(
            composeTestRule = composeTestRule,
            device = device,
            email = getTestEmail(),
            password = getTestPassword(),
            roleSelector = { TestAccountHelper.selectMoverRole(it) }
        )
    }

    /**
     * Signs in with the mover test account from test.properties.
     * Looks for the specific test account in the account picker.
     */
    private fun signInAsMover() {
        // First ensure the account exists
        setupTestAccount()

        // Then sign in
        TestAccountHelper.signIn(
            composeTestRule = composeTestRule,
            device = device,
            email = getTestEmail(),
            roleSelector = { TestAccountHelper.selectMoverRole(it) }
        )
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
        val dialogAppeared = device.wait(
            Until.hasObject(By.pkg("com.google.android.permissioncontroller")),
            5000
        ) || device.wait(
            Until.hasObject(By.pkg("com.android.permissioncontroller")),
            2000
        )

        if (!dialogAppeared) {
            device.wait(
                Until.hasObject(By.textContains("allow")),
                2000
            )
        }
        Thread.sleep(500)
        val denyButton = device.findObject(By.text("Don't allow"))
            ?: device.findObject(By.res("com.android.permissioncontroller:id/permission_deny_button"))
            ?: device.findObject(By.res("com.google.android.permissioncontroller:id/permission_deny_button"))

        if (denyButton != null) {
            denyButton.click()
            Thread.sleep(1000)
        } else {
            // If we can't find the deny button, try pressing back to dismiss the dialog
            device.pressBack()
            Thread.sleep(1000)
        }
    }

    /**
     * Scroll until the specified day becomes visible on screen
     * Uses the day's index to scroll to the appropriate position
     */
    protected fun scrollToDay(dayName: String) {
        // First check if already visible
        if (composeTestRule.onAllNodesWithText(dayName).fetchSemanticsNodes().isNotEmpty()) {
            return
        }

        // Get the index of the day (MONDAY=0, TUESDAY=1, etc.)
        val dayIndex = when(dayName) {
            "MONDAY" -> 0
            "TUESDAY" -> 1
            "WEDNESDAY" -> 2
            "THURSDAY" -> 3
            "FRIDAY" -> 4
            "SATURDAY" -> 5
            "SUNDAY" -> 6
            else -> 0
        }

        // Scroll down gradually until the day is visible
        // Each swipe should move approximately 2-3 items
        val swipesNeeded = (dayIndex / 2).coerceAtLeast(1)

        repeat(swipesNeeded) {
            if (composeTestRule.onAllNodesWithText(dayName).fetchSemanticsNodes().isEmpty()) {
                try {
                    composeTestRule.onNodeWithTag("availability_list")
                        .performTouchInput {
                            swipeUp(
                                startY = bottom * 0.7f,
                                endY = top * 1.3f
                            )
                        }
                    composeTestRule.waitForIdle()
                    Thread.sleep(150) // Give time for recomposition
                } catch (_: Exception) {
                    // If that fails, try a different approach
                    composeTestRule.onRoot().performTouchInput {
                        swipeUp(
                            startY = centerY + (height * 0.3f),
                            endY = centerY - (height * 0.3f)
                        )
                    }
                    composeTestRule.waitForIdle()
                    Thread.sleep(150)
                }
            }
        }

        // Final verification with more swipes if needed
        var attempts = 0
        while (composeTestRule.onAllNodesWithText(dayName).fetchSemanticsNodes().isEmpty() && attempts < 5) {
            try {
                composeTestRule.onNodeWithTag("availability_list")
                    .performTouchInput {
                        swipeUp(
                            startY = bottom * 0.7f,
                            endY = top * 1.3f
                        )
                    }
            } catch (_: Exception) {
                composeTestRule.onRoot().performTouchInput {
                    swipeUp()
                }
            }
            composeTestRule.waitForIdle()
            Thread.sleep(150)
            attempts++
        }

        // Assert that the day is now visible
        composeTestRule.onNodeWithText(dayName).assertExists(
            "Could not find day '$dayName' after scrolling"
        )
    }

    /**
     * Add a time slot to a specific day
     */
    protected fun addAvailabilityTimeSlot(day: String, startTime: String, endTime: String) {
        // Scroll until the day is visible
        scrollToDay(day)
        composeTestRule.waitForIdle()

        // Click add button for the specific day using test tag
        composeTestRule.onNodeWithTag("add_time_slot_$day").performClick()

        composeTestRule.waitForIdle()

        // Verify dialog is shown
        composeTestRule.onNodeWithText("Add Time Slot").assertIsDisplayed()

        // Update start time using test tag
        composeTestRule.onNodeWithTag("start_time_input").apply {
            performTextClearance()
            performTextInput(startTime)
        }

        composeTestRule.waitForIdle()

        // Update end time using test tag
        composeTestRule.onNodeWithTag("end_time_input").apply {
            performTextClearance()
            performTextInput(endTime)
        }

        composeTestRule.waitForIdle()

        // Click Add button
        composeTestRule.onNodeWithText("Add").performClick()

        composeTestRule.waitForIdle()
    }
}
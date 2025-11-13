package com.cpen321.usermanagement

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
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
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Before
import org.junit.Rule
import org.junit.runner.RunWith
import java.util.Properties

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

    companion object {
        private var testCredentials: Pair<String, String>? = null

        private fun loadTestCredentials(): Pair<String, String> {
            if (testCredentials != null) return testCredentials!!

            val properties = Properties()
            val inputStream = this::class.java.classLoader?.getResourceAsStream("test.properties")
            if (inputStream != null) {
                properties.load(inputStream)
                val email = properties.getProperty("MOVER_EMAIL") ?: throw IllegalStateException("MOVER_EMAIL not found in test.properties")
                val password = properties.getProperty("MOVER_PASSWORD") ?: throw IllegalStateException("MOVER_PASSWORD not found in test.properties")
                testCredentials = email to password
                return testCredentials!!
            } else {
                throw IllegalStateException("test.properties file not found in androidTest/resources")
            }
        }

        fun getTestEmail(): String = loadTestCredentials().first
        fun getTestPassword(): String = loadTestCredentials().second
    }

    @Before
    fun baseSetup() {
        hiltRule.inject()
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())

        // Wait for the app to settle after injection
        composeTestRule.waitForIdle()

        // Grant notification permission automatically
        grantNotificationPermission()

        // Always need to be signed in as a mover for find jobs use cases
        // check if we already see bio screen and sign in if not
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
     * Sets up the test account by either signing up or adding the account to the device.
     * Call this when you want to ensure the test account exists (for sign-up tests).
     */
    fun setupTestAccount() {
        composeTestRule.waitForIdle()

        val isNotAuthenticated = composeTestRule
            .onAllNodesWithText("Sign in with Google")
            .fetchSemanticsNodes()
            .isNotEmpty()

        if (isNotAuthenticated) {
            // Click the sign-up button
            composeTestRule.onNodeWithText("Sign up with Google", useUnmergedTree = true)
                .assertExists("Sign up button should exist")
                .performClick()

            // Wait for Google account picker dialog to appear
            val accountPickerAppeared = device.wait(
                Until.hasObject(By.pkg("com.google.android.gms")),
                10_000
            )

            if (accountPickerAppeared) {
                Thread.sleep(1000) // Wait for UI to settle

                val testEmail = FindJobsTestBase.Companion.getTestEmail()

                // Look for the test account email
                val testAccountElement = device.findObject(By.text(testEmail))

                if (testAccountElement != null) {
                    // Account exists, click it
                    testAccountElement.click()
                    Thread.sleep(2000) // Wait for consent screen to load

                    // Wait for and click "Agree and share" button
                    val agreeButton = device.wait(
                        Until.findObject(By.textContains("Agree and share")),
                        5_000
                    )

                    if (agreeButton != null) {
                        agreeButton.click()
                        Thread.sleep(2000)
                    }
                } else {
                    // Account doesn't exist, need to add it
                    // Look for "Add another account" or "Use another account"
                    val addAccountButton = device.findObject(By.textContains("another account"))
                        ?: device.findObject(By.textContains("Add account"))

                    if (addAccountButton != null) {
                        addAccountButton.click()
                        Thread.sleep(3000) // Wait for Google sign-in page

                        // Enter email - look for "Email or phone" field
                        device.wait(
                            Until.findObject(By.textContains("Email or phone")),
                            5_000
                        )

                        // Now find the EditText input field
                        var emailField = device.findObject(By.res("identifierId"))
                        if (emailField == null) {
                            emailField = device.findObject(By.clazz("android.widget.EditText"))
                        }
                        if (emailField == null) {
                            emailField = device.findObject(By.focused(true))
                        }

                        if (emailField != null) {
                            emailField.click() // Ensure it's focused
                            Thread.sleep(1000)
                            emailField.setText(testEmail)
                            Thread.sleep(5000)

                            // Try to find and click Next button - look for button specifically
                            var nextButton = device.findObject(
                                By.clazz("android.widget.Button").text("NEXT")
                            )
                            if (nextButton == null) {
                                nextButton = device.findObject(
                                    By.desc("NEXT")
                                )
                            }

                            if (nextButton != null) {
                                nextButton.click()
                            } else {
                                device.pressEnter()
                            }
                            Thread.sleep(5000)

                            // Enter password - find the password EditText field
                            var passwordField = device.findObject(By.res("password"))
                            if (passwordField == null) {
                                passwordField = device.findObject(By.clazz("android.widget.EditText"))
                            }
                            if (passwordField == null) {
                                passwordField = device.findObject(By.focused(true))
                            }

                            if (passwordField != null) {
                                passwordField.click()
                                Thread.sleep(1000)
                                val password = getTestPassword().replace(" ", "%s") // Escape spaces
                                device.executeShellCommand("input text $password")
                                Thread.sleep(5000)

                                // Try to find and click Next button for password
                                var nextButton = device.findObject(
                                    By.clazz("android.widget.Button").text("NEXT")
                                )
                                if (nextButton == null) {
                                    nextButton = device.findObject(
                                        By.desc("NEXT")
                                    )
                                }

                                if (nextButton != null) {
                                    nextButton.click()
                                } else {
                                    device.pressEnter()
                                }
                                Thread.sleep(5000)

                                // Handle Google account setup screens
                                // Look for "Skip" button (recovery phone/email setup)
                                var skipButton = device.findObject(By.text("Skip"))
                                if (skipButton == null) {
                                    skipButton = device.findObject(By.textContains("Skip"))
                                }
                                if (skipButton == null) {
                                    skipButton = device.findObject(By.desc("Skip"))
                                }

                                if (skipButton != null) {
                                    // Scroll to make sure it's visible
                                    try {
                                        skipButton.click()
                                        Thread.sleep(5000)
                                    } catch (e: Exception) {
                                        // Button might not be clickable, continue
                                    }
                                }

                                // Look for "I agree" button (terms and conditions)
                                var agreeButton = device.findObject(By.text("I agree"))
                                if (agreeButton == null) {
                                    agreeButton = device.findObject(By.textContains("I agree"))
                                }
                                if (agreeButton == null) {
                                    agreeButton = device.findObject(By.desc("I agree"))
                                }

                                if (agreeButton != null) {
                                    // Scroll to make sure it's visible
                                    try {
                                        agreeButton.click()
                                        Thread.sleep(5000)
                                    } catch (e: Exception) {
                                        // Button might not be clickable, continue
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Wait for sign-in flow to complete
            composeTestRule.waitForIdle()
            Thread.sleep(5000)


           checkSetRole()

            // Check if "Complete Your Profile" popup appears and skip it if present
            val completeProfileNodes = composeTestRule
                .onAllNodesWithText("Complete Your Profile", useUnmergedTree = true)
                .fetchSemanticsNodes()

            if (completeProfileNodes.isNotEmpty()) {
                composeTestRule
                    .onNodeWithText("Skip", useUnmergedTree = true)
                    .performClick()
            }

            composeTestRule.waitForIdle()
        }
    }

    protected fun checkSetRole()
    {
        // Wait for role selection
        val chooseRoleNode = composeTestRule
            .onAllNodesWithText("I'm a Mover", useUnmergedTree = true)
            .fetchSemanticsNodes()

        // Choose mover role
        if (chooseRoleNode.isNotEmpty()){
            composeTestRule.onNodeWithText("I'm a Mover", useUnmergedTree = true)
                .assertExists("Role button should exist")
                .performClick()
        }

        composeTestRule.waitForIdle()
    }

    protected fun grantNotificationPermission() {
        device.wait(
            Until.findObject(By.text("Allow")),
            5000
        )?.click()
    }

    private fun signInAsMover() {

        setupTestAccount()

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
                Thread.sleep(1000) // Wait for UI to settle

                val testEmail = FindJobsTestBase.Companion.getTestEmail()

                // Look for the test account email
                val testAccountElement = device.findObject(By.text(testEmail))

                if (testAccountElement != null) {
                    // Found the test account, click it
                    testAccountElement.click()
                }
            }

            // Wait for sign-in flow to complete
            composeTestRule.waitForIdle()
            Thread.sleep(2000)

            checkSetRole()

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
    protected fun addTimeSlot(day: String, startTime: String, endTime: String) {
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
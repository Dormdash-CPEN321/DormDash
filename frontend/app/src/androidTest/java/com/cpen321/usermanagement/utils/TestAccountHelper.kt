package com.cpen321.usermanagement.utils

import androidx.compose.ui.test.SemanticsNodeInteractionCollection
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import java.util.Properties

/**
 * Helper object for managing test account operations during UI testing.
 * Provides functions for loading credentials, signing in, and signing up with test accounts.
 */
object TestAccountHelper {

    private var studentCredentials: Pair<String, String>? = null
    private var moverCredentials: Pair<String, String>? = null

    /**
     * Load student test credentials from test.properties
     */
    private fun loadStudentCredentials(): Pair<String, String> {
        if (studentCredentials != null) return studentCredentials!!

        val properties = Properties()
        val inputStream = this::class.java.classLoader?.getResourceAsStream("test.properties")
        if (inputStream != null) {
            properties.load(inputStream)
            val email = properties.getProperty("STUDENT_EMAIL")
                ?: throw IllegalStateException("STUDENT_EMAIL not found in test.properties")
            val password = properties.getProperty("STUDENT_PASSWORD")
                ?: throw IllegalStateException("STUDENT_PASSWORD not found in test.properties")
            studentCredentials = email to password
            return studentCredentials!!
        } else {
            throw IllegalStateException("test.properties file not found in androidTest/resources")
        }
    }

    /**
     * Load mover test credentials from test.properties
     */
    private fun loadMoverCredentials(): Pair<String, String> {
        if (moverCredentials != null) return moverCredentials!!

        val properties = Properties()
        val inputStream = this::class.java.classLoader?.getResourceAsStream("test.properties")
        if (inputStream != null) {
            properties.load(inputStream)
            val email = properties.getProperty("MOVER_EMAIL")
                ?: throw IllegalStateException("MOVER_EMAIL not found in test.properties")
            val password = properties.getProperty("MOVER_PASSWORD")
                ?: throw IllegalStateException("MOVER_PASSWORD not found in test.properties")
            moverCredentials = email to password
            return moverCredentials!!
        } else {
            throw IllegalStateException("test.properties file not found in androidTest/resources")
        }
    }

    fun getStudentEmail(): String = loadStudentCredentials().first
    fun getStudentPassword(): String = loadStudentCredentials().second
    fun getMoverEmail(): String = loadMoverCredentials().first
    fun getMoverPassword(): String = loadMoverCredentials().second

    /**
     * Sets up the test account by either signing up or adding the account to the device.
     * This is a comprehensive function that handles the full Google sign-up flow including
     * adding a new account to the device if necessary.
     *
     * @param composeTestRule The compose test rule for interacting with the app UI
     * @param device The UI device for interacting with system dialogs
     * @param email The test account email
     * @param password The test account password
     * @param roleSelector Optional lambda to select the user role (e.g., Student or Mover)
     */
    fun setupTestAccount(
        composeTestRule: ComposeTestRule,
        device: UiDevice,
        email: String,
        password: String,
        roleSelector: ((ComposeTestRule) -> Unit)? = null
    ) {
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

                // Look for the test account email
                val testAccountElement = device.findObject(By.text(email))

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
                    addGoogleAccountToDevice(device, email, password)
                }
            }

            // Wait for sign-up flow to complete
            composeTestRule.waitForIdle()
            Thread.sleep(5000)

            // Handle role selection if provided
            roleSelector?.invoke(composeTestRule)

            // Check if "Complete Your Profile" popup appears and skip it if present
            skipCompleteProfileIfPresent(composeTestRule)

            composeTestRule.waitForIdle()
        }
    }

    /**
     * Signs in with an existing test account.
     * Assumes the account already exists on the device.
     *
     * @param composeTestRule The compose test rule for interacting with the app UI
     * @param device The UI device for interacting with system dialogs
     * @param email The test account email
     * @param roleSelector Optional lambda to select the user role (e.g., Student or Mover)
     */
    fun signIn(
        composeTestRule: ComposeTestRule,
        device: UiDevice,
        email: String,
        roleSelector: ((ComposeTestRule) -> Unit)? = null
    ) {
        composeTestRule.waitForIdle()

        val isNotAuthenticated = composeTestRule
            .onAllNodesWithText("Sign in with Google")
            .fetchSemanticsNodes()
            .isNotEmpty()

        if (isNotAuthenticated) {
            // Click the sign-in button
            composeTestRule.onNodeWithText("Sign in with Google", useUnmergedTree = true)
                .assertExists("Sign in button should exist")
                .performClick()

            // Wait for Google account picker dialog to appear
            val accountPickerAppeared = device.wait(
                Until.hasObject(By.pkg("com.google.android.gms")),
                10_000
            )

            if (accountPickerAppeared) {
                Thread.sleep(1000) // Wait for UI to settle

                // Look for the test account email
                val testAccountElement = device.findObject(By.text(email))

                if (testAccountElement != null) {
                    // Found the test account, click it
                    testAccountElement.click()
                }
            }

            // Wait for sign-in flow to complete
            composeTestRule.waitForIdle()
            Thread.sleep(2000)

            // Handle role selection if provided
            roleSelector?.invoke(composeTestRule)

            // Check if "Complete Your Profile" popup appears and skip it if present
            skipCompleteProfileIfPresent(composeTestRule)

            composeTestRule.waitForIdle()
        }
    }

    /**
     * Adds a Google account to the device by going through the full sign-in flow.
     * This is a helper function used by setupTestAccount when the account doesn't exist yet.
     */
    private fun addGoogleAccountToDevice(
        device: UiDevice,
        email: String,
        password: String
    ) {
        // Look for "Add another account" or "Use another account"
        val addAccountButton = device.findObject(By.textContains("another account"))
            ?: device.findObject(By.textContains("Add account"))

        if (addAccountButton != null) {
            addAccountButton.click()
            Thread.sleep(3000) // Wait for Google sign-in page

            // Enter email
            enterEmail(device, email)

            // Enter password
            enterPassword(device, password)

            // Handle post-login screens (skip recovery setup, accept terms)
            handlePostLoginScreens(device)
        }
    }

    /**
     * Enters the email in the Google sign-in flow
     */
    private fun enterEmail(device: UiDevice, email: String) {
        device.wait(
            Until.findObject(By.textContains("Email or phone")),
            5_000
        )

        // Find the email input field
        var emailField = device.findObject(By.res("identifierId"))
        if (emailField == null) {
            emailField = device.findObject(By.clazz("android.widget.EditText"))
        }
        if (emailField == null) {
            emailField = device.findObject(By.focused(true))
        }

        if (emailField != null) {
            emailField.click()
            Thread.sleep(300)
            emailField.setText(email)
            Thread.sleep(1000)

            // Click Next button
            clickNextButton(device)
            Thread.sleep(3000)
        }
    }

    /**
     * Enters the password in the Google sign-in flow
     */
    private fun enterPassword(device: UiDevice, password: String) {
        // Find the password input field
        var passwordField = device.findObject(By.res("password"))
        if (passwordField == null) {
            passwordField = device.findObject(By.clazz("android.widget.EditText"))
        }
        if (passwordField == null) {
            passwordField = device.findObject(By.focused(true))
        }

        if (passwordField != null) {
            passwordField.click()
            Thread.sleep(300)
            val escapedPassword = password.replace(" ", "%s") // Escape spaces for shell command
            device.executeShellCommand("input text $escapedPassword")
            Thread.sleep(1000)

            // Click Next button
            clickNextButton(device)
            Thread.sleep(3000)
        }
    }

    /**
     * Clicks the "Next" button in Google sign-in flow
     */
    private fun clickNextButton(device: UiDevice) {
        var nextButton = device.findObject(
            By.clazz("android.widget.Button").text("NEXT")
        )
        if (nextButton == null) {
            nextButton = device.findObject(By.desc("NEXT"))
        }

        if (nextButton != null) {
            nextButton.click()
        } else {
            device.pressEnter()
        }
    }

    /**
     * Handles post-login screens like recovery setup and terms acceptance
     */
    private fun handlePostLoginScreens(device: UiDevice) {
        // Look for "Skip" button (recovery phone/email setup)
        var skipButton = device.findObject(By.text("Skip"))
        if (skipButton == null) {
            skipButton = device.findObject(By.textContains("Skip"))
        }
        if (skipButton == null) {
            skipButton = device.findObject(By.desc("Skip"))
        }

        if (skipButton != null) {
            try {
                skipButton.click()
                Thread.sleep(2000)
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
            try {
                agreeButton.click()
                Thread.sleep(2000)
            } catch (e: Exception) {
                // Button might not be clickable, continue
            }
        }
    }

    /**
     * Skips the "Complete Your Profile" dialog if it appears
     */
    private fun skipCompleteProfileIfPresent(composeTestRule: ComposeTestRule) {
        val completeProfileNodes = composeTestRule
            .onAllNodesWithText("Complete Your Profile", useUnmergedTree = true)
            .fetchSemanticsNodes()

        if (completeProfileNodes.isNotEmpty()) {
            composeTestRule
                .onNodeWithText("Skip", useUnmergedTree = true)
                .performClick()
        }
    }

    /**
     * Default role selector for student tests
     */
    fun selectStudentRole(composeTestRule: ComposeTestRule) {
        val chooseRoleNode = composeTestRule
            .onAllNodesWithText("I'm a Student", useUnmergedTree = true)
            .fetchSemanticsNodes()

        if (chooseRoleNode.isNotEmpty()) {
            composeTestRule.onNodeWithText("I'm a Student", useUnmergedTree = true)
                .assertExists("Student role button should exist")
                .performClick()
        }

        composeTestRule.waitForIdle()
    }

    /**
     * Default role selector for mover tests
     */
    fun selectMoverRole(composeTestRule: ComposeTestRule) {
        val chooseRoleNode = composeTestRule
            .onAllNodesWithText("I'm a Mover", useUnmergedTree = true)
            .fetchSemanticsNodes()

        if (chooseRoleNode.isNotEmpty()) {
            composeTestRule.onNodeWithText("I'm a Mover", useUnmergedTree = true)
                .assertExists("Mover role button should exist")
                .performClick()
        }

        composeTestRule.waitForIdle()
    }
}

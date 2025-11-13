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
import com.cpen321.usermanagement.FindJobsTestBase
import com.cpen321.usermanagement.MainActivity
import com.cpen321.usermanagement.features.auth.AuthTestBase
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Before
import org.junit.Rule
import org.junit.runner.RunWith
import java.util.Properties

@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
abstract class OrderTestBase {

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
                val email = properties.getProperty("STUDENT_EMAIL") ?: throw IllegalStateException("STUDENT_EMAIL not found in test.properties")
                val password = properties.getProperty("STUDENT_PASSWORD") ?: throw IllegalStateException("STUDENT_PASSWORD not found in test.properties")
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

    protected fun checkSetRole()
    {

        // Wait for role selection
        val chooseRoleNode = composeTestRule
            .onAllNodesWithText("I'm a Student", useUnmergedTree = true)
            .fetchSemanticsNodes()

        // Choose sutdent role
        if (chooseRoleNode.isNotEmpty()){
            composeTestRule.onNodeWithText("I'm a Student", useUnmergedTree = true)
                .assertExists("Role button should exist")
                .performClick()
        }

        composeTestRule.waitForIdle()
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

                val testEmail = OrderTestBase.Companion.getTestEmail()

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
                            Thread.sleep(3000)

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
                            Thread.sleep(3000)

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
                                val password = getTestPassword()
                                    .replace(" ", "%s") // Escape spaces
                                device.executeShellCommand("input text $password")
                                Thread.sleep(3000)

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

    /**
     * Signs in with the test account from test.properties.
     * Looks for the specific test account in the account picker.
     */
    fun signIn() {

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
                Thread.sleep(1000) // Wait for UI to settle

                val testEmail = getTestEmail()
                
                // Look for the test account email
                val testAccountElement = device.findObject(By.text(testEmail))
                
                if (testAccountElement != null) {
                    // Found the test account, click it
                    testAccountElement.click()
                } else {
                    // Fallback: click first clickable (in case email not visible as text)
                    device.wait(Until.hasObject(By.clickable(true)), 3_000)
                    val firstClickable = device.findObject(By.clickable(true))
                    firstClickable?.click()
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
                composeTestRule
                    .onNodeWithText("Skip", useUnmergedTree = true)
                    .performClick()
            }

            composeTestRule.waitForIdle()
        }
    }
}
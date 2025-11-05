package com.cpen321.usermanagement.features.auth

import android.content.Intent
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import com.cpen321.usermanagement.MainActivity
import com.cpen321.usermanagement.data.repository.AuthRepository
import com.cpen321.usermanagement.fakes.FakeAuthRepository
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import kotlinx.coroutines.runBlocking
import org.junit.Before
import org.junit.Rule
import javax.inject.Inject

@HiltAndroidTest
abstract class AuthTestBase {
    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeTestRule = createComposeRule()

    @Inject
    lateinit var authRepository: AuthRepository

    protected lateinit var device: UiDevice
    protected lateinit var scenario: ActivityScenario<MainActivity>

    /**
     * Override this in subclasses to start signed out (for auth flow tests)
     * Default is false (starts signed in) for tests like sign out, delete account
     */
    protected open val startSignedOut: Boolean = false

    @Before
    fun baseSetup() {
        hiltRule.inject()
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())

        // Set auth state BEFORE launching the activity
        if (!startSignedOut && authRepository is FakeAuthRepository) {
            runBlocking {
                (authRepository as FakeAuthRepository).resetToSignedIn()
            }
        }

        // Now launch the activity with the correct auth state
        val intent = Intent(ApplicationProvider.getApplicationContext(), MainActivity::class.java)
        scenario = ActivityScenario.launch(intent)

        // Wait for the app to settle after launching
        composeTestRule.waitForIdle()

        // Grant notification permission automatically
        grantNotificationPermission()

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
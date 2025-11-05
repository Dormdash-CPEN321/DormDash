package com.cpen321.usermanagement.features.auth

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import com.cpen321.usermanagement.MainActivity
import com.cpen321.usermanagement.fakes.FakeAuthRepository
import com.cpen321.usermanagement.fakes.FakeProfileRepository
import com.cpen321.usermanagement.network.SocketClient
import com.cpen321.usermanagement.ui.navigation.NavigationStateManager
import com.cpen321.usermanagement.ui.screens.AuthScreen
import com.cpen321.usermanagement.ui.theme.ProvideFontSizes
import com.cpen321.usermanagement.ui.theme.ProvideSpacing
import com.cpen321.usermanagement.ui.theme.UserManagementTheme
import com.cpen321.usermanagement.ui.viewmodels.AuthViewModel
import com.cpen321.usermanagement.ui.viewmodels.ProfileViewModel
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import io.mockk.mockk
import io.mockk.unmockkAll
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class SignInTest {

    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    private lateinit var device: UiDevice

    @Before
    fun setup() {
        hiltRule.inject()
        
        // Initialize UiDevice for system UI interactions
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())

        composeTestRule.waitForIdle()

        // Grant notification permission automatically
        grantNotificationPermission()

    }

    @After
    fun tearDown() {
        unmockkAll()
    }


    @Test
    fun authScreen_showsBothButtons() {
        composeTestRule.waitForIdle()

        // Both buttons should be visible simultaneously
        composeTestRule.onNodeWithText("Sign in with Google", useUnmergedTree = true)
            .assertExists()
        composeTestRule.onNodeWithText("Sign up with Google", useUnmergedTree = true)
            .assertExists()
    }

    @Test
    fun test_SignIn(){
        // Click the sign-in button
        composeTestRule.onNodeWithText("Sign in with Google", useUnmergedTree = true)
            .performClick()

        // Wait for Google account picker dialog to appear (timeout: 10 seconds)
        val accountPickerAppeared = device.wait(
            Until.hasObject(By.pkg("com.google.android.gms")),
            10_000
        )

        if (accountPickerAppeared) {
            // Wait briefly for account items to become clickable
            device.wait(Until.hasObject(By.clickable(true)), 3_000)

            // Choose the first clickable object (account entry). You may need to refine selector per device.
            val firstClickable = device.findObject(By.clickable(true))
            firstClickable?.click()
        }

        // Wait for sign-in flow to complete
        composeTestRule.waitForIdle()

        // title is rendered as two Text nodes (app name + role). Assert both parts separately:
        composeTestRule.onNodeWithText("DormDash", useUnmergedTree = true).assertExists()
    }


    protected fun grantNotificationPermission() {
        device.wait(
            androidx.test.uiautomator.Until.findObject(
                androidx.test.uiautomator.By.text("Allow")
            ),
            5000
        )?.click()
    }
}
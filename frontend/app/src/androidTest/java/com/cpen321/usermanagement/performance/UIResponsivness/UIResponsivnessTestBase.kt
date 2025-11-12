package com.cpen321.usermanagement.performance.UIResponsivness

import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.*
import android.content.Intent
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import com.cpen321.usermanagement.MainActivity
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Before
import org.junit.Rule

@HiltAndroidTest
abstract class UIResponsivnessTestBase {

    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    protected lateinit var device: UiDevice
    protected val appPackage = "com.cpen321.usermanagement"
    private val launchTimeout = 5000L

    @Before
    fun baseSetup() {
        hiltRule.inject()
        device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())

        // Wake and unlock device
        if (!device.isScreenOn) device.wakeUp()
        device.swipe(500, 1000, 500, 100, 10)
        device.pressHome()

        // Launch MainActivity via Intent
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val intent = Intent(context, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)

        // Wait for the app to appear
        device.wait(Until.hasObject(By.pkg(appPackage).depth(0)), launchTimeout)

        composeTestRule.waitForIdle()

        grantNotificationPermission()

        SignIn()
    }

    protected fun grantNotificationPermission() {
        device.wait(
            Until.findObject(By.text("Allow")),
            5000
        )?.click()
    }

    protected fun SignIn() {
        composeTestRule.onNodeWithText("Sign in with Google", useUnmergedTree = true)
            .performClick()

        val accountPickerAppeared = device.wait(
            Until.hasObject(By.pkg("com.google.android.gms")),
            10_000
        )

        if (accountPickerAppeared) {
            device.wait(Until.hasObject(By.clickable(true)), 3_000)
            val firstClickable = device.findObject(By.clickable(true))
            firstClickable?.click()
        }

        val mainScreenAppeared = device.wait(
            Until.hasObject(By.text("DormDash")),
            10_000
        )
        if (!mainScreenAppeared) {
            throw RuntimeException("Main screen did not appear after Google sign-in")
        }

        composeTestRule.waitForIdle()
    }
}

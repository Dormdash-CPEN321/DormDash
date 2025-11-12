// File: app/src/androidTest/java/com/cpen321/usermanagement/performance/UIResponsivness/UIResponseTimeTest.kt

package com.cpen321.usermanagement.performance.UIResponsivness

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.By
import androidx.test.uiautomator.Until
import androidx.compose.ui.test.junit4.ComposeTestRule
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertIsDisplayed
import com.cpen321.usermanagement.performance.UIResponsivness.UIResponsivnessTestBase
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Assert
import org.junit.Test
import org.junit.runner.RunWith

@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class UIResponseTimeTest : UIResponsivnessTestBase() {

    private val timeout = 100L // 0.1 seconds for "Enter Address" to appear

    @Test
    fun clickCreateNewOrderButton_opensBottomSheetWithEnterAddress() {
        composeTestRule.waitForIdle()
        Thread.sleep(3000)

        composeTestRule.onNodeWithText("Create New Order", useUnmergedTree = true)
            .assertExists("Create Order button should exist for this test, there might be an active order")
            .performClick()

        composeTestRule.waitForIdle()

        // Wait for "Enter Address" text to appear in the bottom sheet
        composeTestRule.waitUntil(timeoutMillis = timeout) {
            composeTestRule.onAllNodesWithText("Enter Address", useUnmergedTree = true)
                .fetchSemanticsNodes().isNotEmpty()
        }
    }

    @Test
    fun clickProfileButton_opensProfileScreen() {
        composeTestRule.waitForIdle()
        Thread.sleep(3000)

        // Click on the profile icon to navigate to profile screen
        composeTestRule
            .onNodeWithTag("ProfileButton")
            .assertExists("Profile button should exist")
            .performClick()

        composeTestRule
            .onNodeWithText("Manage Orders", useUnmergedTree = true)
            .assertExists("Manage Orders button should exist on profile screen")
            .performClick()

        composeTestRule.waitForIdle()

        composeTestRule.waitUntil(timeoutMillis = timeout) {
            composeTestRule
                .onAllNodesWithText("Manage Profile", useUnmergedTree = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }

        composeTestRule.waitUntil(timeoutMillis = timeout) {
            composeTestRule.onAllNodesWithText("Order History", useUnmergedTree = true)
                .fetchSemanticsNodes().isNotEmpty()
        }
    }
}

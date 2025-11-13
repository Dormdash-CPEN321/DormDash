package com.cpen321.usermanagement.performance.UIResponsivness

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.performClick
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Test
import org.junit.runner.RunWith

@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class StudentUIResponseTimeTest : UIResponsivnessTestBase() {

    @Test
    fun createNewOrderButtonTest() {
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
    fun profileScreenTest() {
        composeTestRule.waitForIdle()
        Thread.sleep(3000)

        // Click on the profile icon to navigate to profile screen
        composeTestRule
            .onNodeWithTag("ProfileButton")
            .assertExists("Profile button should exist")
            .performClick()

        composeTestRule.waitForIdle()

        // Assert "Manage Profile" button appears within timeout
        composeTestRule.waitUntil(timeoutMillis = timeout) {
            composeTestRule
                .onAllNodesWithText("Manage Profile", useUnmergedTree = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }

        composeTestRule
            .onNodeWithText("Manage Profile", useUnmergedTree = true)
            .performClick()

        composeTestRule.waitForIdle()

        // Assert "Name" text appears within timeout
        composeTestRule.waitUntil(timeoutMillis = timeout) {
            composeTestRule
                .onAllNodesWithText("Name", useUnmergedTree = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }
    }
}

package com.cpen321.usermanagement.performance.UIResponsivness

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.junit4.ComposeTestRule
import com.cpen321.usermanagement.utils.TestAccountHelper
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Test
import org.junit.runner.RunWith

@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
class MoverUIResponseTimeTest : UIResponsivnessTestBase() {

    override fun getTestEmail(): String = TestAccountHelper.getMoverEmail()
    override fun getTestPassword(): String = TestAccountHelper.getMoverPassword()
    override fun getRoleSelector(): (ComposeTestRule) -> Unit =
        { TestAccountHelper.selectMoverRole(it) }

    @Test
    fun availableJobsScreenTest() {
        composeTestRule.waitForIdle()
        Thread.sleep(3000)

        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("Find Jobs").fetchSemanticsNodes().isNotEmpty()
        }

        composeTestRule.onNodeWithText("Find Jobs", useUnmergedTree = true)
            .performClick()

        composeTestRule.waitForIdle()

        // Wait for "Available Jobs" text to appear within timeout
        composeTestRule.waitUntil(timeoutMillis = timeout) {
            composeTestRule.onAllNodesWithText("Available Jobs", useUnmergedTree = true)
                .fetchSemanticsNodes().isNotEmpty()
        }

        // Click on the availability switch
        composeTestRule.onNodeWithTag("availability_switch", useUnmergedTree = true)
            .assertExists("Availability switch should exist")
            .performClick()

        composeTestRule.waitForIdle()

        composeTestRule.waitUntil(timeoutMillis = timeout) {
            composeTestRule.onAllNodesWithText("Within Availability", useUnmergedTree = true)
                .fetchSemanticsNodes().isNotEmpty()
        }

        composeTestRule.onNodeWithText("Get Optimal Route", useUnmergedTree = true)
            .assertExists("Get Optimal Route button should exist")
            .performClick()

        composeTestRule.waitForIdle()

        composeTestRule.waitUntil(timeoutMillis = timeout) {
            composeTestRule.onAllNodesWithText("Smart Route Suggestion", useUnmergedTree = true)
                .fetchSemanticsNodes().isNotEmpty()
        }
    }

    @Test
    fun setAvailabilityScreenTest() {
        composeTestRule.waitForIdle()
        Thread.sleep(3000)

        // Click on the "Availability" button
        composeTestRule.onNodeWithText("Availability", useUnmergedTree = true)
            .assertExists("Availability button should exist")
            .performClick()

        composeTestRule.waitForIdle()

        composeTestRule.waitUntil(timeoutMillis = timeout) {
            composeTestRule.onAllNodesWithText("Set Availability", useUnmergedTree = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }

        // Click on the + icon in Monday box (test tag: "add_time_slot_MONDAY")
        composeTestRule.onNodeWithTag("add_time_slot_MONDAY", useUnmergedTree = true)
            .assertExists("Add time slot button for Monday should exist")
            .performClick()

        composeTestRule.waitForIdle()

        composeTestRule.waitUntil(timeoutMillis = timeout) {
            composeTestRule.onAllNodesWithText("Add Time Slot", useUnmergedTree = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
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

        composeTestRule.waitUntil(timeoutMillis = timeout) {
            composeTestRule
                .onAllNodesWithText("Earned Credits", useUnmergedTree = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }

        composeTestRule
            .onNodeWithText("Manage Profile", useUnmergedTree = true)
            .performClick()

        composeTestRule.waitForIdle()

        composeTestRule.waitUntil(timeoutMillis = timeout) {
            composeTestRule
                .onAllNodesWithText("Name", useUnmergedTree = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }
    }
}

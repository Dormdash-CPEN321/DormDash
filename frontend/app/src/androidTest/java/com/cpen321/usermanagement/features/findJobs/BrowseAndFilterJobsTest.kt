package com.cpen321.usermanagement

import androidx.compose.ui.test.*
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Test

/**
 * UC-3: Browse and Filter Jobs
 * 
 * Tests the ability for movers to browse unassigned jobs and filter them by availability.
 *
 * Main Success Scenario:
 * 1. Mover clicks on "Find Jobs" on the navigation bar
 * 2. System displays all unassigned jobs with details
 * 3. Mover can toggle between "Show All" and "Within Availability"
 * 4. System displays filtered jobs based on availability
 * 5. Mover can optionally accept a job
 * 
 * Failure Scenarios:
 * 2a. No unassigned jobs exist
 * 4a. No jobs exist within mover's availability
 */
@HiltAndroidTest
class BrowseAndFilterJobsTest : FindJobsTestBase() {
    
    /**
     * Test: Main success scenario - Browse all jobs
     * Steps 1-2: Navigate to Find Jobs and verify job list is displayed
     *
     */
    @Test
    fun testBrowseAllJobs_displaysJobList() {
        // Wait for the app to navigate from loading to mover main screen
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("Find Jobs").fetchSemanticsNodes().isNotEmpty()
        }

        // Setup: Navigate to Profile and seed test jobs
        composeTestRule.onNodeWithTag("ProfileButton").performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Seed Test Jobs (10)").performClick()
        composeTestRule.waitForIdle()

        Thread.sleep(2000)

        // Navigate back to main screen
        device.pressBack()
        composeTestRule.waitForIdle()

        // Step 1: Mover clicks on "Find Jobs" on navigation bar
        composeTestRule.onNodeWithText("Find Jobs").performClick()

        // Wait for the screen to load
        composeTestRule.waitForIdle()

        // Step 2: Verify system displays all unassigned jobs
        // Check that the job list is visible
        composeTestRule.onNodeWithTag("find_jobs_list").assertIsDisplayed()

        // Verify job cards contain required information:
        composeTestRule.onAllNodesWithTag("job_card").onFirst().assertIsDisplayed()

        // Verify job card components are displayed
        composeTestRule.onAllNodesWithTag("job_card_pickup_address").onFirst().assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("job_card_dropoff_address").onFirst().assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("job_card_volume").onFirst().assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("job_card_datetime").onFirst().assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("job_card_type").onFirst().assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("job_card_credits").onFirst().assertIsDisplayed()

        // Cleanup: Navigate to Profile and clear all jobs
        composeTestRule.onNodeWithTag("ProfileButton").performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Clear All Jobs").performClick()
        composeTestRule.waitForIdle()

        Thread.sleep(2000) // Give backend time to persist
    }

    /**
     * Test: Toggle filter between "Show All" and "Within Availability"
     * Steps 3-4: Test the availability filter toggle functionality
     *
     */
    @Test
    fun testFilterByAvailability_displaysFilteredJobs() {
        // Wait for app to load
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("Find Jobs").fetchSemanticsNodes().isNotEmpty()
        }

        // Setup: Navigate to Profile and seed availability test jobs (2 jobs)
        composeTestRule.onNodeWithTag("ProfileButton").performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Seed Availability Jobs (2)").performClick()
        composeTestRule.waitForIdle()

        Thread.sleep(2000) // Give backend time to persist

        // Navigate back to main screen
        device.pressBack()
        composeTestRule.waitForIdle()

        // Go to availability screen and set availability for monday 9-5
        composeTestRule.onNodeWithText("Availability").performClick()
        composeTestRule.waitForIdle()

        addTimeSlot(
            day = "MONDAY",
            startTime = "08:00",
            endTime = "17:00"
        )

        // Save availability
        composeTestRule.onNodeWithText("Save Availability").performClick()
        composeTestRule.waitForIdle()

        // Verify success message appears
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule
                .onAllNodesWithText("Availability updated successfully!", substring = true, ignoreCase = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }

        // Step 1: Navigate to Find Jobs
        composeTestRule.onNodeWithText("Find Jobs").performClick()

        // Wait for jobs to load
        composeTestRule.waitForIdle()
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithTag("job_card").fetchSemanticsNodes().isNotEmpty()
        }

        // Step 2: Verify "Show All" is initially displayed
        composeTestRule.onNodeWithText("Show All").assertIsDisplayed()

        // Verify both jobs are displayed (should have 2 job cards)
        composeTestRule.onAllNodesWithTag("job_card").assertCountEquals(2)

        // Step 3: Mover clicks toggle to switch to "Within Availability"
        composeTestRule.onNodeWithTag("availability_switch").performClick()

        // Wait for filtering to apply
        composeTestRule.waitForIdle()

        // Verify "Within Availability" is now displayed
        composeTestRule.onNodeWithText("Show All").assertDoesNotExist()
        composeTestRule.onNodeWithText("Within Availability").assertIsDisplayed()

        // Step 4: System displays only jobs within mover's availability
        // Should show only 1 job (Monday 10:00)
        composeTestRule.onAllNodesWithTag("job_card").assertCountEquals(1)

        // Cleanup: Remove availability
        composeTestRule.onNodeWithText("Availability").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("delete_time_slot_MONDAY_08:00").performClick()
        composeTestRule.onNodeWithText("Save Availability").performClick()
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule
                .onAllNodesWithText("Availability updated successfully!", substring = true, ignoreCase = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }

        // Cleanup: Navigate to Profile and clear all jobs
        composeTestRule.onNodeWithTag("ProfileButton").performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Clear All Jobs").performClick()
        composeTestRule.waitForIdle()

        Thread.sleep(2000) // Give backend time to persist
    }

    /**
     * Failure Scenario 2a: No unassigned jobs exist
     * Failure Scenario 4a: No jobs exist within mover's availability
     */
    @Test
    fun testNoJobsAvailable_displaysEmptyState() {
        // Wait for app to load
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("Find Jobs").fetchSemanticsNodes().isNotEmpty()
        }

        // Setup: Navigate to Profile and clear all jobs to ensure empty state
        composeTestRule.onNodeWithTag("ProfileButton").performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Clear All Jobs").performClick()
        composeTestRule.waitForIdle()

        Thread.sleep(2000) // Give backend time to persist

        // Navigate back to main screen
        device.pressBack()
        composeTestRule.waitForIdle()

        // Step 1: Navigate to Find Jobs
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        composeTestRule.waitForIdle()

        // Step 2a: No jobs available - Verify empty state message is displayed
        composeTestRule.onNodeWithText("No available jobs").assertIsDisplayed()

        // Verify the job list is not displayed (no job cards exist)
        composeTestRule.onAllNodesWithTag("job_card").assertCountEquals(0)

        // Setup: Navigate to Profile and seed test jobs
        composeTestRule.onNodeWithTag("ProfileButton").performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Seed Test Jobs (10)").performClick()
        composeTestRule.waitForIdle()

        Thread.sleep(2000)

        // Navigate back to main screen
        device.pressBack()
        composeTestRule.waitForIdle()

        // Toggle availability filter
        composeTestRule.onNodeWithTag("availability_switch").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("Show All").assertDoesNotExist()
        composeTestRule.onNodeWithText("Within Availability").assertIsDisplayed()

        // Step 4a: No jobs within availability - Verify empty state message is displayed and no jobs shown
        composeTestRule.onNodeWithText("No available jobs within your availability").assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("job_card").assertCountEquals(0)
    }
}

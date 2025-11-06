package com.cpen321.usermanagement

import androidx.compose.ui.test.*
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Test

/**
 * UC-3: Browse and Filter Jobs
 * 
 * Tests the ability for movers to browse unassigned jobs and filter them by availability.
 * 
 * ⚠️ TEST PREREQUISITES:
 *
 * Before running tests, ensure the following setup is complete:
 *
 * 1. Backend must be running (npm run dev)
 * 2. Database must have the correct test data:
 *
 * For testFilterByAvailability_displaysFilteredJobs, testBrowseAllJobs_displaysJobList, testToggleBackToShowAll_displaysAllJobs:
 *    Run: npm run seed-availability-test-jobs
 *    This creates 2 jobs:
 *    - Job 1: Monday 10:00 AM (WITHIN availability)
 *    - Job 2: Saturday 11:00 AM (OUTSIDE availability)
 *
 * For testNoJobsAvailable_displaysEmptyState:
 *    Run: npm run clear-jobs
 *    This removes all jobs from the database
 *
 * 3. Test mover account must have availability set to:
 *    Monday-Friday: 09:00-17:00
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
     * Prerequisites: Run `npm run seed-availability-test-jobs` to create 2 test jobs
     */
    @Test
    fun testBrowseAllJobs_displaysJobList() {
        // Wait for the app to navigate from loading to mover main screen
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("Find Jobs").fetchSemanticsNodes().isNotEmpty()
        }

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
    }

    /**
     * Test: Toggle filter between "Show All" and "Within Availability"
     * Steps 3-4: Test the availability filter toggle functionality
     *
     * Prerequisites: Run `npm run seed-availability-test-jobs` to create 2 test jobs:
     * - Job 1: Monday 10:00 AM - WITHIN availability (Monday-Friday 09:00-17:00)
     * - Job 2: Saturday 11:00 AM - OUTSIDE availability (weekend)
     */
    @Test
    fun testFilterByAvailability_displaysFilteredJobs() {
        // Wait for app to load
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("Find Jobs").fetchSemanticsNodes().isNotEmpty()
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
    }

    /**
     * Test: Toggle back from "Within Availability" to "Show All"
     * Tests that the filter can be toggled off to show all jobs again
     *
     * Prerequisites: Run `npm run seed-availability-test-jobs` to create 2 test jobs
     */
    @Test
    fun testToggleBackToShowAll_displaysAllJobs() {
        // Wait for app to load
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("Find Jobs").fetchSemanticsNodes().isNotEmpty()
        }

        // Navigate to Find Jobs
        composeTestRule.onNodeWithText("Find Jobs").performClick()

        // Wait for jobs to load
        composeTestRule.waitForIdle()
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithTag("job_card").fetchSemanticsNodes().isNotEmpty()
        }

        // Switch to filtered view
        composeTestRule.onNodeWithTag("availability_switch").performClick()
        composeTestRule.waitForIdle()

        // Verify we're in filtered mode
        composeTestRule.onNodeWithText("Within Availability").assertIsDisplayed()
        
        // Verify only 1 job is shown (within availability)
        composeTestRule.onAllNodesWithTag("job_card").assertCountEquals(1)

        // Toggle back to "Show All"
        composeTestRule.onNodeWithTag("availability_switch").performClick()
        composeTestRule.waitForIdle()

        // Verify we're back to showing all jobs
        composeTestRule.onNodeWithText("Show All").assertIsDisplayed()
        composeTestRule.onNodeWithText("Within Availability").assertDoesNotExist()
        
        // Verify both jobs are shown again
        composeTestRule.onAllNodesWithTag("job_card").assertCountEquals(2)
    }

    /**
     * Failure Scenario 2a: No unassigned jobs exist
     *
     * Prerequisites: Run `npm run clear-jobs` to remove all jobs from database
     */
    @Test
    fun testNoJobsAvailable_displaysEmptyState() {
        // Wait for app to load
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("Find Jobs").fetchSemanticsNodes().isNotEmpty()
        }

        // Step 1: Navigate to Find Jobs
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        
        // Wait for the screen to load
        composeTestRule.waitForIdle()

        // Step 2a: No jobs available - Verify empty state message is displayed
        composeTestRule.onNodeWithText("No available jobs").assertIsDisplayed()
        
        // Verify the job list is not displayed (no job cards exist)
        composeTestRule.onAllNodesWithTag("job_card").assertCountEquals(0)
    }

    /**
     * Failure Scenario 4a: No jobs within mover's availability
     *
     * Prerequisites: Run `npm run clear-jobs` to remove all jobs from database
     *
     * To-do
     */
    @Test
    fun testNoJobsWithinAvailability_displaysSuggestion() {
        // This test requires custom backend setup with jobs only outside availability
        // Not implemented with current seed scripts
    }
}

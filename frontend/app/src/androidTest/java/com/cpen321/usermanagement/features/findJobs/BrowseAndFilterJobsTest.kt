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
        // - Pickup address
        composeTestRule.onAllNodesWithTag("job_card_pickup_address").onFirst().assertIsDisplayed()

        // - Drop-off address
        composeTestRule.onAllNodesWithTag("job_card_dropoff_address").onFirst().assertIsDisplayed()

        // - Volume of items
        composeTestRule.onAllNodesWithTag("job_card_volume").onFirst().assertIsDisplayed()

        // - Date and time
        composeTestRule.onAllNodesWithTag("job_card_datetime").onFirst().assertIsDisplayed()

        // - Job type (storage or return)
        composeTestRule.onAllNodesWithTag("job_card_type").onFirst().assertIsDisplayed()

        // - Credits
        composeTestRule.onAllNodesWithTag("job_card_credits").onFirst().assertIsDisplayed()
    }

    /**
     * Test: Toggle filter between "Show All" and "Within Availability"
     * Steps 3-4: Test the availability filter toggle functionality
     *
     * Mover availability: Monday-Friday 09:00-17:00
     * Test data:
     * - Job 1: Monday 10:00 - WITHIN
     * - Job 2: Tuesday 14:30 - WITHIN
     * - Job 3: Saturday 11:00 - OUTSIDE (weekend)
     * - Job 4: Monday 07:00 - OUTSIDE (too early)
     * - Job 5: Wednesday 18:30 - OUTSIDE (too late)
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

        // Step 2: Verify "Show All" is initially selected/displayed
        composeTestRule.onNodeWithText("Show All").assertIsDisplayed()

        // Verify all 5 jobs are displayed by checking for unique addresses from each job
        // Note: LazyColumn only renders visible items, so we check by scrolling to find each
        composeTestRule.onNodeWithText("123 Main St, Vancouver, BC", substring = true).assertExists() // Job 1
        composeTestRule.onNodeWithText("789 Broadway, Vancouver, BC", substring = true).assertExists() // Job 2

        // Scroll down to see more jobs
        composeTestRule.onNodeWithTag("find_jobs_list").performScrollToNode(
            hasText("555 Weekend Ave, Vancouver, BC", substring = true)
        )
        composeTestRule.onNodeWithText("555 Weekend Ave, Vancouver, BC", substring = true).assertExists() // Job 3

        composeTestRule.onNodeWithTag("find_jobs_list").performScrollToNode(
            hasText("777 Early Bird St, Vancouver, BC", substring = true)
        )
        composeTestRule.onNodeWithText("777 Early Bird St, Vancouver, BC", substring = true).assertExists() // Job 4

        composeTestRule.onNodeWithTag("find_jobs_list").performScrollToNode(
            hasText("999 Late Night Blvd, Vancouver, BC", substring = true)
        )
        composeTestRule.onNodeWithText("999 Late Night Blvd, Vancouver, BC", substring = true).assertExists() // Job 5

        // Step 3: Mover clicks toggle to switch to "Within Availability"
        // Scroll back to top to access the toggle
        composeTestRule.onNodeWithTag("find_jobs_list").performScrollToNode(
            hasText("123 Main St, Vancouver, BC", substring = true)
        )

        // Verify "Show All" is currently displayed
        composeTestRule.onNodeWithText("Show All").assertIsDisplayed()

        composeTestRule.onNodeWithTag("availability_switch").performClick()

        // Wait for filtering to apply
        composeTestRule.waitForIdle()

        // Verify "Show All" is no longer displayed and "Within Availability" is displayed
        composeTestRule.onNodeWithText("Show All").assertDoesNotExist()
        composeTestRule.onNodeWithText("Within Availability").assertIsDisplayed()

        // Step 4: System displays only jobs within mover's availability
        // Should show only 2 jobs (Monday 10:00 and Tuesday 14:30)

        // Verify jobs WITHIN availability are shown
        composeTestRule.onNodeWithText("123 Main St, Vancouver, BC", substring = true).assertExists() // Monday 10:00
        composeTestRule.onNodeWithText("789 Broadway, Vancouver, BC", substring = true).assertExists() // Tuesday 14:30

        // Verify jobs OUTSIDE availability are NOT shown
        composeTestRule.onNodeWithText("555 Weekend Ave, Vancouver, BC", substring = true).assertDoesNotExist() // Saturday
        composeTestRule.onNodeWithText("777 Early Bird St, Vancouver, BC", substring = true).assertDoesNotExist() // Monday 7am
        composeTestRule.onNodeWithText("999 Late Night Blvd, Vancouver, BC", substring = true).assertDoesNotExist() // Wednesday 6:30pm
    }

    /**
     * Test: Toggle back from "Within Availability" to "Show All"
     * Tests that the filter can be toggled off to show all jobs again
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
        
        // Verify only 2 jobs are shown (within availability)
        composeTestRule.onNodeWithText("123 Main St, Vancouver, BC", substring = true).assertExists()
        composeTestRule.onNodeWithText("789 Broadway, Vancouver, BC", substring = true).assertExists()

        // Toggle back to "Show All"
        composeTestRule.onNodeWithTag("availability_switch").performClick()
        composeTestRule.waitForIdle()

        // Verify we're back to showing all jobs
        composeTestRule.onNodeWithText("Show All").assertIsDisplayed()
        composeTestRule.onNodeWithText("Within Availability").assertDoesNotExist()
        
        // Verify all 5 jobs are shown again by checking for jobs that were filtered out
        composeTestRule.onNodeWithText("123 Main St, Vancouver, BC", substring = true).assertExists() // Job 1
        composeTestRule.onNodeWithText("789 Broadway, Vancouver, BC", substring = true).assertExists() // Job 2
        
        // Scroll to verify the previously filtered jobs are now visible
        composeTestRule.onNodeWithTag("find_jobs_list").performScrollToNode(
            hasText("555 Weekend Ave, Vancouver, BC", substring = true)
        )
        composeTestRule.onNodeWithText("555 Weekend Ave, Vancouver, BC", substring = true).assertExists() // Job 3
    }

    /**
     * Failure Scenario 2a: No unassigned jobs exist
     */
    @Test
    fun testNoJobsAvailable_displaysEmptyState() {
        // Configure fake repository to return empty job list
        if (jobRepository is com.cpen321.usermanagement.fakes.FakeJobRepository) {
            (jobRepository as com.cpen321.usermanagement.fakes.FakeJobRepository).setEmptyJobs()
        }
        
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
     */
    @Test
    fun testNoJobsWithinAvailability_displaysSuggestion() {
        // Configure fake repository to return only jobs outside availability
        if (jobRepository is com.cpen321.usermanagement.fakes.FakeJobRepository) {
            (jobRepository as com.cpen321.usermanagement.fakes.FakeJobRepository).setOnlyJobsOutsideAvailability()
        }
        
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
        
        // Verify jobs are shown in "Show All" mode
        composeTestRule.onNodeWithText("Show All").assertIsDisplayed()
        composeTestRule.onNodeWithText("555 Weekend Ave, Vancouver, BC", substring = true).assertExists()

        // Switch to "Within Availability" filter
        composeTestRule.onNodeWithTag("availability_switch").performClick()
        composeTestRule.waitForIdle()

        // Verify we're in filtered mode
        composeTestRule.onNodeWithText("Within Availability").assertIsDisplayed()

        // Verify no jobs message with suggestion is displayed
        composeTestRule.onNodeWithText("No available jobs within your availability. Try broadening your availability.")
            .assertIsDisplayed()

        // Verify no job cards are displayed
        composeTestRule.onAllNodesWithTag("job_card").assertCountEquals(0)
    }
}

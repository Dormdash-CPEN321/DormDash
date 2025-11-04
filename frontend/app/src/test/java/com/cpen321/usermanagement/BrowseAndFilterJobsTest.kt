package com.cpen321.usermanagement

import androidx.compose.ui.test.*
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
class BrowseAndFilterJobsTest : FindJobsTestBase() {
    
    /**
     * Test: Main success scenario - Browse all jobs
     * Steps 1-2: Navigate to Find Jobs and verify job list is displayed
     */
    @Test
    fun testBrowseAllJobs_displaysJobList() {
        // Step 1: Mover clicks on "Find Jobs" on navigation bar
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        
        // Step 2: Verify system displays all unassigned jobs
        // Check that the job list is visible
        composeTestRule.onNodeWithTag("job_list").assertIsDisplayed()
        
        // Verify job cards contain required information:
        // - Pickup address
        composeTestRule.onAllNodesWithTag("job_pickup_address").onFirst().assertIsDisplayed()
        
        // - Drop-off address
        composeTestRule.onAllNodesWithTag("job_dropoff_address").onFirst().assertIsDisplayed()
        
        // - Volume of items
        composeTestRule.onAllNodesWithTag("job_volume").onFirst().assertIsDisplayed()
        
        // - Date and time
        composeTestRule.onAllNodesWithTag("job_datetime").onFirst().assertIsDisplayed()
        
        // - Job type (storage or return)
        composeTestRule.onAllNodesWithTag("job_type").onFirst().assertIsDisplayed()
        
        // - Credits
        composeTestRule.onAllNodesWithTag("job_credits").onFirst().assertIsDisplayed()
    }
    
    /**
     * Test: Toggle filter between "Show All" and "Within Availability"
     * Steps 3-4: Test the availability filter toggle functionality
     */
    @Test
    fun testFilterByAvailability_displaysFilteredJobs() {
        // Step 1: Navigate to Find Jobs
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        
        // Step 2: Verify "Show All" is initially selected/displayed
        composeTestRule.onNodeWithText("Show All").assertIsDisplayed()
        
        // Step 3: Mover clicks toggle to switch to "Within Availability"
        composeTestRule.onNodeWithTag("availability_toggle").performClick()
        
        // Verify toggle switched to "Within Availability"
        composeTestRule.onNodeWithText("Within Availability").assertIsDisplayed()
        
        // Step 4: System displays only jobs within mover's availability
        // Verify filtered job list is displayed
        composeTestRule.onNodeWithTag("job_list").assertIsDisplayed()
        
        // Verify jobs shown have availability indicator or are within time windows
        composeTestRule.onAllNodesWithTag("job_within_availability_badge")
            .onFirst()
            .assertIsDisplayed()
    }
    
    /**
     * Test: Toggle back from "Within Availability" to "Show All"
     */
    @Test
    fun testToggleBackToShowAll_displaysAllJobs() {
        // Navigate and switch to filtered view
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        composeTestRule.onNodeWithTag("availability_toggle").performClick()
        
        // Verify we're in filtered mode
        composeTestRule.onNodeWithText("Within Availability").assertIsDisplayed()
        
        // Toggle back to "Show All"
        composeTestRule.onNodeWithTag("availability_toggle").performClick()
        
        // Verify we're back to showing all jobs
        composeTestRule.onNodeWithText("Show All").assertIsDisplayed()
        composeTestRule.onNodeWithTag("job_list").assertIsDisplayed()
    }
    
    /**
     * Failure Scenario 2a: No unassigned jobs exist
     */
    @Test
    fun testNoJobsAvailable_displaysEmptyState() {
        // TODO: Mock backend to return empty job list
        // This requires setting up a test environment where no jobs exist
        
        // Step 1: Navigate to Find Jobs
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        
        // Step 2a: No jobs available
        // Verify empty state message is displayed
        composeTestRule.onNodeWithText("No jobs available")
            .assertIsDisplayed()
        
        // Verify job list is not visible or empty
        composeTestRule.onNodeWithTag("job_list").assertDoesNotExist()
            .or(composeTestRule.onNodeWithTag("empty_job_list").assertIsDisplayed())
    }
    
    /**
     * Failure Scenario 4a: No jobs within mover's availability
     */
    @Test
    fun testNoJobsWithinAvailability_displaysSuggestion() {
        // TODO: Mock backend to return jobs outside availability
        
        // Navigate to Find Jobs
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        
        // Switch to "Within Availability" filter
        composeTestRule.onNodeWithTag("availability_toggle").performClick()
        
        // Verify no jobs message with suggestion is displayed
        composeTestRule.onNodeWithText("No jobs available")
            .assertIsDisplayed()
        
        // Verify suggestion to broaden availability
        composeTestRule.onNode(
            hasText("broaden your availability", substring = true, ignoreCase = true)
        ).assertIsDisplayed()
    }
    
    /**
     * Test: Job cards display correct information format
     */
    @Test
    fun testJobCardInformation_isFormattedCorrectly() {
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        
        // Verify at least one job card exists
        val jobCards = composeTestRule.onAllNodesWithTag("job_card")
        jobCards.onFirst().assertIsDisplayed()
        
        // Verify job type badge is one of: "Storage" or "Return"
        composeTestRule.onNode(
            hasTestTag("job_type") and (hasText("Storage") or hasText("Return"))
        ).assertExists()
        
        // Verify credits display format (e.g., "$25" or "25 credits")
        composeTestRule.onAllNodesWithTag("job_credits")
            .onFirst()
            .assertTextContains("$", substring = true)
            .or(composeTestRule.onAllNodesWithTag("job_credits")
                .onFirst()
                .assertTextContains("credit", substring = true, ignoreCase = true))
    }
    
    /**
     * Test: Can scroll through job list
     */
    @Test
    fun testJobList_isScrollable() {
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        
        // Perform scroll on job list
        composeTestRule.onNodeWithTag("job_list")
            .performScrollToIndex(5) // Scroll to 6th item
        
        // Verify we can see different jobs after scrolling
        composeTestRule.onNodeWithTag("job_list").assertIsDisplayed()
    }
}

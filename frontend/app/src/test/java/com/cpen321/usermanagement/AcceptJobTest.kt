package com.cpen321.usermanagement

import androidx.compose.ui.test.*
import org.junit.Test

/**
 * UC-4: Accept Job
 * 
 * Tests the ability for movers to accept unassigned jobs.
 * 
 * Main Success Scenario:
 * 1. Mover clicks "Accept" button for a job
 * 2. System assigns job to mover, notifies student, triggers live update
 * 3. Mover sees job listed under "Current Jobs"
 * 
 * Failure Scenarios:
 * 1a. Another mover accepts the job at the same time
 */
class AcceptJobTest : FindJobsTestBase() {
    
    /**
     * Test: Main success scenario - Accept a job
     * Complete flow from browsing to accepting to viewing in Current Jobs
     */
    @Test
    fun testAcceptJob_successfullyAssignsToMover() {
        // Precondition: Navigate to Find Jobs (UC-3)
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        
        // Verify job list is displayed
        composeTestRule.onNodeWithTag("job_list").assertIsDisplayed()
        
        // Get the first job's details for verification later
        // (In real test, you might want to verify specific job ID)
        val firstJobCard = composeTestRule.onAllNodesWithTag("job_card").onFirst()
        firstJobCard.assertIsDisplayed()
        
        // Step 1: Mover clicks "Accept" button for the first job
        composeTestRule.onAllNodesWithText("Accept")
            .onFirst()
            .performClick()
        
        // Step 2: System assigns the job
        // Verify loading indicator or success message appears
        composeTestRule.onNode(
            hasText("Accepting job", substring = true, ignoreCase = true)
                .or(hasText("Job accepted", substring = true, ignoreCase = true))
        ).assertIsDisplayed()
        
        // Wait for assignment to complete (you may need to adjust wait time)
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("Job accepted", substring = true, ignoreCase = true)
                .fetchSemanticsNodes().isNotEmpty()
        }
        
        // Step 3: Navigate to "Current Jobs" to verify the job is listed there
        composeTestRule.onNodeWithText("Current Jobs").performClick()
        
        // Verify the accepted job appears in Current Jobs list
        composeTestRule.onNodeWithTag("current_jobs_list").assertIsDisplayed()
        
        // Verify at least one job card is present
        composeTestRule.onAllNodesWithTag("current_job_card")
            .onFirst()
            .assertIsDisplayed()
    }
    
    /**
     * Test: Job disappears from Find Jobs after acceptance
     */
    @Test
    fun testAcceptJob_removesJobFromFindJobsList() {
        // Navigate to Find Jobs
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        
        // Count initial number of jobs
        val initialJobCount = composeTestRule.onAllNodesWithTag("job_card")
            .fetchSemanticsNodes().size
        
        // Accept the first job
        composeTestRule.onAllNodesWithText("Accept")
            .onFirst()
            .performClick()
        
        // Wait for acceptance to complete
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("Job accepted", substring = true, ignoreCase = true)
                .fetchSemanticsNodes().isNotEmpty()
        }
        
        // Go back to Find Jobs
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        
        // Verify job count decreased by 1
        val newJobCount = composeTestRule.onAllNodesWithTag("job_card")
            .fetchSemanticsNodes().size
        
        assert(newJobCount == initialJobCount - 1) {
            "Job should be removed from list after acceptance"
        }
    }
    
    /**
     * Test: Accept button is enabled and clickable
     */
    @Test
    fun testAcceptButton_isEnabledAndClickable() {
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        
        // Verify Accept button exists and is enabled
        composeTestRule.onAllNodesWithText("Accept")
            .onFirst()
            .assertIsDisplayed()
            .assertIsEnabled()
            .assertHasClickAction()
    }
    
    /**
     * Test: Loading state during job acceptance
     */
    @Test
    fun testAcceptJob_showsLoadingState() {
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        
        // Click Accept
        composeTestRule.onAllNodesWithText("Accept")
            .onFirst()
            .performClick()
        
        // Verify loading indicator appears
        composeTestRule.onNode(
            hasTestTag("accepting_job_loading")
                .or(hasText("Accepting", substring = true, ignoreCase = true))
        ).assertIsDisplayed()
    }
    
    /**
     * Failure Scenario 1a: Concurrent acceptance - another mover accepts job first
     */
    @Test
    fun testAcceptJob_concurrentAcceptance_showsErrorAndRefreshes() {
        // TODO: Mock backend to simulate concurrent acceptance failure
        // This requires intercepting the API call and returning a conflict/error
        
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        
        // Get the first job for tracking
        val firstJobCard = composeTestRule.onAllNodesWithTag("job_card").onFirst()
        firstJobCard.assertIsDisplayed()
        
        // Step 1a: Mover attempts to accept job (but another mover accepts it first)
        composeTestRule.onAllNodesWithText("Accept")
            .onFirst()
            .performClick()
        
        // Step 1a1: System notifies mover that job could not be accepted
        composeTestRule.onNode(
            hasText("could not be accepted", substring = true, ignoreCase = true)
                .or(hasText("no longer available", substring = true, ignoreCase = true))
                .or(hasText("already accepted", substring = true, ignoreCase = true))
        ).assertIsDisplayed()
        
        // Verify retry button is present
        composeTestRule.onNode(
            hasText("Retry", substring = true, ignoreCase = true)
                .or(hasText("Try again", substring = true, ignoreCase = true))
        ).assertIsDisplayed()
        
        // Verify the list refreshes and job is no longer visible
        // (This assumes the dialog is dismissed or auto-closes)
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("could not be accepted", substring = true, ignoreCase = true)
                .fetchSemanticsNodes().isEmpty()
        }
        
        // The previously attempted job should not be in the list anymore
        // (This is difficult to test without unique job identifiers)
    }
    
    /**
     * Test: Retry after failed acceptance
     */
    @Test
    fun testAcceptJob_retryAfterFailure() {
        // TODO: Mock backend to fail first, succeed second time
        
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        
        // Attempt to accept (this will fail in mock)
        composeTestRule.onAllNodesWithText("Accept")
            .onFirst()
            .performClick()
        
        // Error message appears
        composeTestRule.onNode(
            hasText("could not be accepted", substring = true, ignoreCase = true)
        ).assertIsDisplayed()
        
        // Click retry button
        composeTestRule.onNodeWithText("Retry", ignoreCase = true)
            .performClick()
        
        // Verify another attempt is made (loading state appears again)
        composeTestRule.onNode(
            hasText("Accepting", substring = true, ignoreCase = true)
        ).assertIsDisplayed()
    }
    
    /**
     * Test: Accept multiple jobs in sequence
     */
    @Test
    fun testAcceptMultipleJobs_allAppearInCurrentJobs() {
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        
        // Accept first job
        composeTestRule.onAllNodesWithText("Accept").onFirst().performClick()
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("Job accepted", substring = true, ignoreCase = true)
                .fetchSemanticsNodes().isNotEmpty()
        }
        
        // Go back to Find Jobs
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        
        // Accept second job
        composeTestRule.onAllNodesWithText("Accept").onFirst().performClick()
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("Job accepted", substring = true, ignoreCase = true)
                .fetchSemanticsNodes().isNotEmpty()
        }
        
        // Navigate to Current Jobs
        composeTestRule.onNodeWithText("Current Jobs").performClick()
        
        // Verify we have at least 2 jobs in Current Jobs
        val currentJobsCount = composeTestRule.onAllNodesWithTag("current_job_card")
            .fetchSemanticsNodes().size
        
        assert(currentJobsCount >= 2) {
            "Should have at least 2 jobs in Current Jobs after accepting 2 jobs"
        }
    }
    
    /**
     * Test: Accepted job shows correct status
     */
    @Test
    fun testAcceptedJob_displaysAcceptedStatus() {
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        
        // Accept a job
        composeTestRule.onAllNodesWithText("Accept").onFirst().performClick()
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("Job accepted", substring = true, ignoreCase = true)
                .fetchSemanticsNodes().isNotEmpty()
        }
        
        // Navigate to Current Jobs
        composeTestRule.onNodeWithText("Current Jobs").performClick()
        
        // Verify job has "Accepted" status badge or indicator
        composeTestRule.onNode(
            hasText("Accepted", substring = true, ignoreCase = true)
                .or(hasTestTag("job_status_accepted"))
        ).assertIsDisplayed()
    }
}

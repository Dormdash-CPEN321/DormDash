package com.cpen321.usermanagement

import androidx.compose.ui.test.*
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Test

/**
 * UC-4: Accept Job
 * 
 * Tests the ability for movers to accept unassigned jobs.
 *
 * Before running test, ensure the following setup is complete:
 *
 * 1. Create an order from a student's account.
 *
 * Main Success Scenario:
 * 1. Mover clicks "Accept" button for a job
 * 2. System assigns job to mover, notifies student, triggers live update
 * 3. Mover sees job listed under "Current Jobs"
 * 
 * Failure Scenarios:
 * 1a. Another mover accepts the job at the same time
 */
@HiltAndroidTest
class AcceptJobTest : FindJobsTestBase() {
    
    /**
     * Test: Main success scenario - Accept a job
     * Complete flow from browsing to accepting to viewing in Current Jobs
     */
    @Test
    fun testAcceptJob_successfullyAssignsToMover() {
        // Wait for the app to navigate from loading to mover main screen
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("Find Jobs").fetchSemanticsNodes().isNotEmpty()
        }

        // Navigate to Find Jobs (UC-3)
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        composeTestRule.waitForIdle()

        // Wait for jobs to load
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithTag("job_card").fetchSemanticsNodes().isNotEmpty()
        }

        // Verify job list is displayed
        composeTestRule.onNodeWithTag("find_jobs_list").assertIsDisplayed()

        // Count initial number of jobs
        val initialJobCount = composeTestRule.onAllNodesWithTag("job_card")
            .fetchSemanticsNodes().size

        // Get the first job's details for verification later
        val firstJobCard = composeTestRule.onAllNodesWithTag("job_card").onFirst()
        firstJobCard.assertIsDisplayed()

        // Verify Accept button exists and is enabled
        composeTestRule.onAllNodesWithTag("job_accept_button")
            .onFirst()
            .assertIsDisplayed()
            .assertIsEnabled()
            .assertHasClickAction()

        // Step 1: Mover clicks "Accept" button for the job
        composeTestRule.onAllNodesWithTag("job_accept_button")
            .onFirst()
            .performClick()
        
        // Wait for assignment to complete
        composeTestRule.waitForIdle()
        Thread.sleep(2000) // Wait for backend to process

        // Navigate to "Current Jobs" to verify the job is listed there
        composeTestRule.onNodeWithText("Current Jobs").performClick()
        composeTestRule.waitForIdle()

        // Wait for current jobs to load
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithTag("current_job_card").fetchSemanticsNodes().isNotEmpty()
        }

        // Verify the accepted job appears in Current Jobs list
        composeTestRule.onNodeWithTag("current_jobs_list").assertIsDisplayed()
        
        // Verify at least one job card is present
        composeTestRule.onAllNodesWithTag("current_job_card")
            .onFirst()
            .assertIsDisplayed()

        // Verify job has status displayed
        composeTestRule.onAllNodesWithTag("current_job_status")
            .onFirst()
            .assertIsDisplayed()

        // Go back to Find Jobs
        composeTestRule.onNodeWithText("Find Jobs").performClick()

        // Wait for list to refresh
        composeTestRule.waitForIdle()
        Thread.sleep(1000)

        // Verify job count decreased by 1
        val newJobCount = composeTestRule.onAllNodesWithTag("job_card")
            .fetchSemanticsNodes().size

        assert(newJobCount == initialJobCount - 1) {
            "Job should be removed from list after acceptance"
        }
    }
}

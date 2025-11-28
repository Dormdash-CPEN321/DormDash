package com.cpen321.usermanagement

import androidx.compose.ui.test.*
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Test

/**
 * UC-5: View Recommended Route
 * 
 * Tests the ability for movers to view an optimal route that maximizes earnings.
 * 
 * Main Success Scenario:
 * 1. Mover clicks "Get Optimal Route" button
 * 2. System prompts for max shift duration
 * 3. Mover enters duration and clicks "Find Smart Route"
 * 4. System prompts for location access
 * 5. Mover allows location access
 * 6. System displays route summary and job list
 * 7. Mover can accept all or some jobs
 * 
 * Failure Scenarios:
 * 5a. Mover does not allow location access
 * 6a. Unable to suggest route due to duration/availability constraints
 */
@HiltAndroidTest
class ViewRecommendedRouteTest : FindJobsTestBase() {

    /**
     * Test: Main success scenario - View recommended route
     * Complete flow from requesting route to viewing suggestions
     */
    @Test
    fun testViewRecommendedRoute_displaysOptimalRoute() {
        //first go to availability page and set availability to ensure there are jobs available
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("Availability").fetchSemanticsNodes().isNotEmpty()
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

        composeTestRule.onNodeWithText("Availability").performClick()
        composeTestRule.waitForIdle()

        // Verify we're on the Set Availability screen
        composeTestRule.onNodeWithText("Set Availability").assertIsDisplayed()

        // Days to add standard 9-5 availability
        val standardDays = listOf("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY")

        // Add 9:00-17:00 time slots for standard days
        standardDays.forEach { day ->
            addAvailabilityTimeSlot(
                day = day,
                startTime = "09:00",
                endTime = "17:00"
            )
        }

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


        // Precondition: Navigate to Find Jobs page
        composeTestRule.onNodeWithText("Find Jobs").performClick()

        // Step 1: Mover clicks "Get Optimal Route" button
        composeTestRule.onNodeWithText("Get Optimal Route", ignoreCase = true)
            .performClick()

        // Step 2: System prompts for max shift duration
        composeTestRule.onNode(
            hasText("max", substring = true, ignoreCase = true)
                .and(hasText("duration", substring = true, ignoreCase = true))
        ).assertIsDisplayed()

        composeTestRule.onNodeWithTag("duration_slider")
            .performTouchInput {
                // Slider goes from 0 to 6, we want position 3 (4 hours)
                // Calculate the X position: 3/6 = 0.5 of the width
                val targetX = left + (width * 0.5f)
                down(center)
                moveTo(androidx.compose.ui.geometry.Offset(targetX, centerY))
                up()
            }

        // Mover clicks "Find Smart Route" button
        composeTestRule.onNodeWithText("Find Smart Route", ignoreCase = true)
            .performClick()

        // Step 4: System prompts for location access
        // Step 5: Grant location permission using UI Automator
        grantLocationPermission()

        composeTestRule.waitForIdle()

        // Wait for route calculation to complete
        waitForRouteCalculation()

        // Step 6: Verify route summary is displayed
        composeTestRule.onNodeWithTag("route_summary").assertIsDisplayed()

        // Verify route summary shows:
        // - Total credits/earnings
        composeTestRule.onNode(
            hasTestTag("route_total_credits")
        ).assertIsDisplayed()

        // - Total travel time
        composeTestRule.onNode(
            hasTestTag("route_total_time")
        ).assertIsDisplayed()

        // - Number of jobs in route
        composeTestRule.onNode(
            hasTestTag("route_job_count")
        ).assertIsDisplayed()

        // Verify list of jobs in the route
        composeTestRule.onNodeWithTag("route_jobs_list").assertIsDisplayed()

        // Verify each job shows: pickup address, travel time, credits
        composeTestRule.onAllNodesWithTag("route_job_pickup_address")
            .onFirst()
            .assertIsDisplayed()

        composeTestRule.onAllNodesWithTag("route_job_travel_time")
            .onFirst()
            .assertIsDisplayed()

        composeTestRule.onAllNodesWithTag("route_job_credits")
            .onFirst()
            .assertIsDisplayed()

        // remove all added availability after
        composeTestRule.onNodeWithText("Availability").performClick()
        composeTestRule.waitForIdle()

        standardDays.forEach { day ->
            composeTestRule.onNodeWithTag("delete_time_slot_${day}_09:00").performClick()
        }
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
     * Test: Accept all jobs in recommended route
     * Step 7: Test "Accept all jobs" button
     */
    @Test
    fun testRecommendedRoute_acceptAllJobs() {
        // Wait for initial navigation to be ready
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("Availability").fetchSemanticsNodes().isNotEmpty()
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

        // Set availability with unlimited time
        composeTestRule.onNodeWithText("Availability").performClick()
        composeTestRule.waitForIdle()

        // Verify we're on the Set Availability screen
        composeTestRule.onNodeWithText("Set Availability").assertIsDisplayed()
        composeTestRule.waitForIdle()

        // Days to add unlimited availability
        val allDays = listOf("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY")

        // Add unlimited time slots (00:00-23:59) for all days
        allDays.forEach { day ->
            addAvailabilityTimeSlot(
                day = day,
                startTime = "00:00",
                endTime = "23:59"
            )
        }

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

        // Navigate to Find Jobs and request route
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        composeTestRule.waitForIdle()

        // Click "Get Optimal Route" button
        composeTestRule.onNodeWithText("Get Optimal Route", ignoreCase = true).performClick()
        composeTestRule.waitForIdle()

        // Click "Find Smart Route" button
        composeTestRule.onNodeWithText("Find Smart Route", ignoreCase = true).performClick()
        composeTestRule.waitForIdle()

        // Grant location permission
        grantLocationPermission()
        composeTestRule.waitForIdle()

        // Wait for route calculation to complete
        waitForRouteCalculation()

        // Step 7: Click "Accept all jobs" button
        composeTestRule.onNodeWithTag("accept_all_jobs_button")
            .assertIsDisplayed()
            .performClick()

        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("ProfileButton").performClick()
        composeTestRule.waitForIdle()
        device.pressBack()
        composeTestRule.waitForIdle()

        // Navigate to Find Jobs - need to click retry if error appears
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        composeTestRule.waitForIdle()
        Thread.sleep(1000)

        // Check if retry button appears (happens because seeded jobs don't have real student IDs)
        val retryNodes = composeTestRule.onAllNodesWithText("Retry", ignoreCase = true).fetchSemanticsNodes()
        if (retryNodes.isNotEmpty()) {
            composeTestRule.onNodeWithText("Retry", ignoreCase = true).performClick()
            composeTestRule.waitForIdle()
        }

        // Navigate to Current Jobs to verify
        composeTestRule.onNodeWithText("Current Jobs").performClick()
        composeTestRule.waitForIdle()
        Thread.sleep(1000)

        // Check if retry button appears again
        val retryNodesCurrentJobs = composeTestRule.onAllNodesWithText("Retry", ignoreCase = true).fetchSemanticsNodes()
        if (retryNodesCurrentJobs.isNotEmpty()) {
            composeTestRule.onNodeWithText("Retry", ignoreCase = true).performClick()
            composeTestRule.waitForIdle()
        }

        // Verify current jobs list is displayed
        composeTestRule.onNodeWithTag("current_jobs_list").assertIsDisplayed()

        // Verify multiple jobs are now in current jobs
        val jobCount = composeTestRule.onAllNodesWithTag("current_job_card")
            .fetchSemanticsNodes().size
        assert(jobCount > 1) { "Should have multiple jobs after accepting all" }

        // Cleanup: Remove all added availability
        composeTestRule.onNodeWithText("Availability").performClick()
        composeTestRule.waitForIdle()

        allDays.forEach { day ->
            scrollToDay(day)
            composeTestRule.onNodeWithTag("delete_time_slot_${day}_00:00").performClick()
        }
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
     * Failure Scenario 5a: Mover denies location permission
     */
    @Test
    fun testDenyLocationPermission_displaysError() {
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("Find Jobs").fetchSemanticsNodes().isNotEmpty()
        }
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Get Optimal Route", ignoreCase = true).performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Find Smart Route", ignoreCase = true).performClick()
        composeTestRule.waitForIdle()

        // Step 5a: Deny location permission
        denyLocationPermission()
        Thread.sleep(2000)
        composeTestRule.waitForIdle()

        // Step 5a1: Verify location permission required message is displayed
        composeTestRule.waitUntil(timeoutMillis = 10000) {
            composeTestRule
                .onAllNodesWithText("Location Permission Required", substring = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }

        composeTestRule.onNodeWithText("Location Permission Required")
            .assertIsDisplayed()

        // Also verify the explanation text
        composeTestRule.onNodeWithText(
            "We need your location to calculate the optimal route",
            substring = true
        ).assertIsDisplayed()
    }

    /**
     * Failure Scenario 6a: No route fits duration/availability constraints
     */
    @Test
    fun testNoRouteFitsConstraints_displaysMessage() {
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("Find Jobs").fetchSemanticsNodes().isNotEmpty()
        }
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Get Optimal Route", ignoreCase = true).performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Find Smart Route", ignoreCase = true).performClick()
        composeTestRule.waitForIdle()

        grantLocationPermission()
        Thread.sleep(2000)
        composeTestRule.waitForIdle()
        Thread.sleep(2000)
        composeTestRule.onAllNodesWithText("location required", substring = true, ignoreCase = true)
            .fetchSemanticsNodes().isEmpty()

        // Step 6a1: Verify message that no jobs fit
        composeTestRule.onNode(
            hasText("no jobs available", substring = true, ignoreCase = true)
        ).assertIsDisplayed()

        // Verify suggestion to change availability/duration
        composeTestRule.onNode(
            hasText("adjust", substring = true, ignoreCase = true)
                .and(hasText("availability", substring = true, ignoreCase = true)
                    .or(hasText("duration", substring = true, ignoreCase = true)))
        ).assertIsDisplayed()
    }

    // Helper functions
    /**
     * Wait for route calculation to complete
     * First waits for loading indicator to appear, then waits for it to disappear,
     * then waits for route_summary to appear
     */
    private fun waitForRouteCalculation(maxTimeoutMillis: Long = 60000L) {
        // Short wait to see if loading appears (non-fatal if it doesn't)
        val loadingShown = try {
            composeTestRule.waitUntil(5_000) {
                composeTestRule.onAllNodesWithTag("route_loading").fetchSemanticsNodes().isNotEmpty() ||
                composeTestRule.onAllNodesWithText("Calculating optimal route", substring = true, ignoreCase = true)
                    .fetchSemanticsNodes().isNotEmpty()
            }
            true
        } catch (_: Throwable) {
            // Loading didn't show within 5s, might already be done
            false
        }

        // If loading was shown, wait for it to disappear
        if (loadingShown) {
            composeTestRule.waitUntil(maxTimeoutMillis) {
                composeTestRule.onAllNodesWithTag("route_loading").fetchSemanticsNodes().isEmpty() &&
                composeTestRule.onAllNodesWithText("Calculating optimal route", substring = true, ignoreCase = true)
                    .fetchSemanticsNodes().isEmpty()
            }
            composeTestRule.waitForIdle()
        }

        // Finally wait for the route summary to appear
        composeTestRule.waitUntil(maxTimeoutMillis) {
            composeTestRule.onAllNodesWithTag("route_summary").fetchSemanticsNodes().isNotEmpty()
        }
        composeTestRule.waitForIdle()
    }
}

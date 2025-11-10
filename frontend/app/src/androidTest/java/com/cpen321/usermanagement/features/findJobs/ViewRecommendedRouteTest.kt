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
        composeTestRule.onNodeWithText("Availability").performClick()
        composeTestRule.waitForIdle()

        // Verify we're on the Set Availability screen
        composeTestRule.onNodeWithText("Set Availability").assertIsDisplayed()

        // Days to add standard 9-5 availability
        val standardDays = listOf("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY")

        // Add 9:00-17:00 time slots for standard days
        standardDays.forEach { day ->
            addTimeSlot(
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

        // Verify slider bar is shown and move it to select duration
        //it starts off at unlimited by default
        //move the slider to 4 hours
        composeTestRule.onNodeWithTag("duration_slider").performTouchInput {
            swipeRight()
            swipeRight()
            swipeRight()
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
    }

    /**
     * Test: Accept all jobs in recommended route
     * Step 7: Test "Accept all jobs" button
     */
    @Test
    fun testRecommendedRoute_acceptAllJobs() {
        // Navigate and request route
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        composeTestRule.onNodeWithText("Get Optimal Route", ignoreCase = true).performClick()

        // Select duration
        composeTestRule.onNodeWithText("4 hours", substring = true, ignoreCase = true).performClick()
        composeTestRule.onNodeWithText("Find Smart Route", ignoreCase = true).performClick()

        // Grant location
        grantLocationPermission()

        // Wait for route
        composeTestRule.waitUntil(timeoutMillis = 10000) {
            composeTestRule.onAllNodesWithTag("route_summary")
                .fetchSemanticsNodes().isNotEmpty()
        }

        // Step 7: Click "Accept all jobs" button
        composeTestRule.onNodeWithText("Accept all jobs", ignoreCase = true)
            .assertIsDisplayed()
            .performClick()

        // Verify confirmation or loading state
        composeTestRule.onNode(
            hasText("Accepting all jobs", substring = true, ignoreCase = true)
                .or(hasText("Jobs accepted", substring = true, ignoreCase = true))
        ).assertIsDisplayed()

        // Wait for acceptance to complete
        composeTestRule.waitUntil(timeoutMillis = 10000) {
            composeTestRule.onAllNodesWithText("Jobs accepted", substring = true, ignoreCase = true)
                .fetchSemanticsNodes().isNotEmpty()
        }

        // Verify jobs appear in Current Jobs
        composeTestRule.onNodeWithText("Current Jobs").performClick()
        composeTestRule.onNodeWithTag("current_jobs_list").assertIsDisplayed()

        // Verify multiple jobs are now in current jobs
        val jobCount = composeTestRule.onAllNodesWithTag("current_job_card")
            .fetchSemanticsNodes().size
        assert(jobCount > 1) { "Should have multiple jobs after accepting all" }
    }

    /**
     * Test: Accept individual jobs from recommended route
     * Step 7: Test individual "Accept job" buttons
     */
    @Test
    fun testRecommendedRoute_acceptIndividualJobs() {
        // Setup: Get to route display
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        composeTestRule.onNodeWithText("Get Optimal Route", ignoreCase = true).performClick()
        composeTestRule.onNodeWithText("4 hours", substring = true, ignoreCase = true).performClick()
        composeTestRule.onNodeWithText("Find Smart Route", ignoreCase = true).performClick()
        grantLocationPermission()

        composeTestRule.waitUntil(timeoutMillis = 10000) {
            composeTestRule.onAllNodesWithTag("route_summary")
                .fetchSemanticsNodes().isNotEmpty()
        }

        // Accept first job only
        composeTestRule.onAllNodesWithText("Accept job", ignoreCase = true)
            .onFirst()
            .performClick()

        // Verify acceptance confirmation
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("Job accepted", substring = true, ignoreCase = true)
                .fetchSemanticsNodes().isNotEmpty()
        }

        // Accept second job
        composeTestRule.onAllNodesWithText("Accept job", ignoreCase = true)
            .onFirst() // Now first again since previous was removed/disabled
            .performClick()

        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("Job accepted", substring = true, ignoreCase = true)
                .fetchSemanticsNodes().isNotEmpty()
        }
    }

    /**
     * Test: Duration selection options
     * Step 2-3: Verify all duration options are available
     */
    @Test
    fun testDurationSelection_displaysAllOptions() {
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        composeTestRule.onNodeWithText("Get Optimal Route", ignoreCase = true).performClick()

        // Verify multiple duration options
        val durationOptions = listOf("2 hours", "4 hours", "6 hours", "8 hours")
        durationOptions.forEach { duration ->
            composeTestRule.onNode(
                hasText(duration, substring = true, ignoreCase = true)
            ).assertIsDisplayed()
        }
    }

    /**
     * Test: Route summary displays total information
     * Step 6: Verify route summary shows totals
     */
    @Test
    fun testRouteSummary_displaysTotalInformation() {
        // Setup: Get route
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        composeTestRule.onNodeWithText("Get Optimal Route", ignoreCase = true).performClick()
        composeTestRule.onNodeWithText("4 hours", substring = true, ignoreCase = true).performClick()
        composeTestRule.onNodeWithText("Find Smart Route", ignoreCase = true).performClick()
        grantLocationPermission()

        composeTestRule.waitUntil(timeoutMillis = 10000) {
            composeTestRule.onAllNodesWithTag("route_summary")
                .fetchSemanticsNodes().isNotEmpty()
        }

        // Verify route summary shows:
        // - Total credits/earnings
        composeTestRule.onNode(
            hasTestTag("route_total_credits")
                .or(hasText("Total credits", substring = true, ignoreCase = true))
                .or(hasText("Total earnings", substring = true, ignoreCase = true))
        ).assertIsDisplayed()

        // - Total travel time
        composeTestRule.onNode(
            hasTestTag("route_total_time")
                .or(hasText("Total time", substring = true, ignoreCase = true))
        ).assertIsDisplayed()

        // - Number of jobs in route
        composeTestRule.onNode(
            hasTestTag("route_job_count")
                .or(hasText("jobs", substring = true, ignoreCase = true))
        ).assertIsDisplayed()
    }

    /**
     * Failure Scenario 5a: Mover denies location permission
     */
    @Test
    fun testDenyLocationPermission_displaysError() {
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        composeTestRule.onNodeWithText("Get Optimal Route", ignoreCase = true).performClick()
        composeTestRule.onNodeWithText("4 hours", substring = true, ignoreCase = true).performClick()
        composeTestRule.onNodeWithText("Find Smart Route", ignoreCase = true).performClick()

        // Step 5a: Deny location permission
        denyLocationPermission()

        // Step 5a1: Verify error message is displayed
        composeTestRule.onNode(
            hasText("location permission is required", substring = true, ignoreCase = true)
                .or(hasText("grant permission", substring = true, ignoreCase = true))
        ).assertIsDisplayed()

        // Verify suggestion to grant permission
        composeTestRule.onNode(
            hasText("grant", substring = true, ignoreCase = true)
                .or(hasText("allow", substring = true, ignoreCase = true))
        ).assertIsDisplayed()
    }

    /**
     * Failure Scenario 6a: No route fits duration/availability constraints
     */
    @Test
    fun testNoRouteFitsConstraints_displaysMessage() {
        // TODO: Mock backend to return empty route

        composeTestRule.onNodeWithText("Find Jobs").performClick()
        composeTestRule.onNodeWithText("Get Optimal Route", ignoreCase = true).performClick()

        // Select very short duration (2 hours)
        composeTestRule.onNodeWithText("2 hours", substring = true, ignoreCase = true).performClick()
        composeTestRule.onNodeWithText("Find Smart Route", ignoreCase = true).performClick()
        grantLocationPermission()

        // Step 6a1: Verify message that no jobs fit
        composeTestRule.onNode(
            hasText("no jobs fit", substring = true, ignoreCase = true)
                .or(hasText("unable to suggest route", substring = true, ignoreCase = true))
        ).assertIsDisplayed()

        // Verify suggestion to change availability/duration
        composeTestRule.onNode(
            hasText("change", substring = true, ignoreCase = true)
                .and(hasText("availability", substring = true, ignoreCase = true)
                    .or(hasText("duration", substring = true, ignoreCase = true)))
        ).assertIsDisplayed()
    }

    /**
     * Test: Loading state while calculating route
     */
    @Test
    fun testRouteCalculation_showsLoadingState() {
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        composeTestRule.onNodeWithText("Get Optimal Route", ignoreCase = true).performClick()
        composeTestRule.onNodeWithText("4 hours", substring = true, ignoreCase = true).performClick()
        composeTestRule.onNodeWithText("Find Smart Route", ignoreCase = true).performClick()
        grantLocationPermission()

        // Verify loading indicator appears
        composeTestRule.onNode(
            hasTestTag("route_loading")
                .or(hasText("Calculating route", substring = true, ignoreCase = true))
                .or(hasText("Finding optimal route", substring = true, ignoreCase = true))
        ).assertIsDisplayed()
    }

    /**
     * Test: Can cancel route request
     */
    @Test
    fun testCancelRouteRequest_returnsToFindJobs() {
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        composeTestRule.onNodeWithText("Get Optimal Route", ignoreCase = true).performClick()

        // Look for cancel/back button in duration selection dialog
        composeTestRule.onNode(
            hasText("Cancel", ignoreCase = true)
                .or(hasContentDescription("Navigate up"))
        ).performClick()

        // Verify we're back on Find Jobs page
        composeTestRule.onNodeWithText("Get Optimal Route", ignoreCase = true)
            .assertIsDisplayed()
    }

    /**
     * Test: Route jobs are within availability
     */
    @Test
    fun testRecommendedRoute_jobsAreWithinAvailability() {
        // Setup: Get route
        composeTestRule.onNodeWithText("Find Jobs").performClick()
        composeTestRule.onNodeWithText("Get Optimal Route", ignoreCase = true).performClick()
        composeTestRule.onNodeWithText("4 hours", substring = true, ignoreCase = true).performClick()
        composeTestRule.onNodeWithText("Find Smart Route", ignoreCase = true).performClick()
        grantLocationPermission()

        composeTestRule.waitUntil(timeoutMillis = 10000) {
            composeTestRule.onAllNodesWithTag("route_summary")
                .fetchSemanticsNodes().isNotEmpty()
        }

        // Verify each job has availability badge or indicator
        composeTestRule.onAllNodesWithTag("route_job_within_availability")
            .onFirst()
            .assertIsDisplayed()
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

    /**
     * Scroll until the specified day becomes visible on screen
     * Uses the day's index to scroll to the appropriate position
     */
    private fun scrollToDay(dayName: String) {
        // First check if already visible
        if (composeTestRule.onAllNodesWithText(dayName).fetchSemanticsNodes().isNotEmpty()) {
            return
        }

        // Get the index of the day (MONDAY=0, TUESDAY=1, etc.)
        val dayIndex = when(dayName) {
            "MONDAY" -> 0
            "TUESDAY" -> 1
            "WEDNESDAY" -> 2
            "THURSDAY" -> 3
            "FRIDAY" -> 4
            "SATURDAY" -> 5
            "SUNDAY" -> 6
            else -> 0
        }

        // Scroll down gradually until the day is visible
        // Each swipe should move approximately 2-3 items
        val swipesNeeded = (dayIndex / 2).coerceAtLeast(1)

        repeat(swipesNeeded) {
            if (composeTestRule.onAllNodesWithText(dayName).fetchSemanticsNodes().isEmpty()) {
                try {
                    composeTestRule.onNodeWithTag("availability_list")
                        .performTouchInput {
                            swipeUp(
                                startY = bottom * 0.7f,
                                endY = top * 1.3f
                            )
                        }
                    composeTestRule.waitForIdle()
                    Thread.sleep(150) // Give time for recomposition
                } catch (_: Exception) {
                    // If that fails, try a different approach
                    composeTestRule.onRoot().performTouchInput {
                        swipeUp(
                            startY = centerY + (height * 0.3f),
                            endY = centerY - (height * 0.3f)
                        )
                    }
                    composeTestRule.waitForIdle()
                    Thread.sleep(150)
                }
            }
        }

        // Final verification with more swipes if needed
        var attempts = 0
        while (composeTestRule.onAllNodesWithText(dayName).fetchSemanticsNodes().isEmpty() && attempts < 5) {
            try {
                composeTestRule.onNodeWithTag("availability_list")
                    .performTouchInput {
                        swipeUp(
                            startY = bottom * 0.7f,
                            endY = top * 1.3f
                        )
                    }
            } catch (_: Exception) {
                composeTestRule.onRoot().performTouchInput {
                    swipeUp()
                }
            }
            composeTestRule.waitForIdle()
            Thread.sleep(150)
            attempts++
        }

        // Assert that the day is now visible
        composeTestRule.onNodeWithText(dayName).assertExists(
            "Could not find day '$dayName' after scrolling"
        )
    }

    /**
     * Add a time slot to a specific day
     */
    private fun addTimeSlot(day: String, startTime: String, endTime: String) {
        // Scroll until the day is visible
        scrollToDay(day)
        composeTestRule.waitForIdle()

        // Click add button for the specific day using test tag
        composeTestRule.onNodeWithTag("add_time_slot_$day").performClick()

        composeTestRule.waitForIdle()

        // Verify dialog is shown
        composeTestRule.onNodeWithText("Add Time Slot").assertIsDisplayed()

        // Update start time using test tag
        composeTestRule.onNodeWithTag("start_time_input").apply {
            performTextClearance()
            performTextInput(startTime)
        }

        composeTestRule.waitForIdle()

        // Update end time using test tag
        composeTestRule.onNodeWithTag("end_time_input").apply {
            performTextClearance()
            performTextInput(endTime)
        }

        composeTestRule.waitForIdle()

        // Click Add button
        composeTestRule.onNodeWithText("Add").performClick()

        composeTestRule.waitForIdle()
    }
}

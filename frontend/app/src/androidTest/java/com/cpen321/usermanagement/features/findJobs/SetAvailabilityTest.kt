package com.cpen321.usermanagement.features.findJobs

import androidx.compose.ui.test.*
import com.cpen321.usermanagement.FindJobsTestBase
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Test

/**
 *
 * Use Case: The mover defines daily time periods for each day of the week where they are
 * available to complete pick up orders. The system uses these slots to determine which jobs
 * are eligible to be shown to mover if they choose to only view jobs within their availability.
 *
 * Test Scenarios:
 * 1. Main Success Scenario: Mover successfully sets availability for all days of the week
 *    - Navigate to Set Availability screen
 *    - Add 9:00-17:00 time slots for Monday through Thursday and Saturday through Sunday
 *    - Add 8:00-18:00 time slot for Friday (test custom input)
 *    - Save availability successfully
 *
 * 2. Extension Scenarios:
 *    a. Remove a time slot
 *    b. Add multiple time slots to the same day
 *    c. Invalid time format handling
 */
@HiltAndroidTest
class SetAvailabilityTest : FindJobsTestBase() {

    /**
     * Main Success Scenario: Set availability for all days of the week
     * - Start with no availability set
     * - Add 9:00 AM - 5:00 PM slots to all days except Friday
     * - Add 8:00 AM - 6:00 PM slot to Friday (test typing custom times)
     * - Save availability
     */
    @Test
    fun testSetAvailabilityForAllDays_success() {
        // Navigate to Set Availability screen
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("Availability").fetchSemanticsNodes().isNotEmpty()
        }
        composeTestRule.onNodeWithText("Availability").performClick()
        composeTestRule.waitForIdle()

        // Verify we're on the Set Availability screen
        composeTestRule.onNodeWithText("Set Availability").assertIsDisplayed()

        // Days to add standard 9-5 availability
        val standardDays = listOf("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY")

        // Add 9:00-17:00 time slots for standard days
        standardDays.forEach { day ->
            addAvailabilityTimeSlot(
                day = day,
                startTime = "09:00",
                endTime = "17:00"
            )
        }

        // scroll to to top to ensure we verify starting from monday
        composeTestRule.onNodeWithTag("availability_list").performTouchInput {
            swipeDown(
                startY = centerY - (height * 0.3f),
                endY = centerY + (height * 0.3f)
            )
        }

        // Verify all time slots are displayed
        standardDays.forEach { day ->
            verifyTimeSlotExists(day, "09:00", "17:00")
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

        composeTestRule.onNodeWithText("Find Jobs").performClick()
        composeTestRule.waitForIdle()
        Thread.sleep(1000)

        composeTestRule.onNodeWithText("Availability").performClick()
        composeTestRule.waitForIdle()
        Thread.sleep(1000)

        // Cleanup: Remove time slots
        // Scroll to top to ensure we can access all days
        composeTestRule.onNodeWithTag("availability_list").performTouchInput {
            swipeDown(
                startY = centerY - (height * 0.3f),
                endY = centerY + (height * 0.3f)
            )
        }
        composeTestRule.waitForIdle()

        // Remove each time slot, scrolling to each day to ensure it's visible
        standardDays.forEach { day ->
            composeTestRule.waitForIdle()
            composeTestRule.onNodeWithTag("delete_time_slot_${day}_09:00").performClick()
            composeTestRule.waitForIdle()
            //Thread.sleep(300)
        }

        // Save the empty availability
        composeTestRule.onNodeWithText("Save Availability").performClick()
        composeTestRule.waitForIdle()

        // Wait for success message AND give extra time for backend to persist
        composeTestRule.waitUntil(timeoutMillis = 10000) {
            composeTestRule
                .onAllNodesWithText("Availability updated successfully!", substring = true, ignoreCase = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }

        // Final wait to ensure everything is persisted
        Thread.sleep(2000)
    }

    /**
     * Remove a time slot
     */
    @Test
    fun testRemoveTimeSlot_success() {
        // Navigate to Set Availability screen
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("Availability").fetchSemanticsNodes().isNotEmpty()
        }
        composeTestRule.onNodeWithText("Availability").performClick()
        composeTestRule.waitForIdle()

        // Add a time slot for Monday
        addAvailabilityTimeSlot(
            day = "MONDAY",
            startTime = "09:00",
            endTime = "17:00"
        )

        // Verify time slot exists
        verifyTimeSlotExists("MONDAY", "09:00", "17:00")

        // Find and click the delete button for this time slot using test tag
        composeTestRule.onNodeWithTag("delete_time_slot_MONDAY_09:00").performClick()

        composeTestRule.waitForIdle()

        // Verify time slot is removed by expecting assert failure from verification
        val exception = kotlin.runCatching {
            verifyTimeSlotExists("MONDAY", "09:00", "17:00")
        }.exceptionOrNull()

        assert(exception is AssertionError)

        // Cleanup: Save the empty availability to ensure backend is cleared
        composeTestRule.onNodeWithText("Save Availability").performClick()
        composeTestRule.waitForIdle()

        // Wait for success message to ensure backend save completed
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule
                .onAllNodesWithText("Availability updated successfully!", substring = true, ignoreCase = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }

        // Give extra time for backend operation to complete
        Thread.sleep(2000)
    }

    /**
     * Add multiple time slots to the same day
     */
    @Test
    fun testAddMultipleTimeSlotsToSameDay_success() {
        // Navigate to Set Availability screen
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("Availability").fetchSemanticsNodes().isNotEmpty()
        }
        composeTestRule.onNodeWithText("Availability").performClick()
        composeTestRule.waitForIdle()

        // Add first time slot for Monday (morning)
        addAvailabilityTimeSlot(
            day = "MONDAY",
            startTime = "09:00",
            endTime = "12:00"
        )

        // Add second time slot for Monday (afternoon)
        addAvailabilityTimeSlot(
            day = "MONDAY",
            startTime = "14:00",
            endTime = "18:00"
        )

        composeTestRule.onNodeWithText("Save Availability").performClick()

        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Find Jobs").performClick()

        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Availability").performClick()

        // Verify both time slots exist for Monday
        verifyTimeSlotExists("MONDAY", "09:00", "12:00")
        verifyTimeSlotExists("MONDAY", "14:00", "18:00")

        // Cleanup: Remove both time slots
        scrollToDay("MONDAY")
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("delete_time_slot_MONDAY_09:00").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("delete_time_slot_MONDAY_14:00").performClick()
        composeTestRule.waitForIdle()

        // Save empty availability
        composeTestRule.onNodeWithText("Save Availability").performClick()
        composeTestRule.waitForIdle()

        // Wait for success message to ensure backend save completed
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule
                .onAllNodesWithText("Availability updated successfully!", substring = true, ignoreCase = true)
                .fetchSemanticsNodes()
                .isNotEmpty()
        }

        // Give extra time for backend operation to complete
        Thread.sleep(2000)
    }

    /**
     * Invalid time format handling
     */
    @Test
    fun testInvalidTimeFormat_showsError() {
        // Navigate to Set Availability screen
        composeTestRule.waitUntil(timeoutMillis = 5000) {
            composeTestRule.onAllNodesWithText("Availability").fetchSemanticsNodes().isNotEmpty()
        }
        composeTestRule.onNodeWithText("Availability").performClick()
        composeTestRule.waitForIdle()

        // Click add button for Monday using test tag
        composeTestRule.onNodeWithTag("add_time_slot_MONDAY").performClick()

        composeTestRule.waitForIdle()

        // Verify dialog is shown
        composeTestRule.onNodeWithText("Add Time Slot").assertIsDisplayed()

        // Try to enter invalid time format in start time field
        composeTestRule.onNodeWithTag("start_time_input").apply {
            performTextClearance()
            performTextInput("25:00") // Invalid hour
        }

        composeTestRule.waitForIdle()

        // Verify error message is shown
        composeTestRule.onNodeWithText("Use HH:mm format", substring = true).assertExists()
    }

    /**
     * Start time after end time validation
     */
    @Test
    fun testStartTimeAfterEndTime_disablesAddButton() {
        // Navigate to Set Availability screen
        composeTestRule.onNodeWithText("Availability").performClick()
        composeTestRule.waitForIdle()

        // Click add button for Monday using test tag
        composeTestRule.onNodeWithTag("add_time_slot_MONDAY").performClick()

        composeTestRule.waitForIdle()

        // Set start time to 17:00
        composeTestRule.onNodeWithTag("start_time_input").apply {
            performTextClearance()
            performTextInput("17:00")
        }

        composeTestRule.waitForIdle()

        // Set end time to 09:00 (before start time)
        composeTestRule.onNodeWithTag("end_time_input").apply {
            performTextClearance()
            performTextInput("09:00")
        }

        composeTestRule.waitForIdle()

        // Verify Add button is disabled
        composeTestRule.onNodeWithText("Add").assertIsNotEnabled()
    }

    // Helper functions
    /**
     * Verify a time slot exists for a specific day
     */
    private fun verifyTimeSlotExists(day: String, startTime: String, endTime: String) {
        // Scroll to the day card if needed
        scrollToDay(day)
        composeTestRule.waitForIdle()

        // Use the test tag to verify the time slot exists
        val testTag = "time_slot_text_${day}_${startTime}"
        composeTestRule.onNodeWithTag(testTag).assertExists(
            "Could not find time slot '$startTime - $endTime' for day '$day'"
        )
    }
}


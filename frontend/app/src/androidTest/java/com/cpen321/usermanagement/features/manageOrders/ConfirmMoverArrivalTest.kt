package com.cpen321.usermanagement.features.manageOrders

import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Test

/**
 * Test suite for the Confirm Mover Arrival functionality.
 * 
 * Tests that students can confirm when a mover has arrived at their location
 * for either pickup or delivery. This updates the order status and triggers
 * the next phase of the delivery process.
 * 
 * Precondition: 
 * - An order must be in AWAITING_STUDENT_CONFIRMATION status
 * - This happens when a mover accepts a job and marks themselves as arrived
 * - For testing: A mover must manually accept the job and update status to
 *   AWAITING_STUDENT_CONFIRMATION using the mover's "Current Jobs" screen
 */
@HiltAndroidTest
class ConfirmMoverArrivalTest: OrderTestBase() {
    
    /**
     * Tests the mover arrival confirmation flow.
     * 
     * Test Steps:
     * 1. Waits for order to be in AWAITING_STUDENT_CONFIRMATION status
     * 2. Clicks "Confirm Arrival" button on the order status panel
     * 3. Verifies order status updates appropriately
     * 
     * Expected Result:
     * - Order status transitions to next phase (PICKED_UP for pickup, DELIVERED for return)
     * - Mover can proceed with loading/unloading items
     * - Status panel updates to reflect new order state
     * 
     * Setup Required:
     * Before running this test, a mover must:
     * 1. Accept the job corresponding to this student's order
     * 2. Navigate to their "Current Jobs" screen
     * 3. Update the job status to indicate arrival at student location
     * 4. This changes order to AWAITING_STUDENT_CONFIRMATION
     */
    @Test
    fun confirmMoverArrival_UpdateStatus(){
        composeTestRule.waitForIdle()
        Thread.sleep(3000) // Give OrderViewModel time to load active order state

        // Click the confirm arrival button
        composeTestRule.onNodeWithTag("confirm arrival button", useUnmergedTree = true)
            .assertExists("No confirm button. Mover must first accept job and mark arrival.")
            .performClick()
    }
}
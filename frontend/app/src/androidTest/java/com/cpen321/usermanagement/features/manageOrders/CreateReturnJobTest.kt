package com.cpen321.usermanagement.features.manageOrders

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Test

/**
 * Test suite for the Create Return Job functionality.
 * 
 * Tests that students can schedule a return delivery for items in storage.
 * The return job allows students to specify when and where to deliver their
 * stored items back.
 * 
 * Precondition: An order must exist with IN_STORAGE status. This means the
 * pickup has been completed and items are currently in the warehouse.
 */
@HiltAndroidTest
class CreateReturnJobTest: OrderTestBase() {

    /**
     * Tests the complete return job creation flow using default settings.
     * 
     * Test Steps:
     * 1. Clicks "Schedule Return Delivery" button (visible when order is IN_STORAGE)
     * 2. Uses default return date/time (shown in date selection step)
     * 3. Clicks "Continue" to proceed
     * 4. Uses default return address (same as pickup address)
     * 5. Clicks "Confirm" to create return job
     * 6. Verifies "✅ Return delivery scheduled" status appears
     * 
     * Expected Result:
     * - Return job is created with default date/time and address
     * - No payment required (on-time return)
     * - Order status updated to show return delivery scheduled
     * 
     * Note: This test uses all defaults (no custom date, time, or address).
     * For early returns, a refund is automatically processed. For late returns,
     * payment would be required before the address step.
     */
    @Test
    fun createReturnJob_deliveryScheduled(){
        composeTestRule.waitForIdle()
        Thread.sleep(3000) // Give OrderViewModel time to load active order state
        
        // Step 1: Click "Schedule Return Delivery" button
        composeTestRule.onNodeWithTag("return-delivery-button")
            .assertExists("Schedule delivery button should exist")
            .performClick()

        // Verify Refund message
        composeTestRule.onNodeWithText("Early Return Refund").assertExists("No Early return refund message")
        // Step 2-3: Use default date/time and continue
        composeTestRule.onNodeWithTag("continue-button")
            .assertExists("Continue delivery button should exist")
            .performClick()

        inputInvalidAddress_ErrorMessage()

        composeTestRule.waitForIdle()
        // Step 4-5: Use default address and confirm
        composeTestRule.onNodeWithTag("default_address_radio_button", useUnmergedTree = true)
            .assertExists("default address radio button should exist")
            .performClick()


        composeTestRule.onNodeWithTag("confirm-address-button")
            .assertExists("Confirm address button should exist")
            .performClick()

        // Step 6: Verify return delivery is scheduled
        composeTestRule.waitForIdle()
        composeTestRule.waitUntil(timeoutMillis = 10_000) {
            composeTestRule.onAllNodesWithText( "✅ Return delivery scheduled", useUnmergedTree = true)
                .fetchSemanticsNodes().isNotEmpty()
        }
    }

    /**
     * Tests that addresses outside Greater Vancouver are rejected.
     *
     * Failure Scenario:
     * - Student inputs an address outside Greater Vancouver area
     * - System displays error: "We currently only service Greater Vancouver."
     *
     */
    fun inputInvalidAddress_ErrorMessage(){
        composeTestRule.waitForIdle()
        Thread.sleep(3000)

        // Step 1: Select custom address option
        composeTestRule.onNodeWithTag("custom_address_radio_button", useUnmergedTree = true)
            .assertExists("Custom address radio button should exist")
            .performClick()

        composeTestRule.waitForIdle()

        // Step 2: Enter and select address outside Greater Vancouver
        val addressField = composeTestRule.onNodeWithTag("return-job-address-field")
            .assertExists("Address Field should exist")
            .assertIsDisplayed()

        addressField.performClick()
        // Use Google headquarters in Mountain View, California as test address
        addressField.performTextInput("1600 Amphitheatre Parkway, Mountain View, CA")

        // Wait for Google Maps address suggestions
        composeTestRule.waitUntil(timeoutMillis = 5_000) {
            composeTestRule.onAllNodesWithTag("address_suggestion_item", useUnmergedTree = true)
                .fetchSemanticsNodes().isNotEmpty()
        }

        // Select first suggestion
        composeTestRule.onAllNodesWithTag("address_suggestion_item", useUnmergedTree = true)
            .onFirst()
            .performClick()

        Thread.sleep(1000)

        // Step 3: Try to confirm address (should fail validation)
        composeTestRule.onNodeWithTag("confirm-address-button")
            .assertExists("Confirm address button should exist")
            .performClick()

        composeTestRule.waitForIdle()

        Thread.sleep(4000)
        
        // Step 4: Verify error message is displayed
        composeTestRule.waitUntil(timeoutMillis = 10_000) {
            try {
                composeTestRule.onNodeWithText(
                    "We currently only service Greater Vancouver.",
                    useUnmergedTree = true
                ).assertExists("Error message should be displayed for addresses outside Greater Vancouver")
                true
            } catch (e: Exception) {
                false
            }
        }

        // Clear Input field
        addressField.performTextClearance()
    }

}
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
 * End-to-end test for the complete order creation and payment flow.
 * 
 * Tests the full UC-1 (Create Order) and UC-2 (Pay) use cases in a single test
 * because order creation progress is not persisted between steps.
 * 
 * Main Success Scenario Covered:
 * 1. Student clicks "Create New Order" button
 * 2. System displays address autocomplete field
 * 3. Student enters pickup address
 * 4. System suggests valid addresses via Google Maps
 * 5. Student selects address and clicks "Get Base Delivery Charge"
 * 6. System displays box selection with quantity adjusters
 * 7. Student selects box quantities and pickup/return times
 * 8. System displays price quote
 * 9. Student proceeds to payment
 * 10. Student fills in payment details (name, email)
 * 11. Student processes payment with test card
 * 12. System creates order and displays active order status
 */
@HiltAndroidTest
class CreateOrderTest : OrderTestBase() {

    /**
     * Tests the complete order creation flow from address entry through payment.
     * 
     * Test Steps:
     * 1. Clicks "Create New Order" button
     * 2. Enters "3381 Ross Drive" in address field
     * 3. Waits for Google Maps suggestions
     * 4. Selects first suggestion
     * 5. Clicks "Get Base Delivery Charge"
     * 6. Waits for box selection screen
     * 7. Adds one small box
     * 8. Proceeds to payment
     * 9. Fills in customer name ("John Doe")
     * 10. Fills in customer email ("john.doe@example.com")
     * 11. Clicks "Process Payment"
     * 12. Confirms payment in dialog
     * 13. Verifies "Order Active" status appears
     * 
     * Expected Result: Order is created, payment processed, and active order displayed
     * 
     * Note: This must be one test because order creation state is not persisted
     * between test methods. Splitting would require restarting the JVM.
     */
    @Test
    fun createOrder_pay_seeActiveOrder(){

        // Step 1: Open create order bottom sheet
        composeTestRule.waitForIdle()
        Thread.sleep(3000) // Give OrderViewModel time to load active order state

        composeTestRule.onNodeWithText("Create New Order", useUnmergedTree = true)
            .assertExists("Create Order button should exist for this test, there might be an active order")
            .performClick()

        composeTestRule.waitForIdle()

        // Test failure scenario 5a:
        createOrder_invalidAddress_showsErrorAndStaysOnForm()

        // Step 2-4: Enter and select address
        val addressField = composeTestRule.onNodeWithTag("Address Field")
            .assertExists("Address Field should exist")
            .assertIsDisplayed()

        addressField.performClick()
        addressField.performTextInput("3381 Ross Drive")

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

        // Step 5: Get delivery charge quote
        composeTestRule.waitUntil(timeoutMillis = 10_000) {
            try {
                composeTestRule.onNodeWithTag("charge button", useUnmergedTree = true)
                    .assertExists()
                true
            } catch (e: Exception) {
                false
            }
        }

        composeTestRule.onNodeWithText("Get Base Delivery Charge", useUnmergedTree = true)
            .performClick()

        composeTestRule.waitForIdle()

        // Test failure scenario 7a, both parts:
        createOrder_returnDateBeforePickupDate_showsErrorAndStaysOnForm()
        composeTestRule.waitForIdle()
        createOrder_returnTimeBeforePickupTime_showsError()

        // Proceed with normal flow after failure scenario testing
        // Step 6-7: Select boxes
        // Wait for the network call to complete and box selection to appear
        composeTestRule.waitUntil(timeoutMillis = 15_000) {
            composeTestRule.onAllNodesWithText("Select Boxes", useUnmergedTree = true)
                .fetchSemanticsNodes().isNotEmpty()
        }

        composeTestRule.waitUntil(timeoutMillis = 3000) {
            composeTestRule.onAllNodesWithTag("add_box_button", useUnmergedTree = true)
                .fetchSemanticsNodes().isNotEmpty()
        }
        
        // Add one small box
        composeTestRule.onAllNodesWithTag("add_box_button", useUnmergedTree = true)
            .onFirst()
            .performClick()

        composeTestRule.waitForIdle()

        // Step 8: Proceed to payment
        composeTestRule.onNodeWithTag("proceed_to_payment_button", useUnmergedTree = true)
            .performClick()

        composeTestRule.waitForIdle()

        // Step 9: Payment Use Case
        paymentUseCase_WithFailureScenario()

        composeTestRule.waitForIdle()

        // Step 10: Verify order is active
        composeTestRule.waitUntil(timeoutMillis = 10_000) {
            composeTestRule.onAllNodesWithText( "Order Active", useUnmergedTree = true)
                .fetchSemanticsNodes().isNotEmpty()
        }
    }

    /** Executes Payment Use Case
    * Includes Failure Scenario for invalid information
     * */
    fun paymentUseCase_WithFailureScenario(){

        // Failure scenario test
        // Step 0: Verify Error Message for invalid information
        composeTestRule.onNodeWithText(
            "Please fill in all required fields with valid information.",
            useUnmergedTree = true
        ).assertExists("Error message should be displayed for invalid information")


        // Step 1: Fill in customer information
        composeTestRule.onNodeWithTag("customer_name_field", useUnmergedTree = true)
            .performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("customer_name_field", useUnmergedTree = true)
            .performTextInput("John Doe")

        composeTestRule.waitForIdle()
        Thread.sleep(500)

        val emailField = composeTestRule.onNodeWithTag("customer_email_field", useUnmergedTree = true)
        emailField.assertExists("Email field should exist")
        emailField.performClick()

        composeTestRule.waitForIdle()
        Thread.sleep(500)

        emailField.performTextInput("john.doe@example.com")

        composeTestRule.waitForIdle()
        Thread.sleep(500)

        composeTestRule.waitForIdle()

        // Step 2: Process payment
        composeTestRule.onNodeWithTag("process_payment_button", useUnmergedTree = true)
            .performClick()
            
        composeTestRule.waitForIdle()

        // Step 3: Confirm payment in dialog
        composeTestRule.onNodeWithTag("confirm_pay_button", useUnmergedTree = true)
            .performClick()

    }

    /**
     * Tests that addresses outside Greater Vancouver are rejected.
     * 
     * Failure Scenario 5a (for CreateOrder):
     * - Student inputs an address outside Greater Vancouver area
     * - System displays error: "We currently only service Greater Vancouver."
     * - System stays on the address entry form to allow correction
     *
     */
    fun createOrder_invalidAddress_showsErrorAndStaysOnForm() {
        composeTestRule.waitForIdle()
        Thread.sleep(3000)

        // Enter and select address outside Greater Vancouver
        val addressField = composeTestRule.onNodeWithTag("Address Field")
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

        // Try to get delivery charge (should fail validation)
        composeTestRule.waitUntil(timeoutMillis = 10_000) {
            try {
                composeTestRule.onNodeWithTag("charge button", useUnmergedTree = true)
                    .assertExists()
                true
            } catch (e: Exception) {
                false
            }
        }

        composeTestRule.onNodeWithText("Get Base Delivery Charge", useUnmergedTree = true)
            .performClick()

        composeTestRule.waitForIdle()

        Thread.sleep(4000)
        // Verify error message is displayed
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

        //Verify we're still on the address entry form (charge button still exists)
        composeTestRule.onNodeWithTag("charge button", useUnmergedTree = true)
            .assertExists("Should still be on address entry form after validation error")

        // Verify address field is still accessible so user can correct the address
        composeTestRule.onNodeWithTag("Address Field", useUnmergedTree = true)
            .assertExists("Address field should still be accessible for correction")

        // Clear Input field
        addressField.performTextClearance()
    }

    /**
     * Test for validating that return date must be after pickup date.
     *
     * Failure Scenario 7a (for CreateOrder):
     * - Student inputs a return date or time which is before the pickup date
     * - System displays error: "Return date/time must be after pickup date/time"
     * - System stays on the form
     */
    fun createOrder_returnDateBeforePickupDate_showsErrorAndStaysOnForm() {

        composeTestRule.waitForIdle()

        // Wait for box selection screen
        composeTestRule.waitUntil(timeoutMillis = 15_000) {
            composeTestRule.onAllNodesWithText("Select Boxes", useUnmergedTree = true)
                .fetchSemanticsNodes().isNotEmpty()
        }

        // Now we're on the date/time/box selection screen
        // The system should prevent setting return date before pickup date
        // We need to:
        // 1. Set a pickup date (e.g., Dec 15)
        // 2. Try to set return date before pickup (e.g., Dec 10)
        // 3. Verify error is shown

        // Click on pickup date to open date picker
        composeTestRule.onNodeWithTag("pickup_date_button", useUnmergedTree = true)
            .assertExists("Pickup date button should exist")
            .performClick()

        composeTestRule.waitForIdle()
        Thread.sleep(500)

        // Select a date in the future (we'll use the date picker's default behavior)
        // Assuming date picker shows current month, select day 15
        composeTestRule.onNodeWithText("15", useUnmergedTree = true)
            .performClick()

        composeTestRule.waitForIdle()
        Thread.sleep(500)

        // Confirm date selection
        composeTestRule.onNodeWithText("OK", useUnmergedTree = true)
            .performClick()

        composeTestRule.waitForIdle()
        Thread.sleep(500)

        // Now click on return date
        composeTestRule.onNodeWithTag("return_date_button", useUnmergedTree = true)
            .assertExists("Return date button should exist")
            .performClick()

        composeTestRule.waitForIdle()
        Thread.sleep(500)

        // Try to select a date earlier than pickup (day 10, before day 15)
        composeTestRule.onNodeWithText("10", useUnmergedTree = true)
            .performClick()

        composeTestRule.waitForIdle()
        Thread.sleep(500)

        // Confirm return date selection
        composeTestRule.onNodeWithText("OK", useUnmergedTree = true)
            .performClick()

        composeTestRule.waitForIdle()
        Thread.sleep(1000)

        // Verify error message is displayed
        composeTestRule.onNodeWithText(
            "Return date/time must be after pickup date/time",
            useUnmergedTree = true
        ).assertExists("Error message should be displayed when return date is before pickup date")

        // Verify we're still on the box selection form (proceed button exists but should be disabled)
        composeTestRule.onNodeWithTag("proceed_to_payment_button", useUnmergedTree = true)
            .assertExists("Should still be on the box selection form")

        // Verify the date/time selection is still visible so user can correct it
        composeTestRule.onNodeWithTag("pickup_date_button", useUnmergedTree = true)
            .assertExists("Date selection should still be visible for correction")

        composeTestRule.onNodeWithTag("return_date_button", useUnmergedTree = true)
            .assertExists("Return date selection should still be visible for correction")
    }

    /**
     * Test for validating that return time must be after pickup time.
     *
     * Failure Scenario 7a (for CreateOrder):
     * - Student inputs a return time which is before the pickup time on the same date
     * - System displays error: "Return date/time must be after pickup date/time"
     * - System stays on the form
     */
    fun createOrder_returnTimeBeforePickupTime_showsError() {
        composeTestRule.waitForIdle()

        composeTestRule.waitUntil(timeoutMillis = 15_000) {
            composeTestRule.onAllNodesWithText("Select Boxes", useUnmergedTree = true)
                .fetchSemanticsNodes().isNotEmpty()
        }

        // First, set pickup time to 14:00 (2 PM) - this establishes our reference time
        composeTestRule.onNodeWithTag("pickup_time_increase_hour", useUnmergedTree = true)
            .assertExists("Pickup time hour increase button should exist")

        // Click multiple times to set to 14:00 (assuming default is 12:00)
        repeat(2) {
            composeTestRule.onNodeWithTag("pickup_time_increase_hour", useUnmergedTree = true)
                .performClick()
            Thread.sleep(200)
        }

        composeTestRule.waitForIdle()
        Thread.sleep(500)

        // Now set return time to 10:00 (10 AM - 4 hours BEFORE pickup time)
        // Assuming return time also starts at 12:00, we need to decrease by 2 hours
        composeTestRule.onNodeWithTag("return_time_decrease_hour", useUnmergedTree = true)
            .assertExists("Return time hour decrease button should exist")

        repeat(2) {
            composeTestRule.onNodeWithTag("return_time_decrease_hour", useUnmergedTree = true)
                .performClick()
            Thread.sleep(200)
        }

        composeTestRule.waitForIdle()
        Thread.sleep(1000)

        // Verify error message is displayed
        composeTestRule.onNodeWithText(
            "Return date/time must be after pickup date/time",
            useUnmergedTree = true
        ).assertExists("Error message should be displayed when return time is before pickup time on same day")

        // Verify we're still on the form (proceed button should exist)
        composeTestRule.onNodeWithTag("proceed_to_payment_button", useUnmergedTree = true)
            .assertExists("Should still be on the box selection form")
    }

}






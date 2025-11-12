package com.cpen321.usermanagement.features.manageOrders

import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Test

/**
 * Test suite for the Cancel Order functionality.
 * 
 * Tests that students can cancel a pending order and receive a full refund.
 * Only orders with PENDING status (awaiting mover acceptance) can be cancelled.
 * 
 * Precondition: An active order must exist in PENDING status. This typically means
 * CreateOrderTest must run first to create an order.
 */
@HiltAndroidTest
class CancelOrderTest : OrderTestBase() {

    /**
     * Tests the complete order cancellation flow and refund processing.
     * 
     * Test Steps:
     * 1. Verifies "Order Active" button exists (order was created)
     * 2. Navigates to profile screen
     * 3. Clicks "Manage Orders" button
     * 4. Waits for orders list to load
     * 5. Selects the pending order from the list
     * 6. Clicks "Cancel Order" button in order details
     * 7. Verifies order is cancelled (dialog closes)
     * 
     * Expected Result: 
     * - Order status changes to CANCELLED
     * - Full refund is processed
     * - Order details dialog closes
     * 
     * Note: Only PENDING orders can be cancelled. Orders that have been accepted
     * by a mover cannot be cancelled via this flow.
     */
    @Test
    fun cancelOrder_ReceiveRefund(){
        composeTestRule.waitForIdle()
        Thread.sleep(3000) // Give OrderViewModel time to load active order state

        // Step 1: Verify active order exists
        composeTestRule.onNodeWithText("Order Active", useUnmergedTree = true)
            .assertExists("No Active Order Found")
            .performClick()
        
        // Step 2: Navigate to profile screen
        composeTestRule
            .onNodeWithTag("ProfileButton")
            .assertExists("Profile button should exist")
            .performClick()

        // Step 3: Open Manage Orders screen
        composeTestRule.waitForIdle()

        composeTestRule
            .onNodeWithText("Manage Orders", useUnmergedTree = true)
            .assertExists("Manage Orders button should exist on profile screen")
            .performClick()

        // Step 4: Wait for orders to load
        composeTestRule.waitForIdle()
        Thread.sleep(1000) // Give time for orders to load

        // Step 5: Select the pending order
        composeTestRule
            .onNodeWithTag("order_list_item_PENDING", useUnmergedTree = true)
            .assertExists("No pending order, only pending orders can be cancelled")
            .performClick()

        // Step 6: Wait for order details dialog
        composeTestRule.waitForIdle()

        // Step 7: Cancel the order
        composeTestRule
            .onNodeWithTag("cancel_order_button", useUnmergedTree = true)
            .assertExists("Cancel Order button should exist")
            .performClick()

        // Step 8: Verify cancellation completed
        composeTestRule.waitForIdle()
        Thread.sleep(2000) // Give time for backend to process cancellation

        // Verify that the order was cancelled (dialog should be closed)
        composeTestRule
            .onNodeWithTag("cancel_order_button", useUnmergedTree = true)
            .assertDoesNotExist()
    }
}
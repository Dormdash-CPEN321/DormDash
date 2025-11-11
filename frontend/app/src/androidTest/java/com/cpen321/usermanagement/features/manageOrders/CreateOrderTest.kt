package com.cpen321.usermanagement.features.manageOrders

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.printToLog
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Test
import org.junit.runner.RunWith
import kotlin.concurrent.thread

/*
Test for Create order, Includes Pay  to avoid restarting JVM
NOTE: This all had to be in one test since we do not persist order creation progress
 */
@HiltAndroidTest
class CreateOrderTest : OrderTestBase() {

    @Test
    fun createOrder_pay_seeActiveOrder(){

        // Ensure the create button exists, then click it to open the bottom sheet
        composeTestRule.waitForIdle()
        Thread.sleep(3000) // Give OrderViewModel time to load active order state


        composeTestRule.onNodeWithText("Create New Order", useUnmergedTree = true)
            .assertExists("Create Order button should exist for this test, there might be an active order")
            .performClick()

        // Wait for the bottom sheet to appear and settle
        composeTestRule.waitForIdle()


        // Target the actual TextField inside the autocomplete (testTag is applied to the TextField)
        val addressField = composeTestRule.onNodeWithTag("Address Field")
            .assertExists("Address Field should exist")
            .assertIsDisplayed()

        // Focus and enter text
        addressField.performClick()
        addressField.performTextInput("3381 Ross Drive")

        // Wait for suggestions to appear
        composeTestRule.waitUntil(timeoutMillis = 5_000) {
            composeTestRule.onAllNodesWithTag("address_suggestion_item", useUnmergedTree = true)
                .fetchSemanticsNodes().isNotEmpty()
        }

        // Click the first suggestion (which should be 3381 Ross Drive)
        composeTestRule.onAllNodesWithTag("address_suggestion_item", useUnmergedTree = true)
            .onFirst()
            .performClick()

        // Wait for the address to be processed
        Thread.sleep(1000)

        // Wait for the address to be selected and button to become enabled
        composeTestRule.waitUntil(timeoutMillis = 10_000) {
            try {
                // Check if button exists and try to click it (will fail if disabled)
                composeTestRule.onNodeWithTag("charge button", useUnmergedTree = true)
                    .assertExists()
                true
            } catch (e: Exception) {
                false
            }
        }

        // Now click the button
        composeTestRule.onNodeWithText("Get Base Delivery Charge", useUnmergedTree = true)
            .performClick()

        composeTestRule.waitForIdle()

        // Wait for the network call to complete and box selection to appear
        // The app shows "Getting Quote" then transitions to "Select Boxes"
        composeTestRule.waitUntil(timeoutMillis = 15_000) {
            composeTestRule.onAllNodesWithText("Select Boxes", useUnmergedTree = true)
                .fetchSemanticsNodes().isNotEmpty()
        }

        // Wait for the add box button to appear and click it
        composeTestRule.waitUntil(timeoutMillis = 3000) {
            composeTestRule.onAllNodesWithTag("add_box_button", useUnmergedTree = true)
                .fetchSemanticsNodes().isNotEmpty()
        }
        
        // Click + to add a box (using the first add button - for Small box)
        composeTestRule.onAllNodesWithTag("add_box_button", useUnmergedTree = true)
            .onFirst()
            .performClick()

        composeTestRule.waitForIdle()

        // Proceed to payment
        composeTestRule.onNodeWithTag("proceed_to_payment_button", useUnmergedTree = true)
            .performClick()

        composeTestRule.waitForIdle()

        // Fill in customer information
        // Fill in customer name
        composeTestRule.onNodeWithTag("customer_name_field", useUnmergedTree = true)
            .performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("customer_name_field", useUnmergedTree = true)
            .performTextInput("John Doe")

        composeTestRule.waitForIdle()
        Thread.sleep(500)

        // Fill in customer email - scroll to it first if needed
        val emailField = composeTestRule.onNodeWithTag("customer_email_field", useUnmergedTree = true)
        emailField.assertExists("Email field should exist")
        emailField.performClick()
        
        composeTestRule.waitForIdle()
        Thread.sleep(500)
        
        emailField.performTextInput("john.doe@example.com")
        
        composeTestRule.waitForIdle()
        Thread.sleep(500)

        composeTestRule.waitForIdle()

        // Click Process Payment button
        composeTestRule.onNodeWithTag("process_payment_button", useUnmergedTree = true)
            .performClick()

        composeTestRule.waitForIdle()

        // Click Confirm & Pay in the dialog
        composeTestRule.onNodeWithTag("confirm_pay_button", useUnmergedTree = true)
            .performClick()

        composeTestRule.waitForIdle()

        // Wait for order confirmation and verify active order appears
        composeTestRule.waitUntil(timeoutMillis = 10_000) {
            composeTestRule.onAllNodesWithText( "Order Active", useUnmergedTree = true)
                .fetchSemanticsNodes().isNotEmpty()
        }
    }


}





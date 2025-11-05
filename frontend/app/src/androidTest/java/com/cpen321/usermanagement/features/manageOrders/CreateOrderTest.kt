package com.cpen321.usermanagement.features.manageOrders

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.ExperimentalTestApi
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Test
import org.junit.runner.RunWith

@HiltAndroidTest
class CreateOrderTest : OrderTestBase() {
    
    @OptIn(ExperimentalTestApi::class)
    @Test
    fun setAddress_getPricing(){

        // Ensure the create button exists, then click it to open the bottom sheet
        composeTestRule.waitForIdle()
        Thread.sleep(1000) // Give OrderViewModel time to load active order state


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
        addressField.performTextInput("3381 Ross Drive, Vancouver, BC V6S")

        composeTestRule.waitForIdle()

        // choose address from autocomplete (wait for suggestion to appear)
        composeTestRule.waitUntil(timeoutMillis = 5_000) {
            composeTestRule.onAllNodesWithText("Vancouver, BC, V6S 0l2, Canada").fetchSemanticsNodes().isNotEmpty()
        }

        Thread.sleep(1000)

        composeTestRule.onNodeWithText("Vancouver, BC, Canada").performClick()

        composeTestRule.waitForIdle()

        // Finally request the pricing
        composeTestRule.onNodeWithText("Get Base Delivery Charge").assertExists("Should get base charge after selecting address").performClick()
    }

}





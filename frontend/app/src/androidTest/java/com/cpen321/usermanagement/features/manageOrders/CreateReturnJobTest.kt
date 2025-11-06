package com.cpen321.usermanagement.features.manageOrders

import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Test

@HiltAndroidTest
class CreateReturnJobTest: OrderTestBase() {

    @Test
    fun createReturnJob_deliveryScheduled(){
        composeTestRule.waitForIdle()
        Thread.sleep(3000) // Give OrderViewModel time to load active order state
        composeTestRule.onNodeWithTag("return-delivery-button").assertExists("Schedule delivery button should exist").performClick()

        composeTestRule.onNodeWithTag("continue-button").assertExists("Continue delivery button should exist").performClick()

        composeTestRule.onNodeWithTag("confirm-address-button").assertExists("Confirm address button should exist").performClick()

        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithText("✅ Return delivery scheduled").assertExists("Return should be scheduled")
    }

}
package com.cpen321.usermanagement.features.manageOrders

import androidx.test.ext.junit.runners.AndroidJUnit4
import com.cpen321.usermanagement.utils.BaseTestSetup
import com.cpen321.usermanagement.utils.TestAccountHelper
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Before
import org.junit.runner.RunWith

/**
 * Base class for Manage Order feature tests.
 * Provides common setup and utilities specific to order testing.
 * Extends BaseTestSetup for standard test configuration.
 */
@HiltAndroidTest
@RunWith(AndroidJUnit4::class)
abstract class OrderTestBase : BaseTestSetup() {

    companion object {
        fun getTestEmail(): String = TestAccountHelper.getStudentEmail()
        fun getTestPassword(): String = TestAccountHelper.getStudentPassword()
    }

    @Before
    override fun baseSetup() {
        super.baseSetup()

        // Always need to be signed in for order management use cases
        signIn()
    }

    /**
     * Sets up the test account by either signing up or adding the account to the device.
     * Call this when you want to ensure the test account exists (for sign-up tests).
     */
    fun setupTestAccount() {
        TestAccountHelper.setupTestAccount(
            composeTestRule = composeTestRule,
            device = device,
            email = getTestEmail(),
            password = getTestPassword(),
            roleSelector = { TestAccountHelper.selectStudentRole(it) }
        )
    }

    /**
     * Signs in with the test account from test.properties.
     * Looks for the specific test account in the account picker.
     */
    fun signIn() {
        // First ensure the account exists
        setupTestAccount()

        // Then sign in
        TestAccountHelper.signIn(
            composeTestRule = composeTestRule,
            device = device,
            email = getTestEmail(),
            roleSelector = { TestAccountHelper.selectStudentRole(it) }
        )
    }

}
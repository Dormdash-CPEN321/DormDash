package com.cpen321.usermanagement.features.auth

import com.cpen321.usermanagement.data.repository.AuthRepository
import com.cpen321.usermanagement.utils.BaseTestSetup
import com.cpen321.usermanagement.utils.TestAccountHelper
import dagger.hilt.android.testing.HiltAndroidTest
import javax.inject.Inject

/**
 * Base class for Authenticate feature tests.
 * Extends BaseTestSetup for standard test configuration.
 */
@HiltAndroidTest
abstract class AuthTestBase : BaseTestSetup() {

    @Inject
    lateinit var authRepository: AuthRepository

    companion object {
        fun getTestEmail(): String = TestAccountHelper.getStudentEmail()
        fun getTestPassword(): String = TestAccountHelper.getStudentPassword()
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
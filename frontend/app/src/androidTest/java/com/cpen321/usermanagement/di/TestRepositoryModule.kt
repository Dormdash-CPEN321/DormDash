package com.cpen321.usermanagement.di

import com.cpen321.usermanagement.data.repository.AuthRepository
import com.cpen321.usermanagement.data.repository.JobRepository
import com.cpen321.usermanagement.data.repository.ProfileRepository
import com.cpen321.usermanagement.fakes.FakeAuthRepository
import com.cpen321.usermanagement.fakes.FakeJobRepository
import com.cpen321.usermanagement.fakes.FakeProfileRepository
import dagger.Module
import dagger.Provides
import dagger.hilt.components.SingletonComponent
import dagger.hilt.testing.TestInstallIn
import javax.inject.Singleton

/**
 * Test module to replace RepositoryModule during instrumented tests.
 * Provides fake implementations with pre-configured mover account.
 */
@Module
@TestInstallIn(
    components = [SingletonComponent::class],
    replaces = [RepositoryModule::class]
)
object TestRepositoryModule {

    @Provides
    @Singleton
    fun provideAuthRepository(): AuthRepository {
        return FakeAuthRepository()
    }

    @Provides
    @Singleton
    fun provideProfileRepository(): ProfileRepository {
        return FakeProfileRepository()
    }

    @Provides
    @Singleton
    fun provideJobRepository(): JobRepository {
        return FakeJobRepository()
    }
}

package com.cpen321.usermanagement.di

import com.cpen321.usermanagement.data.remote.api.AuthInterface
import com.cpen321.usermanagement.data.remote.api.DevApiService
import com.cpen321.usermanagement.data.remote.api.JobApiService
import com.cpen321.usermanagement.data.remote.api.OrderInterface
import com.cpen321.usermanagement.data.remote.api.PaymentInterface
import com.cpen321.usermanagement.data.remote.api.RetrofitClient
import com.cpen321.usermanagement.data.remote.api.RouteApiService
import com.cpen321.usermanagement.data.remote.api.UserInterface
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideAuthService(): AuthInterface {
        return RetrofitClient.authInterface
    }

    @Provides
    @Singleton
    fun provideUserService(): UserInterface {
        return RetrofitClient.userInterface
    }

    @Provides
    @Singleton
    fun provideOrderService(): OrderInterface {
        return RetrofitClient.orderInterface
    }

    @Provides
    @Singleton
    fun provideJobService(): JobApiService {
        return RetrofitClient.jobApiService
    }

    @Provides
    @Singleton
    fun providePaymentService(): PaymentInterface {
        return RetrofitClient.paymentInterface
    }

    @Provides
    @Singleton
    fun provideRouteService(): RouteApiService {
        return RetrofitClient.routeApiService
    }

    @Provides
    @Singleton
    fun provideDevService(): DevApiService {
        return RetrofitClient.devApiService
    }
}

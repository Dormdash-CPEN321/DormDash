package com.cpen321.usermanagement.data.remote.api

import com.cpen321.usermanagement.BuildConfig
import com.cpen321.usermanagement.data.remote.interceptors.AuthInterceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

object RetrofitClient {
    private const val BASE_URL = BuildConfig.API_BASE_URL
    private const val IMAGE_BASE_URL = BuildConfig.IMAGE_BASE_URL

    private var authToken: String? = null

    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = HttpLoggingInterceptor.Level.BODY
    }

    private val authInterceptor = AuthInterceptor { authToken }
    // idempotency key provider (set by repository when starting a flow)
    private var idempotencyKeyProvider: (() -> String?)? = null

    // Interceptor to add Idempotency-Key header when available
    private val idempotencyInterceptor = okhttp3.Interceptor { chain ->
        val original = chain.request()
        val builder = original.newBuilder()
        val key = idempotencyKeyProvider?.invoke()
        if (!key.isNullOrBlank()) {
            builder.header("Idempotency-Key", key)
        }
        chain.proceed(builder.build())
    }

    private val httpClient = OkHttpClient.Builder()
        .addInterceptor(authInterceptor)
        .addInterceptor(idempotencyInterceptor)
        .addInterceptor(loggingInterceptor)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    private val retrofit = Retrofit.Builder()
        .baseUrl(BASE_URL)
        .client(httpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    val authInterface: AuthInterface = retrofit.create(AuthInterface::class.java)
    val userInterface: UserInterface = retrofit.create(UserInterface::class.java)
    val orderInterface: OrderInterface = retrofit.create(OrderInterface::class.java)
    val jobInterface: JobInterface = retrofit.create(JobInterface::class.java)
    val paymentInterface: PaymentInterface = retrofit.create(PaymentInterface::class.java)
    val routeInterface: RouteInterface = retrofit.create(RouteInterface::class.java)
    val devInterface: DevInterface = retrofit.create(DevInterface::class.java)

    fun setAuthToken(token: String?) {
        authToken = token
    }

    fun setIdempotencyKeyProvider(provider: () -> String?) {
        idempotencyKeyProvider = provider
    }

    fun getPictureUri(picturePath: String): String {
        return if (picturePath.startsWith("uploads/")) {
            IMAGE_BASE_URL + picturePath
        } else {
            picturePath
        }
    }
}
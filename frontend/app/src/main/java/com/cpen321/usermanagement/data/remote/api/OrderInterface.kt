package com.cpen321.usermanagement.data.remote.api

import com.cpen321.usermanagement.data.local.models.GetQuoteRequest
import com.cpen321.usermanagement.data.local.models.GetQuoteResponse
import com.cpen321.usermanagement.data.remote.models.CreateOrderRequest
import com.cpen321.usermanagement.data.remote.models.GetAllOrdersResponse
import com.cpen321.usermanagement.data.remote.models.CreateReturnJobRequest
import com.cpen321.usermanagement.data.remote.models.CreateReturnJobResponse
import com.cpen321.usermanagement.data.remote.models.CancelOrderResponse
import com.cpen321.usermanagement.data.local.models.Order
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST


interface OrderInterface {
    
    @POST("order/quote")
    suspend fun getQuote(@Body request: GetQuoteRequest): Response<GetQuoteResponse>
    
    @POST("order")
    suspend fun placeOrder(@Body request: CreateOrderRequest): Response<Order>

    @POST(value = "order/create-return-Job")
    suspend fun createReturnJob(@Body request: CreateReturnJobRequest): Response<CreateReturnJobResponse>
    
    @GET("order/all-orders")
    suspend fun getAllOrders(): Response<GetAllOrdersResponse>

    @GET("order/active-order")
    suspend fun getActiveOrder(): Response<Order>

    @DELETE("order/cancel-order")
    suspend fun cancelOrder(): Response<CancelOrderResponse>
}
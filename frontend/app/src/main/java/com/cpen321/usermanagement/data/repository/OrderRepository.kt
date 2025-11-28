package com.cpen321.usermanagement.data.repository

import com.cpen321.usermanagement.data.local.models.*
import com.cpen321.usermanagement.data.remote.api.OrderInterface
import com.cpen321.usermanagement.data.remote.api.RetrofitClient
import com.cpen321.usermanagement.data.remote.models.CreateOrderRequest
import com.cpen321.usermanagement.data.remote.models.CreateReturnJobRequest
import com.cpen321.usermanagement.data.remote.models.CreateReturnJobResponse
import com.cpen321.usermanagement.data.remote.models.OrderRequest
import java.text.SimpleDateFormat
import java.util.*
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class OrderRepository @Inject constructor(
    private val orderApi: OrderInterface,
    private val authRepository: AuthRepository
) {

    // Store last quote response for order creation
    private var lastQuoteResponse: GetQuoteResponse? = null
    private var lastStudentAddress: Address? = null
    private var isSubmitting: Boolean = false
    
    
    private suspend fun getCurrentUserId(): String? {
        return authRepository.getCurrentUser()?._id
    }
    
    
    private suspend fun transformToCreateOrderRequest(
        orderRequest: OrderRequest,
        studentAddr: Address? = null,
        warehouseAddr: Address? = null,
        paymentIntentId: String? = null
    ): CreateOrderRequest? {
        val userId = getCurrentUserId() ?: return null
        
        // Calculate volume from box quantities
        val volume = orderRequest.boxQuantities.sumOf { boxQuantity ->
            when (boxQuantity.boxSize.type) {
                "Small" -> boxQuantity.quantity * 0.5  // 0.5 cubic meters per small box
                "Medium" -> boxQuantity.quantity * 0.8  // 0.8 cubic meters per medium box
                "Large" -> boxQuantity.quantity * 1.2   // 1.2 cubic meters per large box
                else -> boxQuantity.quantity * 0.8      // Default to medium
            }
        }
        
        // Use the price calculated by the UI (which uses backend pricing rules)
        val totalPrice = orderRequest.totalPrice
        
        // Both addresses should come from the quote response
        // Student address: from the geocoded address in quote request
        // Warehouse address: from the quote response
        val studentAddress = studentAddr 
            ?: return null // Cannot create order without proper student address from quote
        
        val warehouseAddress = warehouseAddr 
            ?: return null // Cannot create order without warehouse address from backend quote
        
        // Format return date - pickup time comes from OrderRequest
        val now = Date()
        val pickupTime = orderRequest.pickupTime // Use the pickup time from UI (already in ISO format)
        
        // Parse the return date (which is in "MMMM dd, yyyy" format from UI)
        // and convert to ISO format with Pacific timezone consideration
        val displayDateParser = SimpleDateFormat("MMMM dd, yyyy", Locale.getDefault())
        val parsedDate = displayDateParser.parse(orderRequest.returnDate) 
            ?: Date(now.time + 7 * 24 * 60 * 60 * 1000)
        
        // The parsed date is at midnight in the default timezone
        // We need to interpret this as Pacific timezone and set it to noon Pacific time
        val pacificZone = TimeZone.getTimeZone("America/Los_Angeles")
        val utcZone = TimeZone.getTimeZone("UTC")
        
        val pacificCalendar = java.util.Calendar.getInstance(pacificZone).apply {
            time = parsedDate
            // Extract date components
            val year = get(java.util.Calendar.YEAR)
            val month = get(java.util.Calendar.MONTH)
            val day = get(java.util.Calendar.DAY_OF_MONTH)
            
            // Set to noon Pacific time to avoid timezone edge cases
            clear()
            timeZone = pacificZone
            set(year, month, day, 12, 0, 0)
            set(java.util.Calendar.MILLISECOND, 0)
        }
        
        // Format to ISO with UTC timezone
        val isoFormatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = utcZone
        }
        val returnTime = isoFormatter.format(pacificCalendar.time)
        
        return CreateOrderRequest(
            studentId = userId,
            volume = volume,
            totalPrice = totalPrice,
            studentAddress = studentAddress,
            warehouseAddress = warehouseAddress,
            pickupTime = pickupTime,
            returnTime = returnTime,
            paymentIntentId = paymentIntentId // Include payment intent ID for refunds
        )
    }
    
    /**
     * Get pricing quote from backend API
     */
    suspend fun getQuote(address: Address): Result<GetQuoteResponse> {
        return try {
            val userId = getCurrentUserId() 
                ?: return Result.failure(Exception("User not authenticated"))
                
            val request = GetQuoteRequest(
                studentAddress = address,
                studentId = userId
            )
            val response = orderApi.getQuote(request)
            
            if (response.isSuccessful) {
                response.body()?.let { quoteResponse ->
                    // Store for later use in order creation
                    lastQuoteResponse = quoteResponse
                    lastStudentAddress = address
                    Result.success(quoteResponse)
                } ?: Result.failure(Exception("Empty response from server"))
            } else {
                Result.failure(Exception("Failed to get quote: ${response.message()}"))
            }
        } catch (e: java.io.IOException) {
            android.util.Log.e("OrderRepository", "Network error getting quote", e)
            Result.failure(e)
        } catch (e: retrofit2.HttpException) {
            android.util.Log.e("OrderRepository", "HTTP error getting quote: ${e.code()}", e)
            Result.failure(e)
        } catch (e: com.google.gson.JsonSyntaxException) {
            android.util.Log.e("OrderRepository", "JSON parsing error in quote response", e)
            Result.failure(e)
        }
    }
    
    /**
     * Submit order to backend API
     */
    suspend fun submitOrder(orderRequest: OrderRequest, paymentIntentId: String? = null): Result<Order> {
        // prevent concurrent submits
        if (isSubmitting) return Result.failure(Exception("Already submitting"))
        isSubmitting = true
        // generate an idempotency key for this flow
        val idempotencyKey = java.util.UUID.randomUUID().toString()
        RetrofitClient.setIdempotencyKeyProvider { idempotencyKey }

        return try {
            println("🚀 OrderRepository: Starting order submission (idempotency=$idempotencyKey)")
            println("📦 OrderRequest: $orderRequest")
            println("💳 PaymentIntentId: $paymentIntentId")

            val createOrderRequest = transformToCreateOrderRequest(
                orderRequest, 
                lastStudentAddress, 
                lastQuoteResponse?.warehouseAddress,
                paymentIntentId
            ) ?: return Result.failure(Exception("Failed to create order request"))

            println("🌐 CreateOrderRequest: $createOrderRequest")
            val response = orderApi.placeOrder(createOrderRequest)
            println("📡 Response code: ${response.code()}")
            println("📡 Response message: ${response.message()}")
            if (response.isSuccessful) {
                response.body()?.let { order ->
                    println("✅ Order created with ID: ${order.id}")
                    Result.success(order)
                } ?: Result.failure(Exception("Empty response"))
            } else {
                Result.failure(Exception("Failed to place order: ${response.message()}"))
            }

        } catch (e: java.io.IOException) {
            android.util.Log.e("OrderRepository", "Network error submitting order", e)
            Result.failure(e)
        } catch (e: retrofit2.HttpException) {
            android.util.Log.e("OrderRepository", "HTTP error submitting order: ${e.code()}", e)
            Result.failure(e)
        } catch (e: com.google.gson.JsonSyntaxException) {
            android.util.Log.e("OrderRepository", "JSON parsing error submitting order", e)
            Result.failure(e)
        } finally {
            isSubmitting = false
            // clear provider
            RetrofitClient.setIdempotencyKeyProvider { null }
        }
    }
    
    /**
     * Get current active order
     */
    suspend fun getActiveOrder(): Order? {
        return try {
            val response = orderApi.getActiveOrder()
            if (response.isSuccessful && response.body() != null) {
                response.body()?.let { order ->
                    println("found: ${order.id}")
                    Result.success(order)
                } ?: Result.failure(Exception("Empty response"))
                response.body()
            } else {
                null
            }
        } catch (e: java.io.IOException) {
                null
            } catch (e: retrofit2.HttpException) {
                null
            } catch (e: com.google.gson.JsonSyntaxException) {
                null
            }
    }

    /**
     * Get all orders
     */
    suspend fun getAllOrders(): List<Order>? {
        val response = orderApi.getAllOrders()
        if (response.isSuccessful) {
            val orders = response.body()?.orders?.map{ dto ->
                Order(
                    id = dto.id,
                    studentId = dto.studentId,
                    moverId = dto.moverId,
                    status = OrderStatus.valueOf(dto.status),
                    volume = dto.volume,
                    price = dto.totalPrice,
                    studentAddress = dto.studentAddress,
                    warehouseAddress = dto.warehouseAddress,
                    returnAddress = dto.returnAddress,
                    pickupTime = dto.pickupTime,
                    returnTime = dto.returnTime
                )
            }
            return orders
        } else {
            println("❌ Failed to fetch orders: ${response.code()} - ${response.message()}")
        }
        return null
    }

    /**
     * Clear active order (when starting new order or dismissing completed one)
     */
    suspend fun cancelOrder(){
        val response = orderApi.cancelOrder()
        if (!response.isSuccessful) {
            // Throw a Retrofit HttpException so callers can inspect status/code
            throw retrofit2.HttpException(response)
        }
    }

    suspend fun createReturnJob(request: CreateReturnJobRequest): CreateReturnJobResponse {
        val response = orderApi.createReturnJob(request)
        if (!response.isSuccessful) {
            // Surface server error as a HttpException with the response so handlers can react
            throw retrofit2.HttpException(response)
        }
        return response.body() ?: throw IllegalStateException("Empty response from server")
    }

}
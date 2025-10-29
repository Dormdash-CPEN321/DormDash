package com.cpen321.usermanagement.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.cpen321.usermanagement.data.local.models.*
import com.cpen321.usermanagement.business.DynamicPriceCalculator
import com.cpen321.usermanagement.ui.viewmodels.OrderViewModel
import com.cpen321.usermanagement.data.repository.PaymentRepository
import com.cpen321.usermanagement.ui.components.shared.DatePickerDialog
import com.cpen321.usermanagement.utils.LocationUtils
import com.cpen321.usermanagement.utils.TimeUtils
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.TimeoutCancellationException
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateOrderBottomSheet(
    onDismiss: () -> Unit,
    onSubmitOrder: (OrderRequest, String?) -> Unit, // Added paymentIntentId parameter
    orderViewModel: OrderViewModel,
    paymentRepository: PaymentRepository,
    modifier: Modifier = Modifier
) {
    // Step management
    var currentStep by remember { mutableStateOf(OrderCreationStep.ADDRESS_CAPTURE) }
    var studentAddress by remember { mutableStateOf<Address?>(null) }
    var warehouseAddress by remember { mutableStateOf<Address?>(null) }
    var pricingRules by remember { mutableStateOf<PricingRules?>(null) }
    
    // Order and payment data
    var orderRequest by remember { mutableStateOf<OrderRequest?>(null) }
    var paymentIntentResponse by remember { mutableStateOf<CreatePaymentIntentResponse?>(null) }
    var paymentDetails by remember { mutableStateOf(PaymentDetails()) }
    // Prevent duplicate submissions from UI
    var isSubmitting by remember { mutableStateOf(false) }
    
    // Error handling
    var errorMessage by remember { mutableStateOf<String?>(null) }
    
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    
    Column(
        modifier = modifier.padding(24.dp)
    ) {
        // Header with back button (if not on first step)
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (currentStep != OrderCreationStep.ADDRESS_CAPTURE) {
                    IconButton(
                        onClick = { 
                            currentStep = when(currentStep) {
                                OrderCreationStep.BOX_SELECTION -> OrderCreationStep.ADDRESS_CAPTURE
                                OrderCreationStep.PAYMENT_DETAILS -> OrderCreationStep.BOX_SELECTION
                                OrderCreationStep.PROCESSING_PAYMENT -> OrderCreationStep.PAYMENT_DETAILS
                                else -> OrderCreationStep.ADDRESS_CAPTURE
                            }
                        }
                    ) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
                Text(
                    text = when(currentStep) {
                        OrderCreationStep.ADDRESS_CAPTURE -> "Enter Address"
                        OrderCreationStep.LOADING_QUOTE -> "Getting Quote"
                        OrderCreationStep.BOX_SELECTION -> "Select Boxes"
                        OrderCreationStep.PAYMENT_DETAILS -> "Payment Details"
                        OrderCreationStep.PROCESSING_PAYMENT -> "Processing Payment"
                        OrderCreationStep.ORDER_CONFIRMATION -> "Order Confirmed"
                    },
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold
                )
            }
            IconButton(onClick = onDismiss) {
                Icon(Icons.Default.Close, contentDescription = "Close")
            }
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // Error message display
        errorMessage?.let { error ->
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer
                ),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(
                    text = error,
                    color = MaterialTheme.colorScheme.onErrorContainer,
                    modifier = Modifier.padding(16.dp)
                )
            }
            Spacer(modifier = Modifier.height(16.dp))
        }
        
        // Step content
        when (currentStep) {
            OrderCreationStep.ADDRESS_CAPTURE -> {
                AddressCaptureStep(
                    onAddressConfirmed = { address ->
                        studentAddress = address
                        currentStep = OrderCreationStep.LOADING_QUOTE
                        errorMessage = null
                        
                        // Real API call to get quote
                        coroutineScope.launch {
                            try {
                                val result = orderViewModel.getQuote(address)
                                result.fold(
                                    onSuccess = { quoteResponse ->
                                        warehouseAddress = quoteResponse.warehouseAddress
                                        pricingRules = PricingRules(
                                            distanceServiceFee = quoteResponse.distancePrice
                                        )
                                        currentStep = OrderCreationStep.BOX_SELECTION
                                    },
                                    onFailure = { exception: Throwable ->
                                        errorMessage = "Failed to get pricing: ${exception.message}"
                                        currentStep = OrderCreationStep.ADDRESS_CAPTURE
                                    }
                                )
                            } catch (e: Exception) {
                                errorMessage = "Failed to get pricing. Please try again."
                                currentStep = OrderCreationStep.ADDRESS_CAPTURE
                            }
                        }
                    },
                    onError = { error ->
                        errorMessage = error
                    }
                )
            }
            
            OrderCreationStep.LOADING_QUOTE -> {
                LoadingQuoteStep()
            }
            
            OrderCreationStep.BOX_SELECTION -> {
                pricingRules?.let { rules ->
                    BoxSelectionStep(
                        pricingRules = rules,
                        studentAddress = studentAddress!!,
                        onProceedToPayment = { order ->
                            orderRequest = order
                            currentStep = OrderCreationStep.PAYMENT_DETAILS
                            errorMessage = null
                        }
                    )
                }
            }
            
            OrderCreationStep.PAYMENT_DETAILS -> {
                orderRequest?.let { order ->
                    PaymentDetailsStep(
                        orderRequest = order,
                        paymentDetails = paymentDetails,
                        onPaymentDetailsChange = { details ->
                            paymentDetails = details
                        },
                        isSubmitting = isSubmitting,
                        onProcessPayment = {
                            // Prevent duplicate starts
                            if (isSubmitting) return@PaymentDetailsStep
                            isSubmitting = true

                            currentStep = OrderCreationStep.PROCESSING_PAYMENT
                            errorMessage = null

                            // Create payment intent and process payment with timeout
                            coroutineScope.launch {
                                try {
                                    // Add timeout protection (30 seconds)
                                    withTimeout(30000L) {
                                        // Step 1: Create payment intent
                                        println("Creating payment intent for amount: ${order.totalPrice}")
                                        val intentResult = paymentRepository.createPaymentIntent(order.totalPrice)
                                        intentResult.fold(
                                            onSuccess = { intent ->
                                                println("Payment intent created successfully: ${intent.id}")
                                                paymentIntentResponse = intent

                                                // Step 2: Process payment with customer info
                                                val customerInfo = CustomerInfo(
                                                    name = paymentDetails.cardholderName,
                                                    email = paymentDetails.email,
                                                    address = PaymentAddress(
                                                        line1 = order.currentAddress,
                                                        city = "Vancouver",
                                                        state = "BC",
                                                        postalCode = "V6T1Z4",
                                                        country = "CA"
                                                    )
                                                )

                                                println("Processing payment with intent ID: ${intent.id}")
                                                val paymentResult = paymentRepository.processPayment(
                                                    intent.id,
                                                    customerInfo,
                                                    TestPaymentMethods.VISA_SUCCESS // Use selected test card
                                                )

                                                paymentResult.fold(
                                                    onSuccess = { payment ->
                                                        if (payment.status == "SUCCEEDED") {
                                                            // Submit order to backend with payment intent ID
                                                            onSubmitOrder(order, intent.id)
                                                            currentStep = OrderCreationStep.ORDER_CONFIRMATION
                                                            // keep isSubmitting=true until sheet closes to avoid re-submits
                                                        } else {
                                                            errorMessage = "Payment was declined. Please try a different payment method."
                                                            currentStep = OrderCreationStep.PAYMENT_DETAILS
                                                            isSubmitting = false
                                                        }
                                                    },
                                                    onFailure = { exception ->
                                                        errorMessage = "Payment processing failed: ${exception.message}"
                                                        currentStep = OrderCreationStep.PAYMENT_DETAILS
                                                        isSubmitting = false
                                                    }
                                                )
                                            },
                                            onFailure = { exception ->
                                                println("Failed to create payment intent: ${exception.message}")
                                                errorMessage = "Failed to initialize payment: ${exception.message}"
                                                currentStep = OrderCreationStep.PAYMENT_DETAILS
                                                isSubmitting = false
                                            }
                                        )
                                    }
                                } catch (e: TimeoutCancellationException) {
                                    errorMessage = "Payment request timed out. Please check your connection and try again."
                                    currentStep = OrderCreationStep.PAYMENT_DETAILS
                                    isSubmitting = false
                                } catch (e: Exception) {
                                    errorMessage = "Payment failed: ${e.message ?: "Unknown error"}. Please try again."
                                    currentStep = OrderCreationStep.PAYMENT_DETAILS
                                    isSubmitting = false
                                }
                            }
                        }
                    )
                }
            }
            
            OrderCreationStep.PROCESSING_PAYMENT -> {
                ProcessingPaymentStep()
            }
            
            OrderCreationStep.ORDER_CONFIRMATION -> {
                orderRequest?.let { order ->
                    OrderConfirmationStep(
                        orderRequest = order,
                        onClose = onDismiss
                    )
                }
            }
        }
    }
}

// Step 1: Address Capture
@Composable
private fun AddressCaptureStep(
    onAddressConfirmed: (Address) -> Unit,
    onError: (String) -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    
    // Single address field with autocomplete
    var addressInput by remember { mutableStateOf("") }
    var selectedAddress by remember { mutableStateOf<SelectedAddress?>(null) }
    var isValidating by remember { mutableStateOf(false) }

    Column {
        Text(
            text = "We need your pickup address to find the nearest warehouse",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 8.dp)
        )

        Text(
            text = "Currently serving Greater Vancouver, BC only",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.primary,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(bottom = 24.dp)
        )
        
        // Address autocomplete field
        AddressAutocompleteField(
            value = addressInput,
            onValueChange = { 
                addressInput = it
                // Clear selected address when user starts typing again
                if (selectedAddress != null && it != selectedAddress?.formattedAddress) {
                    selectedAddress = null
                }
            },
            onAddressSelected = { address ->
                selectedAddress = address
                addressInput = address.formattedAddress
            },
            modifier = Modifier.fillMaxWidth()
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Spacer(modifier = Modifier.height(32.dp))
        
        Button(
            onClick = {
                if (selectedAddress == null) {
                    onError("Please select an address from the suggestions")
                    return@Button
                }
                
                isValidating = true
                coroutineScope.launch {
                    try {
                        // Validate that the selected address is within Vancouver area
                        val validationResult = LocationUtils.validateAndGeocodeAddress(
                            context, 
                            selectedAddress!!.formattedAddress
                        )

                        if (validationResult.isValid && validationResult.coordinates != null) {
                            // Address is valid and within Vancouver area
                            val address = Address(
                                lat = selectedAddress!!.latitude,
                                lon = selectedAddress!!.longitude,
                                formattedAddress = selectedAddress!!.formattedAddress
                            )
                            onAddressConfirmed(address)
                        } else {
                            // Address is invalid or outside service area
                            onError(validationResult.errorMessage ?: "Invalid address. Please select a valid address within Greater Vancouver.")
                            isValidating = false
                        }
                    } catch (e: Exception) {
                        onError("Failed to validate address. Please try again.")
                        isValidating = false
                    }
                }
            },
            enabled = !isValidating && selectedAddress != null,
            modifier = Modifier.fillMaxWidth()
        ) {
            if (isValidating) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Validating Address...")
                }
            } else {
                Text("Get Base Delivery Charge")
            }
        }
    }
}

// Step 2: Loading Quote
@Composable
private fun LoadingQuoteStep() {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth()
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(48.dp),
            color = MaterialTheme.colorScheme.primary
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Text(
            text = "Getting pricing for your location...",
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Text(
            text = "This may take a few seconds",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
    }
}

// Step 3: Box Selection with Dynamic Pricing
@Composable
private fun BoxSelectionStep(
    pricingRules: PricingRules,
    studentAddress: Address,
    onProceedToPayment: (OrderRequest) -> Unit
) {
    var boxQuantities by remember {
        mutableStateOf(STANDARD_BOX_SIZES.map { BoxQuantity(it, 0) })
    }
    
    // Pickup date/time state
    var showPickupDatePicker by remember { mutableStateOf(false) }
    var selectedPickupDateMillis by remember { 
        mutableStateOf(System.currentTimeMillis() + (24 * 60 * 60 * 1000L)) // Tomorrow
    }
    var pickupHour by remember { mutableStateOf(10) } // Default 10 AM
    var pickupMinute by remember { mutableStateOf(0) }
    var showPickupTimeDialog by remember { mutableStateOf(false) }
    
    // Return date & time state
    var showDatePicker by remember { mutableStateOf(false) }
    var selectedDateMillis by remember { 
        mutableStateOf(System.currentTimeMillis() + (7 * 24 * 60 * 60 * 1000L)) // 7 days from now
    }
    var returnHour by remember { mutableStateOf(17) } // Default 5 PM
    var returnMinute by remember { mutableStateOf(0) }
    var showReturnTimeDialog by remember { mutableStateOf(false) }
    
    val pickupDate = TimeUtils.formatDatePickerDate(selectedPickupDateMillis)
    val returnDate = TimeUtils.formatDatePickerDate(selectedDateMillis)
    
    // Validation: Check if return date/time is after pickup date/time
    val pickupDateTime = Calendar.getInstance().apply {
        timeInMillis = selectedPickupDateMillis
        set(Calendar.HOUR_OF_DAY, pickupHour)
        set(Calendar.MINUTE, pickupMinute)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }.timeInMillis
    
    val returnDateTime = Calendar.getInstance().apply {
        timeInMillis = selectedDateMillis
        set(Calendar.HOUR_OF_DAY, returnHour)
        set(Calendar.MINUTE, returnMinute)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }.timeInMillis
    
    val isReturnBeforePickup = returnDateTime <= pickupDateTime
    
    val calculator = remember { DynamicPriceCalculator(pricingRules) }
    val currentPrice = calculator.calculateTotal(boxQuantities, returnDate)
    val totalBoxes = boxQuantities.sumOf { it.quantity }
    val canSubmit = totalBoxes > 0 && !isReturnBeforePickup
    
    Column {
        // Box Selection
        Text(
            text = "Select Boxes",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(bottom = 16.dp)
        )
        
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.heightIn(max = 200.dp)
        ) {
            items(boxQuantities) { boxQuantityItem ->
                BoxSelectionItem(
                    boxQuantity = boxQuantityItem,
                    unitPrice = pricingRules.boxPrices[boxQuantityItem.boxSize.type] ?: 0.0,
                    onQuantityChange = { newQuantity ->
                        boxQuantities = boxQuantities.map { item ->
                            if (item.boxSize == boxQuantityItem.boxSize) {
                                item.copy(quantity = newQuantity)
                            } else item
                        }
                    }
                )
            }
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // Pickup Date & Time Selection
        Text(
            text = "Pickup Date & Time",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Pickup Date
            OutlinedCard(
                modifier = Modifier.weight(1f),
                onClick = { showPickupDatePicker = true }
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.DateRange,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Column {
                        Text(
                            text = "Date",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            text = pickupDate,
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
            }
            
            // Pickup Time
            OutlinedCard(
                modifier = Modifier.weight(1f),
                onClick = { showPickupTimeDialog = true }
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.Check,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Column {
                        Text(
                            text = "Time",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            text = String.format("%02d:%02d", pickupHour, pickupMinute),
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
            }
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // Return Date & Time Selection
        Text(
            text = "Return Date & Time",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Return Date
            OutlinedCard(
                modifier = Modifier.weight(1f),
                onClick = { showDatePicker = true }
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.DateRange,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Column {
                        Text(
                            text = "Date",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            text = returnDate,
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
            }
            
            // Return Time
            OutlinedCard(
                modifier = Modifier.weight(1f),
                onClick = { showReturnTimeDialog = true }
            ) {
                Row(
                    modifier = Modifier.padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.Check,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Column {
                        Text(
                            text = "Time",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            text = String.format("%02d:%02d", returnHour, returnMinute),
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
            }
        }
        
        // Validation error message
        if (isReturnBeforePickup) {
            Spacer(modifier = Modifier.height(8.dp))
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer
                )
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.Info,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.error,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Return date/time must be after pickup date/time",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onErrorContainer
                    )
                }
            }
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // Price Breakdown
        PriceBreakdownCard(priceBreakdown = currentPrice)
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // Proceed to Payment Button
        Button(
            onClick = {
                // Create ISO 8601 datetime string for pickup in Pacific timezone
                val pacificZone = TimeZone.getTimeZone("America/Los_Angeles")
                val utcZone = TimeZone.getTimeZone("UTC")
                
                // First, extract date components from the UTC milliseconds
                val utcCalendar = Calendar.getInstance(utcZone).apply {
                    timeInMillis = selectedPickupDateMillis
                }
                val year = utcCalendar.get(Calendar.YEAR)
                val month = utcCalendar.get(Calendar.MONTH)
                val day = utcCalendar.get(Calendar.DAY_OF_MONTH)
                
                // Now create a Pacific time calendar with those date components
                val pickupCalendar = Calendar.getInstance(pacificZone).apply {
                    clear()
                    set(year, month, day, pickupHour, pickupMinute, 0)
                    set(Calendar.MILLISECOND, 0)
                }
                
                // Format to ISO in UTC
                val isoFormatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
                    timeZone = utcZone
                }
                val pickupTimeIso = isoFormatter.format(pickupCalendar.time)
                
                val orderRequest = OrderRequest(
                    boxQuantities = boxQuantities.filter { it.quantity > 0 },
                    currentAddress = studentAddress.formattedAddress,
                    pickupTime = pickupTimeIso,
                    returnDate = returnDate,
                    totalPrice = currentPrice.total
                )
                onProceedToPayment(orderRequest)
            },
            enabled = canSubmit,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Proceed to Payment - $${String.format("%.2f", currentPrice.total)}")
        }
    }
    
    // Pickup Date Picker Dialog
    if (showPickupDatePicker) {
        DatePickerDialog(
            onDateSelected = { dateMillis ->
                selectedPickupDateMillis = dateMillis
            },
            onDismiss = { showPickupDatePicker = false },
            title = "Select Pickup Date",
            initialDateMillis = selectedPickupDateMillis,
            minDateOffsetDays = 0
        )
    }
    
    // Pickup Time Picker Dialog
    if (showPickupTimeDialog) {
        TimePickerDialog(
            initialHour = pickupHour,
            initialMinute = pickupMinute,
            onTimeSelected = { hour, minute ->
                pickupHour = hour
                pickupMinute = minute
                showPickupTimeDialog = false
            },
            onDismiss = { showPickupTimeDialog = false }
        )
    }
    
    // Return Date Picker Dialog
    if (showDatePicker) {
        DatePickerDialog(
            onDateSelected = { dateMillis ->
                selectedDateMillis = dateMillis
            },
            onDismiss = { showDatePicker = false },
            title = "Select Return Date",
            initialDateMillis = selectedDateMillis,
            minDateOffsetDays = 1 // Return must be at least tomorrow
        )
    }
    
    // Return Time Picker Dialog
    if (showReturnTimeDialog) {
        TimePickerDialog(
            initialHour = returnHour,
            initialMinute = returnMinute,
            onTimeSelected = { hour, minute ->
                returnHour = hour
                returnMinute = minute
                showReturnTimeDialog = false
            },
            onDismiss = { showReturnTimeDialog = false }
        )
    }
}

@Composable
private fun BoxSelectionItem(
    boxQuantity: BoxQuantity,
    unitPrice: Double,
    onQuantityChange: (Int) -> Unit,
    modifier: Modifier = Modifier
) {
    OutlinedCard(
        modifier = modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(
                modifier = Modifier.weight(1f)
            ) {
                Row(
                    verticalAlignment = Alignment.Bottom
                ) {
                    Text(
                        text = "${boxQuantity.boxSize.type} Box",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Medium
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "$${String.format("%.0f", unitPrice)}/box",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.primary,
                        fontWeight = FontWeight.Medium
                    )
                }
                Text(
                    text = boxQuantity.boxSize.dimensions,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = boxQuantity.boxSize.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            
            QuantityCounter(
                quantity = boxQuantity.quantity,
                onQuantityChange = onQuantityChange
            )
        }
    }
}

@Composable
private fun PriceBreakdownCard(
    priceBreakdown: PriceBreakdown,
    modifier: Modifier = Modifier
) {
    var isExpanded by remember { mutableStateOf(false) }
    
    OutlinedCard(
        modifier = modifier.fillMaxWidth(),
        colors = CardDefaults.outlinedCardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)
        )
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            // Total (always visible)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Total",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "$${String.format("%.2f", priceBreakdown.total)}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
            }
            
            // Expandable breakdown
            TextButton(
                onClick = { isExpanded = !isExpanded },
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(if (isExpanded) "Hide breakdown" else "Show breakdown")
            }
            
            if (isExpanded) {
                Spacer(modifier = Modifier.height(8.dp))
                
                // Box details
                priceBreakdown.boxDetails.forEach { boxItem ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "${boxItem.boxType} (${boxItem.quantity}×)",
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Text(
                            text = "$${String.format("%.2f", boxItem.totalPrice)}",
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
                
                // Daily fee
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "Rental (${priceBreakdown.days} days)",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Text(
                        text = "$${String.format("%.2f", priceBreakdown.dailyFee)}",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
                
                // Service fees
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "Service & Distance Fee",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Text(
                        text = "$${String.format("%.2f", priceBreakdown.serviceFee)}",
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        }
    }
}

@Composable
private fun TimePickerDialog(
    initialHour: Int,
    initialMinute: Int,
    onTimeSelected: (Int, Int) -> Unit,
    onDismiss: () -> Unit
) {
    var selectedHour by remember { mutableStateOf(initialHour) }
    var selectedMinute by remember { mutableStateOf(initialMinute) }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Select Time") },
        text = {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.Center,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Hour selector
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    IconButton(onClick = { selectedHour = (selectedHour + 1) % 24 }) {
                        Icon(
                            Icons.Default.Add,
                            contentDescription = "Increase hour",
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                    Text(
                        text = String.format("%02d", selectedHour),
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold
                    )
                    IconButton(onClick = { selectedHour = if (selectedHour > 0) selectedHour - 1 else 23 }) {
                        Icon(
                            Icons.Default.Remove,
                            contentDescription = "Decrease hour",
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                }
                
                Text(
                    text = ":",
                    style = MaterialTheme.typography.headlineMedium,
                    modifier = Modifier.padding(horizontal = 16.dp)
                )
                
                // Minute selector
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    IconButton(onClick = { selectedMinute = (selectedMinute + 15) % 60 }) {
                        Icon(
                            Icons.Default.Add,
                            contentDescription = "Increase minute",
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                    Text(
                        text = String.format("%02d", selectedMinute),
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold
                    )
                    IconButton(onClick = { selectedMinute = if (selectedMinute >= 15) selectedMinute - 15 else 45 }) {
                        Icon(
                            Icons.Default.Remove,
                            contentDescription = "Decrease minute",
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onTimeSelected(selectedHour, selectedMinute) }) {
                Text("OK")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}

// Step 4: Payment Details
@Composable
private fun PaymentDetailsStep(
    orderRequest: OrderRequest,
    paymentDetails: PaymentDetails,
    onPaymentDetailsChange: (PaymentDetails) -> Unit,
    isSubmitting: Boolean,
    onProcessPayment: () -> Unit
) {
    var selectedTestCard by remember { mutableStateOf(TestPaymentMethods.TEST_CARDS[0]) }
    var showCardSelector by remember { mutableStateOf(false) }
    var showConfirmDialog by remember { mutableStateOf(false) }
    var nameError by remember { mutableStateOf<String?>(null) }
    var emailError by remember { mutableStateOf<String?>(null) }
    
    // Email validation regex
    val emailRegex = "^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$".toRegex()
    
    // Validation function
    fun validateFields(): Boolean {
        var isValid = true
        
        // Validate name
        if (paymentDetails.cardholderName.isBlank()) {
            nameError = "Name is required"
            isValid = false
        } else if (paymentDetails.cardholderName.length < 2) {
            nameError = "Name must be at least 2 characters"
            isValid = false
        } else if (!paymentDetails.cardholderName.matches("^[a-zA-Z\\s'-]+$".toRegex())) {
            nameError = "Name contains invalid characters"
            isValid = false
        } else {
            nameError = null
        }
        
        // Validate email
        if (paymentDetails.email.isBlank()) {
            emailError = "Email is required"
            isValid = false
        } else if (!paymentDetails.email.matches(emailRegex)) {
            emailError = "Please enter a valid email address"
            isValid = false
        } else {
            emailError = null
        }
        
        return isValid
    }
    
    Column {
        // Order Summary
        Text(
            text = "Order Summary",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(bottom = 8.dp)
        )
        
        OutlinedCard(
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(16.dp)
            ) {
                Text(
                    text = "Total: $${String.format("%.2f", orderRequest.totalPrice)}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary
                )
                Text(
                    text = "${orderRequest.boxQuantities.sumOf { it.quantity }} boxes for ${orderRequest.returnDate}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // Test Card Selection (Demo Mode)
        Text(
            text = "Payment Method (Demo)",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        OutlinedCard(
            modifier = Modifier.fillMaxWidth(),
            onClick = { showCardSelector = true }
        ) {
            Row(
                modifier = Modifier.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = selectedTestCard.description,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        text = "**** **** **** ${selectedTestCard.number.takeLast(4)}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Icon(
                    Icons.Default.Edit,
                    contentDescription = "Change card",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        
        if (showCardSelector) {
            Spacer(modifier = Modifier.height(8.dp))
            Card {
                LazyColumn {
                    items(TestPaymentMethods.TEST_CARDS) { testCard ->
                        ListItem(
                            headlineContent = { Text(testCard.description) },
                            supportingContent = { Text("**** **** **** ${testCard.number.takeLast(4)}") },
                            modifier = Modifier.clickable {
                                selectedTestCard = testCard
                                showCardSelector = false
                            }
                        )
                    }
                }
            }
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // Customer Information
        Text(
            text = "Customer Information",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        OutlinedTextField(
            value = paymentDetails.cardholderName,
            onValueChange = { name ->
                onPaymentDetailsChange(paymentDetails.copy(cardholderName = name))
                // Clear error when user starts typing
                if (nameError != null) nameError = null
            },
            label = { Text("Full Name") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            isError = nameError != null,
            supportingText = nameError?.let { 
                { Text(it, color = MaterialTheme.colorScheme.error) }
            },
            enabled = !isSubmitting
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        OutlinedTextField(
            value = paymentDetails.email,
            onValueChange = { email ->
                onPaymentDetailsChange(paymentDetails.copy(email = email))
                // Clear error when user starts typing
                if (emailError != null) emailError = null
            },
            label = { Text("Email Address") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            isError = emailError != null,
            supportingText = emailError?.let { 
                { Text(it, color = MaterialTheme.colorScheme.error) }
            },
            placeholder = { Text("example@email.com") },
            enabled = !isSubmitting
        )
        
        Spacer(modifier = Modifier.height(32.dp))
        
        // Warning about test cards
        if (selectedTestCard.description.contains("Declined", ignoreCase = true)) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.errorContainer
                )
            ) {
                Row(
                    modifier = Modifier.padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        Icons.Default.Info,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.error,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Warning: This test card will be declined",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onErrorContainer
                    )
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
        }
        
        // Process Payment Button
        val canProcessPayment = paymentDetails.cardholderName.isNotBlank() && 
                               paymentDetails.email.matches(emailRegex)
        
        Button(
            onClick = {
                if (validateFields()) {
                    showConfirmDialog = true
                }
            },
            enabled = canProcessPayment && !isSubmitting,
            modifier = Modifier.fillMaxWidth()
        ) {
            if (isSubmitting) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Processing...")
                }
            } else {
                Text("Process Payment - $${String.format("%.2f", orderRequest.totalPrice)}")
            }
        }
        
        if (!canProcessPayment) {
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Please fill in all required fields with valid information",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
            )
        }
        
        // Confirmation Dialog
        if (showConfirmDialog) {
            AlertDialog(
                onDismissRequest = { showConfirmDialog = false },
                title = { Text("Confirm Payment") },
                text = {
                    Column {
                        Text("Please confirm the payment details:")
                        Spacer(modifier = Modifier.height(12.dp))
                        Text("Amount: $${String.format("%.2f", orderRequest.totalPrice)}", fontWeight = FontWeight.Bold)
                        Text("Name: ${paymentDetails.cardholderName}")
                        Text("Email: ${paymentDetails.email}")
                        Text("Card: ${selectedTestCard.description}")
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = "This is a demo payment using test cards.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                confirmButton = {
                    Button(
                        onClick = {
                            showConfirmDialog = false
                            onProcessPayment()
                        },
                        enabled = !isSubmitting
                    ) {
                        Text("Confirm & Pay")
                    }
                },
                dismissButton = {
                    TextButton(
                        onClick = { showConfirmDialog = false },
                        enabled = !isSubmitting
                    ) {
                        Text("Cancel")
                    }
                }
            )
        }
    }
}

// Step 5: Processing Payment
@Composable
private fun ProcessingPaymentStep() {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth()
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(48.dp),
            color = MaterialTheme.colorScheme.primary
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Text(
            text = "Processing your payment...",
            style = MaterialTheme.typography.titleMedium,
            textAlign = TextAlign.Center
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Text(
            text = "Please wait while we process your payment securely",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
    }
}

// Step 6: Order Confirmation
@Composable
private fun OrderConfirmationStep(
    orderRequest: OrderRequest,
    onClose: () -> Unit
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.fillMaxWidth()
    ) {
        // Success Icon
        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
            modifier = Modifier.size(80.dp)
        ) {
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier.fillMaxSize()
            ) {
                Icon(
                    Icons.Default.Check,
                    contentDescription = null,
                    modifier = Modifier.size(40.dp),
                    tint = MaterialTheme.colorScheme.onPrimaryContainer
                )
            }
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Text(
            text = "Order Created Successfully!",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Text(
            text = "Your payment has been processed and your order is confirmed.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // Order Details
        OutlinedCard(
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(16.dp)
            ) {
                Text(
                    text = "Order Details",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold
                )
                
                Spacer(modifier = Modifier.height(8.dp))
                
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Total Amount:")
                    Text(
                        "$${String.format("%.2f", orderRequest.totalPrice)}",
                        fontWeight = FontWeight.Medium
                    )
                }
                
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Boxes:")
                    Text("${orderRequest.boxQuantities.sumOf { it.quantity }} boxes")
                }
                
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Return Date:")
                    Text(orderRequest.returnDate)
                }
            }
        }
        
        Spacer(modifier = Modifier.height(32.dp))
        
        Button(
            onClick = onClose,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Close")
        }
    }
}

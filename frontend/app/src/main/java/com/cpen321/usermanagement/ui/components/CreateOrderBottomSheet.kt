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
                            } catch (e: java.io.IOException) {
                                    // Network issue
                                    errorMessage = "Network error while fetching pricing. Please check your connection and try again."
                                    currentStep = OrderCreationStep.ADDRESS_CAPTURE
                                } catch (e: retrofit2.HttpException) {
                                    // HTTP error from backend
                                    errorMessage = "Server error while fetching pricing. Please try again later."
                                    currentStep = OrderCreationStep.ADDRESS_CAPTURE
                                } catch (e: com.google.gson.JsonSyntaxException) {
                                    // Malformed response
                                    errorMessage = "Unexpected response from server. Please try again."
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
                                } catch (e: java.io.IOException) {
                                    errorMessage = "Network error during payment. Please check your connection and try again."
                                    currentStep = OrderCreationStep.PAYMENT_DETAILS
                                    isSubmitting = false
                                } catch (e: retrofit2.HttpException) {
                                    errorMessage = "Payment server error. Please try again later."
                                    currentStep = OrderCreationStep.PAYMENT_DETAILS
                                    isSubmitting = false
                                } catch (e: com.google.gson.JsonSyntaxException) {
                                    errorMessage = "Unexpected response during payment. Please try again."
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
                    } catch (e: java.io.IOException) {
                        // Network / Geocoder I/O error
                        onError("Network error validating address. Please check your connection and try again.")
                        isValidating = false
                    } catch (e: IllegalArgumentException) {
                        // Bad input passed to Geocoder
                        onError("Invalid address format. Please enter a valid address.")
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

private data class DateTimeState(
    val showPickupDatePicker: Boolean = false,
    val selectedPickupDateMillis: Long = System.currentTimeMillis() + (24 * 60 * 60 * 1000L),
    val pickupHour: Int = 10,
    val pickupMinute: Int = 0,
    val showPickupTimeDialog: Boolean = false,
    val showReturnDatePicker: Boolean = false,
    val selectedReturnDateMillis: Long = System.currentTimeMillis() + (7 * 24 * 60 * 60 * 1000L),
    val returnHour: Int = 17,
    val returnMinute: Int = 0,
    val showReturnTimeDialog: Boolean = false
)

private data class DateTimeDisplay(
    val pickupDate: String,
    val pickupHour: Int,
    val pickupMinute: Int,
    val returnDate: String,
    val returnHour: Int,
    val returnMinute: Int,
    val isReturnBeforePickup: Boolean
)

private data class DateTimeActions(
    val onShowPickupDatePicker: () -> Unit,
    val onShowPickupTimePicker: () -> Unit,
    val onShowReturnDatePicker: () -> Unit,
    val onShowReturnTimePicker: () -> Unit
)

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
    
    var dateTimeState by remember { mutableStateOf(DateTimeState()) }
    
    val pickupDate = TimeUtils.formatDatePickerDate(dateTimeState.selectedPickupDateMillis)
    val returnDate = TimeUtils.formatDatePickerDate(dateTimeState.selectedReturnDateMillis)
    
    val pickupDateTime = calculateDateTime(
        dateTimeState.selectedPickupDateMillis,
        dateTimeState.pickupHour,
        dateTimeState.pickupMinute
    )
    
    val returnDateTime = calculateDateTime(
        dateTimeState.selectedReturnDateMillis,
        dateTimeState.returnHour,
        dateTimeState.returnMinute
    )
    
    val isReturnBeforePickup = returnDateTime <= pickupDateTime
    
    val calculator = remember { DynamicPriceCalculator(pricingRules) }
    val currentPrice = calculator.calculateTotal(boxQuantities, returnDate)
    val totalBoxes = boxQuantities.sumOf { it.quantity }
    val canSubmit = totalBoxes > 0 && !isReturnBeforePickup
    
    Column {
        BoxSelectionList(
            boxQuantities = boxQuantities,
            pricingRules = pricingRules,
            onQuantitiesChange = { boxQuantities = it }
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        DateTimeSelectionSection(
            display = DateTimeDisplay(
                pickupDate = pickupDate,
                pickupHour = dateTimeState.pickupHour,
                pickupMinute = dateTimeState.pickupMinute,
                returnDate = returnDate,
                returnHour = dateTimeState.returnHour,
                returnMinute = dateTimeState.returnMinute,
                isReturnBeforePickup = isReturnBeforePickup
            ),
            actions = DateTimeActions(
                onShowPickupDatePicker = { dateTimeState = dateTimeState.copy(showPickupDatePicker = true) },
                onShowPickupTimePicker = { dateTimeState = dateTimeState.copy(showPickupTimeDialog = true) },
                onShowReturnDatePicker = { dateTimeState = dateTimeState.copy(showReturnDatePicker = true) },
                onShowReturnTimePicker = { dateTimeState = dateTimeState.copy(showReturnTimeDialog = true) }
            )
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        PriceBreakdownCard(priceBreakdown = currentPrice)
        
        Spacer(modifier = Modifier.height(24.dp))
        
        ProceedToPaymentButton(
            enabled = canSubmit,
            totalPrice = currentPrice.total,
            onProceed = {
                val pickupTimeIso = formatPickupTimeToISO(
                    dateTimeState.selectedPickupDateMillis,
                    dateTimeState.pickupHour,
                    dateTimeState.pickupMinute
                )
                
                val orderRequest = OrderRequest(
                    boxQuantities = boxQuantities.filter { it.quantity > 0 },
                    currentAddress = studentAddress.formattedAddress,
                    pickupTime = pickupTimeIso,
                    returnDate = returnDate,
                    totalPrice = currentPrice.total
                )
                onProceedToPayment(orderRequest)
            }
        )
    }
    
    DateTimePickerDialogs(
        dateTimeState = dateTimeState,
        onPickupDateSelected = { millis ->
            dateTimeState = dateTimeState.copy(
                selectedPickupDateMillis = millis,
                showPickupDatePicker = false
            )
        },
        onPickupTimeSelected = { hour, minute ->
            dateTimeState = dateTimeState.copy(
                pickupHour = hour,
                pickupMinute = minute,
                showPickupTimeDialog = false
            )
        },
        onReturnDateSelected = { millis ->
            dateTimeState = dateTimeState.copy(
                selectedReturnDateMillis = millis,
                showReturnDatePicker = false
            )
        },
        onReturnTimeSelected = { hour, minute ->
            dateTimeState = dateTimeState.copy(
                returnHour = hour,
                returnMinute = minute,
                showReturnTimeDialog = false
            )
        },
        onDismiss = { dialog ->
            dateTimeState = when (dialog) {
                "pickupDate" -> dateTimeState.copy(showPickupDatePicker = false)
                "pickupTime" -> dateTimeState.copy(showPickupTimeDialog = false)
                "returnDate" -> dateTimeState.copy(showReturnDatePicker = false)
                "returnTime" -> dateTimeState.copy(showReturnTimeDialog = false)
                else -> dateTimeState
            }
        }
    )
}

private fun calculateDateTime(dateMillis: Long, hour: Int, minute: Int): Long {
    return Calendar.getInstance().apply {
        timeInMillis = dateMillis
        set(Calendar.HOUR_OF_DAY, hour)
        set(Calendar.MINUTE, minute)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
    }.timeInMillis
}

private fun formatPickupTimeToISO(dateMillis: Long, hour: Int, minute: Int): String {
    val pacificZone = TimeZone.getTimeZone("America/Los_Angeles")
    val utcZone = TimeZone.getTimeZone("UTC")
    
    val utcCalendar = Calendar.getInstance(utcZone).apply {
        timeInMillis = dateMillis
    }
    val year = utcCalendar.get(Calendar.YEAR)
    val month = utcCalendar.get(Calendar.MONTH)
    val day = utcCalendar.get(Calendar.DAY_OF_MONTH)
    
    val pickupCalendar = Calendar.getInstance(pacificZone).apply {
        clear()
        set(year, month, day, hour, minute, 0)
        set(Calendar.MILLISECOND, 0)
    }
    
    val isoFormatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
        timeZone = utcZone
    }
    return isoFormatter.format(pickupCalendar.time)
}

@Composable
private fun BoxSelectionList(
    boxQuantities: List<BoxQuantity>,
    pricingRules: PricingRules,
    onQuantitiesChange: (List<BoxQuantity>) -> Unit
) {
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
                    onQuantitiesChange(boxQuantities.map { item ->
                        if (item.boxSize == boxQuantityItem.boxSize) {
                            item.copy(quantity = newQuantity)
                        } else item
                    })
                }
            )
        }
    }
}

@Composable
private fun DateTimeSelectionSection(
    display: DateTimeDisplay,
    actions: DateTimeActions
) {
    Text(
        text = "Pickup Date & Time",
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold
    )
    
    Spacer(modifier = Modifier.height(8.dp))
    
    DateTimeRow(
        date = display.pickupDate,
        hour = display.pickupHour,
        minute = display.pickupMinute,
        onDateClick = actions.onShowPickupDatePicker,
        onTimeClick = actions.onShowPickupTimePicker
    )
    
    Spacer(modifier = Modifier.height(24.dp))
    
    Text(
        text = "Return Date & Time",
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold
    )
    
    Spacer(modifier = Modifier.height(8.dp))
    
    DateTimeRow(
        date = display.returnDate,
        hour = display.returnHour,
        minute = display.returnMinute,
        onDateClick = actions.onShowReturnDatePicker,
        onTimeClick = actions.onShowReturnTimePicker
    )
    
    if (display.isReturnBeforePickup) {
        Spacer(modifier = Modifier.height(8.dp))
        DateTimeValidationError()
    }
}

@Composable
private fun DateTimeRow(
    date: String,
    hour: Int,
    minute: Int,
    onDateClick: () -> Unit,
    onTimeClick: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        DateCard(
            date = date,
            onClick = onDateClick,
            modifier = Modifier.weight(1f)
        )
        
        TimeCard(
            hour = hour,
            minute = minute,
            onClick = onTimeClick,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun DateCard(date: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    OutlinedCard(
        modifier = modifier,
        onClick = onClick
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
                    text = date,
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        }
    }
}

@Composable
private fun TimeCard(hour: Int, minute: Int, onClick: () -> Unit, modifier: Modifier = Modifier) {
    OutlinedCard(
        modifier = modifier,
        onClick = onClick
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
                    text = String.format("%02d:%02d", hour, minute),
                    style = MaterialTheme.typography.bodyMedium
                )
            }
        }
    }
}

@Composable
private fun DateTimeValidationError() {
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

@Composable
private fun ProceedToPaymentButton(
    enabled: Boolean,
    totalPrice: Double,
    onProceed: () -> Unit
) {
    Button(
        onClick = onProceed,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth()
    ) {
        Text("Proceed to Payment - $${String.format("%.2f", totalPrice)}")
    }
}

@Composable
private fun DateTimePickerDialogs(
    dateTimeState: DateTimeState,
    onPickupDateSelected: (Long) -> Unit,
    onPickupTimeSelected: (Int, Int) -> Unit,
    onReturnDateSelected: (Long) -> Unit,
    onReturnTimeSelected: (Int, Int) -> Unit,
    onDismiss: (String) -> Unit
) {
    if (dateTimeState.showPickupDatePicker) {
        DatePickerDialog(
            onDateSelected = onPickupDateSelected,
            onDismiss = { onDismiss("pickupDate") },
            title = "Select Pickup Date",
            initialDateMillis = dateTimeState.selectedPickupDateMillis,
            minDateOffsetDays = 0
        )
    }
    
    if (dateTimeState.showPickupTimeDialog) {
        TimePickerDialog(
            initialHour = dateTimeState.pickupHour,
            initialMinute = dateTimeState.pickupMinute,
            onTimeSelected = onPickupTimeSelected,
            onDismiss = { onDismiss("pickupTime") }
        )
    }
    
    if (dateTimeState.showReturnDatePicker) {
        DatePickerDialog(
            onDateSelected = onReturnDateSelected,
            onDismiss = { onDismiss("returnDate") },
            title = "Select Return Date",
            initialDateMillis = dateTimeState.selectedReturnDateMillis,
            minDateOffsetDays = 1
        )
    }
    
    if (dateTimeState.showReturnTimeDialog) {
        TimePickerDialog(
            initialHour = dateTimeState.returnHour,
            initialMinute = dateTimeState.returnMinute,
            onTimeSelected = onReturnTimeSelected,
            onDismiss = { onDismiss("returnTime") }
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
            PriceTotalRow(priceBreakdown.total)
            
            ExpandBreakdownButton(
                isExpanded = isExpanded,
                onToggle = { isExpanded = !isExpanded }
            )
            
            if (isExpanded) {
                Spacer(modifier = Modifier.height(8.dp))
                PriceBreakdownDetails(priceBreakdown)
            }
        }
    }
}

@Composable
private fun PriceTotalRow(total: Double) {
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
            text = "$${String.format("%.2f", total)}",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary
        )
    }
}

@Composable
private fun ExpandBreakdownButton(isExpanded: Boolean, onToggle: () -> Unit) {
    TextButton(
        onClick = onToggle,
        modifier = Modifier.fillMaxWidth()
    ) {
        Text(if (isExpanded) "Hide breakdown" else "Show breakdown")
    }
}

@Composable
private fun PriceBreakdownDetails(priceBreakdown: PriceBreakdown) {
    priceBreakdown.boxDetails.forEach { boxItem ->
        PriceRow(
            label = "${boxItem.boxType} (${boxItem.quantity}×)",
            amount = boxItem.totalPrice
        )
    }
    
    PriceRow(
        label = "Rental (${priceBreakdown.days} days)",
        amount = priceBreakdown.dailyFee
    )
    
    PriceRow(
        label = "Service & Distance Fee",
        amount = priceBreakdown.serviceFee
    )
}

@Composable
private fun PriceRow(label: String, amount: Double) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium
        )
        Text(
            text = "$${String.format("%.2f", amount)}",
            style = MaterialTheme.typography.bodyMedium
        )
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
    
    val emailRegex = "^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$".toRegex()
    
    fun validateFields(): Boolean {
        return validateName(paymentDetails.cardholderName) { nameError = it } &&
               validateEmail(paymentDetails.email, emailRegex) { emailError = it }
    }
    
    Column {
        OrderSummarySection(orderRequest)
        
        Spacer(modifier = Modifier.height(24.dp))
        
        TestCardSelectionSection(
            selectedCard = selectedTestCard,
            showSelector = showCardSelector,
            onShowSelector = { showCardSelector = it },
            onCardSelected = { card ->
                selectedTestCard = card
                showCardSelector = false
            }
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        CustomerInformationSection(
            paymentDetails = paymentDetails,
            onPaymentDetailsChange = onPaymentDetailsChange,
            nameError = nameError,
            emailError = emailError,
            isSubmitting = isSubmitting,
            onNameChanged = { if (nameError != null) nameError = null },
            onEmailChanged = { if (emailError != null) emailError = null }
        )
        
        Spacer(modifier = Modifier.height(32.dp))
        
        if (selectedTestCard.description.contains("Declined", ignoreCase = true)) {
            DeclinedCardWarning()
            Spacer(modifier = Modifier.height(16.dp))
        }
        
        PaymentActionButton(
            orderRequest = orderRequest,
            paymentDetails = paymentDetails,
            emailRegex = emailRegex,
            isSubmitting = isSubmitting,
            onValidateAndProceed = {
                if (validateFields()) showConfirmDialog = true
            }
        )
        
        if (showConfirmDialog) {
            PaymentConfirmationDialog(
                orderRequest = orderRequest,
                paymentDetails = paymentDetails,
                selectedCard = selectedTestCard,
                isSubmitting = isSubmitting,
                onConfirm = {
                    showConfirmDialog = false
                    onProcessPayment()
                },
                onDismiss = { showConfirmDialog = false }
            )
        }
    }
}

private fun validateName(name: String, onError: (String?) -> Unit): Boolean {
    return when {
        name.isBlank() -> {
            onError("Name is required")
            false
        }
        name.length < 2 -> {
            onError("Name must be at least 2 characters")
            false
        }
        !name.matches("^[a-zA-Z\\s'-]+$".toRegex()) -> {
            onError("Name contains invalid characters")
            false
        }
        else -> {
            onError(null)
            true
        }
    }
}

private fun validateEmail(email: String, emailRegex: Regex, onError: (String?) -> Unit): Boolean {
    return when {
        email.isBlank() -> {
            onError("Email is required")
            false
        }
        !email.matches(emailRegex) -> {
            onError("Please enter a valid email address")
            false
        }
        else -> {
            onError(null)
            true
        }
    }
}

@Composable
private fun OrderSummarySection(orderRequest: OrderRequest) {
    Text(
        text = "Order Summary",
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(bottom = 8.dp)
    )
    
    OutlinedCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
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
}

@Composable
private fun TestCardSelectionSection(
    selectedCard: TestCard,
    showSelector: Boolean,
    onShowSelector: (Boolean) -> Unit,
    onCardSelected: (TestCard) -> Unit
) {
    Text(
        text = "Payment Method (Demo)",
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold
    )
    
    Spacer(modifier = Modifier.height(8.dp))
    
    OutlinedCard(
        modifier = Modifier.fillMaxWidth(),
        onClick = { onShowSelector(true) }
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = selectedCard.description,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = "**** **** **** ${selectedCard.number.takeLast(4)}",
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
    
    if (showSelector) {
        Spacer(modifier = Modifier.height(8.dp))
        Card {
            LazyColumn {
                items(TestPaymentMethods.TEST_CARDS) { testCard ->
                    ListItem(
                        headlineContent = { Text(testCard.description) },
                        supportingContent = { Text("**** **** **** ${testCard.number.takeLast(4)}") },
                        modifier = Modifier.clickable { onCardSelected(testCard) }
                    )
                }
            }
        }
    }
}

@Composable
private fun CustomerInformationSection(
    paymentDetails: PaymentDetails,
    onPaymentDetailsChange: (PaymentDetails) -> Unit,
    nameError: String?,
    emailError: String?,
    isSubmitting: Boolean,
    onNameChanged: () -> Unit,
    onEmailChanged: () -> Unit
) {
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
            onNameChanged()
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
            onEmailChanged()
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
}

@Composable
private fun DeclinedCardWarning() {
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
}

@Composable
private fun PaymentActionButton(
    orderRequest: OrderRequest,
    paymentDetails: PaymentDetails,
    emailRegex: Regex,
    isSubmitting: Boolean,
    onValidateAndProceed: () -> Unit
) {
    val canProcessPayment = paymentDetails.cardholderName.isNotBlank() && 
                           paymentDetails.email.matches(emailRegex)
    
    Button(
        onClick = onValidateAndProceed,
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
}

@Composable
private fun PaymentConfirmationDialog(
    orderRequest: OrderRequest,
    paymentDetails: PaymentDetails,
    selectedCard: TestCard,
    isSubmitting: Boolean,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Confirm Payment") },
        text = {
            Column {
                Text("Please confirm the payment details:")
                Spacer(modifier = Modifier.height(12.dp))
                Text("Amount: $${String.format("%.2f", orderRequest.totalPrice)}", fontWeight = FontWeight.Bold)
                Text("Name: ${paymentDetails.cardholderName}")
                Text("Email: ${paymentDetails.email}")
                Text("Card: ${selectedCard.description}")
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
                onClick = onConfirm,
                enabled = !isSubmitting
            ) {
                Text("Confirm & Pay")
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                enabled = !isSubmitting
            ) {
                Text("Cancel")
            }
        }
    )
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
        SuccessIcon()
        
        Spacer(modifier = Modifier.height(24.dp))
        
        ConfirmationMessage()
        
        Spacer(modifier = Modifier.height(24.dp))
        
        OrderDetailsCard(orderRequest)
        
        Spacer(modifier = Modifier.height(32.dp))
        
        Button(
            onClick = onClose,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Close")
        }
    }
}

@Composable
private fun SuccessIcon() {
    Card(
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer
        ),
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
}

@Composable
private fun ConfirmationMessage() {
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
}

@Composable
private fun OrderDetailsCard(orderRequest: OrderRequest) {
    OutlinedCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "Order Details",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            OrderDetailRow("Total Amount:", "$${String.format("%.2f", orderRequest.totalPrice)}")
            OrderDetailRow("Boxes:", "${orderRequest.boxQuantities.sumOf { it.quantity }} boxes")
            OrderDetailRow("Return Date:", orderRequest.returnDate)
        }
    }
}

@Composable
private fun OrderDetailRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label)
        Text(value, fontWeight = if (label.contains("Total")) FontWeight.Medium else null)
    }
}

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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.TimeoutCancellationException
import java.text.SimpleDateFormat
import java.util.*
import android.content.Context

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
    var isSubmitting by remember { mutableStateOf(false) }
    
    // Error handling
    var errorMessage by remember { mutableStateOf<String?>(null) }
    
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    
    Column(
        modifier = modifier.padding(24.dp)
    ) {
        OrderCreationHeader(
            currentStep = currentStep,
            onDismiss = onDismiss,
            onBack = { 
                currentStep = when(currentStep) {
                    OrderCreationStep.BOX_SELECTION -> OrderCreationStep.ADDRESS_CAPTURE
                    OrderCreationStep.PAYMENT_DETAILS -> OrderCreationStep.BOX_SELECTION
                    OrderCreationStep.PROCESSING_PAYMENT -> OrderCreationStep.PAYMENT_DETAILS
                    else -> OrderCreationStep.ADDRESS_CAPTURE
                }
            }
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        ErrorMessageDisplay(errorMessage = errorMessage)
        
        OrderCreationStepContent(
            currentStep = currentStep,
            studentAddress = studentAddress,
            pricingRules = pricingRules,
            orderRequest = orderRequest,
            paymentDetails = paymentDetails,
            isSubmitting = isSubmitting,
            onAddressConfirmed = { address ->
                studentAddress = address
                currentStep = OrderCreationStep.LOADING_QUOTE
                errorMessage = null
                
                coroutineScope.launch {
                    handleQuoteFetch(
                        orderViewModel = orderViewModel,
                        address = address,
                        onSuccess = { quoteResponse ->
                            warehouseAddress = quoteResponse.warehouseAddress
                            pricingRules = PricingRules(distanceServiceFee = quoteResponse.distancePrice)
                            currentStep = OrderCreationStep.BOX_SELECTION
                        },
                        onError = { error ->
                            errorMessage = error
                            currentStep = OrderCreationStep.ADDRESS_CAPTURE
                        }
                    )
                }
            },
            onAddressError = { error -> errorMessage = error },
            onProceedToPayment = { order ->
                orderRequest = order
                currentStep = OrderCreationStep.PAYMENT_DETAILS
                errorMessage = null
            },
            onPaymentDetailsChange = { details -> paymentDetails = details },
            onProcessPayment = {
                orderRequest?.let { order ->
                    if (!isSubmitting) {
                        isSubmitting = true
                        currentStep = OrderCreationStep.PROCESSING_PAYMENT
                        errorMessage = null
                        
                        coroutineScope.launch {
                            handlePaymentProcessing(
                                order = order,
                                paymentDetails = paymentDetails,
                                paymentRepository = paymentRepository,
                                onSuccess = { intentId ->
                                    onSubmitOrder(order, intentId)
                                    currentStep = OrderCreationStep.ORDER_CONFIRMATION
                                },
                                onError = { error ->
                                    errorMessage = error
                                    currentStep = OrderCreationStep.PAYMENT_DETAILS
                                    isSubmitting = false
                                }
                            )
                        }
                    }
                }
            },
            onClose = onDismiss
        )
    }
}

@Composable
private fun OrderCreationHeader(
    currentStep: OrderCreationStep,
    onDismiss: () -> Unit,
    onBack: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (currentStep != OrderCreationStep.ADDRESS_CAPTURE) {
                IconButton(onClick = onBack) {
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
}

@Composable
fun ErrorMessageDisplay(errorMessage: String?) {
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
}

@Composable
private fun OrderCreationStepContent(
    currentStep: OrderCreationStep,
    studentAddress: Address?,
    pricingRules: PricingRules?,
    orderRequest: OrderRequest?,
    paymentDetails: PaymentDetails,
    isSubmitting: Boolean,
    onAddressConfirmed: (Address) -> Unit,
    onAddressError: (String) -> Unit,
    onProceedToPayment: (OrderRequest) -> Unit,
    onPaymentDetailsChange: (PaymentDetails) -> Unit,
    onProcessPayment: () -> Unit,
    onClose: () -> Unit
) {
    when (currentStep) {
        OrderCreationStep.ADDRESS_CAPTURE -> {
            AddressCaptureStep(
                onAddressConfirmed = onAddressConfirmed,
                onError = onAddressError
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
                    onProceedToPayment = onProceedToPayment
                )
            }
        }
        
        OrderCreationStep.PAYMENT_DETAILS -> {
            orderRequest?.let { order ->
                PaymentDetailsStep(
                    orderRequest = order,
                    paymentDetails = paymentDetails,
                    onPaymentDetailsChange = onPaymentDetailsChange,
                    isSubmitting = isSubmitting,
                    onProcessPayment = onProcessPayment
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
                    onClose = onClose
                )
            }
        }
    }
}

private suspend fun handleQuoteFetch(
    orderViewModel: OrderViewModel,
    address: Address,
    onSuccess: (GetQuoteResponse) -> Unit,
    onError: (String) -> Unit
) {
    try {
        val result = orderViewModel.getQuote(address)
        result.fold(
            onSuccess = onSuccess,
            onFailure = { exception: Throwable ->
                onError("Failed to get pricing: ${exception.message}")
            }
        )
    } catch (e: java.io.IOException) {
        onError("Network error while fetching pricing. Please check your connection and try again.")
    } catch (e: retrofit2.HttpException) {
        onError("Server error while fetching pricing. Please try again later.")
    } catch (e: com.google.gson.JsonSyntaxException) {
        onError("Unexpected response from server. Please try again.")
    }
}

private suspend fun handlePaymentProcessing(
    order: OrderRequest,
    paymentDetails: PaymentDetails,
    paymentRepository: PaymentRepository,
    onSuccess: (String) -> Unit,
    onError: (String) -> Unit
) {
    try {
        withTimeout(30000L) {
            val intentResult = paymentRepository.createPaymentIntent(order.totalPrice)
            intentResult.fold(
                onSuccess = { intent ->
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
                    
                    val paymentResult = paymentRepository.processPayment(
                        intent.id,
                        customerInfo,
                        TestPaymentMethods.VISA_SUCCESS
                    )
                    
                    paymentResult.fold(
                        onSuccess = { payment ->
                            if (payment.status == "SUCCEEDED") {
                                onSuccess(intent.id)
                            } else {
                                onError("Payment was declined. Please try a different payment method.")
                            }
                        },
                        onFailure = { exception ->
                            onError("Payment processing failed: ${exception.message}")
                        }
                    )
                },
                onFailure = { exception ->
                    onError("Failed to initialize payment: ${exception.message}")
                }
            )
        }
    } catch (e: TimeoutCancellationException) {
        onError("Payment request timed out. Please check your connection and try again.")
    } catch (e: java.io.IOException) {
        onError("Network error during payment. Please check your connection and try again.")
    } catch (e: retrofit2.HttpException) {
        onError("Payment server error. Please try again later.")
    } catch (e: com.google.gson.JsonSyntaxException) {
        onError("Unexpected response during payment. Please try again.")
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
    
    var addressInput by remember { mutableStateOf("") }
    var selectedAddress by remember { mutableStateOf<SelectedAddress?>(null) }
    var isValidating by remember { mutableStateOf(false) }

    Column {
        AddressCaptureInstructions()
        
        AddressAutocompleteField(
            value = addressInput,
            onValueChange = { 
                addressInput = it
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
        
        AddressValidationButton(
            isValidating = isValidating,
            hasSelectedAddress = selectedAddress != null,
            onValidate = {
                handleAddressValidation(
                    selectedAddress = selectedAddress,
                    context = context,
                    coroutineScope = coroutineScope,
                    onAddressConfirmed = onAddressConfirmed,
                    onError = onError,
                    onValidatingChange = { isValidating = it }
                )
            }
        )
    }
}

@Composable
private fun AddressCaptureInstructions() {
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
}

@Composable
private fun AddressValidationButton(
    isValidating: Boolean,
    hasSelectedAddress: Boolean,
    onValidate: () -> Unit
) {
    Button(
        onClick = onValidate,
        enabled = !isValidating && hasSelectedAddress,
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

private fun handleAddressValidation(
    selectedAddress: SelectedAddress?,
    context: Context,
    coroutineScope: CoroutineScope,
    onAddressConfirmed: (Address) -> Unit,
    onError: (String) -> Unit,
    onValidatingChange: (Boolean) -> Unit
) {
    if (selectedAddress == null) {
        onError("Please select an address from the suggestions")
        return
    }
    
    onValidatingChange(true)
    coroutineScope.launch {
        try {
            val validationResult = LocationUtils.validateAndGeocodeAddress(
                context,
                selectedAddress.formattedAddress
            )

            if (validationResult.isValid && validationResult.coordinates != null) {
                val address = Address(
                    lat = selectedAddress.latitude,
                    lon = selectedAddress.longitude,
                    formattedAddress = selectedAddress.formattedAddress
                )
                onAddressConfirmed(address)
            } else {
                onError(validationResult.errorMessage ?: "Invalid address. Please select a valid address within Greater Vancouver.")
                onValidatingChange(false)
            }
        } catch (e: java.io.IOException) {
            onError("Network error validating address. Please check your connection and try again.")
            onValidatingChange(false)
        } catch (e: IllegalArgumentException) {
            onError("Invalid address format. Please enter a valid address.")
            onValidatingChange(false)
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

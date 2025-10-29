package com.cpen321.usermanagement.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.cpen321.usermanagement.data.local.models.Address
import com.cpen321.usermanagement.data.local.models.CreateReturnJobRequest
import com.cpen321.usermanagement.data.local.models.Order
import com.cpen321.usermanagement.data.local.models.TestPaymentMethods
import com.cpen321.usermanagement.data.local.models.TestCard
import com.cpen321.usermanagement.data.local.models.CustomerInfo
import com.cpen321.usermanagement.data.local.models.PaymentAddress
import com.cpen321.usermanagement.data.repository.PaymentRepository
import com.cpen321.usermanagement.ui.components.shared.DatePickerDialog
import com.cpen321.usermanagement.utils.LocationUtils
import com.cpen321.usermanagement.utils.TimeUtils
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateReturnJobBottomSheet(
    activeOrder: Order,
    paymentRepository: PaymentRepository,
    onDismiss: () -> Unit,
    onSubmit: (CreateReturnJobRequest, String?) -> Unit
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    
    // Step state
    var currentStep by remember { mutableStateOf(ReturnJobStep.SELECT_DATE) }
    
    // Error handling
    var errorMessage by remember { mutableStateOf<String?>(null) }

    // Date selection state
    var selectedDateMillis by remember { 
        mutableStateOf(System.currentTimeMillis())
    }
    var returnHour by remember { mutableStateOf(17) } // Default 5 PM
    var returnMinute by remember { mutableStateOf(0) }
    var showDatePicker by remember { mutableStateOf(false) }
    var showTimeDialog by remember { mutableStateOf(false) }
    
    // Address state
    var useCustomAddress by remember { mutableStateOf(false) }
    var addressInput by remember { mutableStateOf("") }
    var selectedAddress by remember { mutableStateOf<SelectedAddress?>(null) }
    var customAddress by remember { mutableStateOf<Address?>(null) }
    var isValidating by remember { mutableStateOf(false) }
    
    // Fee calculation
    val expectedReturnDate = remember { 
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.parse(activeOrder.returnTime)?.time ?: System.currentTimeMillis()
    }
    
    val daysDifference = remember(selectedDateMillis) {
        val diff = (selectedDateMillis - expectedReturnDate) / (1000 * 60 * 60 * 24)
        diff.toInt()
    }
    
    val adjustmentAmount = remember(daysDifference) {
        Math.abs(daysDifference) * 5.0
    }
    
    val isEarlyReturn = daysDifference < 0
    val isLateReturn = daysDifference > 0
    
    // Payment state
    var isProcessingPayment by remember { mutableStateOf(false) }
    var paymentIntentId by remember { mutableStateOf<String?>(null) }
    
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        modifier = Modifier.fillMaxHeight(0.9f)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp)
                .navigationBarsPadding()
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Confirm Order Return",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold
                )
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

            // Content based on step
            when (currentStep) {
                ReturnJobStep.SELECT_DATE -> {
                    DateSelectionStep(
                        DateSelectionState(
                            expectedReturnDate = TimeUtils.formatDatePickerDate(expectedReturnDate),
                            selectedDate = TimeUtils.formatDatePickerDate(selectedDateMillis),
                            returnHour = returnHour,
                            returnMinute = returnMinute,
                            daysDifference = daysDifference,
                            adjustmentAmount = adjustmentAmount,
                            isEarlyReturn = isEarlyReturn,
                            isLateReturn = isLateReturn
                        ),
                        DateSelectionActions(
                            onDateClick = { showDatePicker = true },
                            onTimeClick = { showTimeDialog = true },
                            onNext = {
                                if (isLateReturn) {
                                    currentStep = ReturnJobStep.PAYMENT
                                } else {
                                    currentStep = ReturnJobStep.ADDRESS
                                }
                            }
                        )
                    )
                }
                
                ReturnJobStep.ADDRESS -> {
                    AddressSelectionStep(
                        defaultAddress = activeOrder.returnAddress?.formattedAddress 
                            ?: activeOrder.studentAddress.formattedAddress,
                        useCustomAddress = useCustomAddress,
                        onUseCustomAddressChange = { 
                            useCustomAddress = it
                            // Reset when switching
                            if (it) {
                                addressInput = ""
                                selectedAddress = null
                            }
                        },
                        streetAddress = addressInput,
                        onStreetAddressChange = { 
                            addressInput = it
                            // Clear selected address when user starts typing again
                            if (selectedAddress != null && it != selectedAddress?.formattedAddress) {
                                selectedAddress = null
                            }
                        },
                        selectedAddress = selectedAddress,
                        onAddressSelected = { address ->
                            selectedAddress = address
                            addressInput = address.formattedAddress
                        },
                        isValidating = isValidating,
                        onConfirm = {
                            if (useCustomAddress) {
                                if (selectedAddress == null) {
                                    return@AddressSelectionStep
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
                                            customAddress = Address(
                                                lat = selectedAddress!!.latitude,
                                                lon = selectedAddress!!.longitude,
                                                formattedAddress = selectedAddress!!.formattedAddress
                                            )
                                            
                                            // Submit the return job
                                            submitReturnJob(
                                                selectedDateMillis = selectedDateMillis,
                                                returnHour = returnHour,
                                                returnMinute = returnMinute,
                                                customAddress = customAddress,
                                                isEarlyReturn = isEarlyReturn,
                                                paymentIntentId = paymentIntentId,
                                                onSubmit = onSubmit
                                            )
                                        } else {
                                            // Address is invalid or outside service area
                                            errorMessage = validationResult.errorMessage ?: "Invalid address. Please select a valid address within Greater Vancouver."
                                            isValidating = false
                                        }
                                    } catch (e: Exception) {
                                        errorMessage = "Failed to validate address. Please try again."
                                        isValidating = false
                                    }
                                }
                            } else {
                                // Use default address
                                submitReturnJob(
                                    selectedDateMillis = selectedDateMillis,
                                    returnHour = returnHour,
                                    returnMinute = returnMinute,
                                    customAddress = null,
                                    isEarlyReturn = isEarlyReturn,
                                    paymentIntentId = paymentIntentId,
                                    onSubmit = onSubmit
                                )
                            }
                        }
                    )
                }
                
                ReturnJobStep.PAYMENT -> {
                    PaymentStep(
                        lateFee = adjustmentAmount,
                        isProcessing = isProcessingPayment,
                        onPayment = { selectedCard ->
                            isProcessingPayment = true
                            coroutineScope.launch {
                                try {
                                    val intentResult = paymentRepository.createPaymentIntent(adjustmentAmount)
                                    
                                    intentResult.fold(
                                        onSuccess = { intent ->
                                            val customerInfo = CustomerInfo(
                                                name = "Student",
                                                email = "student@example.com",
                                                address = PaymentAddress(
                                                    line1 = activeOrder.studentAddress.formattedAddress,
                                                    city = "Vancouver",
                                                    state = "BC",
                                                    postalCode = "V6T1Z4",
                                                    country = "CA"
                                                )
                                            )
                                            
                                            val paymentResult = paymentRepository.processPayment(
                                                intent.id,
                                                customerInfo,
                                                selectedCard.paymentMethodId
                                            )
                                            
                                            paymentResult.fold(
                                                onSuccess = { payment ->
                                                    if (payment.status == "SUCCEEDED") {
                                                        paymentIntentId = intent.id
                                                        currentStep = ReturnJobStep.ADDRESS
                                                    } else {
                                                        // Payment failed
                                                    }
                                                    isProcessingPayment = false
                                                },
                                                onFailure = { exception ->
                                                    // Handle payment error
                                                    isProcessingPayment = false
                                                }
                                            )
                                        },
                                        onFailure = { exception ->
                                            // Handle intent creation error
                                            isProcessingPayment = false
                                        }
                                    )
                                } catch (e: Exception) {
                                    // Handle payment error
                                    isProcessingPayment = false
                                }
                            }
                        }
                    )
                }
            }
        }
    }
    
    // Date Picker Dialog
    if (showDatePicker) {
        DatePickerDialog(
            onDateSelected = { dateMillis ->
                selectedDateMillis = dateMillis
            },
            onDismiss = { showDatePicker = false },
            title = "Select Return Date",
            initialDateMillis = selectedDateMillis,
            minDateOffsetDays = 0
        )
    }
    
    // Time Picker Dialog
    if (showTimeDialog) {
        TimePickerDialog(
            initialHour = returnHour,
            initialMinute = returnMinute,
            onTimeSelected = { hour, minute ->
                returnHour = hour
                returnMinute = minute
                showTimeDialog = false
            },
            onDismiss = { showTimeDialog = false }
        )
    }
}

private fun submitReturnJob(
    selectedDateMillis: Long,
    returnHour: Int,
    returnMinute: Int,
    customAddress: Address?,
    isEarlyReturn: Boolean,
    paymentIntentId: String?,
    onSubmit: (CreateReturnJobRequest, String?) -> Unit
) {
    // selectedDateMillis from DatePicker is in UTC at midnight
    // We need to extract the date components in UTC, then create Pacific time
    val pacificZone = TimeZone.getTimeZone("America/Los_Angeles")
    val utcZone = TimeZone.getTimeZone("UTC")
    
    // First, extract date components from the UTC milliseconds
    val utcCalendar = Calendar.getInstance(utcZone).apply {
        timeInMillis = selectedDateMillis
    }
    val year = utcCalendar.get(Calendar.YEAR)
    val month = utcCalendar.get(Calendar.MONTH)
    val day = utcCalendar.get(Calendar.DAY_OF_MONTH)
    
    // Now create a Pacific time calendar with those date components
    val pacificCalendar = Calendar.getInstance(pacificZone).apply {
        clear()
        set(year, month, day, returnHour, returnMinute, 0)
        set(Calendar.MILLISECOND, 0)
    }
    
    // Format to ISO in UTC
    val isoFormatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply {
        timeZone = utcZone
    }
    val actualReturnDate = isoFormatter.format(pacificCalendar.time)
    
    val request = CreateReturnJobRequest(
        returnAddress = customAddress,
        actualReturnDate = actualReturnDate
    )
    
    onSubmit(request, paymentIntentId)
}

data class DateSelectionState(
    val expectedReturnDate: String,
    val selectedDate: String,
    val returnHour: Int,
    val returnMinute: Int,
    val daysDifference: Int,
    val adjustmentAmount: Double,
    val isEarlyReturn: Boolean,
    val isLateReturn: Boolean
)

data class DateSelectionActions(
    val onDateClick: () -> Unit,
    val onTimeClick: () -> Unit,
    val onNext: () -> Unit
)

@Composable
private fun DateSelectionStep(
    state: DateSelectionState,
    actions: DateSelectionActions
) {
    Column {
        Text(
            text = "Select Return Date & Time",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Text(
            text = "Expected return date: ${state.expectedReturnDate}",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Date Card
            OutlinedCard(
                modifier = Modifier.weight(1f),
                onClick = actions.onDateClick
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
                            text = state.selectedDate,
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
            }
            
            // Time Card
            OutlinedCard(
                modifier = Modifier.weight(1f),
                onClick = actions.onTimeClick
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
                            text = String.format("%02d:%02d", state.returnHour, state.returnMinute),
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }
            }
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // Fee preview
        if (state.isEarlyReturn || state.isLateReturn) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = if (state.isEarlyReturn) 
                        MaterialTheme.colorScheme.primaryContainer 
                    else 
                        MaterialTheme.colorScheme.errorContainer
                )
            ) {
                Column(
                    modifier = Modifier.padding(16.dp)
                ) {
                    Text(
                        text = if (state.isEarlyReturn) "Early Return Refund" else "Late Return Fee",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold
                    )
                    
                    Spacer(modifier = Modifier.height(8.dp))
                    
                    Text(
                        text = if (state.isEarlyReturn) {
                            "You're returning ${Math.abs(state.daysDifference)} days early"
                        } else {
                            "You're returning ${state.daysDifference} days late"
                        },
                        style = MaterialTheme.typography.bodyMedium
                    )
                    
                    Spacer(modifier = Modifier.height(4.dp))
                    
                    Text(
                        text = if (state.isEarlyReturn) {
                            "You'll receive a refund of $${String.format("%.2f", state.adjustmentAmount)}"
                        } else {
                            "Additional charge: $${String.format("%.2f", state.adjustmentAmount)} (${Math.abs(state.daysDifference)} days × $5/day)"
                        },
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(24.dp))
        }
        
        Button(
            onClick = actions.onNext,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(if (state.isLateReturn) "Proceed to Payment" else "Continue")
        }
    }
}

@Composable
private fun AddressSelectionStep(
    defaultAddress: String,
    useCustomAddress: Boolean,
    onUseCustomAddressChange: (Boolean) -> Unit,
    streetAddress: String,
    onStreetAddressChange: (String) -> Unit,
    selectedAddress: SelectedAddress?,
    onAddressSelected: (SelectedAddress) -> Unit,
    isValidating: Boolean,
    onConfirm: () -> Unit
) {
    Column {
        Text(
            text = "Return Address",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        // Default address option
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            RadioButton(
                selected = !useCustomAddress,
                onClick = { onUseCustomAddressChange(false) }
            )
            Spacer(modifier = Modifier.width(8.dp))
            Column {
                Text(
                    text = "Use default address",
                    style = MaterialTheme.typography.bodyLarge
                )
                Text(
                    text = defaultAddress,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        // Custom address option
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            RadioButton(
                selected = useCustomAddress,
                onClick = { onUseCustomAddressChange(true) }
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "Use custom address",
                style = MaterialTheme.typography.bodyLarge
            )
        }
        
        if (useCustomAddress) {
            Spacer(modifier = Modifier.height(16.dp))
            
            Text(
                text = "Currently serving Greater Vancouver, BC only",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(bottom = 8.dp)
            )
            
            AddressAutocompleteField(
                value = streetAddress,
                onValueChange = onStreetAddressChange,
                onAddressSelected = onAddressSelected,
                label = "Enter Address",
                placeholder = "e.g. 123 Main St, Vancouver, BC",
                enabled = !isValidating,
                modifier = Modifier.fillMaxWidth()
            )
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Button(
            onClick = onConfirm,
            enabled = !isValidating && (!useCustomAddress || selectedAddress != null),
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
                Text("Confirm Return Details")
            }
        }
    }
}

@Composable
private fun PaymentStep(
    lateFee: Double,
    isProcessing: Boolean,
    onPayment: (TestCard) -> Unit
) {
    var selectedTestCard by remember { mutableStateOf(TestPaymentMethods.TEST_CARDS[0]) }
    var showCardSelector by remember { mutableStateOf(false) }
    
    Column {
        Text(
            text = "Payment Required",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.errorContainer
            )
        ) {
            Column(
                modifier = Modifier.padding(16.dp)
            ) {
                Text(
                    text = "Late Return Fee",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold
                )
                
                Spacer(modifier = Modifier.height(8.dp))
                
                Text(
                    text = "Total Amount Due",
                    style = MaterialTheme.typography.bodyMedium
                )
                
                Text(
                    text = "$${String.format("%.2f", lateFee)}",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold
                )
            }
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        // Test card selector
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
                        style = MaterialTheme.typography.titleSmall
                    )
                    Text(
                        text = "•••• ${selectedTestCard.number.takeLast(4)}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Icon(
                    Icons.Default.Edit,
                    contentDescription = "Change card"
                )
            }
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Button(
            onClick = { onPayment(selectedTestCard) },
            enabled = !isProcessing,
            modifier = Modifier.fillMaxWidth()
        ) {
            if (isProcessing) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Processing Payment...")
                }
            } else {
                Text("Pay $${String.format("%.2f", lateFee)}")
            }
        }
    }
    
    if (showCardSelector) {
        TestCardSelectorDialog(
            selectedCard = selectedTestCard,
            onCardSelected = { card ->
                selectedTestCard = card
                showCardSelector = false
            },
            onDismiss = { showCardSelector = false }
        )
    }
}

@Composable
private fun TestCardSelectorDialog(
    selectedCard: TestCard,
    onCardSelected: (TestCard) -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Select Test Card") },
        text = {
            Column {
                TestPaymentMethods.TEST_CARDS.forEach { card ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = card == selectedCard,
                            onClick = { onCardSelected(card) }
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Column {
                            Text(
                                text = card.description,
                                style = MaterialTheme.typography.bodyLarge
                            )
                            Text(
                                text = "•••• ${card.number.takeLast(4)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Done")
            }
        }
    )
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

private enum class ReturnJobStep {
    SELECT_DATE,
    PAYMENT,
    ADDRESS
}

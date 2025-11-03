package com.cpen321.usermanagement.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
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
    
    val returnJobState = rememberReturnJobState(activeOrder)
    
    ReturnJobBottomSheetContent(
        activeOrder = activeOrder,
        state = returnJobState,
        onDismiss = onDismiss,
        onSubmit = onSubmit,
        paymentRepository = paymentRepository,
        context = context,
        coroutineScope = coroutineScope
    )
}

@Composable
private fun rememberReturnJobState(activeOrder: Order): ReturnJobState {
    var currentStep by remember { mutableStateOf(ReturnJobStep.SELECT_DATE) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    
    var selectedDateMillis by remember { mutableStateOf(System.currentTimeMillis()) }
    var returnHour by remember { mutableStateOf(17) }
    var returnMinute by remember { mutableStateOf(0) }
    var showDatePicker by remember { mutableStateOf(false) }
    var showTimeDialog by remember { mutableStateOf(false) }
    
    var useCustomAddress by remember { mutableStateOf(false) }
    var addressInput by remember { mutableStateOf("") }
    var selectedAddress by remember { mutableStateOf<SelectedAddress?>(null) }
    var customAddress by remember { mutableStateOf<Address?>(null) }
    var isValidating by remember { mutableStateOf(false) }
    
    var isProcessingPayment by remember { mutableStateOf(false) }
    var paymentIntentId by remember { mutableStateOf<String?>(null) }
    
    val expectedReturnDate = remember(activeOrder.returnTime) {
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.parse(activeOrder.returnTime)?.time ?: System.currentTimeMillis()
    }
    
    val daysDifference = remember(selectedDateMillis, expectedReturnDate) {
        ((selectedDateMillis - expectedReturnDate) / (1000 * 60 * 60 * 24)).toInt()
    }
    
    val adjustmentAmount = Math.abs(daysDifference) * 5.0
    val isEarlyReturn = daysDifference < 0
    val isLateReturn = daysDifference > 0
    
    return ReturnJobState(
        currentStep = currentStep,
        onStepChange = { currentStep = it },
        errorMessage = errorMessage,
        onErrorChange = { errorMessage = it },
        selectedDateMillis = selectedDateMillis,
        onDateChange = { selectedDateMillis = it },
        returnHour = returnHour,
        onHourChange = { returnHour = it },
        returnMinute = returnMinute,
        onMinuteChange = { returnMinute = it },
        showDatePicker = showDatePicker,
        onDatePickerChange = { showDatePicker = it },
        showTimeDialog = showTimeDialog,
        onTimeDialogChange = { showTimeDialog = it },
        useCustomAddress = useCustomAddress,
        onUseCustomAddressChange = { useCustomAddress = it },
        addressInput = addressInput,
        onAddressInputChange = { addressInput = it },
        selectedAddress = selectedAddress,
        onSelectedAddressChange = { selectedAddress = it },
        customAddress = customAddress,
        onCustomAddressChange = { customAddress = it },
        isValidating = isValidating,
        onValidatingChange = { isValidating = it },
        isProcessingPayment = isProcessingPayment,
        onProcessingPaymentChange = { isProcessingPayment = it },
        paymentIntentId = paymentIntentId,
        onPaymentIntentIdChange = { paymentIntentId = it },
        expectedReturnDate = expectedReturnDate,
        daysDifference = daysDifference,
        adjustmentAmount = adjustmentAmount,
        isEarlyReturn = isEarlyReturn,
        isLateReturn = isLateReturn
    )
}

data class ReturnJobState(
    val currentStep: ReturnJobStep,
    val onStepChange: (ReturnJobStep) -> Unit,
    val errorMessage: String?,
    val onErrorChange: (String?) -> Unit,
    val selectedDateMillis: Long,
    val onDateChange: (Long) -> Unit,
    val returnHour: Int,
    val onHourChange: (Int) -> Unit,
    val returnMinute: Int,
    val onMinuteChange: (Int) -> Unit,
    val showDatePicker: Boolean,
    val onDatePickerChange: (Boolean) -> Unit,
    val showTimeDialog: Boolean,
    val onTimeDialogChange: (Boolean) -> Unit,
    val useCustomAddress: Boolean,
    val onUseCustomAddressChange: (Boolean) -> Unit,
    val addressInput: String,
    val onAddressInputChange: (String) -> Unit,
    val selectedAddress: SelectedAddress?,
    val onSelectedAddressChange: (SelectedAddress?) -> Unit,
    val customAddress: Address?,
    val onCustomAddressChange: (Address?) -> Unit,
    val isValidating: Boolean,
    val onValidatingChange: (Boolean) -> Unit,
    val isProcessingPayment: Boolean,
    val onProcessingPaymentChange: (Boolean) -> Unit,
    val paymentIntentId: String?,
    val onPaymentIntentIdChange: (String?) -> Unit,
    val expectedReturnDate: Long,
    val daysDifference: Int,
    val adjustmentAmount: Double,
    val isEarlyReturn: Boolean,
    val isLateReturn: Boolean
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReturnJobBottomSheetContent(
    activeOrder: Order,
    state: ReturnJobState,
    onDismiss: () -> Unit,
    onSubmit: (CreateReturnJobRequest, String?) -> Unit,
    paymentRepository: PaymentRepository,
    context: android.content.Context,
    coroutineScope: kotlinx.coroutines.CoroutineScope
) {
    
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
            ReturnJobHeader(onDismiss = onDismiss)
            
            Spacer(modifier = Modifier.height(24.dp))
            
            ErrorMessageDisplay(errorMessage = state.errorMessage)

            // Content based on step
            when (state.currentStep) {
                ReturnJobStep.SELECT_DATE -> {
                    DateSelectionStep(
                        DateSelectionState(
                            expectedReturnDate = TimeUtils.formatDatePickerDate(state.expectedReturnDate),
                            selectedDate = TimeUtils.formatDatePickerDate(state.selectedDateMillis),
                            returnHour = state.returnHour,
                            returnMinute = state.returnMinute,
                            daysDifference = state.daysDifference,
                            adjustmentAmount = state.adjustmentAmount,
                            isEarlyReturn = state.isEarlyReturn,
                            isLateReturn = state.isLateReturn
                        ),
                        DateSelectionActions(
                            onDateClick = { state.onDatePickerChange(true) },
                            onTimeClick = { state.onTimeDialogChange(true) },
                            onNext = {
                                state.onStepChange(
                                    if (state.isLateReturn) ReturnJobStep.PAYMENT else ReturnJobStep.ADDRESS
                                )
                            }
                        )
                    )
                }
                
                ReturnJobStep.ADDRESS -> {
                    AddressSelectionStep(
                        defaultAddress = activeOrder.returnAddress?.formattedAddress 
                            ?: activeOrder.studentAddress.formattedAddress,
                        useCustomAddress = state.useCustomAddress,
                        streetAddress = state.addressInput,
                        selectedAddress = state.selectedAddress,
                        isValidating = state.isValidating,
                        AddressSelectionActions(
                            onUseCustomAddressChange = { 
                                state.onUseCustomAddressChange(it)
                                if (it) {
                                    state.onAddressInputChange("")
                                    state.onSelectedAddressChange(null)
                                }
                            },
                            onStreetAddressChange = {
                                state.onAddressInputChange(it)
                                if (state.selectedAddress != null && it != state.selectedAddress?.formattedAddress) {
                                    state.onSelectedAddressChange(null)
                                }
                            },
                            onAddressSelected = { address ->
                                state.onSelectedAddressChange(address)
                                state.onAddressInputChange(address.formattedAddress)
                            },
                            onConfirm = {
                                handleAddressConfirmation(
                                    useCustomAddress = state.useCustomAddress,
                                    selectedAddress = state.selectedAddress,
                                    context = context,
                                    coroutineScope = coroutineScope,
                                    state = state,
                                    onSubmit = onSubmit
                                )
                            }
                        )
                    )
                }
                
                ReturnJobStep.PAYMENT -> {
                    PaymentStep(
                        lateFee = state.adjustmentAmount,
                        isProcessing = state.isProcessingPayment,
                        onPayment = { selectedCard ->
                            handlePaymentProcessing(
                                selectedCard = selectedCard,
                                adjustmentAmount = state.adjustmentAmount,
                                activeOrder = activeOrder,
                                paymentRepository = paymentRepository,
                                coroutineScope = coroutineScope,
                                state = state
                            )
                        }
                    )
                }
            }
        }
    }
    
    if (state.showDatePicker) {
        DatePickerDialog(
            onDateSelected = { dateMillis -> state.onDateChange(dateMillis) },
            onDismiss = { state.onDatePickerChange(false) },
            title = "Select Return Date",
            initialDateMillis = state.selectedDateMillis,
            minDateOffsetDays = 0
        )
    }
    
    if (state.showTimeDialog) {
        TimePickerDialog(
            onTimeSelected = { hour, minute ->
                state.onHourChange(hour)
                state.onMinuteChange(minute)
            },
            onDismiss = { state.onTimeDialogChange(false) },
            initialHour = state.returnHour,
            initialMinute = state.returnMinute
        )
    }
}

@Composable
private fun ReturnJobHeader(onDismiss: () -> Unit) {
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
}

private fun handleAddressConfirmation(
    useCustomAddress: Boolean,
    selectedAddress: SelectedAddress?,
    context: android.content.Context,
    coroutineScope: kotlinx.coroutines.CoroutineScope,
    state: ReturnJobState,
    onSubmit: (CreateReturnJobRequest, String?) -> Unit
) {
    if (useCustomAddress) {
        if (selectedAddress != null) {
            state.onValidatingChange(true)
            coroutineScope.launch {
                try {
                    val validationResult = LocationUtils.validateAndGeocodeAddress(
                        context,
                        selectedAddress.formattedAddress
                    )

                    if (validationResult.isValid && validationResult.coordinates != null) {
                        state.onCustomAddressChange(
                            Address(
                                lat = selectedAddress.latitude,
                                lon = selectedAddress.longitude,
                                formattedAddress = selectedAddress.formattedAddress
                            )
                        )

                        submitReturnJob(
                            selectedDateMillis = state.selectedDateMillis,
                            returnHour = state.returnHour,
                            returnMinute = state.returnMinute,
                            customAddress = state.customAddress,
                            isEarlyReturn = state.isEarlyReturn,
                            paymentIntentId = state.paymentIntentId,
                            onSubmit = onSubmit
                        )
                    } else {
                        state.onErrorChange(validationResult.errorMessage ?: "Invalid address. Please select a valid address within Greater Vancouver.")
                        state.onValidatingChange(false)
                    }
                } catch (e: java.io.IOException) {
                    state.onErrorChange("Network error validating address. Please check your connection and try again.")
                    state.onValidatingChange(false)
                } catch (e: IllegalArgumentException) {
                    state.onErrorChange("Invalid address format. Please enter a valid address.")
                    state.onValidatingChange(false)
                }
            }
        }
    } else {
        submitReturnJob(
            selectedDateMillis = state.selectedDateMillis,
            returnHour = state.returnHour,
            returnMinute = state.returnMinute,
            customAddress = null,
            isEarlyReturn = state.isEarlyReturn,
            paymentIntentId = state.paymentIntentId,
            onSubmit = onSubmit
        )
    }
}

private fun handlePaymentProcessing(
    selectedCard: TestCard,
    adjustmentAmount: Double,
    activeOrder: Order,
    paymentRepository: PaymentRepository,
    coroutineScope: kotlinx.coroutines.CoroutineScope,
    state: ReturnJobState
) {
    state.onProcessingPaymentChange(true)
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
                                state.onPaymentIntentIdChange(intent.id)
                                state.onStepChange(ReturnJobStep.ADDRESS)
                            }
                            state.onProcessingPaymentChange(false)
                        },
                        onFailure = {
                            state.onProcessingPaymentChange(false)
                        }
                    )
                },
                onFailure = {
                    state.onProcessingPaymentChange(false)
                }
            )
        } catch (e: Exception) {
            state.onProcessingPaymentChange(false)
        }
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
        DateSelectionHeader(expectedReturnDate = state.expectedReturnDate)
        
        Spacer(modifier = Modifier.height(16.dp))
        
        DateTimeSelectionCards(
            selectedDate = state.selectedDate,
            returnHour = state.returnHour,
            returnMinute = state.returnMinute,
            onDateClick = actions.onDateClick,
            onTimeClick = actions.onTimeClick
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        if (state.isEarlyReturn || state.isLateReturn) {
            FeePreviewCard(
                isEarlyReturn = state.isEarlyReturn,
                daysDifference = state.daysDifference,
                adjustmentAmount = state.adjustmentAmount
            )
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
private fun DateSelectionHeader(expectedReturnDate: String) {
    Text(
        text = "Select Return Date & Time",
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold
    )
    Spacer(modifier = Modifier.height(8.dp))
    Text(
        text = "Expected return date: $expectedReturnDate",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
}

@Composable
private fun DateTimeSelectionCards(
    selectedDate: String,
    returnHour: Int,
    returnMinute: Int,
    onDateClick: () -> Unit,
    onTimeClick: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        OutlinedCard(
            modifier = Modifier.weight(1f),
            onClick = onDateClick
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
                        text = selectedDate,
                        style = MaterialTheme.typography.bodyMedium
                    )
                }
            }
        }
        
        OutlinedCard(
            modifier = Modifier.weight(1f),
            onClick = onTimeClick
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
}

@Composable
private fun FeePreviewCard(
    isEarlyReturn: Boolean,
    daysDifference: Int,
    adjustmentAmount: Double
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (isEarlyReturn) 
                MaterialTheme.colorScheme.primaryContainer 
            else 
                MaterialTheme.colorScheme.errorContainer
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = if (isEarlyReturn) "Early Return Refund" else "Late Return Fee",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = if (isEarlyReturn) {
                    "You're returning ${Math.abs(daysDifference)} days early"
                } else {
                    "You're returning $daysDifference days late"
                },
                style = MaterialTheme.typography.bodyMedium
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = if (isEarlyReturn) {
                    "You'll receive a refund of $${String.format("%.2f", adjustmentAmount)}"
                } else {
                    "Additional charge: $${String.format("%.2f", adjustmentAmount)} (${Math.abs(daysDifference)} days × $5/day)"
                },
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

data class AddressSelectionActions(
    val onUseCustomAddressChange: (Boolean) -> Unit,
    val onStreetAddressChange: (String) -> Unit,
    val onAddressSelected: (SelectedAddress) -> Unit,
    val onConfirm: () -> Unit
)

@Composable
private fun AddressSelectionStep(
    defaultAddress: String,
    useCustomAddress: Boolean,
    streetAddress: String,
    selectedAddress: SelectedAddress?,
    isValidating: Boolean,
    actions: AddressSelectionActions
) {
    Column {
        Text(
            text = "Return Address",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        DefaultAddressOption(
            defaultAddress = defaultAddress,
            isSelected = !useCustomAddress,
            onSelect = { actions.onUseCustomAddressChange(false) }
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        CustomAddressOption(
            isSelected = useCustomAddress,
            onSelect = { actions.onUseCustomAddressChange(true) }
        )
        
        if (useCustomAddress) {
            Spacer(modifier = Modifier.height(16.dp))
            CustomAddressInput(
                streetAddress = streetAddress,
                onValueChange = actions.onStreetAddressChange,
                onAddressSelected = actions.onAddressSelected
            )
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        ConfirmAddressButton(
            isValidating = isValidating,
            isEnabled = !useCustomAddress || selectedAddress != null,
            onConfirm = actions.onConfirm
        )
    }
}

@Composable
private fun DefaultAddressOption(
    defaultAddress: String,
    isSelected: Boolean,
    onSelect: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(
            selected = isSelected,
            onClick = onSelect
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
}

@Composable
private fun CustomAddressOption(isSelected: Boolean, onSelect: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(
            selected = isSelected,
            onClick = onSelect
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = "Use custom address",
            style = MaterialTheme.typography.bodyLarge
        )
    }
}

@Composable
private fun CustomAddressInput(
    streetAddress: String,
    onValueChange: (String) -> Unit,
    onAddressSelected: (SelectedAddress) -> Unit
) {
    Text(
        text = "Currently serving Greater Vancouver, BC only",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.primary,
        fontWeight = FontWeight.Medium,
        modifier = Modifier.padding(bottom = 8.dp)
    )
    
    AddressAutocompleteField(
        value = streetAddress,
        onValueChange = onValueChange,
        onAddressSelected = onAddressSelected,
        modifier = Modifier.fillMaxWidth()
    )
}

@Composable
private fun ConfirmAddressButton(
    isValidating: Boolean,
    isEnabled: Boolean,
    onConfirm: () -> Unit
) {
    Button(
        onClick = onConfirm,
        enabled = !isValidating && isEnabled,
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
        
        LateFeeCard(lateFee)
        
        Spacer(modifier = Modifier.height(24.dp))
        
        TestCardSelector(
            selectedCard = selectedTestCard,
            onShowSelector = { showCardSelector = true }
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        PaymentButton(
            lateFee = lateFee,
            isProcessing = isProcessing,
            onPayment = { onPayment(selectedTestCard) }
        )
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
private fun LateFeeCard(lateFee: Double) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
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
}

@Composable
private fun TestCardSelector(selectedCard: TestCard, onShowSelector: () -> Unit) {
    OutlinedCard(
        modifier = Modifier.fillMaxWidth(),
        onClick = onShowSelector
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = selectedCard.description,
                    style = MaterialTheme.typography.titleSmall
                )
                Text(
                    text = "•••• ${selectedCard.number.takeLast(4)}",
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
}

@Composable
private fun PaymentButton(
    lateFee: Double,
    isProcessing: Boolean,
    onPayment: () -> Unit
) {
    Button(
        onClick = onPayment,
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


enum class ReturnJobStep {
    SELECT_DATE,
    PAYMENT,
    ADDRESS
}

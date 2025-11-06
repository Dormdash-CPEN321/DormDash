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
import androidx.compose.ui.platform.testTag
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
    val stateValues = rememberReturnJobStateValues(activeOrder)
    
    return ReturnJobState(
        currentStep = stateValues.currentStep.value,
        onStepChange = { stateValues.currentStep.value = it },
        errorMessage = stateValues.errorMessage.value,
        onErrorChange = { stateValues.errorMessage.value = it },
        selectedDateMillis = stateValues.selectedDateMillis.value,
        onDateChange = { stateValues.selectedDateMillis.value = it },
        returnHour = stateValues.returnHour.value,
        onHourChange = { stateValues.returnHour.value = it },
        returnMinute = stateValues.returnMinute.value,
        onMinuteChange = { stateValues.returnMinute.value = it },
        showDatePicker = stateValues.showDatePicker.value,
        onDatePickerChange = { stateValues.showDatePicker.value = it },
        showTimeDialog = stateValues.showTimeDialog.value,
        onTimeDialogChange = { stateValues.showTimeDialog.value = it },
        useCustomAddress = stateValues.useCustomAddress.value,
        onUseCustomAddressChange = { stateValues.useCustomAddress.value = it },
        addressInput = stateValues.addressInput.value,
        onAddressInputChange = { stateValues.addressInput.value = it },
        selectedAddress = stateValues.selectedAddress.value,
        onSelectedAddressChange = { stateValues.selectedAddress.value = it },
        customAddress = stateValues.customAddress.value,
        onCustomAddressChange = { stateValues.customAddress.value = it },
        isValidating = stateValues.isValidating.value,
        onValidatingChange = { stateValues.isValidating.value = it },
        isProcessingPayment = stateValues.isProcessingPayment.value,
        onProcessingPaymentChange = { stateValues.isProcessingPayment.value = it },
        paymentIntentId = stateValues.paymentIntentId.value,
        onPaymentIntentIdChange = { stateValues.paymentIntentId.value = it },
        expectedReturnDate = stateValues.expectedReturnDate,
        daysDifference = stateValues.daysDifference,
        adjustmentAmount = stateValues.adjustmentAmount,
        isEarlyReturn = stateValues.isEarlyReturn,
        isLateReturn = stateValues.isLateReturn
    )
}

@Composable
private fun rememberReturnJobStateValues(activeOrder: Order): ReturnJobStateValues {
    val currentStep = remember { mutableStateOf(ReturnJobStep.SELECT_DATE) }
    val errorMessage = remember { mutableStateOf<String?>(null) }
    val selectedDateMillis = remember { mutableStateOf(System.currentTimeMillis()) }
    val returnHour = remember { mutableStateOf(17) }
    val returnMinute = remember { mutableStateOf(0) }
    val showDatePicker = remember { mutableStateOf(false) }
    val showTimeDialog = remember { mutableStateOf(false) }
    val useCustomAddress = remember { mutableStateOf(false) }
    val addressInput = remember { mutableStateOf("") }
    val selectedAddress = remember { mutableStateOf<SelectedAddress?>(null) }
    val customAddress = remember { mutableStateOf<Address?>(null) }
    val isValidating = remember { mutableStateOf(false) }
    val isProcessingPayment = remember { mutableStateOf(false) }
    val paymentIntentId = remember { mutableStateOf<String?>(null) }
    
    val expectedReturnDate = remember(activeOrder.returnTime) {
        SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.parse(activeOrder.returnTime)?.time ?: System.currentTimeMillis()
    }
    
    val daysDifference = remember(selectedDateMillis.value, expectedReturnDate) {
        ((selectedDateMillis.value - expectedReturnDate) / (1000 * 60 * 60 * 24)).toInt()
    }
    
    return ReturnJobStateValues(
        currentStep, errorMessage, selectedDateMillis, returnHour, returnMinute,
        showDatePicker, showTimeDialog, useCustomAddress, addressInput, selectedAddress,
        customAddress, isValidating, isProcessingPayment, paymentIntentId,
        expectedReturnDate, daysDifference,
        Math.abs(daysDifference) * 5.0,
        daysDifference < 0,
        daysDifference > 0
    )
}

private data class ReturnJobStateValues(
    val currentStep: MutableState<ReturnJobStep>,
    val errorMessage: MutableState<String?>,
    val selectedDateMillis: MutableState<Long>,
    val returnHour: MutableState<Int>,
    val returnMinute: MutableState<Int>,
    val showDatePicker: MutableState<Boolean>,
    val showTimeDialog: MutableState<Boolean>,
    val useCustomAddress: MutableState<Boolean>,
    val addressInput: MutableState<String>,
    val selectedAddress: MutableState<SelectedAddress?>,
    val customAddress: MutableState<Address?>,
    val isValidating: MutableState<Boolean>,
    val isProcessingPayment: MutableState<Boolean>,
    val paymentIntentId: MutableState<String?>,
    val expectedReturnDate: Long,
    val daysDifference: Int,
    val adjustmentAmount: Double,
    val isEarlyReturn: Boolean,
    val isLateReturn: Boolean
)

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
            
            ReturnJobStepContent(
                activeOrder = activeOrder,
                state = state,
                context = context,
                coroutineScope = coroutineScope,
                paymentRepository = paymentRepository,
                onSubmit = onSubmit
            )
        }
    }
    
    ReturnJobDialogs(state = state)
}

@Composable
private fun ReturnJobStepContent(
    activeOrder: Order,
    state: ReturnJobState,
    context: android.content.Context,
    coroutineScope: kotlinx.coroutines.CoroutineScope,
    paymentRepository: PaymentRepository,
    onSubmit: (CreateReturnJobRequest, String?) -> Unit
) {
    when (state.currentStep) {
        ReturnJobStep.SELECT_DATE -> {
            DateStepHandler(state = state)
        }
        
        ReturnJobStep.ADDRESS -> {
            AddressStepHandler(
                activeOrder = activeOrder,
                state = state,
                context = context,
                coroutineScope = coroutineScope,
                onSubmit = onSubmit
            )
        }
        
        ReturnJobStep.PAYMENT -> {
            PaymentStepHandler(
                activeOrder = activeOrder,
                state = state,
                paymentRepository = paymentRepository,
                coroutineScope = coroutineScope
            )
        }
    }
}

@Composable
private fun DateStepHandler(state: ReturnJobState) {
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

@Composable
private fun AddressStepHandler(
    activeOrder: Order,
    state: ReturnJobState,
    context: android.content.Context,
    coroutineScope: kotlinx.coroutines.CoroutineScope,
    onSubmit: (CreateReturnJobRequest, String?) -> Unit
) {
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

@Composable
private fun PaymentStepHandler(
    activeOrder: Order,
    state: ReturnJobState,
    paymentRepository: PaymentRepository,
    coroutineScope: kotlinx.coroutines.CoroutineScope
) {
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

@Composable
private fun ReturnJobDialogs(state: ReturnJobState) {
    if (state.showDatePicker) {
        DatePickerDialog(
            onDateSelected = { dateMillis ->
                state.onDateChange(dateMillis)
                state.onDatePickerChange(false)
            },
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
                state.onTimeDialogChange(false)
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
                        val validatedAddress = Address(
                            lat = selectedAddress.latitude,
                            lon = selectedAddress.longitude,
                            formattedAddress = selectedAddress.formattedAddress
                        )
                        
                        state.onCustomAddressChange(validatedAddress)

                        submitReturnJob(
                            selectedDateMillis = state.selectedDateMillis,
                            returnHour = state.returnHour,
                            returnMinute = state.returnMinute,
                            customAddress = validatedAddress,
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
        } catch (e: java.io.IOException) {
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
            modifier = Modifier.fillMaxWidth().testTag("continue-button")
        ) {
            Text(if (state.isLateReturn) "Proceed to Payment" else "Continue")
        }
    }
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
        DateSelectionCard(
            selectedDate = selectedDate,
            onDateClick = onDateClick,
            modifier = Modifier.weight(1f)
        )
        
        TimeSelectionCard(
            returnHour = returnHour,
            returnMinute = returnMinute,
            onTimeClick = onTimeClick,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun DateSelectionCard(
    selectedDate: String,
    onDateClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    OutlinedCard(
        modifier = modifier,
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
}

@Composable
private fun TimeSelectionCard(
    returnHour: Int,
    returnMinute: Int,
    onTimeClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    OutlinedCard(
        modifier = modifier,
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


enum class ReturnJobStep {
    SELECT_DATE,
    PAYMENT,
    ADDRESS
}

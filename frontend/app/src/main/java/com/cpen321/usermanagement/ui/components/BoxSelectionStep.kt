package com.cpen321.usermanagement.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.cpen321.usermanagement.business.DynamicPriceCalculator
import com.cpen321.usermanagement.data.local.models.*
import com.cpen321.usermanagement.ui.components.shared.DatePickerDialog
import com.cpen321.usermanagement.utils.TimeUtils
import java.text.SimpleDateFormat
import java.util.*

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
fun BoxSelectionStep(
    pricingRules: PricingRules,
    studentAddress: Address,
    onProceedToPayment: (OrderRequest) -> Unit
) {
    var boxQuantities by remember {
        mutableStateOf(STANDARD_BOX_SIZES.map { BoxQuantity(it, 0) })
    }
    var dateTimeState by remember { mutableStateOf(DateTimeState()) } 
    
    val dateTimeCalculations = calculateDateTimeValues(dateTimeState)
    val calculator = remember { DynamicPriceCalculator(pricingRules) }
    val currentPrice = calculator.calculateTotal(boxQuantities, dateTimeCalculations.returnDate)
    val totalBoxes = boxQuantities.sumOf { it.quantity }
    val canSubmit = totalBoxes > 0 && !dateTimeCalculations.isReturnBeforePickup
    
    Column {
        BoxSelectionList(
            boxQuantities = boxQuantities,
            pricingRules = pricingRules,
            onQuantitiesChange = { boxQuantities = it }
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        DateTimeSelectionSection(
            display = DateTimeDisplay(
                pickupDate = dateTimeCalculations.pickupDate,
                pickupHour = dateTimeCalculations.pickupHour,
                pickupMinute = dateTimeCalculations.pickupMinute,
                returnDate = dateTimeCalculations.returnDate,
                returnHour = dateTimeCalculations.returnHour,
                returnMinute = dateTimeCalculations.returnMinute,
                isReturnBeforePickup = dateTimeCalculations.isReturnBeforePickup
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
                onProceedToPayment(createOrderRequest(
                    boxQuantities = boxQuantities,
                    studentAddress = studentAddress,
                    dateTimeState = dateTimeState,
                    returnDate = dateTimeCalculations.returnDate,
                    currentPrice = currentPrice
                ))
            }
        )
    }
    
    DateTimePickerDialogsHandler(
        dateTimeState = dateTimeState,
        onStateUpdate = { dateTimeState = it }
    )
}

private data class DateTimeCalculations(
    val pickupDate: String,
    val returnDate: String,
    val pickupDateTime: Long,
    val returnDateTime: Long,
    val isReturnBeforePickup: Boolean,
    val pickupHour: Int,
    val pickupMinute: Int,
    val returnHour: Int,
    val returnMinute: Int
)

private fun calculateDateTimeValues(state: DateTimeState): DateTimeCalculations {
    val pickupDate = TimeUtils.formatDatePickerDate(state.selectedPickupDateMillis)
    val returnDate = TimeUtils.formatDatePickerDate(state.selectedReturnDateMillis)
    val pickupDateTime = calculateDateTime(state.selectedPickupDateMillis, state.pickupHour, state.pickupMinute)
    val returnDateTime = calculateDateTime(state.selectedReturnDateMillis, state.returnHour, state.returnMinute)
    
    return DateTimeCalculations(
        pickupDate = pickupDate,
        returnDate = returnDate,
        pickupDateTime = pickupDateTime,
        returnDateTime = returnDateTime,
        isReturnBeforePickup = returnDateTime <= pickupDateTime,
        pickupHour = state.pickupHour,
        pickupMinute = state.pickupMinute,
        returnHour = state.returnHour,
        returnMinute = state.returnMinute
    )
}

@Composable
private fun DateTimePickerDialogsHandler(
    dateTimeState: DateTimeState,
    onStateUpdate: (DateTimeState) -> Unit
) {
    DateTimePickerDialogs(
        dateTimeState = dateTimeState,
        onPickupDateSelected = { millis ->
            onStateUpdate(dateTimeState.copy(
                selectedPickupDateMillis = millis,
                showPickupDatePicker = false
            ))
        },
        onPickupTimeSelected = { hour, minute ->
            onStateUpdate(dateTimeState.copy(
                pickupHour = hour,
                pickupMinute = minute,
                showPickupTimeDialog = false
            ))
        },
        onReturnDateSelected = { millis ->
            onStateUpdate(dateTimeState.copy(
                selectedReturnDateMillis = millis,
                showReturnDatePicker = false
            ))
        },
        onReturnTimeSelected = { hour, minute ->
            onStateUpdate(dateTimeState.copy(
                returnHour = hour,
                returnMinute = minute,
                showReturnTimeDialog = false
            ))
        },
        onDismiss = { dialog ->
            onStateUpdate(when (dialog) {
                "pickupDate" -> dateTimeState.copy(showPickupDatePicker = false)
                "pickupTime" -> dateTimeState.copy(showPickupTimeDialog = false)
                "returnDate" -> dateTimeState.copy(showReturnDatePicker = false)
                "returnTime" -> dateTimeState.copy(showReturnTimeDialog = false)
                else -> dateTimeState
            })
        }
    )
}

private fun createOrderRequest(
    boxQuantities: List<BoxQuantity>,
    studentAddress: Address,
    dateTimeState: DateTimeState,
    returnDate: String,
    currentPrice: PriceBreakdown
): OrderRequest {
    val pickupTimeIso = formatPickupTimeToISO(
        dateTimeState.selectedPickupDateMillis,
        dateTimeState.pickupHour,
        dateTimeState.pickupMinute
    )
    
    return OrderRequest(
        boxQuantities = boxQuantities.filter { it.quantity > 0 },
        currentAddress = studentAddress.formattedAddress,
        pickupTime = pickupTimeIso,
        returnDate = returnDate,
        totalPrice = currentPrice.total
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
        onTimeClick = actions.onShowPickupTimePicker,
        dateTestTag = "pickup_date_button",
        timeTestTag = "pickup_time_button"
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
        onTimeClick = actions.onShowReturnTimePicker,
        dateTestTag = "return_date_button",
        timeTestTag = "return_time_button"
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
    onTimeClick: () -> Unit,
    dateTestTag: String = "",
    timeTestTag: String = ""
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        DateCard(
            date = date,
            onClick = onDateClick,
            modifier = Modifier.weight(1f),
            testTag = dateTestTag
        )
        
        TimeCard(
            hour = hour,
            minute = minute,
            onClick = onTimeClick,
            modifier = Modifier.weight(1f),
            testTag = timeTestTag
        )
    }
}

@Composable
private fun DateCard(date: String, onClick: () -> Unit, modifier: Modifier = Modifier, testTag: String = "") {
    OutlinedCard(
        modifier = modifier.then(
            if (testTag.isNotEmpty()) Modifier.testTag(testTag) else Modifier
        ),
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
private fun TimeCard(hour: Int, minute: Int, onClick: () -> Unit, modifier: Modifier = Modifier, testTag: String = "") {
    OutlinedCard(
        modifier = modifier.then(
            if (testTag.isNotEmpty()) Modifier.testTag(testTag) else Modifier
        ),
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
        modifier = Modifier
            .fillMaxWidth()
            .testTag("proceed_to_payment_button")
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
            onDismiss = { onDismiss("pickupTime") },
            testTagPrefix = "pickup_time"
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
            onDismiss = { onDismiss("returnTime") },
            testTagPrefix = "return_time"
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


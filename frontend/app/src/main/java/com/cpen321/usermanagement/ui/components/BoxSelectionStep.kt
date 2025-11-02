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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.cpen321.usermanagement.business.DynamicPriceCalculator
import com.cpen321.usermanagement.data.local.models.*
import com.cpen321.usermanagement.ui.components.shared.DatePickerDialog
import com.cpen321.usermanagement.utils.TimeUtils
import java.text.SimpleDateFormat
import java.util.*

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

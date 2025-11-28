package com.cpen321.usermanagement.ui.components.dialogs

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowForward
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

/**
 * Hour selector component for time picker
 */
@Composable
fun HourSelector(
    selectedHour: Int,
    onHourChange: (Int) -> Unit,
    testTagPrefix: String = ""
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        IconButton(
            onClick = { onHourChange((selectedHour + 1) % 24) },
            modifier = if (testTagPrefix.isNotEmpty()) 
                Modifier.testTag("${testTagPrefix}_increase_hour") 
            else Modifier
        ) {
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
        IconButton(
            onClick = { onHourChange(if (selectedHour > 0) selectedHour - 1 else 23) },
            modifier = if (testTagPrefix.isNotEmpty()) 
                Modifier.testTag("${testTagPrefix}_decrease_hour") 
            else Modifier
        ) {
            Icon(
                Icons.Default.Remove,
                contentDescription = "Decrease hour",
                tint = MaterialTheme.colorScheme.primary
            )
        }
    }
}

/**
 * Minute selector component for time picker
 */
@Composable
fun MinuteSelector(
    selectedMinute: Int,
    onMinuteChange: (Int) -> Unit
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        IconButton(onClick = { onMinuteChange((selectedMinute + 15) % 60) }) {
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
        IconButton(onClick = { onMinuteChange(if (selectedMinute >= 15) selectedMinute - 15 else 45) }) {
            Icon(
                Icons.Default.Remove,
                contentDescription = "Decrease minute",
                tint = MaterialTheme.colorScheme.primary
            )
        }
    }
}

/**
 * Shared time picker dialog used across multiple screens
 */
@Composable
fun TimePickerDialog(
    initialHour: Int,
    initialMinute: Int,
    onTimeSelected: (Int, Int) -> Unit,
    onDismiss: () -> Unit,
    testTagPrefix: String = ""
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
                HourSelector(
                    selectedHour = selectedHour, 
                    onHourChange = { selectedHour = it },
                    testTagPrefix = testTagPrefix
                )
                
                Text(
                    text = ":",
                    style = MaterialTheme.typography.headlineMedium,
                    modifier = Modifier.padding(horizontal = 16.dp)
                )
                
                MinuteSelector(selectedMinute = selectedMinute, onMinuteChange = { selectedMinute = it })
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

private fun LocalDate.toUtcMillis(): Long =
    this.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

private fun getTodayUtcMillis(): Long = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply {
    set(Calendar.HOUR_OF_DAY, 0)
    set(Calendar.MINUTE, 0)
    set(Calendar.SECOND, 0)
    set(Calendar.MILLISECOND, 0)
}.timeInMillis

private fun getMinSelectableUtcMillis(todayUTC: Long, offsetDays: Int): Long =
    Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply {
        timeInMillis = todayUTC
        add(Calendar.DAY_OF_YEAR, offsetDays)
    }.timeInMillis

private fun buildCalendarDays(visibleMonth: LocalDate): List<LocalDate?> {
    val daysInMonth = visibleMonth.lengthOfMonth()
    val firstDayOfWeekOffset = visibleMonth.dayOfWeek.value % 7

    return buildList {
        repeat(firstDayOfWeekOffset) { add(null) }
        for (d in 1..daysInMonth) add(LocalDate.of(visibleMonth.year, visibleMonth.month, d))
    }
}

private data class DatePickerInitialState(
    val initialLocalDate: LocalDate,
    val minSelectableUTC: Long,
    val minSelectableLocalDate: LocalDate,
    val initialVisibleMonth: LocalDate
)

private fun computeDatePickerInitialState(initialDateMillis: Long?, minDateOffsetDays: Int): DatePickerInitialState {
    val todayUTC = getTodayUtcMillis()
    val minSelectableUTC = getMinSelectableUtcMillis(todayUTC, minDateOffsetDays)

    val initialDate = initialDateMillis ?: todayUTC
    val initialLocalDate = Instant.ofEpochMilli(initialDate).atZone(ZoneOffset.UTC).toLocalDate()

    val minSelectableLocalDate = Instant.ofEpochMilli(minSelectableUTC).atZone(ZoneOffset.UTC).toLocalDate()

    val initialVisibleMonth = if (minSelectableLocalDate.isBefore(initialLocalDate)) {
        minSelectableLocalDate.withDayOfMonth(1)
    } else {
        initialLocalDate.withDayOfMonth(1)
    }

    return DatePickerInitialState(
        initialLocalDate = initialLocalDate,
        minSelectableUTC = minSelectableUTC,
        minSelectableLocalDate = minSelectableLocalDate,
        initialVisibleMonth = initialVisibleMonth
    )
}

@Composable
private fun CalendarDay(
    date: LocalDate,
    selectedDate: LocalDate,
    minSelectableUTC: Long,
    onDateClick: (LocalDate) -> Unit
) {
    val utc = date.toUtcMillis()
    val enabled = utc >= minSelectableUTC
    val isSelected = date == selectedDate

    val backgroundColor = when {
        isSelected -> MaterialTheme.colorScheme.primary
        else -> androidx.compose.ui.graphics.Color.Transparent
    }
    val textColor = when {
        !enabled -> MaterialTheme.colorScheme.onSurfaceVariant
        isSelected -> MaterialTheme.colorScheme.onPrimary
        else -> MaterialTheme.colorScheme.onSurface
    }

    Box(
        modifier = Modifier
            .size(40.dp)
            .background(color = backgroundColor, shape = CircleShape)
            .testTag("day_${date.toEpochDay()}")
            .semantics { if (!enabled) disabled() }
            .let { base -> if (enabled) base.clickable { onDateClick(date) } else base },
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = date.dayOfMonth.toString(),
            textAlign = TextAlign.Center,
            color = textColor,
            style = MaterialTheme.typography.bodyMedium
        )
    }
}

@Composable
private fun MonthHeader(
    visibleMonth: LocalDate,
    minSelectableLocalDate: LocalDate,
    onPrev: () -> Unit,
    onNext: () -> Unit
) {
    val monthLabel = visibleMonth.format(DateTimeFormatter.ofPattern("MMMM yyyy", Locale.getDefault()))
    val prevEnabled = visibleMonth.isAfter(minSelectableLocalDate.withDayOfMonth(1))

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        IconButton(
            onClick = onPrev,
            enabled = prevEnabled,
            modifier = Modifier.testTag("date_picker_prev_month")
        ) {
            Icon(Icons.Filled.ArrowBack, contentDescription = "Previous month")
        }

        Text(
            monthLabel,
            style = MaterialTheme.typography.titleMedium
        )

        IconButton(
            onClick = onNext,
            modifier = Modifier.testTag("date_picker_next_month")
        ) {
            Icon(Icons.Filled.ArrowForward, contentDescription = "Next month")
        }
    }
}

@Composable
private fun CalendarGrid(
    days: List<LocalDate?>,
    selectedDate: LocalDate,
    minSelectableUTC: Long,
    onDateClick: (LocalDate) -> Unit
) {
    LazyVerticalGrid(
        columns = GridCells.Fixed(7),
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(4.dp)
    ) {
        items(days) { date ->
            if (date == null) {
                Spacer(Modifier.size(40.dp))
            } else {
                CalendarDay(
                    date = date,
                    selectedDate = selectedDate,
                    minSelectableUTC = minSelectableUTC,
                    onDateClick = onDateClick
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DatePickerDialog(
    onDateSelected: (Long) -> Unit,
    onDismiss: () -> Unit,
    title: String = "Select Date",
    initialDateMillis: Long? = null,
    minDateOffsetDays: Int = 0
) {
    val state = computeDatePickerInitialState(initialDateMillis, minDateOffsetDays)

    var selectedDate by remember { mutableStateOf(state.initialLocalDate) }
    var visibleMonth by remember { mutableStateOf(state.initialVisibleMonth) }

    val days = remember(visibleMonth) { buildCalendarDays(visibleMonth) }

    androidx.compose.material3.DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = { onDateSelected(selectedDate.toUtcMillis()) }) {
                Text("OK")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(16.dp))
            MonthHeader(
                visibleMonth = visibleMonth,
                minSelectableLocalDate = state.minSelectableLocalDate,
                onPrev = { visibleMonth = visibleMonth.minusMonths(1) },
                onNext = { visibleMonth = visibleMonth.plusMonths(1) }
            )
            CalendarGrid(
                days = days,
                selectedDate = selectedDate,
                minSelectableUTC = state.minSelectableUTC,
                onDateClick = { selectedDate = it }
            )
        }
    }
}


package com.cpen321.usermanagement.ui.components.shared

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import java.time.*
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowForward

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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DatePickerDialog(
    onDateSelected: (Long) -> Unit,
    onDismiss: () -> Unit,
    title: String = "Select Date",
    initialDateMillis: Long? = null,
    minDateOffsetDays: Int = 0
) {
    val todayUTC = getTodayUtcMillis()
    val minSelectableUTC = getMinSelectableUtcMillis(todayUTC, minDateOffsetDays)
    
    val initialDate = initialDateMillis ?: todayUTC
    val initialLocalDate = Instant.ofEpochMilli(initialDate)
        .atZone(ZoneOffset.UTC).toLocalDate()

    val minSelectableLocalDate = Instant.ofEpochMilli(minSelectableUTC)
        .atZone(ZoneOffset.UTC).toLocalDate()

    var selectedDate by remember { mutableStateOf(initialLocalDate) }
    // Start the calendar on the earlier month between the initially-provided date
    // and the minimum-selectable date so tests can pick earlier allowed dates
    var visibleMonth by remember { mutableStateOf(
        if (minSelectableLocalDate.isBefore(initialLocalDate)) {
            minSelectableLocalDate.withDayOfMonth(1)
        } else {
            initialLocalDate.withDayOfMonth(1)
        }
    ) }

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
            // Month header with navigation
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
                    onClick = { if (prevEnabled) visibleMonth = visibleMonth.minusMonths(1) },
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
                    onClick = { visibleMonth = visibleMonth.plusMonths(1) },
                    modifier = Modifier.testTag("date_picker_next_month")
                ) {
                    Icon(Icons.Filled.ArrowForward, contentDescription = "Next month")
                }
            }
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
                            onDateClick = { selectedDate = it }
                        )
                    }
                }
            }
        }
    }
}

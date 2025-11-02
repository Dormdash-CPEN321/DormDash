package com.cpen321.usermanagement.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Hour selector component for time picker
 */
@Composable
fun HourSelector(
    selectedHour: Int,
    onHourChange: (Int) -> Unit
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        IconButton(onClick = { onHourChange((selectedHour + 1) % 24) }) {
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
        IconButton(onClick = { onHourChange(if (selectedHour > 0) selectedHour - 1 else 23) }) {
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
                HourSelector(selectedHour = selectedHour, onHourChange = { selectedHour = it })

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


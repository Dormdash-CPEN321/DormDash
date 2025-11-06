package com.cpen321.usermanagement.ui.components

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Event
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import com.cpen321.usermanagement.utils.TimeUtils
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import com.cpen321.usermanagement.data.local.models.Order
import com.cpen321.usermanagement.data.local.models.OrderStatus
import com.cpen321.usermanagement.data.local.models.displayText
import com.cpen321.usermanagement.data.local.models.Job
import com.cpen321.usermanagement.data.local.models.JobType
import com.cpen321.usermanagement.data.local.models.JobStatus
import com.cpen321.usermanagement.data.repository.OrderRepository
import com.cpen321.usermanagement.ui.viewmodels.AuthViewModel
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

// java.time imports removed (unused)

@Composable
fun StatusPanel(
    activeOrder: Order?,
    studentJobs: List<Job> = emptyList(),
    onCreateReturnJob: () -> Unit = {}
) {
    if (activeOrder != null) {
        // Show status when there's an active order
        ActiveOrderStatusContent(
            order = activeOrder,
            studentJobs = studentJobs,
            onCreateReturnJob = onCreateReturnJob
        )
    } else {
        // Hidden placeholder when no active order
        // This maintains layout consistency without taking visual space
        Spacer(modifier = Modifier.height(0.dp))
    }
}

@Composable
private fun ActiveOrderStatusContent(
    order: Order,
    studentJobs: List<Job> = emptyList(),
    onCreateReturnJob: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val hasActiveReturnJob = hasActiveReturnJob(studentJobs, order.id)
    val returnJob = findActiveReturnJob(studentJobs, order.id)

    Card(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(12.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            OrderStatusHeader()
            
            OrderProgressIndicator(order.status)
            
            OrderStatusDetails(
                order = order,
                hasActiveReturnJob = hasActiveReturnJob
            )
            
            CalendarButtonSection(
                order = order,
                hasActiveReturnJob = hasActiveReturnJob,
                returnJob = returnJob,
                context = context
            )
            
            JobStatusCard(
                order = order,
                hasActiveReturnJob = hasActiveReturnJob,
                onCreateReturnJob = onCreateReturnJob
            )
        }
    }
}

private fun hasActiveReturnJob(studentJobs: List<Job>, orderId: String?): Boolean {
    return studentJobs.any { job ->
        job.jobType == JobType.RETURN &&
                job.orderId == orderId &&
                job.status != JobStatus.CANCELLED &&
                job.status != JobStatus.COMPLETED
    }
}

private fun findActiveReturnJob(studentJobs: List<Job>, orderId: String?): Job? {
    return studentJobs.find { job ->
        job.jobType == JobType.RETURN &&
                job.orderId == orderId &&
                job.status != JobStatus.CANCELLED &&
                job.status != JobStatus.COMPLETED
    }
}

@Composable
private fun OrderStatusHeader() {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "Order Status and Details",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSecondaryContainer
        )
        Icon(
            imageVector = Icons.Default.CheckCircle,
            contentDescription = "Status",
            modifier = Modifier.size(20.dp),
            tint = MaterialTheme.colorScheme.primary
        )
    }
}

@Composable
private fun OrderProgressIndicator(status: OrderStatus) {
    val progress = when (status) {
        OrderStatus.PENDING -> 0.2f
        OrderStatus.ACCEPTED -> 0.4f
        OrderStatus.PICKED_UP -> 0.7f
        OrderStatus.IN_STORAGE -> 1.0f
        OrderStatus.CANCELLED -> 0.0f
        OrderStatus.RETURNED -> 0.2f
        OrderStatus.COMPLETED -> 0.2f
    }
    LinearProgressIndicator(
        progress = { progress },
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.primary
    )
}

@Composable
private fun OrderStatusDetails(
    order: Order,
    hasActiveReturnJob: Boolean
) {
    StatusDetailRow(
        icon = Icons.Default.CheckCircle,
        label = "Status",
        value = order.status.displayText
    )

    if (!hasActiveReturnJob) {
        StatusDetailRow(
            icon = Icons.Default.LocationOn,
            label = "Pickup Address",
            value = order.studentAddress.formattedAddress
        )
    }

    if (order.status == OrderStatus.IN_STORAGE) {
        StatusDetailRow(
            icon = Icons.Default.LocationOn,
            label = "Storage Location",
            value = order.warehouseAddress.formattedAddress
        )
    }

    if (!hasActiveReturnJob) {
        StatusDetailRow(
            icon = Icons.Default.Info,
            label = "Pickup Date",
            value = TimeUtils.formatDateTime(order.pickupTime)
        )
    }

    if (hasActiveReturnJob) {
        StatusDetailRow(
            icon = Icons.Default.Info,
            label = "Return Date",
            value = TimeUtils.formatDateTime(order.returnTime)
        )
    }

    Spacer(modifier = Modifier.height(2.dp))
}

@Composable
private fun CalendarButtonSection(
    order: Order,
    hasActiveReturnJob: Boolean,
    returnJob: Job?,
    context: Context
) {
    val showCalendarButton = (!hasActiveReturnJob && order.status == OrderStatus.ACCEPTED) ||
                             (hasActiveReturnJob && returnJob?.status == JobStatus.ACCEPTED)

    if (!showCalendarButton) return

    val (eventTime, buttonText, eventTitle, locationAddress) = if (hasActiveReturnJob) {
        listOf(
            order.returnTime,
            "Add Return to Calendar",
            "DormDash Storage Return",
            order.returnAddress?.formattedAddress
        )
    } else {
        listOf(
            order.pickupTime,
            "Add Pickup to Calendar",
            "DormDash Storage Pickup",
            order.studentAddress.formattedAddress
        )
    }

    val calendarEventUrl = generateCalendarUrl(
        eventTime as String,
        eventTitle as String,
        locationAddress as String
    )

    if (calendarEventUrl != null) {
        CalendarButton(
            buttonText = buttonText as String,
            calendarUrl = calendarEventUrl,
            context = context
        )
        Spacer(modifier = Modifier.height(8.dp))
    }
}

private fun generateCalendarUrl(
    eventTime: String,
    eventTitle: String,
    locationAddress: String
): String? {
    return try {
        val zoned: ZonedDateTime = try {
            ZonedDateTime.parse(eventTime)
        } catch (e1: java.time.format.DateTimeParseException) {
            try {
                OffsetDateTime.parse(eventTime).toZonedDateTime()
            } catch (e2: java.time.format.DateTimeParseException) {
                val ldt = LocalDateTime.parse(eventTime)
                ldt.atZone(ZoneId.systemDefault())
            }
        }

        val pacificStart = zoned.withZoneSameInstant(ZoneId.of("America/Los_Angeles"))
        val pacificEnd = pacificStart.plusMinutes(15)
        val dateFormatterLocal = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss")

        val title = Uri.encode(eventTitle)
        val details = Uri.encode("Make sure to meet your mover on time!")
        val location = Uri.encode(locationAddress)

        "https://www.google.com/calendar/render?action=TEMPLATE" +
                "&text=$title" +
                "&dates=${pacificStart.format(dateFormatterLocal)}/${pacificEnd.format(dateFormatterLocal)}" +
                "&details=$details" +
                "&location=$location" +
                "&ctz=America/Los_Angeles"
    } catch (e: java.time.format.DateTimeParseException) {
        println("Error parsing date for calendar: ${e.message}")
        null
    } catch (e: IllegalArgumentException) {
        println("Invalid date value for calendar: ${e.message}")
        null
    }
}

@Composable
private fun CalendarButton(
    buttonText: String,
    calendarUrl: String,
    context: Context
) {
    OutlinedButton(
        onClick = {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(calendarUrl))
            context.startActivity(intent)
        },
        modifier = Modifier.fillMaxWidth()
    ) {
        Icon(
            imageVector = Icons.Default.Event,
            contentDescription = null,
            modifier = Modifier.size(18.dp)
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(buttonText)
    }
}

@Composable
private fun JobStatusCard(
    order: Order,
    hasActiveReturnJob: Boolean,
    onCreateReturnJob: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (hasActiveReturnJob)
                MaterialTheme.colorScheme.primaryContainer
            else
                MaterialTheme.colorScheme.tertiaryContainer
        ),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            if (!hasActiveReturnJob) {
                PickupJobStatus(order, onCreateReturnJob)
            } else {
                ReturnJobStatus()
            }
        }
    }
}

@Composable
private fun PickupJobStatus(order: Order, onCreateReturnJob: () -> Unit) {
    Text(
        text = "📦 Pickup & Storage",
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onTertiaryContainer
    )
    
    val storageStatusText = when {
        order.status == OrderStatus.PENDING -> "📋 Awaiting mover"
        order.status == OrderStatus.ACCEPTED -> "✅ Pickup scheduled"
        order.status == OrderStatus.PICKED_UP -> "🚚 En route to storage"
        order.status == OrderStatus.IN_STORAGE -> "🏬 In storage"
        else -> order.status.displayText
    }
    
    Text(
        text = storageStatusText,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onTertiaryContainer
    )
    
    if (order.status == OrderStatus.IN_STORAGE ) {
        Spacer(modifier = Modifier.height(4.dp))
        Button(
            onClick = onCreateReturnJob,
            modifier = Modifier.fillMaxWidth().testTag("return-delivery-button"),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.tertiary
            )
        ) {
            Icon(
                imageVector = Icons.Default.Home,
                contentDescription = null,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text("Schedule Return Delivery")
        }
    }
}

@Composable
private fun ReturnJobStatus() {
    Text(
        text = "🏠 Return Delivery",
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onPrimaryContainer
    )
    Text(
        text = "✅ Return delivery scheduled",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onPrimaryContainer

    )
}

@Composable
private fun StatusDetailRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            modifier = Modifier.size(16.dp),
            tint = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.7f)
        )
        
        Spacer(modifier = Modifier.width(8.dp))
        
        Text(
            text = "$label: ",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.7f)
        )
        
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSecondaryContainer
        )
    }
}
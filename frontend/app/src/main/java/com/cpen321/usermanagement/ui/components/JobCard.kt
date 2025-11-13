package com.cpen321.usermanagement.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import com.cpen321.usermanagement.data.local.models.Job
import com.cpen321.usermanagement.utils.TimeUtils
import androidx.compose.ui.platform.testTag

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CurrentJobCard(
    job: Job,
    onDetailsClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    ElevatedCard(
        modifier = modifier.fillMaxWidth().testTag("current_job_card")
    ) {
        Column(
            modifier = Modifier.padding(16.dp).fillMaxWidth()
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "${job.jobType.value} Job",
                    style = MaterialTheme.typography.titleMedium
                )
                Text(
                    text = TimeUtils.formatDateTime(job.scheduledTime),
                    style = MaterialTheme.typography.bodyMedium
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Status: ${job.status.value}",
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.testTag("current_job_status")
            )
            Spacer(modifier = Modifier.height(12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End
            ) {
                Button(onClick = onDetailsClick) {
                    Text("View and Manage Job Details")
                }
            }
        }
    }
}

@Composable
fun AvailableJobCard(
    job: Job,
    onAcceptClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    ElevatedCard(
        modifier = modifier.fillMaxWidth().testTag("job_card")
    ) {
        Column(
            modifier = Modifier.padding(16.dp).fillMaxWidth()
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "${job.jobType.value} Job",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.testTag("job_card_type")
                )
                Text(
                    text = "$${String.format("%.2f", job.price)}",
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.testTag("job_card_credits")
                )
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Pickup: ${job.pickupAddress.formattedAddress}",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.testTag("job_card_pickup_address")
            )
            Text(
                text = "Drop-off: ${job.dropoffAddress.formattedAddress}",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.testTag("job_card_dropoff_address")
            )
            Text(
                text = "Volume: ${String.format("%.1f", job.volume)} m³",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.testTag("job_card_volume")
            )
            Text(
                text = TimeUtils.formatDateTime(job.scheduledTime),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.testTag("job_card_datetime")
            )
            Spacer(modifier = Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Button(
                    onClick = onAcceptClick,
                    modifier = Modifier.weight(1f).testTag("job_accept_button")
                ) {
                    Text("Accept")
                }
            }
        }
    }
}

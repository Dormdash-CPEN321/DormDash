package com.cpen321.usermanagement.ui.screens

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.MonetizationOn
import androidx.compose.material.icons.filled.Inventory
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Event
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.cpen321.usermanagement.data.local.models.Job
import com.cpen321.usermanagement.data.local.models.JobStatus
import com.cpen321.usermanagement.data.local.models.JobType
import com.cpen321.usermanagement.ui.viewmodels.JobViewModel
import com.cpen321.usermanagement.ui.components.OrderMapView
import com.cpen321.usermanagement.data.remote.dto.Address
import com.cpen321.usermanagement.utils.TimeUtils
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun JobDetailsScreen(
    jobId: String,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: JobViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    
    // Load mover jobs when screen opens to ensure we have the job data
    LaunchedEffect(Unit) {
        viewModel.loadMoverJobs()
        viewModel.loadAvailableJobs()
    }
    
    // Find the job from available or mover jobs
    val job = remember(uiState.availableJobs, uiState.moverJobs, jobId) {
        uiState.availableJobs.find { it.id == jobId } 
            ?: uiState.moverJobs.find { it.id == jobId }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Job Details") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.Default.ArrowBack,
                            contentDescription = "Back"
                        )
                    }
                }
            )
        }
    ) { paddingValues ->
        if (job == null) {
            Box(
                modifier = modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                contentAlignment = Alignment.Center
            ) {
                Text("Job not found")
            }
        } else {
            JobDetailsContent(
                job = job,
                viewModel = viewModel,
                onUpdateStatus = { newStatus ->
                    viewModel.updateJobStatus(job.id, newStatus)
                },
                modifier = modifier.padding(paddingValues)
            )
        }
    }
}

@Composable
private fun JobDetailsContent(
    job: Job,
    viewModel: JobViewModel,
    onUpdateStatus: (JobStatus) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        JobHeaderCard(job)
        CurrentDestinationCard(job)
        JobInformationCard(job)
        LocationInformationCard(job)
        JobActionButtons(job, viewModel, onUpdateStatus)
        AddToCalendarButton(job)
    }
}

@Composable
private fun JobHeaderCard(job: Job) {
    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 16.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Text(
                text = "${job.jobType.value} Job",
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold
            )
            
            Text(
                text = "Status: ${job.status.value}",
                style = MaterialTheme.typography.bodyLarge,
                color = when (job.status) {
                    JobStatus.ACCEPTED -> MaterialTheme.colorScheme.primary
                    JobStatus.PICKED_UP -> MaterialTheme.colorScheme.tertiary
                    JobStatus.AWAITING_STUDENT_CONFIRMATION -> MaterialTheme.colorScheme.tertiary
                    JobStatus.COMPLETED -> MaterialTheme.colorScheme.secondary
                    else -> MaterialTheme.colorScheme.onSurface
                },
                fontWeight = FontWeight.Medium,
                modifier = Modifier.padding(top = 4.dp)
            )
        }
    }
}

@Composable
private fun CurrentDestinationCard(job: Job) {
    if (job.status == JobStatus.ACCEPTED || 
        job.status == JobStatus.PICKED_UP || 
        job.status == JobStatus.AWAITING_STUDENT_CONFIRMATION) {
        
        val (currentLocation, locationTitle) = getCurrentDestination(job)
        
        ElevatedCard(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 16.dp)
        ) {
            Column(
                modifier = Modifier.padding(16.dp)
            ) {
                Text(
                    text = locationTitle,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(bottom = 12.dp)
                )
                
                OrderMapView(
                    address = currentLocation.formattedAddress,
                    modifier = Modifier.fillMaxWidth()
                )
                
                Spacer(modifier = Modifier.height(8.dp))
                
                Text(
                    text = currentLocation.formattedAddress,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun JobInformationCard(job: Job) {
    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 16.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Text(
                text = "Job Information",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 12.dp)
            )
            
            JobInfoRow(
                icon = Icons.Default.MonetizationOn,
                label = "Payment",
                value = "$${job.price}"
            )
            
            JobInfoRow(
                icon = Icons.Default.Inventory,
                label = "Volume",
                value = "${job.volume} m³"
            )
            
            JobInfoRow(
                icon = Icons.Default.AccessTime,
                label = "Scheduled",
                value = TimeUtils.formatDateTime(job.scheduledTime)
            )
        }
    }
}

@Composable
private fun LocationInformationCard(job: Job) {
    ElevatedCard(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 16.dp)
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Text(
                text = "Locations",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 12.dp)
            )
            
            LocationRow(
                label = "Pickup Location",
                address = job.pickupAddress.formattedAddress
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            LocationRow(
                label = "Dropoff Location",
                address = job.dropoffAddress.formattedAddress
            )
        }
    }
}

@Composable
private fun LocationRow(label: String, address: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.Top
    ) {
        Icon(
            imageVector = Icons.Default.LocationOn,
            contentDescription = null,
            modifier = Modifier.size(20.dp),
            tint = MaterialTheme.colorScheme.primary
        )
        Spacer(modifier = Modifier.width(12.dp))
        Column {
            Text(
                text = label,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium
            )
            Text(
                text = address,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun JobActionButtons(
    job: Job,
    viewModel: JobViewModel,
    onUpdateStatus: (JobStatus) -> Unit
) {
    when (job.status) {
        JobStatus.ACCEPTED -> {
            AcceptedJobButton(job, viewModel, onUpdateStatus)
        }
        
        JobStatus.PICKED_UP -> {
            PickedUpJobButton(job, viewModel, onUpdateStatus)
        }

        JobStatus.AWAITING_STUDENT_CONFIRMATION -> {
            AwaitingConfirmationCard()
        }
        
        JobStatus.COMPLETED -> {
            CompletedJobCard()
        }
        
        else -> {
            // No action needed for other statuses
        }
    }
}

@Composable
private fun AcceptedJobButton(
    job: Job,
    viewModel: JobViewModel,
    onUpdateStatus: (JobStatus) -> Unit
) {
    val nextLocation = if (job.jobType == JobType.STORAGE) {
        "student's location"
    } else {
        "storage facility"
    }
    
    Button(
        onClick = {
            if (job.jobType == JobType.STORAGE) {
                viewModel.requestPickupConfirmation(job.id)
            } else {
                onUpdateStatus(JobStatus.PICKED_UP)
            }
        },
        modifier = Modifier.fillMaxWidth()
    ) {
        Icon(
            imageVector = Icons.Default.CheckCircle,
            contentDescription = null,
            modifier = Modifier.size(18.dp)
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text("Arrived at $nextLocation")
    }
}

@Composable
private fun PickedUpJobButton(
    job: Job,
    viewModel: JobViewModel,
    onUpdateStatus: (JobStatus) -> Unit
) {
    val nextLocation = if (job.jobType == JobType.STORAGE) {
        "storage facility"
    } else {
        "student's location"
    }
    
    Button(
        onClick = {
            if (job.jobType == JobType.RETURN) {
                viewModel.requestDeliveryConfirmation(job.id)
            } else {
                onUpdateStatus(JobStatus.COMPLETED)
            }
        },
        modifier = Modifier.fillMaxWidth()
    ) {
        Icon(
            imageVector = Icons.Default.CheckCircle,
            contentDescription = null,
            modifier = Modifier.size(18.dp)
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text("Completed delivery to $nextLocation")
    }
}

@Composable
private fun AwaitingConfirmationCard() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer
        )
    ) {
        Text(
            text = "Awaiting Student Confirmation",
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(16.dp),
            color = MaterialTheme.colorScheme.onSecondaryContainer
        )
    }
}

@Composable
private fun CompletedJobCard() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer
        )
    ) {
        Text(
            text = "Job Completed",
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.padding(16.dp),
            color = MaterialTheme.colorScheme.onSecondaryContainer
        )
    }
}

@Composable
private fun AddToCalendarButton(job: Job) {
    if (job.status == JobStatus.ACCEPTED || job.status == JobStatus.PICKED_UP) {
        val context = LocalContext.current
        val zoned = job.scheduledTime.atZone(ZoneId.of("UTC"))
            .withZoneSameInstant(ZoneId.of("America/Los_Angeles"))
        val startStr = zoned.format(DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss"))
        val endStr = zoned.plusMinutes(15).format(DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss"))
        val title = Uri.encode("DormDash ${job.jobType.value} Job")
        val details = Uri.encode("Job Details for ${job.jobType.value} Job")
        val location = Uri.encode(job.pickupAddress.formattedAddress)

        val calendarEventUrl = "https://www.google.com/calendar/render?action=TEMPLATE" +
            "&text=$title" +
            "&dates=$startStr/$endStr" +
            "&details=$details" +
            "&location=$location" +
            "&ctz=America/Los_Angeles"

        Spacer(modifier = Modifier.height(16.dp))

        Button(
            onClick = {
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(calendarEventUrl))
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
            Text("Add to Calendar")
        }
    }
}

@Composable
private fun JobInfoRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    label: String,
    value: String
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            modifier = Modifier.size(20.dp),
            tint = MaterialTheme.colorScheme.primary
        )
        Spacer(modifier = Modifier.width(12.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.weight(1f)
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium
        )
    }
}


private fun getCurrentDestination(job: Job): Pair<Address, String> {
    return when (job.jobType) {
        JobType.STORAGE -> {
            when (job.status) {
                JobStatus.ACCEPTED -> Pair(job.pickupAddress, "Navigate to Student Location")
                JobStatus.AWAITING_STUDENT_CONFIRMATION -> Pair(job.pickupAddress, "Awaiting Student Confirmation")
                JobStatus.PICKED_UP -> Pair(job.dropoffAddress, "Navigate to Storage Facility")
                else -> Pair(job.pickupAddress, "Current Destination")
            }
        }
        JobType.RETURN -> {
            when (job.status) {
                JobStatus.ACCEPTED -> Pair(job.pickupAddress, "Navigate to Storage Facility")
                JobStatus.PICKED_UP -> Pair(job.dropoffAddress, "Navigate to Student Location")
                JobStatus.AWAITING_STUDENT_CONFIRMATION -> Pair(job.dropoffAddress, "Awaiting Student Confirmation")
                else -> Pair(job.pickupAddress, "Current Destination")
            }
        }
    }
}

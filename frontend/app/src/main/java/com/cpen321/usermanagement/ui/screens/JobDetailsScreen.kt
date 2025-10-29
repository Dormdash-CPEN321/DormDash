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
    val context = LocalContext.current

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        // Job header
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
        
        // Current destination map
        if (job.status == JobStatus.ACCEPTED || job.status == JobStatus.PICKED_UP || job.status == JobStatus.AWAITING_STUDENT_CONFIRMATION) {
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
        
        // Job information
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
        
        // Location information
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
                
                // Pickup location
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
                            text = "Pickup Location",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium
                        )
                        Text(
                            text = job.pickupAddress.formattedAddress,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
                
                Spacer(modifier = Modifier.height(8.dp))
                
                // Dropoff location
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
                            text = "Dropoff Location",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.padding(top = 8.dp)
                        )
                        Text(
                            text = job.dropoffAddress.formattedAddress,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
        
        // Action buttons based on job status
        when (job.status) {
            JobStatus.ACCEPTED -> {
                val nextLocation = if (job.jobType == JobType.STORAGE) {
                    "student's location"
                } else {
                    "storage facility"
                }
                
                Button(
                    onClick = {
                        if (job.jobType == JobType.STORAGE) {
                            // For storage jobs, request student confirmation first
                            viewModel.requestPickupConfirmation(job.id)
                        } else {
                            // For return jobs, mark as picked up directly
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
            
            JobStatus.PICKED_UP -> {
                val nextLocation = if (job.jobType == JobType.STORAGE) {
                    "storage facility"
                } else {
                    "student's location"
                }
                
                Button(
                    onClick = {
                        if (job.jobType == JobType.RETURN) {
                            // For return jobs, request student delivery confirmation first
                            viewModel.requestDeliveryConfirmation(job.id)
                        } else {
                            // For storage jobs, mark as completed directly
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
    
            JobStatus.AWAITING_STUDENT_CONFIRMATION -> {
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
            
            JobStatus.COMPLETED -> {
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
            
            else -> {
                // No action needed for other statuses
            }
        }

        // Calendar event link for movers
        if (job.status == JobStatus.ACCEPTED || job.status == JobStatus.PICKED_UP) {
            val zoned = job.scheduledTime.atZone(ZoneId.of("UTC")).withZoneSameInstant(ZoneId.of("America/Los_Angeles"))
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

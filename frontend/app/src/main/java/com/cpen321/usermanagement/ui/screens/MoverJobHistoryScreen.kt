package com.cpen321.usermanagement.ui.screens

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.runtime.Composable
import com.cpen321.usermanagement.ui.viewmodels.JobViewModel
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalContext
import dagger.hilt.android.EntryPointAccessors
import kotlinx.coroutines.flow.collect
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.cpen321.usermanagement.data.local.models.Job
import com.cpen321.usermanagement.data.local.models.JobStatus
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.material3.Icon
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import java.time.format.DateTimeFormatter
import com.cpen321.usermanagement.R
import com.cpen321.usermanagement.ui.components.MessageSnackbar
import com.cpen321.usermanagement.ui.components.MessageSnackbarState
import com.cpen321.usermanagement.ui.viewmodels.ProfileUiState
import com.cpen321.usermanagement.ui.viewmodels.ProfileViewModel
import kotlinx.coroutines.delay
import com.cpen321.usermanagement.di.SocketClientEntryPoint
import com.cpen321.usermanagement.utils.TimeUtils

private data class MoverJobHistoryScreenData(
    val completedJobs: List<Job>,
    val uiState: ProfileUiState,
    val snackBarHostState: SnackbarHostState,
    val onSuccessMessageShown: () -> Unit,
    val onErrorMessageShown: () -> Unit
)

private data class MoverJobHistoryScreenActions(
    val onBackClick: () -> Unit,
    val onJobClick: (Job) -> Unit
)
@Composable
fun MoverJobHistoryScreen(
    jobViewModel: JobViewModel,
    profileViewModel: ProfileViewModel,
    onBackClick: () -> Unit,
) {
    val uiState by profileViewModel.uiState.collectAsState()
    val snackBarHostState = remember { SnackbarHostState() }

    // Job UI state collection
    val jobUi by jobViewModel.uiState.collectAsState()

    // Get completed jobs for the mover
    val completedJobs = jobUi.moverJobs.filter { it.status == JobStatus.COMPLETED }

    // State for selected job details
    var selectedJob by remember { mutableStateOf<Job?>(null) }

    // Initial load of jobs when screen opens
    LaunchedEffect(Unit) {
        jobViewModel.loadMoverJobs()
    }

    MoverJobHistoryContent(
        data = MoverJobHistoryScreenData(
            completedJobs = completedJobs,
            uiState = uiState,
            snackBarHostState = snackBarHostState,
            onSuccessMessageShown = profileViewModel::clearSuccessMessage,
            onErrorMessageShown = profileViewModel::clearError
        ),
        actions = MoverJobHistoryScreenActions(
            onBackClick = onBackClick,
            onJobClick = { job -> selectedJob = job }
        )
    )

    // Show job details sheet when a job is selected
    selectedJob?.let { job ->
        JobDetailsSheet(
            job = job,
            onClose = { selectedJob = null }
        )
    }
}

@Composable
private fun MoverJobHistoryContent(
    data: MoverJobHistoryScreenData,
    actions: MoverJobHistoryScreenActions,
    modifier: Modifier = Modifier
) {
    Scaffold(
        modifier = modifier,
        topBar = {
            MoverJobHistoryTopBar(onBackClick = actions.onBackClick)
        },
        snackbarHost = {
            MessageSnackbar(
                hostState = data.snackBarHostState,
                messageState = MessageSnackbarState(
                    successMessage = data.uiState.successMessage,
                    errorMessage = data.uiState.errorMessage,
                    onSuccessMessageShown = data.onSuccessMessageShown,
                    onErrorMessageShown = data.onErrorMessageShown
                )
            )
        }
    ) { paddingValues ->
        Box(modifier = Modifier.padding(paddingValues)) {
            MoverJobHistoryBody(
                data.completedJobs,
                actions.onJobClick
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MoverJobHistoryTopBar(
    onBackClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    TopAppBar(
        title = {
            Text(
                text = "Job History",
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onPrimary
            )
        },
        navigationIcon = {
            IconButton(onClick = onBackClick) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                    contentDescription = "Back",
                    tint = MaterialTheme.colorScheme.onPrimary
                )
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = MaterialTheme.colorScheme.primary
        ),
        modifier = modifier
    )
}


@Composable 
fun MoverJobHistoryBody(
    jobs: List<Job>,
    onJobClick : (Job)-> Unit
){

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text(
            text = "Job History",
            style = MaterialTheme.typography.titleLarge,
            modifier = Modifier.padding(bottom = 16.dp)
        )
        if (jobs.isEmpty()) {
            Text("No completed jobs found.", style = MaterialTheme.typography.bodyMedium)
        } else {
            LazyColumn {
                items(jobs) { job ->
                    JobListItem(
                        job,
                        onJobClick
                    )
                }
            }
        }
    }

}

@Composable
fun JobListItem(
    job: Job,
    onJobClick: (Job) -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp),
        elevation = CardDefaults.cardElevation(2.dp),
        onClick = { onJobClick(job) }
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Job #${job.id?.takeLast(6) ?: "N/A"}", 
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = job.status.value, 
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.primary
                )
            }
            Text(
                text = "›",
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 8.dp)
            )
        }
    }
}

@Composable
fun JobDetailsSheet(
    job: Job,
    onClose: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onClose,
        title = {
            Text(
                "Job Details",
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold
            )
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                DetailRow(label = "Job ID", value = job.id ?: "N/A")
                JobStatusRow(status = job.status)
                HorizontalDivider()
                JobInfoSection(job = job)
                HorizontalDivider()
                JobAddressesSection(job = job)
                HorizontalDivider()
                DetailRow(label = "Scheduled Time", value = TimeUtils.formatDateTime(job.scheduledTime))
            }
        },
        confirmButton = {
            TextButton(onClick = onClose) { Text("Close") }
        }
    )
}

@Composable
private fun JobStatusRow(status: JobStatus) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "Status:",
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium
        )
        Text(
            text = status.value,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.primary,
            fontWeight = FontWeight.Bold
        )
    }
}

@Composable
private fun JobInfoSection(job: Job) {
    DetailRow(label = "Job Type", value = job.jobType.value)
    DetailRow(label = "Volume", value = "${job.volume} m³")
    DetailRow(label = "Earnings", value = "$${String.format("%.2f", job.price)}")
}

@Composable
private fun JobAddressesSection(job: Job) {
    Text(
        text = "Pickup Address",
        style = MaterialTheme.typography.bodySmall,
        fontWeight = FontWeight.Medium
    )
    Text(
        text = job.pickupAddress.formattedAddress,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )

    Text(
        text = "Dropoff Address",
        style = MaterialTheme.typography.bodySmall,
        fontWeight = FontWeight.Medium,
        modifier = Modifier.padding(top = 8.dp)
    )
    Text(
        text = job.dropoffAddress.formattedAddress,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant
    )
}

@Composable
private fun DetailRow(
    label: String,
    value: String,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "$label:",
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

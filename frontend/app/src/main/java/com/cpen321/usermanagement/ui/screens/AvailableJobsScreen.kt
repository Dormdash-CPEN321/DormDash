package com.cpen321.usermanagement.ui.screens

import android.util.Log
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Route
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.cpen321.usermanagement.data.local.models.Job
import com.cpen321.usermanagement.di.SocketClientEntryPoint
import com.cpen321.usermanagement.ui.components.AvailableJobCard
import com.cpen321.usermanagement.ui.components.SmartRouteBottomSheet
import com.cpen321.usermanagement.ui.viewmodels.JobViewModel
import com.cpen321.usermanagement.ui.viewmodels.MoverAvailabilityViewModel
import com.cpen321.usermanagement.utils.TimeUtils
import dagger.hilt.android.EntryPointAccessors
import java.time.DayOfWeek
import java.time.LocalTime

@Composable
fun AvailableJobsScreen(
    modifier: Modifier = Modifier,
    jobViewModel: JobViewModel = hiltViewModel(),
    moverAvailabilityViewModel: MoverAvailabilityViewModel = hiltViewModel()
) {
    val jobUiState by jobViewModel.uiState.collectAsState()
    val moverAvailabilityUiState by moverAvailabilityViewModel.uiState.collectAsState()
    var showOnlyAvailable by remember { mutableStateOf(false) }
    var showSmartRoute by remember { mutableStateOf(false) }

    // Load available jobs when screen is first composed
    // JobViewModel handles socket events (job.created, job.updated) automatically
    LaunchedEffect(Unit) {
        jobViewModel.loadAvailableJobs()
        moverAvailabilityViewModel.loadAvailability()
    }
    
    // Show Smart Route Bottom Sheet
    if (showSmartRoute) {
        SmartRouteBottomSheet(
            onDismiss = { showSmartRoute = false },
            onJobClick = { jobId ->
                // Accept the job directly
                jobViewModel.acceptJob(jobId)
                // Optionally close the bottom sheet after accepting
                // showSmartRoute = false
            },
            onAcceptAll = { jobIds ->
                // Accept all jobs in the route
                jobIds.forEach { jobId ->
                    jobViewModel.acceptJob(jobId)
                }
                // Optionally close the bottom sheet after accepting all
                showSmartRoute = false
            }
        )
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        // Header with title
        Text(
            text = "Available Jobs",
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.padding(bottom = 12.dp)
        )

        // Controls row with Smart Route button and filter switch
        AvailableJobsControls(
            showOnlyAvailable = showOnlyAvailable,
            onFilterChange = { showOnlyAvailable = it },
            onSmartRouteClick = { showSmartRoute = true }
        )

        // Main content area with loading, error, and job list states
        AvailableJobsContent(
            jobUiState = jobUiState,
            moverAvailabilityUiState = moverAvailabilityUiState,
            showOnlyAvailable = showOnlyAvailable,
            onRetry = { jobViewModel.loadAvailableJobs() },
            onAcceptJob = { jobId -> jobViewModel.acceptJob(jobId) }
        )
    }
}

@Composable
private fun AvailableJobsControls(
    showOnlyAvailable: Boolean,
    onFilterChange: (Boolean) -> Unit,
    onSmartRouteClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(bottom = 16.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Smart Route Button
        FilledTonalButton(
            onClick = onSmartRouteClick,
            modifier = Modifier.height(40.dp)
        ) {
            Icon(
                Icons.Default.Route,
                contentDescription = "Smart Route",
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(4.dp))
            Text("Get Optimal Route")
        }

        // Filter switch
        Row(
            modifier = Modifier.testTag("availability_toggle"),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                text = if (!showOnlyAvailable) "Show All" else "Within Availability",
                style = MaterialTheme.typography.bodyMedium
            )
            Switch(
                checked = showOnlyAvailable,
                onCheckedChange = onFilterChange,
                modifier = Modifier.testTag("availability_switch")
            )
        }
    }
}

@Composable
private fun AvailableJobsContent(
    jobUiState: com.cpen321.usermanagement.ui.viewmodels.JobUiState,
    moverAvailabilityUiState: com.cpen321.usermanagement.ui.viewmodels.MoverAvailabilityUiState,
    showOnlyAvailable: Boolean,
    onRetry: () -> Unit,
    onAcceptJob: (String) -> Unit
) {
    when {
        jobUiState.isLoading -> {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        }
        jobUiState.error != null -> {
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "Error: ${jobUiState.error}",
                        style = MaterialTheme.typography.bodyLarge
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Button(onClick = onRetry) {
                        Text("Retry")
                    }
                }
            }
        }
        else -> {
            AvailableJobsList(
                jobUiState = jobUiState,
                moverAvailabilityUiState = moverAvailabilityUiState,
                showOnlyAvailable = showOnlyAvailable,
                onAcceptJob = onAcceptJob
            )
        }
    }
}

@Composable
private fun AvailableJobsList(
    jobUiState: com.cpen321.usermanagement.ui.viewmodels.JobUiState,
    moverAvailabilityUiState: com.cpen321.usermanagement.ui.viewmodels.MoverAvailabilityUiState,
    showOnlyAvailable: Boolean,
    onAcceptJob: (String) -> Unit
) {
    val jobsToShow = remember(jobUiState.availableJobs, showOnlyAvailable, moverAvailabilityUiState.availability) {
        if (showOnlyAvailable) {
            jobUiState.availableJobs.filter { job ->
                // job.scheduledTime is UTC LocalDateTime - need to convert to Pacific for comparison
                val utcDateTime = job.scheduledTime
                val pacificDateTime = utcDateTime.atZone(java.time.ZoneId.of("UTC"))
                    .withZoneSameInstant(java.time.ZoneId.of("America/Los_Angeles"))
                    .toLocalDateTime()
                
                val day = pacificDateTime.dayOfWeek
                val time = pacificDateTime.toLocalTime()

                val slots: List<Pair<LocalTime, LocalTime>> = moverAvailabilityUiState.availability[day].orEmpty()

                slots.any { slot: Pair<LocalTime, LocalTime> ->
                    val (start: LocalTime, end: LocalTime) = slot
                    TimeUtils.isTimeInRange(time, start, end)
                }
            }
        } else {
            jobUiState.availableJobs
        }
    }

    if (jobsToShow.isEmpty() && showOnlyAvailable) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "No available jobs within your availability. Try broadening your availability.",
                style = MaterialTheme.typography.bodyLarge
            )
        }
    } else if (jobsToShow.isEmpty()) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "No available jobs",
                style = MaterialTheme.typography.bodyLarge
            )
        }
    } else {
        LazyColumn(
            modifier = Modifier.testTag("find_jobs_list"),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(jobsToShow) { job ->
                AvailableJobCard(
                    job = job,
                    onAcceptClick = { onAcceptJob(job.id) }
                )
            }
        }
    }
}

package com.cpen321.usermanagement.ui.components.mover

import android.Manifest
import android.content.pm.PackageManager
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DirectionsCar
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.AttachMoney
import androidx.compose.material.icons.filled.CallToAction
import androidx.compose.material3.*
import androidx.compose.runtime.*
import kotlin.math.roundToInt
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.cpen321.usermanagement.data.remote.models.JobInRoute
import com.cpen321.usermanagement.data.remote.models.RouteMetrics
import com.cpen321.usermanagement.ui.theme.LocalSpacing
import com.cpen321.usermanagement.ui.theme.Spacing
import com.cpen321.usermanagement.ui.viewmodels.SmartRouteUiState
import com.cpen321.usermanagement.ui.viewmodels.SmartRouteViewModel
import com.cpen321.usermanagement.utils.TimeUtils
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SmartRouteBottomSheet(
    onDismiss: () -> Unit,
    onJobClick: (String) -> Unit,
    onAcceptAll: (List<String>) -> Unit,
    viewModel: SmartRouteViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val spacing = LocalSpacing.current
    val uiState by viewModel.uiState.collectAsState()
    val removedJobs by viewModel.removedJobs.collectAsState()
    var selectedDuration by remember { mutableStateOf<Int?>(null) } // null = unlimited
    var showDurationSelector by remember { mutableStateOf(true) }
    val snackbarHostState = remember { SnackbarHostState() }
    
    // Show snackbar when jobs are removed from route
    HandleRemovedJobsSnackbar(
        removedJobs = removedJobs,
        snackbarHostState = snackbarHostState,
        onClear = viewModel::clearRemovedJobs
    )

    val (hasLocationPermission, locationPermissionLauncher) = rememberLocationPermissionState(
        context = context,
        onPermissionGranted = {
            if (!showDurationSelector) {
                fetchCurrentLocationAndRoute(context, viewModel, selectedDuration)
            }
        }
    )

    LaunchedEffect(Unit) {
        if (hasLocationPermission && !showDurationSelector) {
            fetchCurrentLocationAndRoute(context, viewModel, selectedDuration)
        }
    }

    SmartRouteBottomSheetContent(
        callbacks = BottomSheetCallbacks(
            onDismiss = onDismiss,
            onDurationSelected = { selectedDuration = it },
            onDurationConfirm = {
                if (!hasLocationPermission) {
                    locationPermissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
                } else {
                    fetchCurrentLocationAndRoute(context, viewModel, selectedDuration)
                }
                showDurationSelector = false
            },
            onRequestPermission = { locationPermissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION) },
            onRetry = { fetchCurrentLocationAndRoute(context, viewModel, selectedDuration) },
            onJobClick = onJobClick,
            onAcceptAll = onAcceptAll
        ),
        state = BottomSheetContentState(
            snackbarHostState = snackbarHostState,
            spacing = spacing,
            showDurationSelector = showDurationSelector,
            selectedDuration = selectedDuration,
            uiState = uiState,
            hasLocationPermission = hasLocationPermission
        )
    )
}

data class BottomSheetContentState(
    val snackbarHostState: SnackbarHostState,
    val spacing: Spacing,
    val showDurationSelector: Boolean,
    val selectedDuration: Int?,
    val uiState: SmartRouteUiState,
    val hasLocationPermission: Boolean
)

data class BottomSheetCallbacks(
    val onDismiss: () -> Unit,
    val onDurationSelected: (Int?) -> Unit,
    val onDurationConfirm: () -> Unit,
    val onRequestPermission: () -> Unit,
    val onRetry: () -> Unit,
    val onJobClick: (String) -> Unit,
    val onAcceptAll: (List<String>) -> Unit
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SmartRouteBottomSheetContent(
    callbacks: BottomSheetCallbacks,
    state: BottomSheetContentState
) {
    ModalBottomSheet(
        onDismissRequest = callbacks.onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ) {
        Scaffold(
            snackbarHost = { SnackbarHost(state.snackbarHostState) }
        ) { paddingValues ->
            SmartRouteContent(
                callbacks = SmartRouteCallbacks(
                    onDismiss = callbacks.onDismiss,
                    onDurationSelected = callbacks.onDurationSelected,
                    onDurationConfirm = callbacks.onDurationConfirm,
                    onRequestPermission = callbacks.onRequestPermission,
                    onRetry = callbacks.onRetry,
                    onJobClick = callbacks.onJobClick,
                    onAcceptAll = callbacks.onAcceptAll
                ),
                state = ContentState(
                    spacing = state.spacing,
                    paddingValues = paddingValues,
                    showDurationSelector = state.showDurationSelector,
                    selectedDuration = state.selectedDuration,
                    uiState = state.uiState,
                    hasLocationPermission = state.hasLocationPermission
                )
            )
        }
    }
}

@Composable
private fun HandleRemovedJobsSnackbar(
    removedJobs: List<String>,
    snackbarHostState: SnackbarHostState,
    onClear: () -> Unit
) {
    LaunchedEffect(removedJobs) {
        if (removedJobs.isNotEmpty()) {
            val message = if (removedJobs.size == 1) {
                "A job was accepted by another mover and removed from your route"
            } else {
                "${removedJobs.size} jobs were accepted by other movers and removed from your route"
            }
            snackbarHostState.showSnackbar(
                message = message,
                duration = SnackbarDuration.Short
            )
            onClear()
        }
    }
}

@Composable
private fun rememberLocationPermissionState(
    context: android.content.Context,
    onPermissionGranted: () -> Unit
): Pair<Boolean, androidx.activity.compose.ManagedActivityResultLauncher<String, Boolean>> {
    var hasLocationPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        )
    }
    
    val locationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        hasLocationPermission = isGranted
        if (isGranted) {
            onPermissionGranted()
        }
    }
    
    return Pair(hasLocationPermission, locationPermissionLauncher)
}

data class ContentState(
    val spacing: Spacing,
    val paddingValues: PaddingValues,
    val showDurationSelector: Boolean,
    val selectedDuration: Int?,
    val uiState: SmartRouteUiState,
    val hasLocationPermission: Boolean
)

data class SmartRouteCallbacks(
    val onDismiss: () -> Unit,
    val onDurationSelected: (Int?) -> Unit,
    val onDurationConfirm: () -> Unit,
    val onRequestPermission: () -> Unit,
    val onRetry: () -> Unit,
    val onJobClick: (String) -> Unit,
    val onAcceptAll: (List<String>) -> Unit
)

@Composable
private fun SmartRouteContent(
    callbacks: SmartRouteCallbacks,
    state: ContentState
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(state.spacing.medium)
            .padding(state.paddingValues)
    ) {
        // Header
        SmartRouteHeader(onDismiss = callbacks.onDismiss)

        Spacer(modifier = Modifier.height(state.spacing.medium))

        // Show duration selector first, then route
        if (state.showDurationSelector) {
            DurationSelector(
                selectedDuration = state.selectedDuration,
                onDurationSelected = callbacks.onDurationSelected,
                onConfirm = callbacks.onDurationConfirm
            )
        } else {
            SmartRouteStateContent(
                uiState = state.uiState,
                hasLocationPermission = state.hasLocationPermission,
                onRequestPermission = callbacks.onRequestPermission,
                onRetry = callbacks.onRetry,
                onJobClick = callbacks.onJobClick,
                onAcceptAll = callbacks.onAcceptAll,
                spacing = state.spacing
            )
        }
    }
}

@Composable
private fun SmartRouteHeader(onDismiss: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = "Smart Route Suggestion",
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold
        )
        IconButton(onClick = onDismiss) {
            Icon(Icons.Default.Close, contentDescription = "Close")
        }
    }
}

@Composable
private fun SmartRouteStateContent(
    uiState: SmartRouteUiState,
    hasLocationPermission: Boolean,
    onRequestPermission: () -> Unit,
    onRetry: () -> Unit,
    onJobClick: (String) -> Unit,
    onAcceptAll: (List<String>) -> Unit,
    spacing: Spacing
) {
    // Existing route display logic
    when (uiState) {
        is SmartRouteUiState.Idle -> {
            if (!hasLocationPermission) {
                LocationPermissionRequired(onRequestPermission = onRequestPermission)
            } else {
                CircularProgressIndicator(
                    modifier = Modifier
                        .fillMaxWidth()
                        .wrapContentWidth(Alignment.CenterHorizontally)
                        .padding(spacing.large)
                )
            }
        }

        is SmartRouteUiState.Loading -> {
            Column(
                modifier = Modifier.fillMaxWidth().testTag("route_loading"),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                CircularProgressIndicator(modifier = Modifier.padding(spacing.large))
                Text(
                    text = "Calculating optimal route...",
                    style = MaterialTheme.typography.bodyMedium,
                    textAlign = TextAlign.Center
                )
            }
        }

        is SmartRouteUiState.Success -> {
            val data = uiState.data
            if (data.route.isEmpty()) {
                EmptyRouteState()
            } else {
                RouteContent(
                    route = data.route,
                    metrics = data.metrics,
                    onJobClick = onJobClick,
                    onAcceptAll = onAcceptAll
                )
            }
        }

        is SmartRouteUiState.Error -> {
            ErrorState(
                message = uiState.message,
                onRetry = { if (hasLocationPermission) onRetry() }
            )
        }
    }
}

@Composable
private fun LocationPermissionRequired(onRequestPermission: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            Icons.Default.LocationOn,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.primary
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "Location Permission Required",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "We need your location to calculate the optimal route",
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(16.dp))
//        Button(onClick = onRequestPermission) {
//            Text("Grant Permission")
//        }
    }
}

@Composable
private fun RouteContent(
    route: List<JobInRoute>,
    metrics: RouteMetrics,
    onJobClick: (String) -> Unit,
    onAcceptAll: (List<String>) -> Unit
) {
    val spacing = LocalSpacing.current
    
    LazyColumn(
        modifier = Modifier.fillMaxWidth().testTag("route_jobs_list"),
        verticalArrangement = Arrangement.spacedBy(spacing.medium)
    ) {
        // Metrics summary card
        item {
            RouteMetricsCard(metrics = metrics)
        }
        
        // Accept All Button
        item {
            Button(
                onClick = { 
                    onAcceptAll(route.map { it.jobId })
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = spacing.small)
                    .testTag("accept_all_jobs_button"),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary
                )
            ) {
                Icon(
                    Icons.Default.CallToAction,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Accept All Jobs (${route.size})",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
            }
        }
        
        // Route jobs
        item {
            Text(
                text = "Optimized Route (${route.size} jobs)",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(vertical = spacing.small)
            )
        }
        
        itemsIndexed(route) { index, job ->
            RouteJobCard(
                job = job,
                index = index,
                onJobClick = { onJobClick(job.jobId) }
            )
        }
        
        // Bottom spacing
        item {
            Spacer(modifier = Modifier.height(spacing.large))
        }
    }
}

@Composable
private fun RouteMetricsCard(metrics: RouteMetrics) {
    val spacing = LocalSpacing.current
    Card(
        modifier = Modifier.fillMaxWidth().testTag("route_summary"),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
    ) {
        Column(modifier = Modifier.padding(spacing.medium)) {
            Text(
                text = "Route Summary",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )

            Spacer(modifier = Modifier.height(spacing.small))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                MetricItem(
                    label = "Earnings",
                    value = "$${String.format("%.2f", metrics.totalEarnings)}",
                    icon = Icons.Default.AttachMoney,
                    testTag = "route_total_credits"
                )
                MetricItem(
                    label = "Jobs",
                    value = metrics.totalJobs.toString(),
                    icon = Icons.Default.CallToAction,
                    testTag = "route_job_count"
                )
                MetricItem(
                    label = "Distance",
                    value = "${String.format("%.1f", metrics.totalDistance)} km",
                    icon = Icons.Default.DirectionsCar,
                    testTag = "route_total_distance"
                )
            }

            Spacer(modifier = Modifier.height(spacing.small))
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceEvenly
            ) {
                MetricItem(
                    label = "Duration",
                    value = "${metrics.totalDuration} min",
                    icon = Icons.Default.Schedule,
                    testTag = "route_total_time"
                )
                MetricItem(
                    label = "$/Hour",
                    value = "$${String.format("%.2f", metrics.earningsPerHour)}",
                    icon = Icons.Default.AttachMoney,
                    testTag = "route_earnings_per_hour"
                )
            }
        }
    }
}

@Composable
private fun MetricItem(
    label: String,
    value: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    testTag: String = ""
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .padding(8.dp)
            .then(if (testTag.isNotEmpty()) Modifier.testTag(testTag) else Modifier)
    ) {
        Icon(
            icon,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(24.dp)
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onPrimaryContainer
        )
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onPrimaryContainer
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RouteJobCard(
    job: JobInRoute,
    index: Int,
    onJobClick: () -> Unit
) {
    val spacing = LocalSpacing.current
    
    Card(
        modifier = Modifier.fillMaxWidth().testTag("route_job_card")
    ) {
        Column(modifier = Modifier.padding(spacing.medium)) {
            // Header with job index, type, and price
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .background(
                                MaterialTheme.colorScheme.primary,
                                RoundedCornerShape(16.dp)
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        TextWithIndex(index = index)
                    }
                    Spacer(modifier = Modifier.width(spacing.small))
                    Text(
                        text = job.jobType,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = Color.Black
                    )
                }
                Text(
                    text = "$${String.format("%.2f", job.price)}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.testTag("route_job_credits")
                )
            }
            Spacer(modifier = Modifier.height(spacing.small))
            
            JobDetailsSection(job = job, spacing = spacing)
            
            Button(
                onClick = onJobClick,
                modifier = Modifier.fillMaxWidth().testTag("route_job_accept_button"),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.primary
                )
            ) {
                Icon(
                    Icons.Default.Schedule,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(spacing.extraSmall))
                Text("Accept Job")
            }
        }
    }
}

@Composable
private fun TextWithIndex(index: Int) {
    Text(
        text = "${index + 1}",
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.onPrimary
    )
}

@Composable
private fun JobDetailsSection(job: JobInRoute, spacing: Spacing) {
    if (job.distanceFromPrevious > 0) {
        Row(
            Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Default.DirectionsCar, null, Modifier.size(16.dp), tint = Color.Black)
            Spacer(Modifier.width(4.dp))
            Text(
                "${String.format("%.1f", job.distanceFromPrevious)} km • ${job.travelTimeFromPrevious} min travel",
                style = MaterialTheme.typography.bodySmall,
                color = Color.Black,
                modifier = Modifier.testTag("route_job_travel_time")
            )
        }
        Spacer(Modifier.height(spacing.extraSmall))
    }
    
    Row(
        Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(Icons.Default.LocationOn, null, Modifier.size(16.dp), tint = Color.Black)
        Spacer(Modifier.width(4.dp))
        Text(
            job.pickupAddress.formattedAddress,
            style = MaterialTheme.typography.bodySmall,
            color = Color.Black,
            maxLines = 1,
            modifier = Modifier.testTag("route_job_pickup_address")
        )
    }
    Spacer(Modifier.height(spacing.extraSmall))
    
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Schedule, null, Modifier.size(16.dp), tint = Color.Black)
            Spacer(Modifier.width(4.dp))
            Text(
                TimeUtils.formatDateTime(job.scheduledTime),
                style = MaterialTheme.typography.bodySmall,
                color = Color.Black
            )
        }
        Text(
            "${job.estimatedDuration} min job",
            style = MaterialTheme.typography.bodySmall,
            color = Color.Black
        )
    }
    
    Text(
        "${String.format("%.1f", job.volume)} m³",
        style = MaterialTheme.typography.bodySmall,
        color = Color.Black,
        modifier = Modifier.padding(top = spacing.extraSmall)
    )
    Spacer(Modifier.height(spacing.small))
}

@Composable
private fun EmptyRouteState() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            Icons.Default.DirectionsCar,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.secondary
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "No Jobs Available, Please Adjust Your Availability or Duration",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "No jobs match your current availability schedule",
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.secondary
        )
    }
}

@Composable
private fun ErrorState(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Error",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.error
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(16.dp))
        Button(onClick = onRetry) {
            Text("Retry")
        }
    }
}

@Composable
private fun DurationSelector(
    selectedDuration: Int?,
    onDurationSelected: (Int?) -> Unit,
    onConfirm: () -> Unit
) {
    val spacing = LocalSpacing.current
    val durationOptions = listOf(
        null to "Unlimited",
        120 to "2 hours",
        180 to "3 hours",
        240 to "4 hours",
        300 to "5 hours",
        360 to "6 hours",
        480 to "8 hours"
    )
    
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(spacing.medium),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Header
        Icon(
            Icons.Default.Schedule,
            contentDescription = null,
            modifier = Modifier.size(48.dp),
            tint = MaterialTheme.colorScheme.primary
        )

        Spacer(modifier = Modifier.height(spacing.medium))

        Text(
            text = "Maximum Shift Duration",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold
        )

        Spacer(modifier = Modifier.height(spacing.small))

        Text(
            text = "How long do you want to work?",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.secondary,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(spacing.large))
        
        DurationSliderSection(
            durationOptions = durationOptions,
            selectedDuration = selectedDuration,
            onDurationSelected = onDurationSelected,
            spacing = spacing
        )
        
        // Confirm button
        Spacer(modifier = Modifier.height(spacing.large))

        Button(
            onClick = onConfirm,
            modifier = Modifier.fillMaxWidth(),
            enabled = true
        ) {
            Text("Find Smart Route")
        }

        Spacer(modifier = Modifier.height(spacing.medium))
    }
}

@Composable
private fun DurationSliderSection(
    durationOptions: List<Pair<Int?, String>>,
    selectedDuration: Int?,
    onDurationSelected: (Int?) -> Unit,
    spacing: Spacing
) {
    val optionCount = durationOptions.size
    val initialIndex = durationOptions.indexOfFirst { it.first == selectedDuration }.let { if (it >= 0) it else 0 }
    var sliderPosition by remember { mutableStateOf(initialIndex.toFloat()) }

    Spacer(modifier = Modifier.height(spacing.small))

    Slider(
        modifier = Modifier.testTag("duration_slider"),
        value = sliderPosition,
        onValueChange = { sliderPosition = it },
        valueRange = 0f..(optionCount - 1).toFloat(),
        onValueChangeFinished = {
            val snapped = sliderPosition.roundToInt().coerceIn(0, optionCount - 1)
            sliderPosition = snapped.toFloat()
            val (duration, _) = durationOptions[snapped]
            onDurationSelected(duration)
        }
    )

    Spacer(modifier = Modifier.height(spacing.small))

    val currentIndex = sliderPosition.roundToInt().coerceIn(0, optionCount - 1)
    val (curDuration, curLabel) = durationOptions[currentIndex]
    Text(
        text = if (curDuration == null) curLabel else "$curLabel • ${curDuration} min",
        style = MaterialTheme.typography.bodyLarge,
        fontWeight = FontWeight.Bold,
        modifier = Modifier.padding(top = spacing.small)
    )
}

private fun fetchCurrentLocationAndRoute(
    context: android.content.Context,
    viewModel: SmartRouteViewModel,
    maxDuration: Int? = null
) {
    
    /* Production code with actual GPS:*/
    val fusedLocationClient: FusedLocationProviderClient =
        LocationServices.getFusedLocationProviderClient(context)
    
    try {
        // Request fresh location update instead of using cached location
        fusedLocationClient.getCurrentLocation(
            com.google.android.gms.location.Priority.PRIORITY_HIGH_ACCURACY,
            null
        ).addOnSuccessListener { location ->
            if (location != null) {
                Log.d("SmartRoute", "Mover Location (Fresh): ${location.latitude}, ${location.longitude}")
                viewModel.fetchSmartRoute(location.latitude, location.longitude, maxDuration)
            } else {
                // Fallback to Vancouver downtown if no location
                Log.d("SmartRoute", "No location available, using Vancouver fallback")
                viewModel.fetchSmartRoute(49.2827, -123.1207, maxDuration)
            }
        }.addOnFailureListener { e ->
            Log.e("SmartRoute", "Failed to get location: ${e.message}")
            // Fallback to Vancouver downtown
            viewModel.fetchSmartRoute(49.2827, -123.1207, maxDuration)
        }
    } catch (e: SecurityException) {
        Log.e("SmartRoute", "Location permission error: ${e.message}")
        // Fallback to Vancouver downtown
        viewModel.fetchSmartRoute(49.2827, -123.1207, maxDuration)
        }
    }


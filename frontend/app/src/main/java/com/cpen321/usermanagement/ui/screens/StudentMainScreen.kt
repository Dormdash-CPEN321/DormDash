package com.cpen321.usermanagement.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.ui.unit.dp
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import com.cpen321.usermanagement.R
import com.cpen321.usermanagement.ui.components.common.MessageSnackbar
import com.cpen321.usermanagement.ui.components.common.MessageSnackbarState
import com.cpen321.usermanagement.ui.components.common.Icon
import com.cpen321.usermanagement.ui.viewmodels.MainUiState
import com.cpen321.usermanagement.ui.viewmodels.MainViewModel
import com.cpen321.usermanagement.ui.viewmodels.AuthViewModel
import com.cpen321.usermanagement.ui.theme.LocalFontSizes
import com.cpen321.usermanagement.ui.theme.LocalSpacing
import com.cpen321.usermanagement.ui.components.student.OrderPanel
import com.cpen321.usermanagement.ui.components.student.StatusPanel
import com.cpen321.usermanagement.ui.components.student.CreateOrderBottomSheet
import com.cpen321.usermanagement.ui.components.student.CreateReturnJobBottomSheet
import com.cpen321.usermanagement.data.remote.models.OrderRequest
import com.cpen321.usermanagement.data.remote.models.CreateReturnJobRequest
import com.cpen321.usermanagement.data.local.models.Order
import com.cpen321.usermanagement.ui.viewmodels.OrderViewModel
import com.cpen321.usermanagement.data.repository.PaymentRepository
import com.cpen321.usermanagement.data.remote.api.RetrofitClient
import androidx.hilt.navigation.compose.hiltViewModel
import com.cpen321.usermanagement.ui.viewmodels.JobViewModel
import dagger.hilt.android.EntryPointAccessors
import retrofit2.HttpException
import java.io.IOException
import dagger.hilt.android.AndroidEntryPoint
import androidx.compose.ui.platform.LocalContext
import androidx.compose.runtime.rememberCoroutineScope
import androidx.collection.orderedScatterSetOf
import androidx.compose.runtime.LaunchedEffect
import android.util.Log
import androidx.compose.material3.Icon
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collect
import com.cpen321.usermanagement.di.SocketClientEntryPoint
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import com.cpen321.usermanagement.data.local.models.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StudentMainScreen(
    mainViewModel: MainViewModel,
    orderViewModel: OrderViewModel,
    onProfileClick: () -> Unit
) {
    val uiState by mainViewModel.uiState.collectAsState()
    val activeOrder by orderViewModel.activeOrder.collectAsState()
    val snackBarHostState = remember { SnackbarHostState() }
    val appCtx = LocalContext.current.applicationContext
    val jobViewModel: JobViewModel = hiltViewModel()
    val jobUiState by jobViewModel.uiState.collectAsState()
    val coroutineScope = rememberCoroutineScope()

    // Initial load of active order and check for pending confirmations
    InitialDataLoad(orderViewModel, jobViewModel)

    // Subscribe to socket events for snackbar notifications
    SocketEventHandler(appCtx, snackBarHostState)

    // Student confirmation modal
    StudentConfirmationModal(
        pendingConfirmJobId = jobUiState.pendingConfirmationJobId,
        studentJobs = jobUiState.studentJobs,
        jobViewModel = jobViewModel,
        coroutineScope = coroutineScope
    )

    MainContent(
        uiState = uiState,
        activeOrder = activeOrder,
        studentJobs = jobUiState.studentJobs,
        orderViewModel = orderViewModel,
        snackBarHostState = snackBarHostState,
        StudentMainContentActions(
            onProfileClick = onProfileClick,
            onSuccessMessageShown = mainViewModel::clearSuccessMessage
        )   
    )
}

@Composable
private fun InitialDataLoad(
    orderViewModel: OrderViewModel,
    jobViewModel: JobViewModel
) {
    LaunchedEffect(Unit) {
        orderViewModel.refreshActiveOrder()
        jobViewModel.checkForPendingConfirmations()
        jobViewModel.loadStudentJobs()
    }
}

@Composable
private fun SocketEventHandler(
    appContext: android.content.Context,
    snackBarHostState: SnackbarHostState
) {
    LaunchedEffect(true) {
        val entry = EntryPointAccessors.fromApplication(appContext, SocketClientEntryPoint::class.java)
        val socketClient = entry.socketClient()

        socketClient.events.collect { ev ->
            when (ev.name) {
                "job.updated" -> handleJobUpdatedEvent(ev, snackBarHostState)
                "order.updated" -> handleOrderUpdatedEvent(ev, snackBarHostState)
            }
        }
    }
}

private suspend fun handleJobUpdatedEvent(
    event: com.cpen321.usermanagement.network.SocketEvent,
    snackBarHostState: SnackbarHostState
) {
    val jobData = when {
        event.payload == null -> null
        event.payload.has("job") -> event.payload.optJSONObject("job")
        else -> event.payload
    }

    val status = jobData?.optString("status")
    val jobType = jobData?.optString("jobType")

    val message = when (status) {
        "AWAITING_STUDENT_CONFIRMATION" -> {
            when (jobType) {
                "STORAGE" -> "Mover is requesting confirmation that they've picked up your items"
                "RETURN" -> "Mover is requesting confirmation that they've delivered your items"
                else -> "Mover is requesting confirmation"
            }
        }
        "PICKED_UP" -> {
            when (jobType) {
                "STORAGE" -> "Mover has picked up your items"
                "RETURN" -> "Items picked up from storage"
                else -> "Mover has picked up items"
            }
        }
        "COMPLETED" -> {
            when (jobType) {
                "STORAGE" -> "Your items have been delivered to the storage facility!"
                "RETURN" -> "Your items have been returned to you!"
                else -> "Job completed successfully!"
            }
        }
        else -> null
    }

    message?.let {
        snackBarHostState.showSnackbar(
            message = it,
            duration = SnackbarDuration.Long
        )
    }
}

private suspend fun handleOrderUpdatedEvent(
    event: com.cpen321.usermanagement.network.SocketEvent,
    snackBarHostState: SnackbarHostState
) {
    val orderData = when {
        event.payload == null -> null
        event.payload.has("order") -> event.payload.optJSONObject("order")
        else -> event.payload
    }

    val orderStatus = orderData?.optString("status")
    
    val message = when (orderStatus) {
        "COMPLETED" -> "🎉 Order completed! Thank you for using our service."
        "CANCELLED" -> "Order cancelled successfully. Refund has been processed."
        else -> null
    }
    
    message?.let {
        snackBarHostState.showSnackbar(
            message = it,
            duration = SnackbarDuration.Long
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StudentConfirmationModal(
    pendingConfirmJobId: String?,
    studentJobs: List<Job>,
    jobViewModel: JobViewModel,
    coroutineScope: kotlinx.coroutines.CoroutineScope
) {
    if (pendingConfirmJobId != null) {
        val jobId = pendingConfirmJobId
        val pendingJob = studentJobs.find { it.id == jobId }
        val isReturnJob = pendingJob?.jobType == com.cpen321.usermanagement.data.local.models.JobType.RETURN
        
        ModalBottomSheet(
            onDismissRequest = { jobViewModel.clearPendingConfirmation() },
            sheetState = rememberModalBottomSheetState()
        ) {
            ConfirmationModalContent(
                isReturnJob = isReturnJob,
                onConfirm = {
                    coroutineScope.launch {
                        if (isReturnJob) {
                            jobViewModel.confirmDelivery(jobId)
                        } else {
                            jobViewModel.confirmPickup(jobId)
                        }
                    }
                }
            )
        }
    }
}

@Composable
private fun ConfirmationModalContent(
    isReturnJob: Boolean,
    onConfirm: () -> Unit
) {
    Column(
        modifier = Modifier.padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            if (isReturnJob) "Confirm delivery" else "Confirm pickup", 
            style = MaterialTheme.typography.titleMedium
        )
        Text(
            if (isReturnJob) 
                "A mover is requesting confirmation that they've delivered your items. Confirm?" 
            else 
                "A mover is requesting confirmation that they've collected your items. Confirm?", 
            style = MaterialTheme.typography.bodyMedium
        )
        androidx.compose.foundation.layout.Spacer(modifier = Modifier.size(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            androidx.compose.material3.Button(onClick = onConfirm, modifier = Modifier.testTag("confirm arrival button")) {
                Text("Confirm")
            }
        }
    }
}

// use shared SocketClientEntryPoint in com.cpen321.usermanagement.di

data class StudentMainContentActions(
    val onProfileClick: () -> Unit,
    val onSuccessMessageShown: () -> Unit
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainContent(
    uiState: MainUiState,
    activeOrder: Order?,
    studentJobs: List<Job>,
    orderViewModel: OrderViewModel,
    snackBarHostState: SnackbarHostState,
    actions: StudentMainContentActions,
    modifier: Modifier = Modifier
) {
    var showCreateOrderSheet by remember { mutableStateOf(false) }
    var showCreateReturnJobSheet by remember { mutableStateOf(false) }
    
    Scaffold(
        modifier = modifier,
        topBar = {
            MainTopBar(onProfileClick = actions.onProfileClick)
        },
        snackbarHost = {
            MainSnackbarHost(
                hostState = snackBarHostState,
                successMessage = uiState.successMessage,
                onSuccessMessageShown = actions.onSuccessMessageShown
            )
        }
    ) { paddingValues ->
        MainBody(
            paddingValues = paddingValues,
            activeOrder = activeOrder,
            studentJobs = studentJobs,
            onCreateOrderClick = { showCreateOrderSheet = true },
            onCreateReturnJobClick = { showCreateReturnJobSheet = true }
        )
    }
    
    CreateOrderBottomSheetHandler(
        showSheet = showCreateOrderSheet,
        onDismiss = { showCreateOrderSheet = false },
        orderViewModel = orderViewModel
    )
    
    CreateReturnJobBottomSheetHandler(
        showSheet = showCreateReturnJobSheet,
        activeOrder = activeOrder,
        onDismiss = { showCreateReturnJobSheet = false },
        orderViewModel = orderViewModel,
        snackBarHostState = snackBarHostState
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CreateOrderBottomSheetHandler(
    showSheet: Boolean,
    onDismiss: () -> Unit,
    orderViewModel: OrderViewModel
) {
    if (!showSheet) return
    
    val bottomSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val coroutineScope = rememberCoroutineScope()
    
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = bottomSheetState
    ) {
        CreateOrderBottomSheet(
            onDismiss = onDismiss,
            orderViewModel = orderViewModel,
            paymentRepository = PaymentRepository(RetrofitClient.paymentInterface),
            onSubmitOrder = { orderRequest, paymentIntentId ->
                coroutineScope.launch {
                    val result = orderViewModel.submitOrder(orderRequest, paymentIntentId)
                    result.onSuccess { order ->
                        println("Order submitted successfully: $order")
                    }.onFailure { exception ->
                        println("Order submission failed: $exception")
                    }
                    onDismiss()
                }
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CreateReturnJobBottomSheetHandler(
    showSheet: Boolean,
    activeOrder: Order?,
    onDismiss: () -> Unit,
    orderViewModel: OrderViewModel,
    snackBarHostState: SnackbarHostState
) {
    if (!showSheet || activeOrder == null) return
    
    val coroutineScope = rememberCoroutineScope()
    
    CreateReturnJobBottomSheet(
        activeOrder = activeOrder,
        paymentRepository = PaymentRepository(RetrofitClient.paymentInterface),
        onDismiss = onDismiss,
        onSubmit = { request, paymentIntentId ->
            coroutineScope.launch {
                try {
                    val response = orderViewModel.createReturnJob(request)

                    // Refresh order data before dismissing to ensure UI shows updated info
                    orderViewModel.refreshActiveOrder()

                    onDismiss()
                    
                    val message = when {
                        response.refundAmount != null && response.refundAmount > 0 -> {
                            "Return job created! Refund of $${String.format("%.2f", response.refundAmount)} has been processed for early return."
                        }
                        response.lateFee != null && response.lateFee > 0 -> {
                            "Return job created with late fee of $${String.format("%.2f", response.lateFee)}."
                        }
                        else -> "Return job created successfully!"
                    }
                    
                    snackBarHostState.showSnackbar(message = message, duration = SnackbarDuration.Long)
                } catch (e: HttpException) {
                    snackBarHostState.showSnackbar(
                        message = "Failed to create return job: Server error (${e.code()})",
                        duration = SnackbarDuration.Long
                    )
                } catch (e: IOException) {
                    snackBarHostState.showSnackbar(
                        message = "Failed to create return job: Network error",
                        duration = SnackbarDuration.Long
                    )
                } catch (e: IllegalStateException) {
                    snackBarHostState.showSnackbar(
                        message = "Failed to create return job: ${e.message}",
                        duration = SnackbarDuration.Long
                    )
                }
            }
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainTopBar(
    onProfileClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    TopAppBar(
        modifier = modifier,
        title = {
            AppTitle()
        },
        actions = {
            ProfileActionButton(onClick = onProfileClick)
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = MaterialTheme.colorScheme.surface,
            titleContentColor = MaterialTheme.colorScheme.onSurface
        )
    )
}

@Composable
private fun AppTitle(
    modifier: Modifier = Modifier
) {
    Row{
        Text(
            text = stringResource(R.string.app_name),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Medium,
            modifier = modifier
        )
        Text(
            text = " (Student)",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Light,
            modifier = modifier
        )
    }
    
}

@Composable
private fun ProfileActionButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val spacing = LocalSpacing.current

    IconButton(
        onClick = onClick,
        modifier = modifier
            .size(spacing.extraLarge2)
            .testTag("ProfileButton")
    ) {
        ProfileIcon()
    }
}

@Composable
private fun ProfileIcon() {
    Icon(
        painter = painterResource(id = R.drawable.ic_account_circle),
        contentDescription = "Profile",
        tint = MaterialTheme.colorScheme.onSurface
    )
}

@Composable
private fun MainSnackbarHost(
    hostState: SnackbarHostState,
    successMessage: String?,
    onSuccessMessageShown: () -> Unit,
    modifier: Modifier = Modifier
) {
    MessageSnackbar(
        hostState = hostState,
        messageState = MessageSnackbarState(
            successMessage = successMessage,
            errorMessage = null,
            onSuccessMessageShown = onSuccessMessageShown,
            onErrorMessageShown = { }
        ),
        modifier = modifier
    )
}

@Composable
private fun MainBody(
    paddingValues: PaddingValues,
    activeOrder: com.cpen321.usermanagement.data.local.models.Order?,
    studentJobs: List<Job>,
    onCreateOrderClick: () -> Unit,
    onCreateReturnJobClick: ()-> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(paddingValues)
            .padding(top = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Order Panel (Main centerpiece)
        OrderPanel(
            hasActiveOrder = activeOrder != null, // Real state!
            activeOrder = activeOrder, // Pass the actual order data
            onCreateOrderClick = onCreateOrderClick
        )
        
        // Status Panel (Hidden when no active order)
        StatusPanel(
            activeOrder = activeOrder, // Pass the actual order data
            studentJobs = studentJobs, // Pass student jobs to check if return job exists
            onCreateReturnJob = onCreateReturnJobClick
        )
    }
}

@Composable
private fun WelcomeMessage(
    modifier: Modifier = Modifier
) {
    val fontSizes = LocalFontSizes.current

    Text(
        text = stringResource(R.string.welcome),
        style = MaterialTheme.typography.bodyLarge,
        fontSize = fontSizes.extraLarge3,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier
    )
}
package com.cpen321.usermanagement.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Work
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.cpen321.usermanagement.R
import com.cpen321.usermanagement.ui.components.MessageSnackbar
import com.cpen321.usermanagement.ui.components.MessageSnackbarState
import com.cpen321.usermanagement.ui.viewmodels.MainUiState
import com.cpen321.usermanagement.ui.viewmodels.MainViewModel
import com.cpen321.usermanagement.ui.viewmodels.JobViewModel
import com.cpen321.usermanagement.ui.theme.LocalSpacing
import com.cpen321.usermanagement.data.local.models.JobStatus

enum class MoverScreen {
    CURRENT_JOBS,
    AVAILABLE_JOBS,
    SET_AVAILABILITY
}

@Composable
fun MoverMainScreen(
    mainViewModel: MainViewModel,
    onProfileClick: () -> Unit,
    onJobDetails: (String) -> Unit = {},
    jobViewModel: JobViewModel = hiltViewModel()
) {
    val mainUiState by mainViewModel.uiState.collectAsState()
    val jobUiState by jobViewModel.uiState.collectAsState()
    val snackBarHostState = remember { SnackbarHostState() }

    // Load jobs when screen first composes
    // JobViewModel handles socket events (job.created, job.updated) automatically
    LaunchedEffect(Unit) {
        jobViewModel.loadMoverJobs()
        jobViewModel.loadAvailableJobs()
    }

    // Filter current jobs (ACCEPTED or in progress)
    val currentJobs = remember(jobUiState.moverJobs) {
        jobUiState.moverJobs.filter { 
            it.status == JobStatus.ACCEPTED || it.status == JobStatus.PICKED_UP || it.status == JobStatus.AWAITING_STUDENT_CONFIRMATION
        }
    }

    MainContent(
        MainContentState(
            mainUiState = mainUiState,
            currentJobs = currentJobs,
            isLoading = jobUiState.isLoading,
            error = jobUiState.error,
            snackBarHostState = snackBarHostState
        ),
        MoverMainContentActions(
            onProfileClick = onProfileClick,
            onSuccessMessageShown = mainViewModel::clearSuccessMessage,
            onJobDetails = { job -> onJobDetails(job.id) },
            onRefresh = {
                jobViewModel.loadMoverJobs()
                jobViewModel.loadAvailableJobs()
            }
        )
    )
}

data class MainContentState(
    val mainUiState: MainUiState,
    val currentJobs: List<com.cpen321.usermanagement.data.local.models.Job>,
    val isLoading: Boolean,
    val error: String?,
    val snackBarHostState: SnackbarHostState
)

data class MoverMainContentActions(
    val onProfileClick: () -> Unit,
    val onSuccessMessageShown: () -> Unit,
    val onJobDetails: (com.cpen321.usermanagement.data.local.models.Job) -> Unit,
    val onRefresh: () -> Unit
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainContent(
    state: MainContentState,
    actions: MoverMainContentActions,
    modifier: Modifier = Modifier
) {
    var currentScreen by remember { mutableStateOf(MoverScreen.CURRENT_JOBS) }

    Scaffold(
        modifier = modifier,
        topBar = {
            MainTopBar(onProfileClick = actions.onProfileClick)
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = currentScreen == MoverScreen.CURRENT_JOBS,
                    onClick = { currentScreen = MoverScreen.CURRENT_JOBS },
                    icon = { Icon(Icons.Default.Work, contentDescription = "Current Jobs") },
                    label = { Text("Current Jobs") }
                )
                NavigationBarItem(
                    selected = currentScreen == MoverScreen.AVAILABLE_JOBS,
                    onClick = { currentScreen = MoverScreen.AVAILABLE_JOBS },
                    icon = { Icon(Icons.Default.Search, contentDescription = "Find Jobs") },
                    label = { Text("Find Jobs") }
                )
                NavigationBarItem(
                    selected = currentScreen == MoverScreen.SET_AVAILABILITY,
                    onClick = { currentScreen = MoverScreen.SET_AVAILABILITY },
                    icon = { Icon(Icons.Default.Schedule, contentDescription = "Set Availability") },
                    label = { Text("Availability") }
                )
            }
        },
        snackbarHost = {
            MainSnackbarHost(
                hostState = state.snackBarHostState,
                successMessage = state.mainUiState.successMessage,
                onSuccessMessageShown = actions.onSuccessMessageShown
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when (currentScreen) {
                MoverScreen.CURRENT_JOBS -> CurrentJobsScreen(
                    jobs = state.currentJobs,
                    isLoading = state.isLoading,
                    error = state.error,
                    onJobDetails = actions.onJobDetails,
                    onRefresh = actions.onRefresh
                )
                MoverScreen.AVAILABLE_JOBS -> AvailableJobsScreen(
                    modifier = Modifier.fillMaxSize()
                )
                MoverScreen.SET_AVAILABILITY -> SetAvailabilityScreen()
            }
        }
    }
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
    Row {
        Text(
            text = stringResource(R.string.app_name),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Medium,
            modifier = modifier
        )
        Text(
            text = " (Mover)",
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
private fun ErrorCard(
    message: String,
    onRetry: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(
                text = message,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onErrorContainer
            )
            Spacer(modifier = Modifier.height(8.dp))
            Button(
                onClick = onRetry,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error
                )
            ) {
                Text("Retry")
            }
        }
    }
}

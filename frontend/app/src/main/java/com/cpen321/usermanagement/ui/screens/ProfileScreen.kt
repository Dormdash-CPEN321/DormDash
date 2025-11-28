package com.cpen321.usermanagement.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.hilt.navigation.compose.hiltViewModel
import com.cpen321.usermanagement.R
import com.cpen321.usermanagement.data.remote.models.User
import com.cpen321.usermanagement.ui.components.common.MessageSnackbar
import com.cpen321.usermanagement.ui.components.common.MessageSnackbarState
import com.cpen321.usermanagement.ui.components.common.Icon
import com.cpen321.usermanagement.ui.components.common.Button
import com.cpen321.usermanagement.ui.components.common.MenuButtonItem
import com.cpen321.usermanagement.ui.viewmodels.AuthViewModel
import com.cpen321.usermanagement.ui.viewmodels.DevViewModel
import com.cpen321.usermanagement.ui.viewmodels.ProfileUiState
import com.cpen321.usermanagement.ui.viewmodels.ProfileViewModel
import com.cpen321.usermanagement.ui.theme.LocalSpacing

private data class ProfileDialogState(
    val showDeleteDialog: Boolean = false
)

data class ProfileScreenActions(
    val onBackClick: () -> Unit,
    val onManageProfileClick: () -> Unit,
    val onManageOrdersClick: () -> Unit,
    val onSignOut: () -> Unit,
    val onAccountDeleted: () -> Unit
)

private data class ProfileScreenCallbacks(
    val onBackClick: () -> Unit,
    val onManageProfileClick: () -> Unit,
    val onManageOrdersClick: () -> Unit,
    val onDeleteAccountClick: () -> Unit,
    val onSignOutClick: () -> Unit,
    val onDeleteDialogDismiss: () -> Unit,
    val onDeleteDialogConfirm: () -> Unit,
    val onSuccessMessageShown: () -> Unit,
    val onErrorMessageShown: () -> Unit,
    val onCashOutClick: () -> Unit
)

@Composable
fun ProfileScreen(
    authViewModel: AuthViewModel,
    profileViewModel: ProfileViewModel,
    userRole: String?,
    actions: ProfileScreenActions
) {
    val uiState by profileViewModel.uiState.collectAsState()
    val snackBarHostState = remember { SnackbarHostState() }

    // Prevent ghost clicks by disabling interaction during navigation
    var isNavigating by remember { mutableStateOf(false) }
    var dialogState by remember { mutableStateOf(ProfileDialogState()) }

    LaunchedEffect(Unit) {
        profileViewModel.clearSuccessMessage()
        profileViewModel.clearError()
        profileViewModel.loadProfile()
    }

    ProfileContent(
        uiState = uiState,
        dialogState = dialogState,
        snackBarHostState = snackBarHostState,
        userRole = userRole,
        isInteractive = !isNavigating,
        callbacks = createProfileCallbacks(
            isNavigating = isNavigating,
            onNavigatingChange = { isNavigating = it },
            dialogState = dialogState,
            onDialogStateChange = { dialogState = it },
            authViewModel = authViewModel,
            profileViewModel = profileViewModel,
            actions = actions
        )
    )
}

@Composable
private fun createProfileCallbacks(
    isNavigating: Boolean,
    onNavigatingChange: (Boolean) -> Unit,
    dialogState: ProfileDialogState,
    onDialogStateChange: (ProfileDialogState) -> Unit,
    authViewModel: AuthViewModel,
    profileViewModel: ProfileViewModel,
    actions: ProfileScreenActions
): ProfileScreenCallbacks {
    return ProfileScreenCallbacks(
        onBackClick = {
            if (!isNavigating) {
                onNavigatingChange(true)
                actions.onBackClick()
            }
        },
        onManageProfileClick = {
            if (!isNavigating) {
                onNavigatingChange(true)
                actions.onManageProfileClick()
            }
        },
        onManageOrdersClick = {
            if (!isNavigating) {
                onNavigatingChange(true)
                actions.onManageOrdersClick()
            }
        },
        onDeleteAccountClick = {
            onDialogStateChange(dialogState.copy(showDeleteDialog = true))
        },
        onSignOutClick = {
            if (!isNavigating) {
                onNavigatingChange(true)
                authViewModel.handleSignout()
                actions.onSignOut()
            }
        },
        onDeleteDialogDismiss = {
            onDialogStateChange(dialogState.copy(showDeleteDialog = false))
        },
        onDeleteDialogConfirm = {
            onDialogStateChange(dialogState.copy(showDeleteDialog = false))
            profileViewModel.deleteAccount(
                onSuccess = {
                    authViewModel.handleAccountDeletion()
                    if (!isNavigating) {
                        onNavigatingChange(true)
                        actions.onAccountDeleted()
                    }
                }
            )
        },
        onSuccessMessageShown = profileViewModel::clearSuccessMessage,
        onErrorMessageShown = profileViewModel::clearError,
        onCashOutClick = {
            profileViewModel.cashOut()
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProfileContent(
    uiState: ProfileUiState,
    dialogState: ProfileDialogState,
    snackBarHostState: SnackbarHostState,
    userRole: String?,
    isInteractive: Boolean = true,
    callbacks: ProfileScreenCallbacks,
    modifier: Modifier = Modifier
) {
    Scaffold(
        modifier = modifier,
        topBar = {
            ProfileTopBar(onBackClick = callbacks.onBackClick)
        },
        snackbarHost = {
            MessageSnackbar(
                hostState = snackBarHostState,
                messageState = MessageSnackbarState(
                    successMessage = uiState.successMessage,
                    errorMessage = uiState.errorMessage,
                    onSuccessMessageShown = callbacks.onSuccessMessageShown,
                    onErrorMessageShown = callbacks.onErrorMessageShown
                )
            )
        }
    ) { paddingValues ->
        ProfileBody(
            paddingValues = paddingValues,
            isLoading = uiState.isLoadingProfile,
            user = uiState.user,
            isInteractive = isInteractive,
            ProfileMenuActions(
                onManageProfileClick = callbacks.onManageProfileClick,
                onManageOrdersClick = callbacks.onManageOrdersClick,
                onDeleteAccountClick = callbacks.onDeleteAccountClick,
                onSignOutClick = callbacks.onSignOutClick,
                onCashOutClick = callbacks.onCashOutClick
            )
        )
    }

    if (dialogState.showDeleteDialog) {
        DeleteAccountDialog(
            onDismiss = callbacks.onDeleteDialogDismiss,
            onConfirm = callbacks.onDeleteDialogConfirm
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProfileTopBar(
    onBackClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    TopAppBar(
        modifier = modifier,
        title = {
            Text(
                text = stringResource(R.string.profile),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Medium
            )
        },
        navigationIcon = {
            IconButton(onClick = onBackClick) {
                Icon(name = R.drawable.ic_arrow_back)
            }
        },
        colors = TopAppBarDefaults.topAppBarColors(
            containerColor = MaterialTheme.colorScheme.surface,
            titleContentColor = MaterialTheme.colorScheme.onSurface
        )
    )
}

data class ProfileMenuActions(
    val onManageProfileClick: () -> Unit,
    val onManageOrdersClick: () -> Unit,
    val onDeleteAccountClick: () -> Unit,
    val onSignOutClick: () -> Unit,
    val onCashOutClick: () -> Unit
)

@Composable
private fun ProfileBody(
    paddingValues: PaddingValues,
    isLoading: Boolean,
    user: User?,
    isInteractive: Boolean = true,
    actions: ProfileMenuActions,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxSize()
            .padding(paddingValues)
    ) {
        when {
            isLoading -> {
                LoadingIndicator(
                    modifier = Modifier.align(Alignment.Center)
                )
            }

            else -> {
                ProfileMenuItems(
                    user = user,
                    isInteractive = isInteractive,
                    ProfileMenuItemActions(
                        onManageProfileClick = actions.onManageProfileClick,
                        onManageOrdersClick = actions.onManageOrdersClick,
                        onSignOutClick = actions.onSignOutClick,
                        onDeleteAccountClick = actions.onDeleteAccountClick,
                        onCashOutClick = actions.onCashOutClick
                    )
                )
            }
        }
    }
}

data class ProfileMenuItemActions(
    val onManageProfileClick: () -> Unit,
    val onManageOrdersClick: () -> Unit,
    val onSignOutClick: () -> Unit,
    val onDeleteAccountClick: () -> Unit,
    val onCashOutClick: () -> Unit
)

@Composable
private fun ProfileMenuItems(
    user: User?,
    isInteractive: Boolean = true,
    actions: ProfileMenuItemActions,
    modifier: Modifier = Modifier
) {
    val spacing = LocalSpacing.current
    val scrollState = rememberScrollState()
    val userRole = user?.userRole
    val devViewModel: DevViewModel = hiltViewModel()
    val devUiState by devViewModel.uiState.collectAsState()

    // Show snackbar for dev operations
    LaunchedEffect(devUiState.message, devUiState.error) {
        // Messages will be displayed in the dev section itself
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(spacing.large)
            .verticalScroll(scrollState),
        verticalArrangement = Arrangement.spacedBy(spacing.medium)
    ) {
        // Credits section for movers only
        if (userRole?.uppercase() == "MOVER") {
            CreditsSection(
                credits = user?.credits ?: 0f,
                onCashOutClick = actions.onCashOutClick
            )
        }

        ProfileSection(
            userRole = userRole,
            isInteractive = isInteractive,
            onManageProfileClick = actions.onManageProfileClick,
            onManageOrdersClick  = actions.onManageOrdersClick
        )

        AccountSection(
            isInteractive = isInteractive,
            onSignOutClick =  actions.onSignOutClick,
            onDeleteAccountClick = actions.onDeleteAccountClick
        )

        // Development tools section
        DevToolsSection(
            devViewModel = devViewModel,
            devUiState = devUiState,
            isInteractive = isInteractive
        )
    }
}

@Composable
private fun ProfileSection(
    userRole: String?,
    isInteractive: Boolean = true,
    onManageProfileClick: () -> Unit,
    onManageOrdersClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(LocalSpacing.current.medium)
    ) {
        MenuButtonItem(
            text = stringResource(R.string.manage_profile),
            iconRes = R.drawable.ic_manage_profile,
            onClick = onManageProfileClick,
            enabled = isInteractive,
        )
        if (userRole?.uppercase() == "MOVER") {
            MenuButtonItem(
                text = stringResource(R.string.job_history),
                iconRes = R.drawable.ic_edit,
                onClick = onManageOrdersClick,
                enabled = isInteractive,
            )
        } else {
            MenuButtonItem(
                text = stringResource(R.string.manage_orders),
                iconRes = R.drawable.ic_edit,
                onClick = onManageOrdersClick,
                enabled = isInteractive,
            )
        }
    }
}

@Composable
private fun AccountSection(
    isInteractive: Boolean = true,
    onSignOutClick: () -> Unit,
    onDeleteAccountClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(LocalSpacing.current.medium)
    ) {
        MenuButtonItem(
            text = stringResource(R.string.sign_out),
            iconRes = R.drawable.ic_sign_out,
            onClick = onSignOutClick,
            enabled = isInteractive,
        )
        MenuButtonItem(
            text = stringResource(R.string.delete_account),
            iconRes = R.drawable.ic_delete_forever,
            onClick = onDeleteAccountClick,
            enabled = isInteractive,
        )
    }
}

@Composable
private fun CreditsSection(
    credits: Float,
    onCashOutClick: () -> Unit,
    isInteractive: Boolean = true,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(LocalSpacing.current.medium)
    ) {
        // Credits display
        androidx.compose.material3.Card(
            modifier = Modifier.fillMaxWidth(),
            colors = androidx.compose.material3.CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.primaryContainer
            )
        ) {
            Column(
                modifier = Modifier.padding(LocalSpacing.current.large),
                verticalArrangement = Arrangement.spacedBy(LocalSpacing.current.small)
            ) {
                Text(
                    text = "Earned Credits",
                    style = MaterialTheme.typography.titleMedium,
                    color = MaterialTheme.colorScheme.onPrimaryContainer
                )
                Text(
                    text = "$${String.format("%.2f", credits)}",
                    style = MaterialTheme.typography.headlineLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onPrimaryContainer
                )
            }
        }

        // Cash out button
        Button(
            fullWidth = true,
            onClick = onCashOutClick,
            enabled = isInteractive
        ) {
            Text("Cash Out")
        }
    }
}

@Composable
private fun DeleteAccountDialog(
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
    modifier: Modifier = Modifier
) {
    AlertDialog(
        modifier = modifier,
        onDismissRequest = onDismiss,
        title = {
            DeleteDialogTitle()
        },
        text = {
            DeleteDialogText()
        },
        confirmButton = {
            DeleteDialogConfirmButton(onClick = onConfirm)
        },
        dismissButton = {
            DeleteDialogDismissButton(onClick = onDismiss)
        }
    )
}

@Composable
private fun DeleteDialogTitle(
    modifier: Modifier = Modifier
) {
    Text(
        text = stringResource(R.string.delete_account),
        style = MaterialTheme.typography.headlineSmall,
        fontWeight = FontWeight.Bold,
        modifier = modifier
    )
}

@Composable
private fun DeleteDialogText(
    modifier: Modifier = Modifier
) {
    Text(
        text = stringResource(R.string.delete_account_confirmation),
        modifier = modifier
    )
}

@Composable
private fun DeleteDialogConfirmButton(
    onClick: () -> Unit,
) {
    Button(
        fullWidth = false,
        onClick = onClick,
    ) {
        Text(stringResource(R.string.confirm))
    }
}

@Composable
private fun DeleteDialogDismissButton(
    onClick: () -> Unit,
) {
    Button(
        fullWidth = false,
        type = "secondary",
        onClick = onClick,
    ) {
        Text(stringResource(R.string.cancel))
    }
}

@Composable
private fun DevToolsSection(
    devViewModel: DevViewModel,
    devUiState: com.cpen321.usermanagement.ui.viewmodels.DevUiState,
    isInteractive: Boolean = true,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.spacedBy(LocalSpacing.current.medium)
    ) {
        // Section title
        Text(
            text = "🛠️ Development Tools",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.primary
        )

        // Status messages
        DevToolsStatusMessages(devUiState)

        // Action buttons
        DevToolsActionButtons(
            devViewModel = devViewModel,
            isEnabled = isInteractive && !devUiState.isLoading
        )

        // Loading indicator
        if (devUiState.isLoading) {
            Box(
                modifier = Modifier.fillMaxWidth(),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        }
    }
}

@Composable
private fun DevToolsStatusMessages(devUiState: com.cpen321.usermanagement.ui.viewmodels.DevUiState) {
    if (devUiState.message != null) {
        androidx.compose.material3.Card(
            modifier = Modifier.fillMaxWidth(),
            colors = androidx.compose.material3.CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.primaryContainer
            )
        ) {
            Text(
                text = devUiState.message,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(LocalSpacing.current.medium),
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
        }
    }

    if (devUiState.error != null) {
        androidx.compose.material3.Card(
            modifier = Modifier.fillMaxWidth(),
            colors = androidx.compose.material3.CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.errorContainer
            )
        ) {
            Text(
                text = "❌ ${devUiState.error}",
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.padding(LocalSpacing.current.medium),
                color = MaterialTheme.colorScheme.onErrorContainer
            )
        }
    }
}

@Composable
private fun DevToolsActionButtons(
    devViewModel: DevViewModel,
    isEnabled: Boolean
) {
    MenuButtonItem(
        text = "Seed Test Jobs (10)",
        iconRes = R.drawable.ic_check,
        onClick = { devViewModel.seedTestJobs() },
        enabled = isEnabled,
    )

    MenuButtonItem(
        text = "Seed Availability Jobs (2)",
        iconRes = R.drawable.ic_check,
        onClick = { devViewModel.seedAvailabilityTestJobs() },
        enabled = isEnabled,
    )

    MenuButtonItem(
        text = "Clear All Jobs",
        iconRes = R.drawable.ic_delete_forever,
        onClick = { devViewModel.clearJobs() },
        enabled = isEnabled,
    )
}

@Composable
private fun LoadingIndicator(
    modifier: Modifier = Modifier
) {
    CircularProgressIndicator(modifier = modifier)
}

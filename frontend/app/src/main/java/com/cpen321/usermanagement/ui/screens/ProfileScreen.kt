package com.cpen321.usermanagement.ui.screens

import Button
import Icon
import MenuButtonItem
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
import com.cpen321.usermanagement.R
import com.cpen321.usermanagement.data.remote.dto.User
import com.cpen321.usermanagement.ui.components.MessageSnackbar
import com.cpen321.usermanagement.ui.components.MessageSnackbarState
import com.cpen321.usermanagement.ui.viewmodels.AuthViewModel
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

    // Dialog state
    var dialogState by remember {
        mutableStateOf(ProfileDialogState())
    }

    // Side effects
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
        callbacks = ProfileScreenCallbacks(
            onBackClick = {
                if (!isNavigating) {
                    isNavigating = true
                    actions.onBackClick()
                }
            },
            onManageProfileClick = {
                if (!isNavigating) {
                    isNavigating = true
                    actions.onManageProfileClick()
                }
            },
            onManageOrdersClick = {
                if (!isNavigating) {
                    isNavigating = true
                    actions.onManageOrdersClick()
                }
            },
            onDeleteAccountClick = {
                dialogState = dialogState.copy(showDeleteDialog = true)
            },
            onSignOutClick= {
                if (!isNavigating) {
                    isNavigating = true
                    authViewModel.handleSignout()
                    actions.onSignOut()
                }
            },
            onDeleteDialogDismiss = {
                dialogState = dialogState.copy(showDeleteDialog = false)
            },
            onDeleteDialogConfirm = {
                dialogState = dialogState.copy(showDeleteDialog = false)
                profileViewModel.deleteAccount(
                    onSuccess = {
                        authViewModel.handleAccountDeletion()
                        if (!isNavigating) {
                            isNavigating = true
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
            userRole = userRole,
            user = uiState.user,
            isInteractive = isInteractive,
            onManageProfileClick = callbacks.onManageProfileClick,
            onManageOrdersClick = callbacks.onManageOrdersClick,
            onDeleteAccountClick = callbacks.onDeleteAccountClick,
            onSignOutClick = callbacks.onSignOutClick,
            onCashOutClick = callbacks.onCashOutClick
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

@Composable
private fun ProfileBody(
    paddingValues: PaddingValues,
    isLoading: Boolean,
    userRole: String?,
    user: User?,
    isInteractive: Boolean = true,
    onManageProfileClick: () -> Unit,
    onManageOrdersClick: () -> Unit,
    onDeleteAccountClick: () -> Unit,
    onSignOutClick: () -> Unit,
    onCashOutClick: () -> Unit,
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
                    onManageProfileClick = onManageProfileClick,
                    onManageOrdersClick  = onManageOrdersClick,
                    onSignOutClick = onSignOutClick,
                    onDeleteAccountClick = onDeleteAccountClick,
                    onCashOutClick = onCashOutClick
                )
            }
        }
    }
}

@Composable
private fun ProfileMenuItems(
    user: User?,
    isInteractive: Boolean = true,
    onManageProfileClick: () -> Unit,
    onManageOrdersClick:  () -> Unit,
    onSignOutClick: () -> Unit,
    onDeleteAccountClick: () -> Unit,
    onCashOutClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val spacing = LocalSpacing.current
    val scrollState = rememberScrollState()
    val userRole = user?.userRole

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
                onCashOutClick = onCashOutClick
            )
        }

        ProfileSection(
            userRole = userRole,
            isInteractive = isInteractive,
            onManageProfileClick = onManageProfileClick,
            onManageOrdersClick  = onManageOrdersClick
        )

        AccountSection(
            isInteractive = isInteractive,
            onSignOutClick =  onSignOutClick,
            onDeleteAccountClick = onDeleteAccountClick
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
        ManageProfileButton(onClick = onManageProfileClick, enabled = isInteractive)
        if (userRole?.uppercase() == "MOVER") {
            JobHistoryButton(onClick = onManageOrdersClick, enabled = isInteractive)
        } else {
            ManageOrdersButton(onClick = onManageOrdersClick, enabled = isInteractive)
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
        SignOutButton (onClick = onSignOutClick, enabled = isInteractive)
        DeleteAccountButton(onClick = onDeleteAccountClick, enabled = isInteractive)
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
private fun ManageProfileButton(
    onClick: () -> Unit,
    enabled: Boolean = true
) {
    MenuButtonItem(
        text = stringResource(R.string.manage_profile),
        iconRes = R.drawable.ic_manage_profile,
        onClick = onClick,
        enabled = enabled,
    )
}

@Composable
private fun JobHistoryButton(
    onClick: () -> Unit,
    enabled: Boolean = true
) {
    MenuButtonItem(
        text = stringResource(R.string.job_history),
        iconRes = R.drawable.ic_edit,
        onClick = onClick,
        enabled = enabled,
    )
}

@Composable
private fun ManageOrdersButton(
    onClick: () -> Unit,
    enabled: Boolean = true
) {
    MenuButtonItem(
        text = stringResource(R.string.manage_orders),
        iconRes = R.drawable.ic_edit,
        onClick = onClick,
        enabled = enabled,
    )
}

@Composable
private fun SignOutButton(
    onClick: () -> Unit,
    enabled: Boolean = true
){
    MenuButtonItem(
        text = stringResource(R.string.sign_out),
        iconRes = R.drawable.ic_sign_out,
        onClick = onClick,
        enabled = enabled,
    )
}
@Composable
private fun DeleteAccountButton(
    onClick: () -> Unit,
    enabled: Boolean = true
) {
    MenuButtonItem(
        text = stringResource(R.string.delete_account),
        iconRes = R.drawable.ic_delete_forever,
        onClick = onClick,
        enabled = enabled,
    )
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
private fun LoadingIndicator(
    modifier: Modifier = Modifier
) {
    CircularProgressIndicator(modifier = modifier)
}

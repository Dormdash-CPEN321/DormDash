package com.cpen321.usermanagement.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

data class AddressSelectionActions(
    val onUseCustomAddressChange: (Boolean) -> Unit,
    val onStreetAddressChange: (String) -> Unit,
    val onAddressSelected: (SelectedAddress) -> Unit,
    val onConfirm: () -> Unit
)

@Composable
internal fun AddressSelectionStep(
    defaultAddress: String,
    useCustomAddress: Boolean,
    streetAddress: String,
    selectedAddress: SelectedAddress?,
    isValidating: Boolean,
    actions: AddressSelectionActions
) {
    Column {
        Text(
            text = "Return Address",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        DefaultAddressOption(
            defaultAddress = defaultAddress,
            isSelected = !useCustomAddress,
            onSelect = { actions.onUseCustomAddressChange(false) }
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        CustomAddressOption(
            isSelected = useCustomAddress,
            onSelect = { actions.onUseCustomAddressChange(true) }
        )
        
        if (useCustomAddress) {
            Spacer(modifier = Modifier.height(16.dp))
            CustomAddressInput(
                streetAddress = streetAddress,
                onValueChange = actions.onStreetAddressChange,
                onAddressSelected = actions.onAddressSelected
            )
        }
        
        Spacer(modifier = Modifier.height(24.dp))
        
        ConfirmAddressButton(
            isValidating = isValidating,
            isEnabled = !useCustomAddress || selectedAddress != null,
            onConfirm = actions.onConfirm
        )
    }
}

@Composable
private fun DefaultAddressOption(
    defaultAddress: String,
    isSelected: Boolean,
    onSelect: () -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(
            selected = isSelected,
            onClick = onSelect
        )
        Spacer(modifier = Modifier.width(8.dp))
        Column {
            Text(
                text = "Use default address",
                style = MaterialTheme.typography.bodyLarge
            )
            Text(
                text = defaultAddress,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun CustomAddressOption(isSelected: Boolean, onSelect: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        RadioButton(
            selected = isSelected,
            onClick = onSelect
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = "Use custom address",
            style = MaterialTheme.typography.bodyLarge
        )
    }
}

@Composable
private fun CustomAddressInput(
    streetAddress: String,
    onValueChange: (String) -> Unit,
    onAddressSelected: (SelectedAddress) -> Unit
) {
    Text(
        text = "Currently serving Greater Vancouver, BC only",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.primary,
        fontWeight = FontWeight.Medium,
        modifier = Modifier.padding(bottom = 8.dp)
    )
    
    AddressAutocompleteField(
        value = streetAddress,
        onValueChange = onValueChange,
        onAddressSelected = onAddressSelected,
        modifier = Modifier.fillMaxWidth()
    )
}

@Composable
private fun ConfirmAddressButton(
    isValidating: Boolean,
    isEnabled: Boolean,
    onConfirm: () -> Unit
) {
    Button(
        onClick = onConfirm,
        enabled = isEnabled && !isValidating,
        modifier = Modifier.fillMaxWidth().testTag("confirm-address-button")
    ) {
        if (isValidating) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.onPrimary
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Validating...")
            }
        } else {
            Text("Confirm Address")
        }
    }
}

package com.cpen321.usermanagement.ui.components.student

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.cpen321.usermanagement.data.local.models.TestCard
import com.cpen321.usermanagement.data.local.models.TestPaymentMethods

@Composable
internal fun PaymentStep(
    lateFee: Double,
    isProcessing: Boolean,
    onPayment: (TestCard) -> Unit
) {
    var selectedTestCard by remember { mutableStateOf(TestPaymentMethods.TEST_CARDS[0]) }
    var showCardSelector by remember { mutableStateOf(false) }
    
    Column {
        Text(
            text = "Payment Required",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        LateFeeCard(lateFee)
        
        Spacer(modifier = Modifier.height(24.dp))
        
        TestCardSelector(
            selectedCard = selectedTestCard,
            onShowSelector = { showCardSelector = true }
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        PaymentButton(
            lateFee = lateFee,
            isProcessing = isProcessing,
            onPayment = { onPayment(selectedTestCard) }
        )
    }
    
    if (showCardSelector) {
        TestCardSelectorDialog(
            selectedCard = selectedTestCard,
            onCardSelected = { card ->
                selectedTestCard = card
                showCardSelector = false
            },
            onDismiss = { showCardSelector = false }
        )
    }
}

@Composable
private fun LateFeeCard(lateFee: Double) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "Late Return Fee",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text(
                text = "Total Amount Due",
                style = MaterialTheme.typography.bodyMedium
            )
            
            Text(
                text = "$${String.format("%.2f", lateFee)}",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold
            )
        }
    }
}

@Composable
private fun TestCardSelector(selectedCard: TestCard, onShowSelector: () -> Unit) {
    OutlinedCard(
        modifier = Modifier.fillMaxWidth(),
        onClick = onShowSelector
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = selectedCard.description,
                    style = MaterialTheme.typography.titleSmall
                )
                Text(
                    text = "•••• ${selectedCard.number.takeLast(4)}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Icon(
                Icons.Default.Edit,
                contentDescription = "Change card"
            )
        }
    }
}

@Composable
private fun PaymentButton(
    lateFee: Double,
    isProcessing: Boolean,
    onPayment: () -> Unit
) {
    Button(
        onClick = onPayment,
        enabled = !isProcessing,
        modifier = Modifier.fillMaxWidth()
    ) {
        if (isProcessing) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    strokeWidth = 2.dp,
                    color = MaterialTheme.colorScheme.onPrimary
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Processing Payment...")
            }
        } else {
            Text("Pay $${String.format("%.2f", lateFee)}")
        }
    }
}

@Composable
private fun TestCardSelectorDialog(
    selectedCard: TestCard,
    onCardSelected: (TestCard) -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Select Test Card") },
        text = {
            Column {
                TestPaymentMethods.TEST_CARDS.forEach { card ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = card == selectedCard,
                            onClick = { onCardSelected(card) }
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Column {
                            Text(
                                text = card.description,
                                style = MaterialTheme.typography.bodyLarge
                            )
                            Text(
                                text = "•••• ${card.number.takeLast(4)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Done")
            }
        }
    )
}

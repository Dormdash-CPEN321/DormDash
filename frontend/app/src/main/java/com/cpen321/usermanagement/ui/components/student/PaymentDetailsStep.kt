package com.cpen321.usermanagement.ui.components.student

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.cpen321.usermanagement.data.local.models.*
import com.cpen321.usermanagement.data.remote.models.OrderRequest

// Step 4: Payment Details
@Composable
fun PaymentDetailsStep(
    orderRequest: OrderRequest,
    paymentDetails: PaymentDetails,
    onPaymentDetailsChange: (PaymentDetails) -> Unit,
    isSubmitting: Boolean,
    onProcessPayment: () -> Unit
) {
    var selectedTestCard by remember { mutableStateOf(TestPaymentMethods.TEST_CARDS[0]) }
    var showCardSelector by remember { mutableStateOf(false) }
    var showConfirmDialog by remember { mutableStateOf(false) }
    var nameError by remember { mutableStateOf<String?>(null) }
    var emailError by remember { mutableStateOf<String?>(null) }
    
    val emailRegex = "^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$".toRegex()
    
    fun validateFields(): Boolean {
        return validateName(paymentDetails.cardholderName) { nameError = it } &&
               validateEmail(paymentDetails.email, emailRegex) { emailError = it }
    }
    
    Column {
        OrderSummarySection(orderRequest)
        
        Spacer(modifier = Modifier.height(24.dp))
        
        TestCardSelectionSection(
            selectedCard = selectedTestCard,
            showSelector = showCardSelector,
            onShowSelector = { showCardSelector = it },
            onCardSelected = { card ->
                selectedTestCard = card
                showCardSelector = false
            }
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        CustomerInformationSection(
            paymentDetails = paymentDetails,
            onPaymentDetailsChange = onPaymentDetailsChange,
            nameError = nameError,
            emailError = emailError,
            isSubmitting = isSubmitting,
            onNameChanged = { if (nameError != null) nameError = null },
            onEmailChanged = { if (emailError != null) emailError = null }
        )
        
        Spacer(modifier = Modifier.height(32.dp))
        
        if (selectedTestCard.description.contains("Declined", ignoreCase = true)) {
            DeclinedCardWarning()
            Spacer(modifier = Modifier.height(16.dp))
        }
        
        PaymentActionButton(
            orderRequest = orderRequest,
            paymentDetails = paymentDetails,
            emailRegex = emailRegex,
            isSubmitting = isSubmitting,
            onValidateAndProceed = {
                if (validateFields()) showConfirmDialog = true
            }
        )
        
        if (showConfirmDialog) {
            PaymentConfirmationDialog(
                orderRequest = orderRequest,
                paymentDetails = paymentDetails,
                selectedCard = selectedTestCard,
                isSubmitting = isSubmitting,
                onConfirm = {
                    showConfirmDialog = false
                    onProcessPayment()
                },
                onDismiss = { showConfirmDialog = false }
            )
        }
    }
}

private fun validateName(name: String, onError: (String?) -> Unit): Boolean {
    return when {
        name.isBlank() -> {
            onError("Name is required")
            false
        }
        name.length < 2 -> {
            onError("Name must be at least 2 characters")
            false
        }
        !name.matches("^[a-zA-Z\\s'-]+$".toRegex()) -> {
            onError("Name contains invalid characters")
            false
        }
        else -> {
            onError(null)
            true
        }
    }
}

private fun validateEmail(email: String, emailRegex: Regex, onError: (String?) -> Unit): Boolean {
    return when {
        email.isBlank() -> {
            onError("Email is required")
            false
        }
        !email.matches(emailRegex) -> {
            onError("Please enter a valid email address")
            false
        }
        else -> {
            onError(null)
            true
        }
    }
}

@Composable
private fun OrderSummarySection(orderRequest: OrderRequest) {
    Text(
        text = "Order Summary",
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(bottom = 8.dp)
    )
    
    OutlinedCard(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "Total: $${String.format("%.2f", orderRequest.totalPrice)}",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary
            )
            Text(
                text = "${orderRequest.boxQuantities.sumOf { it.quantity }} boxes for ${orderRequest.returnDate}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun TestCardSelectionSection(
    selectedCard: TestCard,
    showSelector: Boolean,
    onShowSelector: (Boolean) -> Unit,
    onCardSelected: (TestCard) -> Unit
) {
    Text(
        text = "Payment Method (Demo)",
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold
    )
    
    Spacer(modifier = Modifier.height(8.dp))
    
    OutlinedCard(
        modifier = Modifier.fillMaxWidth(),
        onClick = { onShowSelector(true) }
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = selectedCard.description,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = "**** **** **** ${selectedCard.number.takeLast(4)}",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Icon(
                Icons.Default.Edit,
                contentDescription = "Change card",
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
    
    if (showSelector) {
        Spacer(modifier = Modifier.height(8.dp))
        Card {
            LazyColumn {
                items(TestPaymentMethods.TEST_CARDS) { testCard ->
                    ListItem(
                        headlineContent = { Text(testCard.description) },
                        supportingContent = { Text("**** **** **** ${testCard.number.takeLast(4)}") },
                        modifier = Modifier.clickable { onCardSelected(testCard) }
                    )
                }
            }
        }
    }
}

@Composable
private fun CustomerInformationSection(
    paymentDetails: PaymentDetails,
    onPaymentDetailsChange: (PaymentDetails) -> Unit,
    nameError: String?,
    emailError: String?,
    isSubmitting: Boolean,
    onNameChanged: () -> Unit,
    onEmailChanged: () -> Unit
) {
    Text(
        text = "Customer Information",
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold
    )
    
    Spacer(modifier = Modifier.height(16.dp))
    
    OutlinedTextField(
        value = paymentDetails.cardholderName,
        onValueChange = { name ->
            onPaymentDetailsChange(paymentDetails.copy(cardholderName = name))
            onNameChanged()
        },
        label = { Text("Full Name") },
        modifier = Modifier
            .fillMaxWidth()
            .testTag("customer_name_field"),
        singleLine = true,
        isError = nameError != null,
        supportingText = nameError?.let { 
            { Text(it, color = MaterialTheme.colorScheme.error) }
        },
        enabled = !isSubmitting
    )
    
    Spacer(modifier = Modifier.height(16.dp))
    
    OutlinedTextField(
        value = paymentDetails.email,
        onValueChange = { email ->
            onPaymentDetailsChange(paymentDetails.copy(email = email))
            onEmailChanged()
        },
        label = { Text("Email Address") },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
        modifier = Modifier
            .fillMaxWidth()
            .testTag("customer_email_field"),
        singleLine = true,
        isError = emailError != null,
        supportingText = emailError?.let { 
            { Text(it, color = MaterialTheme.colorScheme.error) }
        },
        placeholder = { Text("example@email.com") },
        enabled = !isSubmitting
    )
}

@Composable
private fun DeclinedCardWarning() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer
        )
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.Info,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.error,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "Warning: This test card will be declined",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onErrorContainer
            )
        }
    }
}

@Composable
private fun PaymentActionButton(
    orderRequest: OrderRequest,
    paymentDetails: PaymentDetails,
    emailRegex: Regex,
    isSubmitting: Boolean,
    onValidateAndProceed: () -> Unit
) {
    val canProcessPayment = paymentDetails.cardholderName.isNotBlank() && 
                           paymentDetails.email.matches(emailRegex)
    
    Button(
        onClick = onValidateAndProceed,
        enabled = canProcessPayment && !isSubmitting,
        modifier = Modifier
            .fillMaxWidth()
            .testTag("process_payment_button")
    ) {
        if (isSubmitting) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    strokeWidth = 2.dp
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Processing...")
            }
        } else {
            Text("Process Payment - $${String.format("%.2f", orderRequest.totalPrice)}")
        }
    }
    
    if (!canProcessPayment) {
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "Please fill in all required fields with valid information",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth()
        )
    }
}

@Composable
private fun PaymentConfirmationDialog(
    orderRequest: OrderRequest,
    paymentDetails: PaymentDetails,
    selectedCard: TestCard,
    isSubmitting: Boolean,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Confirm Payment") },
        text = {
            Column {
                Text("Please confirm the payment details:")
                Spacer(modifier = Modifier.height(12.dp))
                Text("Amount: $${String.format("%.2f", orderRequest.totalPrice)}", fontWeight = FontWeight.Bold)
                Text("Name: ${paymentDetails.cardholderName}")
                Text("Email: ${paymentDetails.email}")
                Text("Card: ${selectedCard.description}")
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "This is a demo payment using test cards.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                enabled = !isSubmitting,
                modifier = Modifier.testTag("confirm_pay_button")
            ) {
                Text("Confirm & Pay")
            }
        },
        dismissButton = {
            TextButton(
                onClick = onDismiss,
                enabled = !isSubmitting
            ) {
                Text("Cancel")
            }
        }
    )
}

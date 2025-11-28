package com.cpen321.usermanagement.ui.components.common

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.*
import com.cpen321.usermanagement.utils.LocationUtils
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import java.io.IOException

// Data class to group map state
private data class MapState(
    val location: LatLng? = null,
    val isLoading: Boolean = true,
    val hasError: Boolean = false
)

// Data class to group map configuration
private data class MapConfig(
    val address: String,
    val markerTitle: String,
    val modifier: Modifier
)

@Composable
fun OrderMapView(
    address: String,
    modifier: Modifier = Modifier,
    markerTitle: String = "Pickup Location"
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    val config = MapConfig(address, markerTitle, modifier)
    
    var mapState by remember(address) { 
        mutableStateOf(MapState(isLoading = true)) 
    }
    
    GeocodeAddressEffect(address, context, coroutineScope) { newState ->
        mapState = newState
    }
    
    MapCard(config, mapState)
}

@Composable
private fun GeocodeAddressEffect(
    address: String,
    context: Context,
    scope: CoroutineScope,
    onStateChange: (MapState) -> Unit
) {
    LaunchedEffect(address) {
        onStateChange(MapState(isLoading = true))
        
        scope.launch {
            try {
                val location = LocationUtils.geocodeAddress(context, address)
                onStateChange(MapState(
                    location = location ?: LocationUtils.getFallbackCoordinates(address),
                    isLoading = false,
                    hasError = location == null
                ))
            } catch (e: IOException) {
                // Network error during geocoding
                onStateChange(MapState(
                    location = LocationUtils.getFallbackCoordinates(address),
                    isLoading = false,
                    hasError = true
                ))
            } catch (e: IllegalArgumentException) {
                // Invalid address format
                onStateChange(MapState(
                    location = LocationUtils.getFallbackCoordinates(address),
                    isLoading = false,
                    hasError = true
                ))
            }
        }
    }
}

@Composable
private fun MapCard(config: MapConfig, state: MapState) {
    Card(
        modifier = config.modifier,
        shape = RoundedCornerShape(12.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Box(
            modifier = Modifier.fillMaxWidth().height(200.dp),
            contentAlignment = Alignment.Center
        ) {
            when {
                state.isLoading -> LoadingIndicator()
                state.location != null -> MapWithMarker(config, state)
                else -> MapUnavailableView(config.address)
            }
        }
    }
}

@Composable
private fun LoadingIndicator() {
    CircularProgressIndicator(
        modifier = Modifier.size(40.dp),
        color = MaterialTheme.colorScheme.primary
    )
}

@Composable
private fun MapWithMarker(config: MapConfig, state: MapState) {
    val location = state.location ?: return
    
    val cameraPositionState = rememberCameraPositionState(key = config.address) {
        position = CameraPosition.fromLatLngZoom(location, 15f)
    }

    LaunchedEffect(location) {
        cameraPositionState.animate(
            CameraUpdateFactory.newLatLngZoom(location, 15f),
            durationMs = 1000
        )
    }
    
    Box {
        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = cameraPositionState,
            uiSettings = MapUiSettings(
                zoomControlsEnabled = true,
                compassEnabled = false,
                mapToolbarEnabled = false
            )
        ) {
            Marker(
                state = MarkerState(position = location),
                title = config.markerTitle,
                snippet = config.address
            )
        }
        
        if (state.hasError) {
            ErrorIndicatorOverlay()
        }
    }
}

@Composable
private fun ErrorIndicatorOverlay() {
    Card(
        modifier = Modifier.padding(8.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.errorContainer
        )
    ) {
        Text(
            text = "Approximate location",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onErrorContainer,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
        )
    }
}

@Composable
private fun MapUnavailableView(address: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = "Map unavailable",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = address,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

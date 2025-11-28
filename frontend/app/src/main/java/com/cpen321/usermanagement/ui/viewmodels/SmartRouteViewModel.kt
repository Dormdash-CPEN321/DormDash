package com.cpen321.usermanagement.ui.viewmodels

import androidx.lifecycle.ViewModel
import android.util.Log
import androidx.lifecycle.viewModelScope
import com.cpen321.usermanagement.data.remote.models.SmartRouteData
import com.cpen321.usermanagement.data.repository.RouteRepository
import com.cpen321.usermanagement.network.SocketClient
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class SmartRouteUiState {
    object Idle : SmartRouteUiState()
    object Loading : SmartRouteUiState()
    data class Success(val data: SmartRouteData) : SmartRouteUiState()
    data class Error(val message: String) : SmartRouteUiState()
}

@HiltViewModel
class SmartRouteViewModel @Inject constructor(
    private val routeRepository: RouteRepository,
    private val socketClient: SocketClient
) : ViewModel() {

    private val _uiState = MutableStateFlow<SmartRouteUiState>(SmartRouteUiState.Idle)
    val uiState: StateFlow<SmartRouteUiState> = _uiState.asStateFlow()

    private val _removedJobs = MutableStateFlow<List<String>>(emptyList())
    val removedJobs: StateFlow<List<String>> = _removedJobs.asStateFlow()

    init {
        listenForJobUpdates()
    }

    private fun listenForJobUpdates() {
        viewModelScope.launch {
            socketClient.events.collect { event ->
                when (event.name) {
                    "job.updated" -> {
                        handleJobUpdated(event.payload)
                    }
                }
            }
        }
    }

    private fun handleJobUpdated(payload: org.json.JSONObject?) {
        try {
            val jobData = parseJobData(payload) ?: return

            val jobId = jobData.optString("id") ?: return
            val status = jobData.optString("status") ?: return

            processJobUpdate(jobId, status)
        } catch (e: org.json.JSONException) {
            Log.e("SmartRouteViewModel", "Error parsing job.updated event JSON", e)
        }
    }

    // Extracted helper to reduce nesting in the main handler
    private fun parseJobData(payload: org.json.JSONObject?): org.json.JSONObject? {
        return when {
            payload == null -> null
            payload.has("job") -> payload.optJSONObject("job")
            payload.has("data") && payload.optJSONObject("data")?.has("job") == true ->
                payload.optJSONObject("data")?.optJSONObject("job")
            else -> payload
        }
    }

    // Extracted processing logic for a parsed job update
    private fun processJobUpdate(jobId: String, status: String) {
        // If job is no longer AVAILABLE, remove it from the route
        if (status != "AVAILABLE") {
            val currentState = _uiState.value
            if (currentState is SmartRouteUiState.Success) {
                val updatedRoute = currentState.data.route.filter { it.jobId != jobId }

                // Only update if a job was actually removed
                if (updatedRoute.size < currentState.data.route.size) {
                    // Track removed job for notification
                    _removedJobs.value = _removedJobs.value + jobId

                    // Update route
                    _uiState.value = SmartRouteUiState.Success(
                        currentState.data.copy(route = updatedRoute)
                    )

                    android.util.Log.d("SmartRouteViewModel", "Job $jobId removed from route (status: $status)")
                }
            }
        }
    }

    fun fetchSmartRoute(currentLat: Double, currentLon: Double, maxDuration: Int? = null) {
        viewModelScope.launch {
            _uiState.value = SmartRouteUiState.Loading
            // Clear removed jobs when fetching new route
            _removedJobs.value = emptyList()
            
            routeRepository.getSmartRoute(currentLat, currentLon, maxDuration)
                .onSuccess { data ->
                    _uiState.value = SmartRouteUiState.Success(data)
                }
                .onFailure { error ->
                    _uiState.value = SmartRouteUiState.Error(
                        error.message ?: "Failed to fetch smart route"
                    )
                }
        }
    }

    fun clearRemovedJobs() {
        _removedJobs.value = emptyList()
    }

    fun resetState() {
        _uiState.value = SmartRouteUiState.Idle
        _removedJobs.value = emptyList()
    }
}

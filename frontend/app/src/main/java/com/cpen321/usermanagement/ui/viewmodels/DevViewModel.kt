package com.cpen321.usermanagement.ui.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.cpen321.usermanagement.data.remote.api.DevApiService
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DevUiState(
    val isLoading: Boolean = false,
    val message: String? = null,
    val error: String? = null
)

@HiltViewModel
class DevViewModel @Inject constructor(
    private val devApiService: DevApiService
) : ViewModel() {

    private val _uiState = MutableStateFlow(DevUiState())
    val uiState: StateFlow<DevUiState> = _uiState

    fun seedTestJobs() {
        viewModelScope.launch {
            _uiState.value = DevUiState(isLoading = true)
            try {
                val response = devApiService.seedTestJobs()
                if (response.isSuccessful) {
                    _uiState.value = DevUiState(
                        isLoading = false,
                        message = "✅ Seeded 10 test jobs successfully!"
                    )
                } else {
                    _uiState.value = DevUiState(
                        isLoading = false,
                        //error = "Failed to seed jobs: ${response.code()}"
                    )
                }
            } catch (e: java.io.IOException) {
                _uiState.value = DevUiState(
                    isLoading = false,
                    error = "Network error: ${e.message}"
                )
            } catch (e: retrofit2.HttpException) {
                _uiState.value = DevUiState(
                    isLoading = false,
                    error = "HTTP error: ${e.code()} - ${e.message()}"
                )
            }
        }
    }

    fun seedAvailabilityTestJobs() {
        viewModelScope.launch {
            _uiState.value = DevUiState(isLoading = true)
            try {
                val response = devApiService.seedAvailabilityTestJobs()
                if (response.isSuccessful) {
                    _uiState.value = DevUiState(
                        isLoading = false,
                        message = "✅ Seeded 2 availability test jobs successfully!"
                    )
                } else {
                    _uiState.value = DevUiState(
                        isLoading = false,
                        //error = "Failed to seed availability jobs: ${response.code()}"
                    )
                }
            } catch (e: java.io.IOException) {
                _uiState.value = DevUiState(
                    isLoading = false,
                    error = "Network error: ${e.message}"
                )
            } catch (e: retrofit2.HttpException) {
                _uiState.value = DevUiState(
                    isLoading = false,
                    error = "HTTP error: ${e.code()} - ${e.message()}"
                )
            }
        }
    }

    fun clearJobs() {
        viewModelScope.launch {
            _uiState.value = DevUiState(isLoading = true)
            try {
                val response = devApiService.clearJobs()
                if (response.isSuccessful) {
                    _uiState.value = DevUiState(
                        isLoading = false,
                        message = "✅ Cleared all jobs successfully!"
                    )
                } else {
                    _uiState.value = DevUiState(
                        isLoading = false,
                        //error = "Failed to clear jobs: ${response.code()}"
                    )
                }
            } catch (e: java.io.IOException) {
                _uiState.value = DevUiState(
                    isLoading = false,
                    error = "Network error: ${e.message}"
                )
            } catch (e: retrofit2.HttpException) {
                _uiState.value = DevUiState(
                    isLoading = false,
                    error = "HTTP error: ${e.code()} - ${e.message()}"
                )
            }
        }
    }

    fun clearMessage() {
        _uiState.value = _uiState.value.copy(message = null, error = null)
    }
}

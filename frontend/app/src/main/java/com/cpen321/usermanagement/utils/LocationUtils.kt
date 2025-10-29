package com.cpen321.usermanagement.utils

import android.location.Geocoder
import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import com.google.android.gms.maps.model.LatLng

/**
 * Location utilities for geocoding addresses to coordinates
 */
object LocationUtils {
    
    // Vancouver, BC bounding box (approximate Greater Vancouver area)
    private const val VANCOUVER_MIN_LAT = 49.0
    private const val VANCOUVER_MAX_LAT = 49.4
    private const val VANCOUVER_MIN_LON = -123.3
    private const val VANCOUVER_MAX_LON = -122.5

    /**
     * Result of address validation
     */
    data class AddressValidationResult(
        val isValid: Boolean,
        val coordinates: LatLng?,
        val formattedAddress: String?,
        val errorMessage: String?
    )

    /**
     * Validate and geocode an address, ensuring it's within Vancouver, BC area
     */
    suspend fun validateAndGeocodeAddress(context: Context, address: String): AddressValidationResult {
        return withContext(Dispatchers.IO) {
            try {
                val geocoder = Geocoder(context)
                val results = geocoder.getFromLocationName(address, 1)

                if (results.isNullOrEmpty()) {
                    return@withContext AddressValidationResult(
                        isValid = false,
                        coordinates = null,
                        formattedAddress = null,
                        errorMessage = "Address not found. Please enter a valid address."
                    )
                }

                val location = results[0]
                val lat = location.latitude
                val lon = location.longitude

                // Check if the geocoder actually found a proper street address
                // If there's no street number or thoroughfare (street name), it likely just matched postal code
                val thoroughfare = location.thoroughfare // Street name
                val subThoroughfare = location.subThoroughfare // Street number
                val featureName = location.featureName // Could be street number or name

                // Check if we have a real street address (not just postal code match)
                if (thoroughfare.isNullOrBlank() && featureName.isNullOrBlank()) {
                    return@withContext AddressValidationResult(
                        isValid = false,
                        coordinates = null,
                        formattedAddress = null,
                        errorMessage = "Please enter a complete street address (e.g., 123 Main St, not just a postal code)."
                    )
                }

                // Check if address is in Vancouver, BC
                if (!isInVancouverArea(lat, lon)) {
                    return@withContext AddressValidationResult(
                        isValid = false,
                        coordinates = null,
                        formattedAddress = null,
                        errorMessage = "We currently only service Greater Vancouver."
                    )
                }

                // Check if it's in BC, Canada
                val locality = location.locality ?: ""
                val adminArea = location.adminArea ?: ""
                val countryCode = location.countryCode ?: ""

                if (countryCode != "CA" || adminArea != "British Columbia") {
                    return@withContext AddressValidationResult(
                        isValid = false,
                        coordinates = null,
                        formattedAddress = null,
                        errorMessage = "Address must be in British Columbia, Canada."
                    )
                }

                // Validate that we have city/locality information
                if (locality.isBlank() && location.subAdminArea.isNullOrBlank()) {
                    return@withContext AddressValidationResult(
                        isValid = false,
                        coordinates = null,
                        formattedAddress = null,
                        errorMessage = "Please enter a complete address with a valid city name."
                    )
                }

                // Build formatted address
                val addressLines = (0 until (location.maxAddressLineIndex + 1))
                    .map { location.getAddressLine(it) }
                    .joinToString(", ")

                return@withContext AddressValidationResult(
                    isValid = true,
                    coordinates = LatLng(lat, lon),
                    formattedAddress = addressLines.ifEmpty { address },
                    errorMessage = null
                )
            } catch (e: Exception) {
                e.printStackTrace()
                return@withContext AddressValidationResult(
                    isValid = false,
                    coordinates = null,
                    formattedAddress = null,
                    errorMessage = "Failed to validate address. Please check your internet connection and try again."
                )
            }
        }
    }

    
    private fun isInVancouverArea(lat: Double, lon: Double): Boolean {
        return lat in VANCOUVER_MIN_LAT..VANCOUVER_MAX_LAT &&
               lon >= VANCOUVER_MIN_LON && lon <= VANCOUVER_MAX_LON
    }

    /**
     * Convert address string to LatLng coordinates
     * Returns null if geocoding fails
     */
    suspend fun geocodeAddress(context: Context, address: String): LatLng? {
        return withContext(Dispatchers.IO) {
            try {
                val geocoder = Geocoder(context)
                val results = geocoder.getFromLocationName(address, 1)
                
                if (!results.isNullOrEmpty()) {
                    val location = results[0]
                    LatLng(location.latitude, location.longitude)
                } else {
                    null
                }
            } catch (e: Exception) {
                e.printStackTrace()
                null
            }
        }
    }
    
    /**
     * Fallback coordinates for common areas (when geocoding fails)
     */
    fun getFallbackCoordinates(address: String): LatLng {
        return when {
            address.contains("Vancouver", ignoreCase = true) -> LatLng(49.2827, -123.1207)
            address.contains("UBC", ignoreCase = true) -> LatLng(49.2606, -123.2460)
            address.contains("Burnaby", ignoreCase = true) -> LatLng(49.2488, -122.9805)
            address.contains("Richmond", ignoreCase = true) -> LatLng(49.1666, -123.1336)
            else -> LatLng(49.2827, -123.1207) // Default to Vancouver downtown
        }
    }
}
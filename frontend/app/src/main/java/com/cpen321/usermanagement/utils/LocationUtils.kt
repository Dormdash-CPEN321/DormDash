package com.cpen321.usermanagement.utils

import android.location.Geocoder
import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import com.google.android.gms.maps.model.LatLng
import java.io.IOException
import android.location.Address
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
    suspend fun validateAndGeocodeAddress(
        context: Context,
        address: String
    ): AddressValidationResult = withContext(Dispatchers.IO) {
        try {
            val geocoder = Geocoder(context)
            val results = geocoder.getFromLocationName(address, 1)

            if (results.isNullOrEmpty()) {
                AddressValidationResult(
                    isValid = false,
                    coordinates = null,
                    formattedAddress = null,
                    errorMessage = "Address not found. Please enter a valid address."
                )
            } else {
                validateLocation(results, address)
            }
        } catch (e: IOException) {
            AddressValidationResult(
                isValid = false,
                coordinates = null,
                formattedAddress = null,
                errorMessage = "Network error validating address. Please check your connection and try again."
            )
        } catch (e: IllegalArgumentException) {
            AddressValidationResult(
                isValid = false,
                coordinates = null,
                formattedAddress = null,
                errorMessage = "Invalid address format. Please enter a valid address."
            )
        }
    }


    private fun validateLocation(results : List<Address>, fallbackAddress: String ) : AddressValidationResult{
        val location = results[0]

        val lat = location.latitude
        val lon = location.longitude

        val thoroughfare = location.thoroughfare
        val subThoroughfare = location.subThoroughfare
        val featureName = location.featureName
        return when {
            thoroughfare.isNullOrBlank() && featureName.isNullOrBlank() ->
                failure("Please enter a complete street address (e.g., 123 Main St, not just a postal code).")

            !isInVancouverArea(lat, lon) ->
                failure("We currently only service Greater Vancouver.")

            (location.countryCode ?: "") != "CA" ||
                    (location.adminArea ?: "") != "British Columbia" ->
                failure("Address must be in British Columbia, Canada.")

            (location.locality ?: "").isBlank() && location.subAdminArea.isNullOrBlank() ->
                failure("Please enter a complete address with a valid city name.")

            else -> {
                val formatted = (0..location.maxAddressLineIndex)
                    .joinToString(", ") { idx -> location.getAddressLine(idx) }

                AddressValidationResult(
                    isValid = true,
                    coordinates = LatLng(lat, lon),
                    formattedAddress = formatted.ifEmpty { fallbackAddress },
                    errorMessage = null
                )
            }
        }
    }


    private fun failure(message: String): AddressValidationResult =
        AddressValidationResult(
            isValid = false,
            coordinates = null,
            formattedAddress = null,
            errorMessage = message
        )

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
            } catch (e: java.io.IOException) {
                e.printStackTrace()
                null
            } catch (e: IllegalArgumentException) {
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
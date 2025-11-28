package com.cpen321.usermanagement.data.remote.models

data class UpdateProfileRequest(
    val name: String? = null,
    val fcmToken: String? = null,
    val bio: String? = null,
    val profilePicture: String? = null,
    // Mover-specific fields
    val availability: Map<String, List<List<String>>>? = null, // Changed from List<Int> to List<String> for "HH:mm" format
    val capacity: Float? = null,
    val carType: String? = null,
    val plateNumber: String? = null
)

data class ProfileData(
    val user: User
)

data class User(
    val _id: String,
    val userRole: String? = null,
    val email: String,
    val fcmToken: String? = null,
    val name: String,
    val bio: String?,
    val profilePicture: String,
    val createdAt: String? = null,
    val updatedAt: String? = null,
    // Mover-specific fields
    val availability: Map<String, List<List<String>>>? = null, // Changed from List<Int> to List<String> for "HH:mm" format
    val capacity: Float? = null,
    val carType: String? = null,
    val plateNumber: String? = null,
    val credits: Float? = null // Credits earned from completed jobs (mover only)
)
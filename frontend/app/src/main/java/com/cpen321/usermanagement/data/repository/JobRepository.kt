package com.cpen321.usermanagement.data.repository

import com.cpen321.usermanagement.data.local.models.Job
import com.cpen321.usermanagement.data.local.models.JobStatus
import com.cpen321.usermanagement.utils.Resource
import kotlinx.coroutines.flow.Flow

interface JobRepository {
    fun getAvailableJobs(): Flow<Resource<List<Job>>>
    fun getMoverJobs(): Flow<Resource<List<Job>>>
    fun getStudentJobs(): Flow<Resource<List<Job>>>
    suspend fun acceptJob(jobId: String): Resource<Unit>
    suspend fun updateJobStatus(jobId: String, newStatus: JobStatus): Resource<Unit>
    suspend fun requestPickupConfirmation(jobId: String): Resource<Unit>
    suspend fun confirmPickup(jobId: String): Resource<Unit>
    suspend fun requestDeliveryConfirmation(jobId: String): Resource<Unit>
    suspend fun confirmDelivery(jobId: String): Resource<Unit>
}

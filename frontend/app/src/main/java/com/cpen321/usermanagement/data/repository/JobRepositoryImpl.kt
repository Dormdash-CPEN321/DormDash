package com.cpen321.usermanagement.data.repository

import com.cpen321.usermanagement.data.local.models.Job
import com.cpen321.usermanagement.data.local.models.JobStatus
import com.cpen321.usermanagement.data.local.models.JobType
import com.cpen321.usermanagement.data.remote.api.JobInterface
import com.cpen321.usermanagement.data.remote.models.JobStatus as DtoJobStatus
import com.cpen321.usermanagement.data.remote.models.UpdateJobStatusRequest
import com.cpen321.usermanagement.utils.Resource
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class JobRepositoryImpl @Inject constructor(
    private val jobInterface: JobInterface
) : JobRepository {

    override fun getAvailableJobs(): Flow<Resource<List<Job>>> = flow {
        try {
            emit(Resource.Loading())
            val response = jobInterface.getAvailableJobs()

            if (response.isSuccessful && response.body() != null) {
                val jobs = response.body()!!.data?.jobs?.map { dto ->
                    Job(
                        id = dto.id,
                        orderId = dto.orderId,
                        jobType = JobType.valueOf(dto.jobType),
                        status = JobStatus.valueOf(dto.status),
                        volume = dto.volume,
                        price = dto.price,
                        pickupAddress = dto.pickupAddress,
                        dropoffAddress = dto.dropoffAddress,
                        scheduledTime = LocalDateTime.parse(dto.scheduledTime, DateTimeFormatter.ISO_DATE_TIME)
                    )
                } ?: emptyList()

                emit(Resource.Success(jobs))
            } else {
                emit(Resource.Error("Failed to load available jobs"))
            }
        } catch (e: java.io.IOException) {
            android.util.Log.e("JobRepository", "Network error loading available jobs", e)
            emit(Resource.Error(e.message ?: "Network error occurred"))
        } catch (e: retrofit2.HttpException) {
            android.util.Log.e("JobRepository", "HTTP error loading available jobs: ${e.code()}", e)
            emit(Resource.Error(e.message ?: "Server error occurred"))
        } catch (e: com.google.gson.JsonSyntaxException) {
            android.util.Log.e("JobRepository", "JSON parsing error in job response", e)
            emit(Resource.Error("Error parsing job data"))
        }
    }

    override fun getMoverJobs(): Flow<Resource<List<Job>>> = flow {
        try {
            emit(Resource.Loading())
            val response = jobInterface.getMoverJobs()

            if (response.isSuccessful && response.body() != null) {
                val jobs = response.body()!!.data?.jobs?.map { dto ->
                    Job(
                        id = dto.id,
                        orderId = dto.orderId,
                        jobType = JobType.valueOf(dto.jobType),
                        status = JobStatus.valueOf(dto.status),
                        volume = dto.volume,
                        price = dto.price,
                        pickupAddress = dto.pickupAddress,
                        dropoffAddress = dto.dropoffAddress,
                        scheduledTime = LocalDateTime.parse(dto.scheduledTime, DateTimeFormatter.ISO_DATE_TIME)
                    )
                } ?: emptyList()

                emit(Resource.Success(jobs))
            } else {
                emit(Resource.Error("Failed to load mover jobs"))
            }
        } catch (e: java.io.IOException) {
            emit(Resource.Error(e.message ?: "Network error occurred"))
        }
    }

    override fun getStudentJobs(): Flow<Resource<List<Job>>> = flow {
        try {
            emit(Resource.Loading())
            val response = jobInterface.getStudentJobs()

            if (response.isSuccessful && response.body() != null) {
                val jobs = response.body()!!.data?.jobs?.map { dto ->
                    Job(
                        id = dto.id,
                        orderId = dto.orderId,
                        jobType = JobType.valueOf(dto.jobType),
                        status = JobStatus.valueOf(dto.status),
                        volume = dto.volume,
                        price = dto.price,
                        pickupAddress = dto.pickupAddress,
                        dropoffAddress = dto.dropoffAddress,
                        scheduledTime = LocalDateTime.parse(dto.scheduledTime, DateTimeFormatter.ISO_DATE_TIME)
                    )
                } ?: emptyList()

                emit(Resource.Success(jobs))
            } else {
                emit(Resource.Error("Failed to load student jobs"))
            }
        } catch (e: java.io.IOException) {
            emit(Resource.Error(e.message ?: "Network error occurred"))
        }
    }

    override suspend fun acceptJob(jobId: String): Resource<Unit> {
        return try {
            val response = jobInterface.updateJobStatus(
                jobId,
                UpdateJobStatusRequest(status = DtoJobStatus.ACCEPTED.value)
            )

            if (response.isSuccessful) {
                Resource.Success(Unit)
            } else {
                Resource.Error("Failed to accept job")
            }
        } catch (e: java.io.IOException) {
            Resource.Error(e.message ?: "Network error occurred")
        }
    }

    override suspend fun updateJobStatus(jobId: String, newStatus: JobStatus): Resource<Unit> {
        return try {
            val dtoStatus = when (newStatus) {
                JobStatus.AVAILABLE -> DtoJobStatus.AVAILABLE
                JobStatus.AWAITING_STUDENT_CONFIRMATION -> DtoJobStatus.AWAITING_STUDENT_CONFIRMATION
                JobStatus.ACCEPTED -> DtoJobStatus.ACCEPTED
                JobStatus.PICKED_UP -> DtoJobStatus.PICKED_UP
                JobStatus.COMPLETED -> DtoJobStatus.COMPLETED
                JobStatus.CANCELLED -> DtoJobStatus.CANCELLED
                JobStatus.IN_STORAGE -> DtoJobStatus.PICKED_UP // Map IN_STORAGE to PICKED_UP for backend
            }

            val response = jobInterface.updateJobStatus(
                jobId,
                UpdateJobStatusRequest(status = dtoStatus.value)
            )

            if (response.isSuccessful) {
                Resource.Success(Unit)
            } else {
                Resource.Error("Failed to update job status")
            }
        } catch (e: java.io.IOException) {
            Resource.Error(e.message ?: "Network error occurred")
        }
    }

    override suspend fun requestPickupConfirmation(jobId: String): Resource<Unit> {
        return try {
            val response = jobInterface.requestPickupConfirmation(jobId)
            if (response.isSuccessful) Resource.Success(Unit) else Resource.Error("Failed to request pickup confirmation")
        } catch (e: java.io.IOException) {
            Resource.Error(e.message ?: "Network error occurred")
        }
    }

    override suspend fun confirmPickup(jobId: String): Resource<Unit> {
        return try {
            val response = jobInterface.confirmPickup(jobId)
            if (response.isSuccessful) Resource.Success(Unit) else Resource.Error("Failed to confirm pickup")
        } catch (e: java.io.IOException) {
            Resource.Error(e.message ?: "Network error occurred")
        }
    }

    override suspend fun requestDeliveryConfirmation(jobId: String): Resource<Unit> {
        return try {
            val response = jobInterface.requestDeliveryConfirmation(jobId)
            if (response.isSuccessful) Resource.Success(Unit) else Resource.Error("Failed to request delivery confirmation")
        } catch (e: java.io.IOException) {
            Resource.Error(e.message ?: "Network error occurred")
        }
    }

    override suspend fun confirmDelivery(jobId: String): Resource<Unit> {
        return try {
            val response = jobInterface.confirmDelivery(jobId)
            if (response.isSuccessful) Resource.Success(Unit) else Resource.Error("Failed to confirm delivery")
        } catch (e: java.io.IOException) {
            Resource.Error(e.message ?: "Network error occurred")
        }
    }
}


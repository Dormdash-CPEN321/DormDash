package com.cpen321.usermanagement.fakes

import com.cpen321.usermanagement.data.local.models.Job
import com.cpen321.usermanagement.data.local.models.JobStatus
import com.cpen321.usermanagement.data.local.models.JobType
import com.cpen321.usermanagement.data.repository.JobRepository
import com.cpen321.usermanagement.data.remote.dto.Address
import com.cpen321.usermanagement.utils.Resource
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import java.time.LocalDateTime

/**
 * Fake implementation of JobRepository for testing.
 */
class FakeJobRepository : JobRepository {

    // Mover availability: Monday-Friday 09:00-17:00
    // Create jobs with some within availability and some outside
    private var jobsList = mutableListOf(
        // Job 1: Monday 10:00 - WITHIN availability
        Job(
            id = "job1",
            orderId = "order1",
            studentId = "student1",
            moverId = null,
            jobType = JobType.STORAGE,
            status = JobStatus.AVAILABLE,
            volume = 2.5,
            price = 25.0,
            pickupAddress = Address(
                lat = 49.2827,
                lon = -123.1207,
                formattedAddress = "123 Main St, Vancouver, BC"
            ),
            dropoffAddress = Address(
                lat = 49.2606,
                lon = -123.1133,
                formattedAddress = "456 University Ave, Vancouver, BC"
            ),
            scheduledTime = LocalDateTime.parse("2025-01-13T10:00:00") // Monday
        ),
        // Job 2: Tuesday 14:30 - WITHIN availability
        Job(
            id = "job2",
            orderId = "order2",
            studentId = "student2",
            moverId = null,
            jobType = JobType.RETURN,
            status = JobStatus.AVAILABLE,
            volume = 1.8,
            price = 18.0,
            pickupAddress = Address(
                lat = 49.2636,
                lon = -123.1386,
                formattedAddress = "789 Broadway, Vancouver, BC"
            ),
            dropoffAddress = Address(
                lat = 49.2706,
                lon = -123.1356,
                formattedAddress = "321 Commercial Dr, Vancouver, BC"
            ),
            scheduledTime = LocalDateTime.parse("2025-01-14T14:30:00") // Tuesday
        ),
        // Job 3: Saturday 11:00 - OUTSIDE availability (weekend)
        Job(
            id = "job3",
            orderId = "order3",
            studentId = "student3",
            moverId = null,
            jobType = JobType.STORAGE,
            status = JobStatus.AVAILABLE,
            volume = 3.2,
            price = 30.0,
            pickupAddress = Address(
                lat = 49.2500,
                lon = -123.1000,
                formattedAddress = "555 Weekend Ave, Vancouver, BC"
            ),
            dropoffAddress = Address(
                lat = 49.2600,
                lon = -123.1100,
                formattedAddress = "666 Storage Ln, Vancouver, BC"
            ),
            scheduledTime = LocalDateTime.parse("2025-01-18T11:00:00") // Saturday
        ),
        // Job 4: Monday 07:00 - OUTSIDE availability (too early)
        Job(
            id = "job4",
            orderId = "order4",
            studentId = "student4",
            moverId = null,
            jobType = JobType.RETURN,
            status = JobStatus.AVAILABLE,
            volume = 1.5,
            price = 15.0,
            pickupAddress = Address(
                lat = 49.2400,
                lon = -123.0900,
                formattedAddress = "777 Early Bird St, Vancouver, BC"
            ),
            dropoffAddress = Address(
                lat = 49.2450,
                lon = -123.0950,
                formattedAddress = "888 Morning Dr, Vancouver, BC"
            ),
            scheduledTime = LocalDateTime.parse("2025-01-13T07:00:00") // Monday 7am
        ),
        // Job 5: Wednesday 18:30 - OUTSIDE availability (too late)
        Job(
            id = "job5",
            orderId = "order5",
            studentId = "student5",
            moverId = null,
            jobType = JobType.STORAGE,
            status = JobStatus.AVAILABLE,
            volume = 2.0,
            price = 20.0,
            pickupAddress = Address(
                lat = 49.2300,
                lon = -123.0800,
                formattedAddress = "999 Late Night Blvd, Vancouver, BC"
            ),
            dropoffAddress = Address(
                lat = 49.2350,
                lon = -123.0850,
                formattedAddress = "111 Evening Way, Vancouver, BC"
            ),
            scheduledTime = LocalDateTime.parse("2025-01-15T18:30:00") // Wednesday 6:30pm
        )
    )

    /**
     * Helper method for tests to set empty job list
     */
    fun setEmptyJobs() {
        jobsList.clear()
    }

    /**
     * Helper method for tests to reset to default jobs
     */
    fun resetToDefaultJobs() {
        jobsList.clear()
        jobsList.addAll(listOf(
            Job(
                id = "job1",
                orderId = "order1",
                studentId = "student1",
                moverId = null,
                jobType = JobType.STORAGE,
                status = JobStatus.AVAILABLE,
                volume = 2.5,
                price = 25.0,
                pickupAddress = Address(
                    lat = 49.2827,
                    lon = -123.1207,
                    formattedAddress = "123 Main St, Vancouver, BC"
                ),
                dropoffAddress = Address(
                    lat = 49.2606,
                    lon = -123.1133,
                    formattedAddress = "456 University Ave, Vancouver, BC"
                ),
                scheduledTime = LocalDateTime.parse("2025-01-13T10:00:00")
            ),
            Job(
                id = "job2",
                orderId = "order2",
                studentId = "student2",
                moverId = null,
                jobType = JobType.RETURN,
                status = JobStatus.AVAILABLE,
                volume = 1.8,
                price = 18.0,
                pickupAddress = Address(
                    lat = 49.2636,
                    lon = -123.1386,
                    formattedAddress = "789 Broadway, Vancouver, BC"
                ),
                dropoffAddress = Address(
                    lat = 49.2706,
                    lon = -123.1356,
                    formattedAddress = "321 Commercial Dr, Vancouver, BC"
                ),
                scheduledTime = LocalDateTime.parse("2025-01-14T14:30:00")
            ),
            Job(
                id = "job3",
                orderId = "order3",
                studentId = "student3",
                moverId = null,
                jobType = JobType.STORAGE,
                status = JobStatus.AVAILABLE,
                volume = 3.2,
                price = 30.0,
                pickupAddress = Address(
                    lat = 49.2500,
                    lon = -123.1000,
                    formattedAddress = "555 Weekend Ave, Vancouver, BC"
                ),
                dropoffAddress = Address(
                    lat = 49.2600,
                    lon = -123.1100,
                    formattedAddress = "666 Storage Ln, Vancouver, BC"
                ),
                scheduledTime = LocalDateTime.parse("2025-01-18T11:00:00")
            ),
            Job(
                id = "job4",
                orderId = "order4",
                studentId = "student4",
                moverId = null,
                jobType = JobType.RETURN,
                status = JobStatus.AVAILABLE,
                volume = 1.5,
                price = 15.0,
                pickupAddress = Address(
                    lat = 49.2400,
                    lon = -123.0900,
                    formattedAddress = "777 Early Bird St, Vancouver, BC"
                ),
                dropoffAddress = Address(
                    lat = 49.2450,
                    lon = -123.0950,
                    formattedAddress = "888 Morning Dr, Vancouver, BC"
                ),
                scheduledTime = LocalDateTime.parse("2025-01-13T07:00:00")
            ),
            Job(
                id = "job5",
                orderId = "order5",
                studentId = "student5",
                moverId = null,
                jobType = JobType.STORAGE,
                status = JobStatus.AVAILABLE,
                volume = 2.0,
                price = 20.0,
                pickupAddress = Address(
                    lat = 49.2300,
                    lon = -123.0800,
                    formattedAddress = "999 Late Night Blvd, Vancouver, BC"
                ),
                dropoffAddress = Address(
                    lat = 49.2350,
                    lon = -123.0850,
                    formattedAddress = "111 Evening Way, Vancouver, BC"
                ),
                scheduledTime = LocalDateTime.parse("2025-01-15T18:30:00")
            )
        ))
    }

    /**
     * Helper method to set only jobs outside availability
     */
    fun setOnlyJobsOutsideAvailability() {
        jobsList.clear()
        jobsList.addAll(listOf(
            // Saturday job
            Job(
                id = "job3",
                orderId = "order3",
                studentId = "student3",
                moverId = null,
                jobType = JobType.STORAGE,
                status = JobStatus.AVAILABLE,
                volume = 3.2,
                price = 30.0,
                pickupAddress = Address(
                    lat = 49.2500,
                    lon = -123.1000,
                    formattedAddress = "555 Weekend Ave, Vancouver, BC"
                ),
                dropoffAddress = Address(
                    lat = 49.2600,
                    lon = -123.1100,
                    formattedAddress = "666 Storage Ln, Vancouver, BC"
                ),
                scheduledTime = LocalDateTime.parse("2025-01-18T11:00:00")
            ),
            // Monday 7am job
            Job(
                id = "job4",
                orderId = "order4",
                studentId = "student4",
                moverId = null,
                jobType = JobType.RETURN,
                status = JobStatus.AVAILABLE,
                volume = 1.5,
                price = 15.0,
                pickupAddress = Address(
                    lat = 49.2400,
                    lon = -123.0900,
                    formattedAddress = "777 Early Bird St, Vancouver, BC"
                ),
                dropoffAddress = Address(
                    lat = 49.2450,
                    lon = -123.0950,
                    formattedAddress = "888 Morning Dr, Vancouver, BC"
                ),
                scheduledTime = LocalDateTime.parse("2025-01-13T07:00:00")
            )
        ))
    }

    override fun getAvailableJobs(): Flow<Resource<List<Job>>> = flow {
        emit(Resource.Success(jobsList.toList()))
    }

    override fun getMoverJobs(): Flow<Resource<List<Job>>> = flow {
        emit(Resource.Success(emptyList()))
    }

    override fun getStudentJobs(): Flow<Resource<List<Job>>> = flow {
        emit(Resource.Success(emptyList()))
    }

    override suspend fun acceptJob(jobId: String): Resource<Unit> {
        return Resource.Success(Unit)
    }

    override suspend fun updateJobStatus(jobId: String, newStatus: JobStatus): Resource<Unit> {
        return Resource.Success(Unit)
    }

    override suspend fun requestPickupConfirmation(jobId: String): Resource<Unit> {
        return Resource.Success(Unit)
    }

    override suspend fun confirmPickup(jobId: String): Resource<Unit> {
        return Resource.Success(Unit)
    }

    override suspend fun requestDeliveryConfirmation(jobId: String): Resource<Unit> {
        return Resource.Success(Unit)
    }

    override suspend fun confirmDelivery(jobId: String): Resource<Unit> {
        return Resource.Success(Unit)
    }
}

import { JobResponse, Job } from '../types/job.type';
import { extractObjectIdString } from '../utils/mongoose.util';

/**
 * JobMapper - Centralized data transformation for Job entities
 * Produces API DTOs (string IDs and ISO timestamps) consumed by the frontend.
 */

/**
 * Convert a single Job document to JobResponse DTO
 */
export function toJobResponse(job: Job): JobResponse {
  const id = job._id.toString();

  // Safely extract orderId string (handles populated documents or ObjectId)
  const orderId = extractObjectIdString(job.orderId);


  return {
    id,
    orderId,
    studentId: extractObjectIdString(job.studentId),
    moverId: job.moverId ? extractObjectIdString(job.moverId) : undefined,
    jobType: job.jobType,
    status: job.status,
    volume: job.volume,
    price: job.price,
    pickupAddress: job.pickupAddress,
    dropoffAddress: job.dropoffAddress,
    scheduledTime:
      job.scheduledTime instanceof Date
        ? job.scheduledTime.toISOString()
        : String(job.scheduledTime),
    createdAt:
      job.createdAt instanceof Date
        ? job.createdAt.toISOString()
        : String(job.createdAt),
    updatedAt:
      job.updatedAt instanceof Date
        ? job.updatedAt.toISOString()
        : String(job.updatedAt),
    calendarEventLink: job.calendarEventLink ?? undefined,
  } as JobResponse;
}


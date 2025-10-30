import { JobResponse, Job } from '../types/job.type';

/**
 * JobMapper - Centralized data transformation for Job entities
 * Produces API DTOs (string IDs and ISO timestamps) consumed by the frontend.
 */
export class JobMapper {
  /**
   * Convert a single Job document to JobResponse DTO
   */
  static toJobResponse(job: Job): JobResponse {
    const id = job?._id?.toString?.() ?? '';

    const orderId = job.orderId?._id ? job.orderId._id.toString() : '';

    return {
      id,
      orderId,
      studentId: job.studentId?.toString?.() ?? '',
      moverId: job.moverId?.toString?.() ?? undefined,
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
}

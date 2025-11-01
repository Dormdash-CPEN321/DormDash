import mongoose, { Schema } from 'mongoose';
import { Job, JobStatus, JobType } from '../types/job.type';
import logger from '../utils/logger.util';

// Address subdocument schema (reuse from order model pattern)
const addressSubSchema = new Schema(
  {
    lat: { type: Number, required: true },
    lon: { type: Number, required: true },
    formattedAddress: { type: String, required: true, trim: true },
  },
  { _id: false }
);

// Mongoose Job schema
const jobSchema = new Schema<Job>(
  {
    _id: { type: Schema.Types.ObjectId, required: true },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    moverId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    jobType: {
      type: String,
      enum: Object.values(JobType),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(JobStatus),
      default: JobStatus.AVAILABLE,
      required: true,
    },
    volume: {
      type: Number,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    pickupAddress: { type: addressSubSchema, required: true },
    dropoffAddress: { type: addressSubSchema, required: true },
    scheduledTime: { type: Date, required: true },
    calendarEventLink: { type: String, required: false },
    createdAt: { type: Date, required: true },
  },
  {
    timestamps: true,
  }
);

// JobModel class
export class JobModel {
  private job: mongoose.Model<Job>;

  constructor() {
    this.job = mongoose.model<Job>('Job', jobSchema);
  }

  async create(newJob: Job): Promise<Job> {
    try {
      const createdJob = await this.job.create(newJob);
      return createdJob;
    } catch (error) {
      logger.error('Error creating job:', error);
      throw new Error('Failed to create job');
    }
  }

  async findById(jobId: mongoose.Types.ObjectId): Promise<Job | null> {
    try {
      return await this.job
        .findById(jobId);
    } catch (error) {
      logger.error('Error finding job:', error);
      throw new Error('Failed to find job');
    }
  }

  async findByOrderId(orderId: mongoose.Types.ObjectId): Promise<Job[]> {
    try {
      return await this.job
        .find({ orderId });
    } catch (error) {
      logger.error('Error finding jobs by order:', error);
      throw new Error('Failed to find jobs');
    }
  }

  async findAvailableJobs(): Promise<Job[]> {
    try {
      const jobs = await this.job
        .find({ status: JobStatus.AVAILABLE });
      return jobs;
    } catch (error) {
      logger.error('Error finding available jobs:', error);
      throw new Error('Failed to find available jobs');
    }
  }

  async findAllJobs(): Promise<Job[]> {
    try {
      return await this.job.find({});
    } catch (error) {
      logger.error('Error finding all jobs:', error);
      throw new Error('Failed to find all jobs');
    }
  }

  async findByMoverId(moverId: mongoose.Types.ObjectId): Promise<Job[]> {
    try {
      return await this.job.find({ moverId });
    } catch (error) {
      logger.error('Error finding mover jobs:', error);
      throw new Error('Failed to find mover jobs');
    }
  }

  async findByStudentId(studentId: mongoose.Types.ObjectId): Promise<Job[]> {
    try {
      return await this.job.find({ studentId });
    } catch (error) {
      logger.error('Error finding student jobs:', error);
      throw new Error('Failed to find student jobs');
    }
  }

  async update(
    jobId: mongoose.Types.ObjectId,
    updatedJob: Partial<Job>
  ): Promise<Job | null> {
    try {
      return await this.job.findByIdAndUpdate(jobId, updatedJob, { new: true });
    } catch (error) {
      logger.error('Error updating job:', error);
      throw new Error('Failed to update job');
    }
  }

  // Atomically accept a job: only set status to ACCEPTED when current status is AVAILABLE
  async tryAcceptJob(
    jobId: mongoose.Types.ObjectId,
    moverId?: mongoose.Types.ObjectId
  ): Promise<Job | null> {
    try {
      const update: Partial<Job> = {
        status: JobStatus.ACCEPTED,
        updatedAt: new Date(),
      };
      if (moverId) update.moverId = moverId;

      // Only apply if job is currently AVAILABLE
      return await this.job.findOneAndUpdate(
        { _id: jobId, status: JobStatus.AVAILABLE },
        { $set: update },
        { new: true }
      );
    } catch (error) {
      logger.error('Error in tryAcceptJob:', error);
      throw new Error('Failed to accept job');
    }
  }
}

export const jobModel = new JobModel();

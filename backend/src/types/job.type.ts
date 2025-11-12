import { z } from 'zod';
import mongoose from 'mongoose';
import { addressSchema, Address } from './order.types';

// Job Types Enum
export enum JobType {
  STORAGE = 'STORAGE', // Pickup from student to warehouse
  RETURN = 'RETURN', // Delivery from warehouse to return address
}

// Job zod Schema
// ------------------------------------------------------------
// TODO: check if orderId and studentId exist in DB
export const jobSchema = z.object({
  orderId: z.string().refine(val => mongoose.isValidObjectId(val), {
    message: 'Invalid order ID',
  }),
  studentId: z.string().refine(val => mongoose.isValidObjectId(val), {
    message: 'Invalid student ID',
  }),
  jobType: z.nativeEnum(JobType),
  volume: z.number().positive(),
  price: z.number().positive(),
  pickupAddress: addressSchema,
  dropoffAddress: addressSchema,
  scheduledTime: z.string().datetime(),
});

// Request types - explicitly typed to avoid 'any' inference
// ------------------------------------------------------------
export interface CreateJobRequest {
  orderId: string;
  studentId: string;
  jobType: JobType;
  volume: number;
  price: number;
  pickupAddress: Address;
  dropoffAddress: Address;
  scheduledTime: string;
}

// Generic type
// ------------------------------------------------------------
// Job status shows if a job is available for movers to pick or already taken
export enum JobStatus {
  AVAILABLE = 'AVAILABLE', // Equivalent to PENDING in OrderStatus
  ACCEPTED = 'ACCEPTED',
  AWAITING_STUDENT_CONFIRMATION = 'AWAITING_STUDENT_CONFIRMATION',
  PICKED_UP = 'PICKED_UP',
  IN_STORAGE = 'IN_STORAGE',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export interface Job {
  _id: mongoose.Types.ObjectId; // Added _id to align with Mongoose documents
  orderId: mongoose.Types.ObjectId;
  studentId: mongoose.Types.ObjectId;
  moverId?: mongoose.Types.ObjectId | null;
  jobType: JobType;
  status: JobStatus;
  volume: number;
  price: number;
  pickupAddress: Address;
  dropoffAddress: Address;
  scheduledTime: Date;
  calendarEventLink?: string | null;
  createdAt: Date;
  updatedAt: Date;
  verificationRequestedAt?: Date | null;
}

export interface JobResponse {
  id: string;
  orderId: string;
  studentId: string;
  moverId?: string;
  jobType: JobType;
  status: JobStatus;
  volume: number;
  price: number;
  pickupAddress: Address;
  dropoffAddress: Address;
  scheduledTime: string;
  calendarEventLink?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GetAllJobsResponse {
  message: string;
  data?: {
    jobs: JobResponse[];
  };
}

export interface GetMoverJobsResponse {
  message: string;
  data?: {
    jobs: JobResponse[];
  };
}

export interface GetJobResponse {
  message: string;
  data?: {
    job: JobResponse;
  };
}

export interface UpdateJobStatusRequest {
  status: JobStatus;
  moverId?: string; // When assigning job to mover
}

export interface CreateJobResponse {
  success: boolean;
  id: string;
  message: string;
}

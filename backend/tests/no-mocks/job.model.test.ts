import { describe, expect, test, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../../src/config/database';
import { jobModel } from '../../src/models/job.model';
import { JobType, JobStatus } from '../../src/types/job.type';

const originalWarn = console.warn;

beforeAll(async () => {
    console.warn = jest.fn();
    await connectDB();
});

beforeEach(async () => {
    // Clean up jobs before each test
    const db = mongoose.connection.db;
    if (db) {
        await db.collection('jobs').deleteMany({});
    }
});

afterAll(async () => {
    await disconnectDB();
    console.warn = originalWarn;
});

describe('JobModel', () => {
    describe('create', () => {
        test('should create job successfully', async () => {
            const newJob = {
                orderId: new mongoose.Types.ObjectId(),
                studentId: new mongoose.Types.ObjectId(),
                jobType: JobType.STORAGE,
                status: JobStatus.AVAILABLE,
                volume: 10,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date().toISOString(),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const result = await jobModel.create(newJob);
            expect(result).toBeDefined();
            expect(result._id).toBeDefined();
            expect(result.jobType).toBe(JobType.STORAGE);
        });

        test('should throw error on invalid data', async () => {
            const invalidJob = {
                orderId: 'invalid',
                studentId: new mongoose.Types.ObjectId(),
                jobType: JobType.STORAGE,
                status: JobStatus.AVAILABLE,
                volume: 10,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date().toISOString(),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await expect(jobModel.create(invalidJob as any)).rejects.toThrow('Failed to create job');
        });
    });

    describe('findById', () => {
        test('should find job by id successfully', async () => {
            const newJob = {
                orderId: new mongoose.Types.ObjectId(),
                studentId: new mongoose.Types.ObjectId(),
                jobType: JobType.STORAGE,
                status: JobStatus.AVAILABLE,
                volume: 10,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date().toISOString(),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const created = await jobModel.create(newJob);
            const result = await jobModel.findById(created._id);

            expect(result).toBeDefined();
            expect(result?._id.toString()).toBe(created._id.toString());
        });

        test('should return null for non-existent job', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();
            const result = await jobModel.findById(nonExistentId);
            expect(result).toBeNull();
        });

        test('should throw error on invalid id format', async () => {
            // This will cause a mongoose error
            await expect(jobModel.findById('invalid-id' as any)).rejects.toThrow('Failed to find job');
        });
    });

    describe('findByOrderId', () => {
        test('should find jobs by orderId successfully', async () => {
            const orderId = new mongoose.Types.ObjectId();
            const job1 = {
                orderId: orderId,
                studentId: new mongoose.Types.ObjectId(),
                jobType: JobType.STORAGE,
                status: JobStatus.AVAILABLE,
                volume: 10,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date().toISOString(),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const job2 = {
                orderId: orderId,
                studentId: new mongoose.Types.ObjectId(),
                jobType: JobType.RETURN,
                status: JobStatus.AVAILABLE,
                volume: 15,
                price: 75,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date().toISOString(),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await jobModel.create(job1);
            await jobModel.create(job2);

            const results = await jobModel.findByOrderId(orderId);
            expect(results.length).toBe(2);
        });

        test('should return empty array for non-existent orderId', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();
            const results = await jobModel.findByOrderId(nonExistentId);
            expect(results).toEqual([]);
        });

        test('should throw error on database error', async () => {
            // Force a database error by disconnecting
            await mongoose.connection.close();
            
            try {
                await expect(jobModel.findByOrderId(new mongoose.Types.ObjectId()))
                    .rejects.toThrow('Failed to find jobs');
            } finally {
                // Reconnect for other tests
                await connectDB();
            }
        });
    });

    describe('findAvailableJobs', () => {
        test('should find only available jobs', async () => {
            const availableJob = {
                orderId: new mongoose.Types.ObjectId(),
                studentId: new mongoose.Types.ObjectId(),
                jobType: JobType.STORAGE,
                status: JobStatus.AVAILABLE,
                volume: 10,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date().toISOString(),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const acceptedJob = {
                orderId: new mongoose.Types.ObjectId(),
                studentId: new mongoose.Types.ObjectId(),
                jobType: JobType.STORAGE,
                status: JobStatus.ACCEPTED,
                volume: 10,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date().toISOString(),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await jobModel.create(availableJob);
            await jobModel.create(acceptedJob);

            const results = await jobModel.findAvailableJobs();
            expect(results.length).toBe(1);
            expect(results[0].status).toBe(JobStatus.AVAILABLE);
        });
    });

    describe('findAllJobs', () => {
        test('should find all jobs', async () => {
            const job1 = {
                orderId: new mongoose.Types.ObjectId(),
                studentId: new mongoose.Types.ObjectId(),
                jobType: JobType.STORAGE,
                status: JobStatus.AVAILABLE,
                volume: 10,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date().toISOString(),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const job2 = {
                orderId: new mongoose.Types.ObjectId(),
                studentId: new mongoose.Types.ObjectId(),
                jobType: JobType.RETURN,
                status: JobStatus.ACCEPTED,
                volume: 15,
                price: 75,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date().toISOString(),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await jobModel.create(job1);
            await jobModel.create(job2);

            const results = await jobModel.findAllJobs();
            expect(results.length).toBe(2);
        });
    });

    describe('findByMoverId', () => {
        test('should find jobs by moverId successfully', async () => {
            const moverId = new mongoose.Types.ObjectId();
            const job = {
                orderId: new mongoose.Types.ObjectId(),
                studentId: new mongoose.Types.ObjectId(),
                moverId: moverId,
                jobType: JobType.STORAGE,
                status: JobStatus.ACCEPTED,
                volume: 10,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date().toISOString(),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await jobModel.create(job);
            const results = await jobModel.findByMoverId(moverId);
            expect(results.length).toBe(1);
            expect(results[0].moverId?.toString()).toBe(moverId.toString());
        });
    });

    describe('findByStudentId', () => {
        test('should find jobs by studentId successfully', async () => {
            const studentId = new mongoose.Types.ObjectId();
            const job = {
                orderId: new mongoose.Types.ObjectId(),
                studentId: studentId,
                jobType: JobType.STORAGE,
                status: JobStatus.AVAILABLE,
                volume: 10,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date().toISOString(),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await jobModel.create(job);
            const results = await jobModel.findByStudentId(studentId);
            expect(results.length).toBe(1);
            expect(results[0].studentId.toString()).toBe(studentId.toString());
        });
    });

    describe('update', () => {
        test('should update job successfully', async () => {
            const job = {
                orderId: new mongoose.Types.ObjectId(),
                studentId: new mongoose.Types.ObjectId(),
                jobType: JobType.STORAGE,
                status: JobStatus.AVAILABLE,
                volume: 10,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date().toISOString(),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const created = await jobModel.create(job);
            const updated = await jobModel.update(created._id, { status: JobStatus.ACCEPTED });

            expect(updated).toBeDefined();
            expect(updated?.status).toBe(JobStatus.ACCEPTED);
        });

        test('should return null for non-existent job', async () => {
            const nonExistentId = new mongoose.Types.ObjectId();
            const result = await jobModel.update(nonExistentId, { status: JobStatus.ACCEPTED });
            expect(result).toBeNull();
        });

        test('should throw error on database error', async () => {
            const job = {
                orderId: new mongoose.Types.ObjectId(),
                studentId: new mongoose.Types.ObjectId(),
                jobType: JobType.STORAGE,
                status: JobStatus.AVAILABLE,
                volume: 10,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date().toISOString(),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const created = await jobModel.create(job);
            
            // Force a database error
            await mongoose.connection.close();
            
            try {
                await expect(jobModel.update(created._id, { status: JobStatus.ACCEPTED }))
                    .rejects.toThrow('Failed to update job');
            } finally {
                await connectDB();
            }
        });
    });

    describe('tryAcceptJob', () => {
        test('should accept job atomically when available', async () => {
            const moverId = new mongoose.Types.ObjectId();
            const job = {
                orderId: new mongoose.Types.ObjectId(),
                studentId: new mongoose.Types.ObjectId(),
                jobType: JobType.STORAGE,
                status: JobStatus.AVAILABLE,
                volume: 10,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date().toISOString(),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const created = await jobModel.create(job);
            const result = await jobModel.tryAcceptJob(created._id, moverId);

            expect(result).toBeDefined();
            expect(result?.status).toBe(JobStatus.ACCEPTED);
            expect(result?.moverId?.toString()).toBe(moverId.toString());
        });

        test('should return null when job is not available', async () => {
            const moverId = new mongoose.Types.ObjectId();
            const job = {
                orderId: new mongoose.Types.ObjectId(),
                studentId: new mongoose.Types.ObjectId(),
                jobType: JobType.STORAGE,
                status: JobStatus.ACCEPTED,
                volume: 10,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date().toISOString(),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const created = await jobModel.create(job);
            const result = await jobModel.tryAcceptJob(created._id, moverId);

            expect(result).toBeNull();
        });

        test('should throw error on database error', async () => {
            const moverId = new mongoose.Types.ObjectId();
            const job = {
                orderId: new mongoose.Types.ObjectId(),
                studentId: new mongoose.Types.ObjectId(),
                jobType: JobType.STORAGE,
                status: JobStatus.AVAILABLE,
                volume: 10,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date().toISOString(),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const created = await jobModel.create(job);
            
            // Force a database error
            await mongoose.connection.close();
            
            try {
                await expect(jobModel.tryAcceptJob(created._id, moverId))
                    .rejects.toThrow('Failed to accept job');
            } finally {
                await connectDB();
            }
        });
    });

    describe('delete', () => {
        test('should delete jobs by filter successfully', async () => {
            const job1 = {
                orderId: new mongoose.Types.ObjectId(),
                studentId: new mongoose.Types.ObjectId(),
                jobType: JobType.STORAGE,
                status: JobStatus.AVAILABLE,
                volume: 10,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date().toISOString(),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const job2 = {
                orderId: new mongoose.Types.ObjectId(),
                studentId: new mongoose.Types.ObjectId(),
                jobType: JobType.STORAGE,
                status: JobStatus.AVAILABLE,
                volume: 15,
                price: 75,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date().toISOString(),
                createdAt: new Date(),
                updatedAt: new Date()
            };

            const created1 = await jobModel.create(job1);
            await jobModel.create(job2);

            const result = await jobModel.delete({ _id: created1._id } as any);
            expect(result.deletedCount).toBe(1);
        });

        test('should throw error on database error', async () => {
            // Force a database error
            await mongoose.connection.close();
            
            try {
                await expect(jobModel.delete({}))
                    .rejects.toThrow('Failed to delete jobs');
            } finally {
                await connectDB();
            }
        });
    });
});


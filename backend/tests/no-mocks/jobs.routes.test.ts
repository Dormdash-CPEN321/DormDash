import { describe, expect, test, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../../src/app';
import { connectDB, disconnectDB } from '../../src/config/database';
import { userModel } from '../../src/models/user.model';
import { jobModel } from '../../src/models/job.model';
import { orderModel } from '../../src/models/order.model';
import { JobStatus, JobType } from '../../src/types/job.type';
import { OrderStatus } from '../../src/types/order.types';

const originalWarn = console.warn;
let authToken: string;
let moverAuthToken: string;
let testUserId: mongoose.Types.ObjectId;
let testMoverId: mongoose.Types.ObjectId;

// Cleanup function to delete all users, jobs, and orders
const cleanupDatabase = async () => {
    const db = mongoose.connection.db;
    if (db) {
        await db.collection('users').deleteMany({});
        await db.collection('jobs').deleteMany({});
        await db.collection('orders').deleteMany({});
    }
};

beforeAll(async () => {
    console.warn = jest.fn(); 
    await connectDB();

    // Clean up all test data before starting
    await cleanupDatabase();
    
    // Create test student user
    const testUser = await (userModel as any).user.create({
        googleId: 'test-google-id-student',
        email: 'test-student@example.com',
        name: 'Test Student',
        userRole: 'STUDENT'
    });

    testUserId = testUser._id;

    // Create test mover user
    const testMover = await (userModel as any).user.create({
        googleId: 'test-google-id-mover',
        email: 'test-mover@example.com',
        name: 'Test Mover',
        userRole: 'MOVER'
    });

    testMoverId = testMover._id;

    // Generate JWT tokens
    const studentPayload = { id: testUserId };
    authToken = jwt.sign(studentPayload, process.env.JWT_SECRET || 'default-secret');

    const moverPayload = { id: testMoverId };
    moverAuthToken = jwt.sign(moverPayload, process.env.JWT_SECRET || 'default-secret');
});

beforeEach(async () => {
    // Clear jobs and orders collections before each test for isolation
    // Dont delete users here because test users (testUserId, testMoverId) need to persist across tests
    const db = mongoose.connection.db;
    if (db) {
       await db.collection('jobs').deleteMany({});
       await db.collection('orders').deleteMany({});
    }
});

afterAll(async () => {
    await cleanupDatabase();
    await disconnectDB();
    console.warn = originalWarn; 
});


describe('POST /api/jobs', () => {
    test('should successfully create a STORAGE job', async () => {
        const reqData = {
            orderId: new mongoose.Types.ObjectId().toString(),
            studentId: testUserId.toString(),
            jobType: "STORAGE",
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString()
        };

        const response = await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(reqData)
            .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.id).toBeDefined();
        expect(response.body.message).toBe(`${reqData.jobType} job created successfully`);
    });

    test('should successfully create a RETURN job', async () => {
        const reqData = {
            orderId: new mongoose.Types.ObjectId().toString(),
            studentId: testUserId.toString(),
            jobType: "RETURN",
            volume: 15,
            price: 75,
            pickupAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' },
            scheduledTime: new Date().toISOString()
        };

        const response = await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(reqData)
            .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.id).toBeDefined();
        expect(response.body.message).toBe(`${reqData.jobType} job created successfully`);
    });

    test('should return 400 for invalid job data', async () => {
        const reqData = {
            orderId: new mongoose.Types.ObjectId().toString(),
            studentId: testUserId.toString(),
            jobType: "INVALID_TYPE",
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString()
        };

        await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(reqData)
            .expect(400);
    });

    test('should return 400 for missing orderId', async () => {
        const reqData = {
            studentId: testUserId.toString(),
            jobType: "STORAGE",
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString()
        };

        await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(reqData)
            .expect(400);
    });

    test('should return 400 for missing studentId', async () => {
        const reqData = {
            orderId: new mongoose.Types.ObjectId().toString(),
            jobType: "STORAGE",
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString()
        };

        await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(reqData)
            .expect(400);
    });

    test('should return 400 for invalid volume (0)', async () => {
        const reqData = {
            orderId: new mongoose.Types.ObjectId().toString(),
            studentId: testUserId.toString(),
            jobType: "STORAGE",
            volume: 0,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString()
        };

        await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(reqData)
            .expect(400);
    });

    test('should return 400 for invalid price (0)', async () => {
        const reqData = {
            orderId: new mongoose.Types.ObjectId().toString(),
            studentId: testUserId.toString(),
            jobType: "STORAGE",
            volume: 10,
            price: 0,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString()
        };

        await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(reqData)
            .expect(400);
    });

    test('should return 400 for invalid studentId (not a valid MongoDB ObjectId)', async () => {
        const reqData = {
            orderId: new mongoose.Types.ObjectId().toString(),
            studentId: "invalid-student-id",
            jobType: "STORAGE",
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString()
        };

        await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(reqData)
            .expect(400);
    });

    test('should return 400 for invalid orderId (not a valid MongoDB ObjectId)', async () => {
        const reqData = {
            orderId: "invalid-order-id",
            studentId: testUserId.toString(),
            jobType: "STORAGE",
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString()
        };

        await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(reqData)
            .expect(400);
    });

    test('should return 401 without authentication', async () => {
        const reqData = {
            orderId: new mongoose.Types.ObjectId().toString(),
            studentId: testUserId.toString(),
            jobType: "STORAGE",
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString()
        };

        await request(app)
            .post('/api/jobs')
            .send(reqData)
            .expect(401);
    });
});

describe('GET /api/jobs', () => {
    test('should get all jobs', async () => {
        // Create a test job first
        const job1 = await jobModel.create({
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const job2 = await jobModel.create({
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            jobType: JobType.RETURN,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 50.2827, lon: -120.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 47.2827, lon: -100.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const response = await request(app)
            .get('/api/jobs')
            .set('Authorization', `Bearer ${authToken}`)
            .expect(200);

        expect(response.body).toHaveProperty('message');
        expect(response.body.data).toBeDefined();
        expect(response.body.data.jobs).toBeDefined();
        expect(Array.isArray(response.body.data.jobs)).toBe(true);
        expect(response.body.data.jobs.length).toBe(2);
    });

    test('should return empty array when no jobs exist', async () => {
        const response = await request(app)
            .get('/api/jobs')
            .set('Authorization', `Bearer ${authToken}`)
            .expect(200);

        expect(response.body.data.jobs).toEqual([]);
    });
});

describe('GET /api/jobs/available', () => {
    test('should get only available jobs', async () => {
        // Create available job
        await jobModel.create({
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Create accepted job (should not appear)
        await jobModel.create({
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            jobType: JobType.RETURN,
            status: JobStatus.ACCEPTED,
            moverId: testMoverId,
            volume: 15,
            price: 75,
            pickupAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' },
            scheduledTime: new Date().toISOString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const response = await request(app)
            .get('/api/jobs/available')
            .set('Authorization', `Bearer ${authToken}`)
            .expect(200);

        expect(response.body.data.jobs).toBeDefined();
        expect(Array.isArray(response.body.data.jobs)).toBe(true);
        expect(response.body.data.jobs.every((job: any) => job.status === JobStatus.AVAILABLE)).toBe(true);
        expect(response.body.data.jobs.length).toBe(1);
    });
});

describe('GET /api/jobs/mover', () => {
    test('should get jobs accepted by authenticated mover', async () => {
        // Create job accepted by the mover
        const acceptedJob = await jobModel.create({
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Create job accepted by different mover (should not appear)
        const otherMoverId = new mongoose.Types.ObjectId();
        await jobModel.create({
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            moverId: otherMoverId,
            jobType: JobType.RETURN,
            status: JobStatus.ACCEPTED,
            volume: 15,
            price: 75,
            pickupAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' },
            scheduledTime: new Date().toISOString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const response = await request(app)
            .get('/api/jobs/mover')
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .expect(200);

        expect(response.body.data.jobs).toBeDefined();
        expect(Array.isArray(response.body.data.jobs)).toBe(true);
        expect(response.body.data.jobs.length).toBe(1);
        expect(response.body.data.jobs[0].id).toBe(acceptedJob._id.toString());
    });

    test('should return empty array when mover has no jobs', async () => {
        const response = await request(app)
            .get('/api/jobs/mover')
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .expect(200);

        expect(response.body.data.jobs).toEqual([]);
    });

    test('should return 401 without authentication', async () => {
        await request(app)
            .get('/api/jobs/mover')
            .expect(401);
    });
});

describe('GET /api/jobs/student', () => {
    test('should get jobs for authenticated student', async () => {
        // Create job for the student
        const studentJob = await jobModel.create({
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Create job for different student (should not appear)
        const otherStudentId = new mongoose.Types.ObjectId();
        await jobModel.create({
            orderId: new mongoose.Types.ObjectId(),
            studentId: otherStudentId,
            jobType: JobType.RETURN,
            status: JobStatus.AVAILABLE,
            volume: 15,
            price: 75,
            pickupAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' },
            scheduledTime: new Date().toISOString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const response = await request(app)
            .get('/api/jobs/student')
            .set('Authorization', `Bearer ${authToken}`)
            .expect(200);

        expect(response.body.data.jobs).toBeDefined();
        expect(Array.isArray(response.body.data.jobs)).toBe(true);
        expect(response.body.data.jobs.length).toBe(1);
        expect(response.body.data.jobs[0].id).toBe(studentJob._id.toString());
    });

    test('should return empty array when student has no jobs', async () => {
        const response = await request(app)
            .get('/api/jobs/student')
            .set('Authorization', `Bearer ${authToken}`)
            .expect(200);

        expect(response.body.data.jobs).toEqual([]);
    });

    test('should return 401 without authentication', async () => {
        await request(app)
            .get('/api/jobs/student')
            .expect(401);
    });
});

describe('GET /api/jobs/:id', () => {
    test('should get job by ID', async () => {
        const job = await jobModel.create({
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const response = await request(app)
            .get(`/api/jobs/${job._id}`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(200);

        expect(response.body.data.job).toBeDefined();
        expect(response.body.data.job.id).toBe(job._id.toString());
        expect(response.body.data.job.jobType).toBe(JobType.STORAGE);
        expect(response.body.data.job.status).toBe(JobStatus.AVAILABLE);
    });

    test('should return 404 for non-existent job', async () => {
        const nonExistentId = new mongoose.Types.ObjectId();
        await request(app)
            .get(`/api/jobs/${nonExistentId}`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(404);
    });

    test('should return 400 for invalid job ID format', async () => {
        await request(app)
            .get('/api/jobs/invalid-id')
            .set('Authorization', `Bearer ${authToken}`)
            .expect(400);
    });
});

describe('PATCH /api/jobs/:id/status', () => {
    test('should accept a job (change status to ACCEPTED)', async () => {
        // Create an order first
        const order = await orderModel.create({
            studentId: testUserId,
            status: OrderStatus.PENDING,
            volume: 10,
            price: 50,
            studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Student Address' },
            warehouseAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Warehouse Address' },
            pickupTime: new Date().toISOString(),
            returnTime: new Date(Date.now() + 86400000).toISOString() // 1 day later
        } as any);

        // Create a job with the order ID
        const job = await jobModel.create({
            orderId: order._id,
            studentId: testUserId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });
        const response = await request(app)
            .patch(`/api/jobs/${job._id}/status`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .send({ status: JobStatus.ACCEPTED })
            .expect(200);
        expect(response.body.data.status).toBe(JobStatus.ACCEPTED);
        expect(response.body.data.moverId).toBe(testMoverId.toString());
        expect(response.body.data.orderId).toBe(order._id.toString());
    });

    test('should update job status to PICKED_UP', async () => {
        const job = await jobModel.create({
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const response = await request(app)
            .patch(`/api/jobs/${job._id}/status`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .send({ status: JobStatus.PICKED_UP })
            .expect(200);

        expect(response.body.data.status).toBe(JobStatus.PICKED_UP);
    });

    test('should update job status to COMPLETED for STORAGE job', async () => {
        const order = await orderModel.create({
            studentId: testUserId,
            status: OrderStatus.PENDING,
            volume: 10,
            price: 50,
            studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Student Address' },
            warehouseAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Warehouse Address' },
            pickupTime: new Date().toISOString(),
            returnTime: new Date(Date.now() + 86400000).toISOString()
        } as any);

        const job = await jobModel.create({
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.PICKED_UP,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Update mover to have MOVER role and credits
        await (userModel as any).user.findByIdAndUpdate(testMoverId, { userRole: 'MOVER', credits: 0 });

        const response = await request(app)
            .patch(`/api/jobs/${job._id}/status`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .send({ status: JobStatus.COMPLETED })
            .expect(200);

        expect(response.body.data.status).toBe(JobStatus.COMPLETED);
    });

    test('should update job status to COMPLETED for RETURN job', async () => {
        const order = await orderModel.create({
            studentId: testUserId,
            status: OrderStatus.PENDING,
            volume: 15,
            price: 75,
            studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Student Address' },
            warehouseAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            pickupTime: new Date().toISOString(),
            returnTime: new Date(Date.now() + 86400000).toISOString()
        } as any);

        const job = await jobModel.create({
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.RETURN,
            status: JobStatus.PICKED_UP,
            volume: 15,
            price: 75,
            pickupAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' },
            scheduledTime: new Date().toISOString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Update mover to have MOVER role and credits
        await (userModel as any).user.findByIdAndUpdate(testMoverId, { userRole: 'MOVER', credits: 0 });

        const response = await request(app)
            .patch(`/api/jobs/${job._id}/status`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .send({ status: JobStatus.COMPLETED })
            .expect(200);

        expect(response.body.data.status).toBe(JobStatus.COMPLETED);
    });

    test('should return 400 for invalid status', async () => {
        const job = await jobModel.create({
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await request(app)
            .patch(`/api/jobs/${job._id}/status`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .send({ status: 'INVALID_STATUS' })
            .expect(400);
    });

    test('should return 400 for missing status', async () => {
        const job = await jobModel.create({
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await request(app)
            .patch(`/api/jobs/${job._id}/status`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .send({})
            .expect(400);
    });

    test('should return 404 for non-existent job when updating status', async () => {
        const nonExistentId = new mongoose.Types.ObjectId();
        await request(app)
            .patch(`/api/jobs/${nonExistentId}/status`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .send({ status: JobStatus.ACCEPTED })
            .expect(404);
    });

    test('should handle job already accepted scenario', async () => {
        const order = await orderModel.create({
            studentId: testUserId,
            status: OrderStatus.PENDING,
            volume: 10,
            price: 50,
            studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Student Address' },
            warehouseAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Warehouse Address' },
            pickupTime: new Date().toISOString(),
            returnTime: new Date(Date.now() + 86400000).toISOString()
        } as any);

        const job = await jobModel.create({
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Try to accept an already accepted job
        await request(app)
            .patch(`/api/jobs/${job._id}/status`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .send({ status: JobStatus.ACCEPTED })
            .expect(400);
    });
});

describe('POST /api/jobs/:id/arrived', () => {
    test('should request pickup confirmation when mover arrives', async () => {
        const job = await jobModel.create({
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const response = await request(app)
            .post(`/api/jobs/${job._id}/arrived`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Confirmation requested');
    });

    test('should return error if mover is not assigned to job', async () => {
        const otherMoverId = new mongoose.Types.ObjectId();
        const job = await jobModel.create({
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            moverId: otherMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await request(app)
            .post(`/api/jobs/${job._id}/arrived`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .expect(403);
    });

    test('should return 404 for non-existent job', async () => {
        const nonExistentId = new mongoose.Types.ObjectId();
        await request(app)
            .post(`/api/jobs/${nonExistentId}/arrived`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .expect(404);
    });

    test('should return 400 for RETURN job type', async () => {
        const job = await jobModel.create({
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.RETURN,
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await request(app)
            .post(`/api/jobs/${job._id}/arrived`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .expect(400);
    });

    test('should return 400 if job status is not ACCEPTED', async () => {
        const job = await jobModel.create({
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await request(app)
            .post(`/api/jobs/${job._id}/arrived`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .expect(400);
    });
});

describe('POST /api/jobs/:id/confirm-pickup', () => {
    test('should confirm pickup by student', async () => {
        // Create an order first
        const order = await orderModel.create({
            studentId: testUserId,
            status: OrderStatus.PENDING,
            volume: 10,
            price: 50,
            studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Student Address' },
            warehouseAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Warehouse Address' },
            pickupTime: new Date().toISOString(),
            returnTime: new Date(Date.now() + 86400000).toISOString() // 1 day later
        } as any);

        const job = await jobModel.create({
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString(),
            verificationRequestedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const response = await request(app)
            .post(`/api/jobs/${job._id}/confirm-pickup`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Pickup confirmed');
    });

    test('should return error if student is not the job owner', async () => {
        const otherStudentId = new mongoose.Types.ObjectId();
        
        // Create an order for the other student
        const order = await orderModel.create({
            studentId: otherStudentId,
            status: OrderStatus.PENDING,
            volume: 10,
            price: 50,
            studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Student Address' },
            warehouseAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Warehouse Address' },
            pickupTime: new Date().toISOString(),
            returnTime: new Date(Date.now() + 86400000).toISOString() // 1 day later
        } as any);

        const job = await jobModel.create({
            orderId: order._id,
            studentId: otherStudentId,
            moverId: testMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString(),
            verificationRequestedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await request(app)
            .post(`/api/jobs/${job._id}/confirm-pickup`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(403);
    });

    test('should return 404 for non-existent job', async () => {
        const nonExistentId = new mongoose.Types.ObjectId();
        await request(app)
            .post(`/api/jobs/${nonExistentId}/confirm-pickup`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(404);
    });

    test('should return 400 for RETURN job type', async () => {
        const order = await orderModel.create({
            studentId: testUserId,
            status: OrderStatus.PENDING,
            volume: 10,
            price: 50,
            studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Student Address' },
            warehouseAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Warehouse Address' },
            pickupTime: new Date().toISOString(),
            returnTime: new Date(Date.now() + 86400000).toISOString()
        } as any);

        const job = await jobModel.create({
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.RETURN,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString(),
            verificationRequestedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await request(app)
            .post(`/api/jobs/${job._id}/confirm-pickup`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(400);
    });

    test('should return 400 if job status is not AWAITING_STUDENT_CONFIRMATION', async () => {
        const order = await orderModel.create({
            studentId: testUserId,
            status: OrderStatus.PENDING,
            volume: 10,
            price: 50,
            studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Student Address' },
            warehouseAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Warehouse Address' },
            pickupTime: new Date().toISOString(),
            returnTime: new Date(Date.now() + 86400000).toISOString()
        } as any);

        const job = await jobModel.create({
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await request(app)
            .post(`/api/jobs/${job._id}/confirm-pickup`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(400);
    });

    test('should return 500 when jobId is empty string', async () => {
        await request(app)
            .post('/api/jobs/%20/confirm-pickup')  
            .set('Authorization', `Bearer ${authToken}`)
            .expect(500);
    });

    test('should return 401 when studentId is missing', async () => {
        const validJobId = new mongoose.Types.ObjectId();
        await request(app)
            .post(`/api/jobs/${validJobId}/confirm-pickup`)
            // No Authorization header - req.user will be undefined
            .expect(401);
    });
});

describe('POST /api/jobs/:id/delivered', () => {
    test('should request delivery confirmation when mover delivers (RETURN job)', async () => {
        // Create an order first
        const order = await orderModel.create({
            studentId: testUserId,
            status: OrderStatus.PENDING,
            volume: 15,
            price: 75,
            studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Student Address' },
            warehouseAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            pickupTime: new Date().toISOString(),
            returnTime: new Date(Date.now() + 86400000).toISOString() // 1 day later
        } as any);

        const job = await jobModel.create({
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.RETURN,
            status: JobStatus.PICKED_UP,
            volume: 15,
            price: 75,
            pickupAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' },
            scheduledTime: new Date().toISOString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const response = await request(app)
            .post(`/api/jobs/${job._id}/delivered`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Delivery confirmation requested');
    });

    test('should return error if mover is not assigned to job', async () => {
        const otherMoverId = new mongoose.Types.ObjectId();
        
        // Create an order first
        const order = await orderModel.create({
            studentId: testUserId,
            status: OrderStatus.PENDING,
            volume: 15,
            price: 75,
            studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Student Address' },
            warehouseAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            pickupTime: new Date().toISOString(),
            returnTime: new Date(Date.now() + 86400000).toISOString() // 1 day later
        } as any);

        const job = await jobModel.create({
            orderId: order._id,
            studentId: testUserId,
            moverId: otherMoverId,
            jobType: JobType.RETURN,
            status: JobStatus.PICKED_UP,
            volume: 15,
            price: 75,
            pickupAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' },
            scheduledTime: new Date().toISOString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await request(app)
            .post(`/api/jobs/${job._id}/delivered`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .expect(403);
    });

    test('should return 404 for non-existent job', async () => {
        const nonExistentId = new mongoose.Types.ObjectId();
        await request(app)
            .post(`/api/jobs/${nonExistentId}/delivered`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .expect(404);
    });

    test('should return 400 for STORAGE job type', async () => {
        const order = await orderModel.create({
            studentId: testUserId,
            status: OrderStatus.PENDING,
            volume: 10,
            price: 50,
            studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Student Address' },
            warehouseAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Warehouse Address' },
            pickupTime: new Date().toISOString(),
            returnTime: new Date(Date.now() + 86400000).toISOString()
        } as any);

        const job = await jobModel.create({
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.PICKED_UP,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await request(app)
            .post(`/api/jobs/${job._id}/delivered`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .expect(400);
    });

    test('should return 400 if job status is not PICKED_UP', async () => {
        const order = await orderModel.create({
            studentId: testUserId,
            status: OrderStatus.PENDING,
            volume: 15,
            price: 75,
            studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Student Address' },
            warehouseAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            pickupTime: new Date().toISOString(),
            returnTime: new Date(Date.now() + 86400000).toISOString()
        } as any);

        const job = await jobModel.create({
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.RETURN,
            status: JobStatus.ACCEPTED,
            volume: 15,
            price: 75,
            pickupAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' },
            scheduledTime: new Date().toISOString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await request(app)
            .post(`/api/jobs/${job._id}/delivered`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .expect(400);
    });
});

describe('POST /api/jobs/:id/confirm-delivery', () => {
    test('should confirm delivery by student (RETURN job)', async () => {
        // Create an order first
        const order = await orderModel.create({
            studentId: testUserId,
            status: OrderStatus.PENDING,
            volume: 15,
            price: 75,
            studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Student Address' },
            warehouseAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            pickupTime: new Date().toISOString(),
            returnTime: new Date(Date.now() + 86400000).toISOString() // 1 day later
        } as any);

        const job = await jobModel.create({
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.RETURN,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 15,
            price: 75,
            pickupAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' },
            scheduledTime: new Date().toISOString(),
            verificationRequestedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const response = await request(app)
            .post(`/api/jobs/${job._id}/confirm-delivery`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Delivery confirmed');
    });

    test('should return error if student is not the job owner', async () => {
        const otherStudentId = new mongoose.Types.ObjectId();
        
        // Create an order for the other student
        const order = await orderModel.create({
            studentId: otherStudentId,
            status: OrderStatus.PENDING,
            volume: 15,
            price: 75,
            studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Student Address' },
            warehouseAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            pickupTime: new Date().toISOString(),
            returnTime: new Date(Date.now() + 86400000).toISOString() // 1 day later
        } as any);

        const job = await jobModel.create({
            orderId: order._id,
            studentId: otherStudentId,
            moverId: testMoverId,
            jobType: JobType.RETURN,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 15,
            price: 75,
            pickupAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' },
            scheduledTime: new Date().toISOString(),
            verificationRequestedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await request(app)
            .post(`/api/jobs/${job._id}/confirm-delivery`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(403);
    });

    test('should return 404 for non-existent job', async () => {
        const nonExistentId = new mongoose.Types.ObjectId();
        await request(app)
            .post(`/api/jobs/${nonExistentId}/confirm-delivery`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(404);
    });

    test('should return 400 for STORAGE job type', async () => {
        const order = await orderModel.create({
            studentId: testUserId,
            status: OrderStatus.PENDING,
            volume: 10,
            price: 50,
            studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Student Address' },
            warehouseAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Warehouse Address' },
            pickupTime: new Date().toISOString(),
            returnTime: new Date(Date.now() + 86400000).toISOString()
        } as any);

        const job = await jobModel.create({
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString(),
            verificationRequestedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await request(app)
            .post(`/api/jobs/${job._id}/confirm-delivery`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(400);
    });

    test('should return 400 if job status is not AWAITING_STUDENT_CONFIRMATION', async () => {
        const order = await orderModel.create({
            studentId: testUserId,
            status: OrderStatus.PENDING,
            volume: 15,
            price: 75,
            studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Student Address' },
            warehouseAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            pickupTime: new Date().toISOString(),
            returnTime: new Date(Date.now() + 86400000).toISOString()
        } as any);

        const job = await jobModel.create({
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.RETURN,
            status: JobStatus.PICKED_UP,
            volume: 15,
            price: 75,
            pickupAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' },
            scheduledTime: new Date().toISOString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await request(app)
            .post(`/api/jobs/${job._id}/confirm-delivery`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(400);
    });
});

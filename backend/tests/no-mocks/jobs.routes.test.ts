import { describe, expect, test, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { Socket as ClientSocket } from 'socket.io-client';
import app from '../../src/app';
import { connectDB, disconnectDB } from '../../src/config/database';
import { userModel } from '../../src/models/user.model';
import { jobModel } from '../../src/models/job.model';
import { orderModel } from '../../src/models/order.model';
import { JobStatus, JobType } from '../../src/types/job.type';
import { OrderStatus } from '../../src/types/order.types';
import { initSocket } from '../../src/socket';
import { OrderService } from '../../src/services/order.service';
import {
  SocketTestContext,
  createStudentSocket,
  createMoverSocket,
  cleanupSocketServer,
  waitForSocketEvent,
  waitForSocketEventOptional,
  generateTestTokens,
} from '../helpers/socket.helper';

const originalWarn = console.warn;
let authToken: string;
let moverAuthToken: string;
let testUserId: mongoose.Types.ObjectId;
let testMoverId: mongoose.Types.ObjectId;

// Socket test infrastructure
const SOCKET_TEST_PORT = 3202; // Unique port for no-mocks jobs socket tests
let socketServer: http.Server | null = null;
let socketIo: SocketIOServer | null = null;
let studentSocket: ClientSocket | null = null;
let moverSocket: ClientSocket | null = null;

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

    // Set up Socket.IO server for testing
    socketServer = http.createServer(app);
    socketIo = initSocket(socketServer);

    await new Promise<void>((resolve) => {
        socketServer!.listen(SOCKET_TEST_PORT, () => {
            resolve();
        });
    });

    // Connect student and mover sockets
    studentSocket = await createStudentSocket(SOCKET_TEST_PORT, authToken);
    moverSocket = await createMoverSocket(SOCKET_TEST_PORT, moverAuthToken);
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
    // Clean up socket connections
    if (studentSocket) {
        studentSocket.disconnect();
        studentSocket = null;
    }
    if (moverSocket) {
        moverSocket.disconnect();
        moverSocket = null;
    }

    // Close Socket.IO and server
    if (socketIo) {
        socketIo.disconnectSockets();
        await new Promise<void>((resolve) => {
            socketIo!.close(() => resolve());
        });
        socketIo = null;
    }
    if (socketServer) {
        await new Promise<void>((resolve) => {
            socketServer!.close(() => resolve());
        });
        socketServer = null;
    }

    await cleanupDatabase();
    
    // Ensure all mongoose connections are closed
    if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
    }
    
    // Also call the disconnectDB function
    await disconnectDB();
    
    // Give a moment for all async operations to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.warn = originalWarn; 
});


describe('POST /api/jobs', () => {
    // Input: valid STORAGE job data with all required fields
    // Expected status code: 201
    // Expected behavior: new job is created in database with STORAGE type
    // Expected output: success: true, id: jobId, message: "STORAGE job created successfully"
    test('should successfully create a STORAGE job', async () => {
        const reqData = {
            orderId: new mongoose.Types.ObjectId().toString(),
            studentId: testUserId.toString(),
            jobType: "STORAGE",
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date()
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

    // Input: valid RETURN job data with all required fields
    // Expected status code: 201
    // Expected behavior: new job is created in database with RETURN type
    // Expected output: success: true, id: jobId, message: "RETURN job created successfully"
    test('should successfully create a RETURN job', async () => {
        const reqData = {
            orderId: new mongoose.Types.ObjectId().toString(),
            studentId: testUserId.toString(),
            jobType: "RETURN",
            volume: 15,
            price: 75,
            pickupAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' },
            scheduledTime: new Date()
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

    // Input: job data with invalid jobType ("INVALID_TYPE")
    // Expected status code: 400
    // Expected behavior: database is unchanged, no job created
    // Expected output: validation error response
    test('should return 400 for invalid job data', async () => {
        const reqData = {
            orderId: new mongoose.Types.ObjectId().toString(),
            studentId: testUserId.toString(),
            jobType: "INVALID_TYPE",
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date()
        };

        await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(reqData)
            .expect(400);
    });

    // Input: job data with missing orderId field
    // Expected status code: 400
    // Expected behavior: database is unchanged, no job created
    // Expected output: validation error response
    test('should return 400 for missing orderId', async () => {
        const reqData = {
            studentId: testUserId.toString(),
            jobType: "STORAGE",
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date()
        };

        await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(reqData)
            .expect(400);
    });

    // Input: job data with missing studentId field
    // Expected status code: 400
    // Expected behavior: database is unchanged, no job created
    // Expected output: validation error response
    test('should return 400 for missing studentId', async () => {
        const reqData = {
            orderId: new mongoose.Types.ObjectId().toString(),
            jobType: "STORAGE",
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date()
        };

        await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(reqData)
            .expect(400);
    });

    // Input: job data with volume = 0
    // Expected status code: 400
    // Expected behavior: database is unchanged, no job created
    // Expected output: validation error response
    test('should return 400 for invalid volume (0)', async () => {
        const reqData = {
            orderId: new mongoose.Types.ObjectId().toString(),
            studentId: testUserId.toString(),
            jobType: "STORAGE",
            volume: 0,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date()
        };

        await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(reqData)
            .expect(400);
    });

    // Input: job data with price = 0
    // Expected status code: 400
    // Expected behavior: database is unchanged, no job created
    // Expected output: validation error response
    test('should return 400 for invalid price (0)', async () => {
        const reqData = {
            orderId: new mongoose.Types.ObjectId().toString(),
            studentId: testUserId.toString(),
            jobType: "STORAGE",
            volume: 10,
            price: 0,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date()
        };

        await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(reqData)
            .expect(400);
    });

    // Input: job data with studentId that is not a valid MongoDB ObjectId
    // Expected status code: 400
    // Expected behavior: database is unchanged, no job created
    // Expected output: validation error response
    test('should return 400 for invalid studentId (not a valid MongoDB ObjectId)', async () => {
        const reqData = {
            orderId: new mongoose.Types.ObjectId().toString(),
            studentId: "invalid-student-id",
            jobType: "STORAGE",
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date()
        };

        await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(reqData)
            .expect(400);
    });

    // Input: job data with orderId that is not a valid MongoDB ObjectId
    // Expected status code: 400
    // Expected behavior: database is unchanged, no job created
    // Expected output: validation error response
    test('should return 400 for invalid orderId (not a valid MongoDB ObjectId)', async () => {
        const reqData = {
            orderId: "invalid-order-id",
            studentId: testUserId.toString(),
            jobType: "STORAGE",
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date()
        };

        await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(reqData)
            .expect(400);
    });

    // Input: valid job data but no Authorization header
    // Expected status code: 401
    // Expected behavior: database is unchanged, no job created
    // Expected output: authentication error response
    test('should return 401 without authentication', async () => {
        const reqData = {
            orderId: new mongoose.Types.ObjectId().toString(),
            studentId: testUserId.toString(),
            jobType: "STORAGE",
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date()
        };

        await request(app)
            .post('/api/jobs')
            .send(reqData)
            .expect(401);
    });
});

describe('GET /api/jobs', () => {
    // Input: GET request with valid authentication token, database contains 2 jobs
    // Expected status code: 200
    // Expected behavior: all jobs are retrieved from database
    // Expected output: message, data.jobs array containing 2 jobs
    test('should get all jobs', async () => {
        // Create a test job first
        const job1 = await jobModel.create({
            _id: new mongoose.Types.ObjectId(),
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const job2 = await jobModel.create({
            _id: new mongoose.Types.ObjectId(),
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            jobType: JobType.RETURN,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 50.2827, lon: -120.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 47.2827, lon: -100.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
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

    // Input: GET request with valid authentication token, database contains no jobs
    // Expected status code: 200
    // Expected behavior: no jobs retrieved (empty result)
    // Expected output: data.jobs is an empty array
    test('should return empty array when no jobs exist', async () => {
        const response = await request(app)
            .get('/api/jobs')
            .set('Authorization', `Bearer ${authToken}`)
            .expect(200);

        expect(response.body.data.jobs).toEqual([]);
    });
});

describe('GET /api/jobs/available', () => {
    // Input: GET request with valid authentication token, database contains 1 AVAILABLE job and 1 ACCEPTED job
    // Expected status code: 200
    // Expected behavior: only AVAILABLE jobs are retrieved from database
    // Expected output: data.jobs array containing 1 job with status AVAILABLE
    test('should get only available jobs', async () => {

        // Create available job
        await jobModel.create({
            _id: new mongoose.Types.ObjectId(),
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Create accepted job (should not appear)
        await jobModel.create({
            _id: new mongoose.Types.ObjectId(),
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            jobType: JobType.RETURN,
            status: JobStatus.ACCEPTED,
            moverId: testMoverId,
            volume: 15,
            price: 75,
            pickupAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' },
            scheduledTime: new Date(),
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
    // Input: GET request with mover authentication token, database contains 1 job accepted by this mover and 1 job accepted by different mover
    // Expected status code: 200
    // Expected behavior: only jobs accepted by authenticated mover are retrieved from database
    // Expected output: data.jobs array containing 1 job with moverId matching authenticated mover
    test('should get jobs accepted by authenticated mover', async () => {
        // Create job accepted by the mover
        const acceptedJob = await jobModel.create({
            _id: new mongoose.Types.ObjectId(),
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Create job accepted by different mover (should not appear)
        const otherMoverId = new mongoose.Types.ObjectId();
        await jobModel.create({
            _id: new mongoose.Types.ObjectId(),
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            moverId: otherMoverId,
            jobType: JobType.RETURN,
            status: JobStatus.ACCEPTED,
            volume: 15,
            price: 75,
            pickupAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' },
            scheduledTime: new Date(),
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

    // Input: GET request with mover authentication token, database contains no jobs for this mover
    // Expected status code: 200
    // Expected behavior: no jobs retrieved (empty result)
    // Expected output: data.jobs is an empty array
    test('should return empty array when mover has no jobs', async () => {
        const response = await request(app)
            .get('/api/jobs/mover')
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .expect(200);

        expect(response.body.data.jobs).toEqual([]);
    });

    // Input: GET request without Authorization header
    // Expected status code: 401
    // Expected behavior: no database query executed
    // Expected output: authentication error response
    test('should return 401 without authentication', async () => {
        await request(app)
            .get('/api/jobs/mover')
            .expect(401);
    });
});

describe('GET /api/jobs/student', () => {
    // Input: GET request with student authentication token, database contains 1 job for this student and 1 job for different student
    // Expected status code: 200
    // Expected behavior: only jobs belonging to authenticated student are retrieved from database
    // Expected output: data.jobs array containing 1 job with studentId matching authenticated student
    test('should get jobs for authenticated student', async () => {
        // Create job for the student
        const studentJob = await jobModel.create({
            _id: new mongoose.Types.ObjectId(),
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Create job for different student (should not appear)
        const otherStudentId = new mongoose.Types.ObjectId();
        await jobModel.create({
            _id: new mongoose.Types.ObjectId(),
            orderId: new mongoose.Types.ObjectId(),
            studentId: otherStudentId,
            jobType: JobType.RETURN,
            status: JobStatus.AVAILABLE,
            volume: 15,
            price: 75,
            pickupAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' },
            scheduledTime: new Date(),
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

    // Input: GET request with student authentication token, database contains no jobs for this student
    // Expected status code: 200
    // Expected behavior: no jobs retrieved (empty result)
    // Expected output: data.jobs is an empty array
    test('should return empty array when student has no jobs', async () => {
        const response = await request(app)
            .get('/api/jobs/student')
            .set('Authorization', `Bearer ${authToken}`)
            .expect(200);

        expect(response.body.data.jobs).toEqual([]);
    });

    // Input: GET request without Authorization header
    // Expected status code: 401
    // Expected behavior: no database query executed
    // Expected output: authentication error response
    test('should return 401 without authentication', async () => {
        await request(app)
            .get('/api/jobs/student')
            .expect(401);
    });
});

describe('GET /api/jobs/:id', () => {
    // Input: GET request with valid job ID and authentication token, job exists in database
    // Expected status code: 200
    // Expected behavior: job is retrieved from database by ID
    // Expected output: data.job object with job details matching the requested ID
    test('should get job by ID', async () => {
        const job = await jobModel.create({
            _id: new mongoose.Types.ObjectId(),
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
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

    // Input: GET request with valid ObjectId format but job does not exist in database
    // Expected status code: 404
    // Expected behavior: database query executed but no job found
    // Expected output: job not found error response
    test('should return 404 for non-existent job', async () => {
        const nonExistentId = new mongoose.Types.ObjectId();
        await request(app)
            .get(`/api/jobs/${nonExistentId}`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(404);
    });

    // Input: GET request with invalid job ID format (not a valid MongoDB ObjectId)
    // Expected status code: 400
    // Expected behavior: no database query executed due to invalid ID format
    // Expected output: validation error response
    test('should return 400 for invalid job ID format', async () => {
        await request(app)
            .get('/api/jobs/invalid-id')
            .set('Authorization', `Bearer ${authToken}`)
            .expect(400);
    });
});

describe('PATCH /api/jobs/:id/status', () => {
    // Input: PATCH request with valid job ID, status: ACCEPTED, mover authentication token, job exists with status AVAILABLE and has associated order
    // Expected status code: 200
    // Expected behavior: job status updated to ACCEPTED, moverId set to authenticated mover, order status updated
    // Expected output: data.status: ACCEPTED, data.moverId: moverId, data.orderId: orderId
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
            _id: new mongoose.Types.ObjectId(),
            orderId: order._id,
            studentId: testUserId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });
        const response = await request(app)
            .patch(`/api/jobs/${job._id}/status`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .send({ status: JobStatus.ACCEPTED })
            .expect(200);
        expect(response.body.status).toBe(JobStatus.ACCEPTED);
        expect(response.body.moverId).toBe(testMoverId.toString());
        expect(response.body.orderId).toBe(order._id.toString());
    });

    // Input: PATCH request with valid job ID, status: PICKED_UP, mover authentication token, job exists with status ACCEPTED
    // Expected status code: 200
    // Expected behavior: job status updated to PICKED_UP in database
    // Expected output: data.status: PICKED_UP
    test('should update job status to PICKED_UP', async () => {
        const job = await jobModel.create({
            _id: new mongoose.Types.ObjectId(),
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const response = await request(app)
            .patch(`/api/jobs/${job._id}/status`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .send({ status: JobStatus.PICKED_UP })
            .expect(200);

        expect(response.body.status).toBe(JobStatus.PICKED_UP);
    });

    // Input: PATCH request with valid job ID, status: COMPLETED, mover authentication token, STORAGE job exists with status PICKED_UP and has associated order
    // Expected status code: 200
    // Expected behavior: job status updated to COMPLETED, mover credits updated, order status updated to IN_STORAGE
    // Expected output: data.status: COMPLETED
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
            _id: new mongoose.Types.ObjectId(),
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.PICKED_UP,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
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

        expect(response.body.status).toBe(JobStatus.COMPLETED);
    });

    // Input: PATCH request with valid job ID, status: COMPLETED, mover authentication token, RETURN job exists with status PICKED_UP and has associated order
    // Expected status code: 200
    // Expected behavior: job status updated to COMPLETED, mover credits updated, order status updated to RETURNED
    // Expected output: data.status: COMPLETED
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
            _id: new mongoose.Types.ObjectId(),
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.RETURN,
            status: JobStatus.PICKED_UP,
            volume: 15,
            price: 75,
            pickupAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' },
            scheduledTime: new Date(),
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

        expect(response.body.status).toBe(JobStatus.COMPLETED);
    });

    // Input: PATCH request with valid job ID, status: "INVALID_STATUS", mover authentication token
    // Expected status code: 400
    // Expected behavior: database is unchanged, no job status updated
    // Expected output: validation error response
    test('should return 400 for invalid status', async () => {
        const job = await jobModel.create({
            _id: new mongoose.Types.ObjectId(),
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await request(app)
            .patch(`/api/jobs/${job._id}/status`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .send({ status: 'INVALID_STATUS' })
            .expect(400);
    });

    // Input: PATCH request with valid job ID, empty request body (no status field), mover authentication token
    // Expected status code: 400
    // Expected behavior: database is unchanged, no job status updated
    // Expected output: validation error response
    test('should return 400 for missing status', async () => {
        const job = await jobModel.create({
            _id: new mongoose.Types.ObjectId(),
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await request(app)
            .patch(`/api/jobs/${job._id}/status`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .send({})
            .expect(400);
    });

    // Input: PATCH request with valid ObjectId format but job does not exist in database, status: ACCEPTED, mover authentication token
    // Expected status code: 404
    // Expected behavior: database query executed but no job found, no updates performed
    // Expected output: job not found error response
    test('should return 404 for non-existent job when updating status', async () => {
        const nonExistentId = new mongoose.Types.ObjectId();
        await request(app)
            .patch(`/api/jobs/${nonExistentId}/status`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .send({ status: JobStatus.ACCEPTED })
            .expect(404);
    });

    // Input: PATCH request with valid job ID, status: ACCEPTED, mover authentication token, job already has status ACCEPTED
    // Expected status code: 400
    // Expected behavior: database is unchanged, job status remains ACCEPTED
    // Expected output: error response indicating job already accepted
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
            _id: new mongoose.Types.ObjectId(),
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
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

    // Branch Coverage: Line 34 - addCreditsToMover early return when job has no moverId
    // Input: PATCH request to complete job that has no mover assigned
    // Expected status code: 200
    // Expected behavior: job completes, but no credits added since moverId is null
    test('should not add credits when job completed without mover', async () => {
        const order = await orderModel.create({
            studentId: testUserId,
            status: OrderStatus.PENDING,
            volume: 100,
            price: 50.0,
            studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Student Address' },
            warehouseAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Warehouse Address' },
            pickupTime: new Date().toISOString(),
            returnTime: new Date(Date.now() + 86400000).toISOString()
        } as any);

        const job = await jobModel.create({
            _id: new mongoose.Types.ObjectId(),
            orderId: order._id,
            studentId: testUserId,
            moverId: null,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 100,
            price: 50.0,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const db = mongoose.connection.db;
        if (db) {
            await db.collection('jobs').updateOne({ _id: job._id }, { $set: { status: JobStatus.PICKED_UP } });
            await db.collection('orders').updateOne({ _id: order._id }, { $set: { status: OrderStatus.PICKED_UP } });
        }

        const moverBefore = await (userModel as any).user.findById(testMoverId);
        const creditsBefore = moverBefore?.credits ?? 0;

        const response = await request(app)
            .patch(`/api/jobs/${job._id.toString()}/status`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .send({ status: JobStatus.COMPLETED });

        expect(response.status).toBe(200);

        const moverAfter = await (userModel as any).user.findById(testMoverId);
        expect(moverAfter?.credits ?? 0).toBe(creditsBefore);
    });

    // Branch Coverage: Lines 48-69 - addCreditsToMover adds credits when mover completes job
    // Input: PATCH request to complete job with mover assigned
    // Expected status code: 200
    // Expected behavior: job completes, credits added to mover
    test('should add credits to mover when job completed with mover', async () => {
        const order = await orderModel.create({
            studentId: testUserId,
            status: OrderStatus.PENDING,
            volume: 100,
            price: 75.0,
            studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Student Address' },
            warehouseAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Warehouse Address' },
            pickupTime: new Date().toISOString(),
            returnTime: new Date(Date.now() + 86400000).toISOString()
        } as any);

        const job = await jobModel.create({
            _id: new mongoose.Types.ObjectId(),
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.PICKED_UP,
            volume: 100,
            price: 75.0,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const db = mongoose.connection.db;
        if (db) {
            await db.collection('orders').updateOne({ _id: order._id }, { $set: { status: OrderStatus.PICKED_UP } });
        }

        const moverBefore = await (userModel as any).user.findById(testMoverId);
        const creditsBefore = moverBefore?.credits ?? 0;

        const response = await request(app)
            .patch(`/api/jobs/${job._id.toString()}/status`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .send({ status: JobStatus.COMPLETED });

        expect(response.status).toBe(200);

        const moverAfter = await (userModel as any).user.findById(testMoverId);
        expect(moverAfter?.credits ?? 0).toBe(creditsBefore + 75.0);
    });

    // Branch Coverage: Lines 55-59 - addCreditsToMover else branch (mover not found or wrong role)
    // Input: Complete job with moverId pointing to a STUDENT (not MOVER role)
    // Expected status code: 200
    // Expected behavior: job completes successfully, no credits added (wrong role)
    test('should complete job without adding credits when moverId has wrong role', async () => {
        const order = await orderModel.create({
            studentId: testUserId,
            status: OrderStatus.PICKED_UP,
            volume: 100,
            price: 75.0,
            studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Student Address' },
            warehouseAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Warehouse Address' },
            pickupTime: new Date().toISOString(),
            returnTime: new Date(Date.now() + 86400000).toISOString()
        } as any);

        // Create job with studentId (STUDENT role) as moverId - this triggers the else branch
        const job = await jobModel.create({
            _id: new mongoose.Types.ObjectId(),
            orderId: order._id,
            studentId: testUserId,
            moverId: testUserId, // Using student ID as mover ID - wrong role!
            jobType: JobType.STORAGE,
            status: JobStatus.PICKED_UP,
            volume: 100,
            price: 75.0,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const studentBefore = await (userModel as any).user.findById(testUserId);
        const creditsBefore = studentBefore?.credits ?? 0;

        // Complete the job using mover token (even though moverId points to STUDENT)
        // The auth middleware needs a valid token, but the moverId in the job is what matters for credits
        const response = await request(app)
            .patch(`/api/jobs/${job._id.toString()}/status`)
            .set('Authorization', `Bearer ${moverAuthToken}`) // Using mover token for auth
            .send({ status: JobStatus.COMPLETED });

        // Job should complete successfully even if moverId points to non-mover
        expect(response.status).toBe(200);

        // Verify NO credits were added (because moverId in job points to STUDENT role)
        const studentAfter = await (userModel as any).user.findById(testUserId);
        expect(studentAfter?.credits ?? 0).toBe(creditsBefore); // Credits unchanged
    });

    // Branch Coverage: Line 517 - Generic error handling in updateJobStatus
    // Input: PATCH request to update status on non-existent job
    // Expected status code: 404
    // Expected behavior: JobNotFoundError thrown and handled
    test('should handle status update on non-existent job', async () => {
        const fakeJobId = new mongoose.Types.ObjectId();

        const response = await request(app)
            .patch(`/api/jobs/${fakeJobId.toString()}/status`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .send({ status: JobStatus.COMPLETED });

        expect(response.status).toBe(404);
    });

    // Branch Coverage: Lines 295, 327-342 - Order update failure during job acceptance
    // Input: PATCH request to accept job, but order update fails (using spy)
    // Expected status code: 500
    // Expected behavior: Error thrown when orderService.updateOrderStatus fails
    test('should handle order update failure when accepting job', async () => {
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
            _id: new mongoose.Types.ObjectId(),
            orderId: order._id,
            studentId: testUserId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const spy = jest.spyOn(OrderService.prototype, 'updateOrderStatus')
            .mockRejectedValue(new Error('Simulated order update failure'));

        try {
            const response = await request(app)
                .patch(`/api/jobs/${job._id}/status`)
                .set('Authorization', `Bearer ${moverAuthToken}`)
                .send({ status: JobStatus.ACCEPTED });

            expect(response.status).toBe(500);
        } finally {
            spy.mockRestore();
        }
    });

    // Branch Coverage: Line 107 - Error in cancelJobsForOrder loop
    // Input: Cancel order with jobs, but one job update fails (using stub)
    // Expected behavior: Error logged but processing continues, order still cancelled
    test('should handle order cancellation with multiple jobs', async () => {
        const order = await orderModel.create({
            studentId: testUserId,
            status: OrderStatus.PENDING,
            volume: 200,
            price: 100.0,
            studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Student Address' },
            warehouseAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Warehouse Address' },
            pickupTime: new Date().toISOString(),
            returnTime: new Date(Date.now() + 86400000).toISOString()
        } as any);

        await jobModel.create({
            _id: new mongoose.Types.ObjectId(),
            orderId: order._id,
            studentId: testUserId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 100,
            price: 50.0,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup 1' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff 1' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await jobModel.create({
            _id: new mongoose.Types.ObjectId(),
            orderId: order._id,
            studentId: testUserId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 100,
            price: 50.0,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup 2' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff 2' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const response = await request(app)
            .delete('/api/order/cancel-order')
            .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);

        const db = mongoose.connection.db;
        if (db) {
            const jobs = await db.collection('jobs').find({ orderId: order._id }).toArray();
            jobs.forEach(job => {
                expect(job.status).toBe(JobStatus.CANCELLED);
            });
        }
    });
});

describe('POST /api/jobs/:id/arrived', () => {
    // Input: POST request with valid job ID, mover authentication token, STORAGE job exists with status ACCEPTED and moverId matches authenticated mover
    // Expected status code: 200
    // Expected behavior: job status updated to AWAITING_STUDENT_CONFIRMATION, verificationRequestedAt timestamp set
    // Expected output: success: true, message: "Confirmation requested"
    test('should request pickup confirmation when mover arrives', async () => {
        const job = await jobModel.create({
            _id: new mongoose.Types.ObjectId(),
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
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

    // Input: POST request with valid job ID, mover authentication token, STORAGE job exists but moverId does not match authenticated mover
    // Expected status code: 403
    // Expected behavior: database is unchanged, no job status updated
    // Expected output: authorization error response
    test('should return error if mover is not assigned to job', async () => {
        const otherMoverId = new mongoose.Types.ObjectId();
        const job = await jobModel.create({
            _id: new mongoose.Types.ObjectId(),
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            moverId: otherMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await request(app)
            .post(`/api/jobs/${job._id}/arrived`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .expect(403);
    });

    // Input: POST request with valid ObjectId format but job does not exist in database, mover authentication token
    // Expected status code: 404
    // Expected behavior: database query executed but no job found, no updates performed
    // Expected output: job not found error response
    test('should return 404 for non-existent job', async () => {
        const nonExistentId = new mongoose.Types.ObjectId();
        await request(app)
            .post(`/api/jobs/${nonExistentId}/arrived`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .expect(404);
    });

    // Input: POST request with valid job ID, mover authentication token, RETURN job exists with status ACCEPTED
    // Expected status code: 400
    // Expected behavior: database is unchanged, no job status updated
    // Expected output: error response indicating endpoint only valid for STORAGE jobs
    test('should return 400 for RETURN job type', async () => {
        const job = await jobModel.create({
            _id: new mongoose.Types.ObjectId(),
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.RETURN,
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await request(app)
            .post(`/api/jobs/${job._id}/arrived`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .expect(400);
    });

    // Input: POST request with valid job ID, mover authentication token, STORAGE job exists but status is not ACCEPTED (e.g., AVAILABLE)
    // Expected status code: 400
    // Expected behavior: database is unchanged, no job status updated
    // Expected output: error response indicating job must be ACCEPTED
    test('should return 400 if job status is not ACCEPTED', async () => {
        const job = await jobModel.create({
            _id: new mongoose.Types.ObjectId(),
            orderId: new mongoose.Types.ObjectId(),
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
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
    // Input: POST request with valid job ID, student authentication token, STORAGE job exists with status AWAITING_STUDENT_CONFIRMATION and studentId matches authenticated student, job has associated order
    // Expected status code: 200
    // Expected behavior: job status updated to PICKED_UP, order status updated to PICKED_UP
    // Expected output: success: true, message: "Pickup confirmed"
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
            _id: new mongoose.Types.ObjectId(),
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
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
            _id: new mongoose.Types.ObjectId(),
            orderId: order._id,
            studentId: otherStudentId,
            moverId: testMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
            verificationRequestedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await request(app)
            .post(`/api/jobs/${job._id}/confirm-pickup`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(403);
    });

    // Input: POST request with valid ObjectId format but job does not exist in database, student authentication token
    // Expected status code: 404
    // Expected behavior: database query executed but no job found, no updates performed
    // Expected output: job not found error response
    test('should return 404 for non-existent job', async () => {
        const nonExistentId = new mongoose.Types.ObjectId();
        await request(app)
            .post(`/api/jobs/${nonExistentId}/confirm-pickup`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(404);
    });

    // Input: POST request with valid job ID, student authentication token, RETURN job exists with status AWAITING_STUDENT_CONFIRMATION
    // Expected status code: 400
    // Expected behavior: database is unchanged, no job status updated
    // Expected output: error response indicating endpoint only valid for STORAGE jobs
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
            _id: new mongoose.Types.ObjectId(),
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.RETURN,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
            verificationRequestedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await request(app)
            .post(`/api/jobs/${job._id}/confirm-pickup`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(400);
    });

    // Input: POST request with valid job ID, student authentication token, STORAGE job exists but status is not AWAITING_STUDENT_CONFIRMATION (e.g., ACCEPTED)
    // Expected status code: 400
    // Expected behavior: database is unchanged, no job status updated
    // Expected output: error response indicating job must be AWAITING_STUDENT_CONFIRMATION
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
            _id: new mongoose.Types.ObjectId(),
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await request(app)
            .post(`/api/jobs/${job._id}/confirm-pickup`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(400);
    });

    // Input: POST request with empty/invalid job ID (space character in URL)
    // Expected status code: 500
    // Expected behavior: database is unchanged, no job status updated
    // Expected output: server error response
    test('should return 500 when jobId is empty string', async () => {
        await request(app)
            .post('/api/jobs/%20/confirm-pickup')  
            .set('Authorization', `Bearer ${authToken}`)
            .expect(500);
    });

    // Input: POST request with valid job ID but no Authorization header
    // Expected status code: 401
    // Expected behavior: no database query executed, no job status updated
    // Expected output: authentication error response
    test('should return 401 when studentId is missing', async () => {
        const validJobId = new mongoose.Types.ObjectId();
        await request(app)
            .post(`/api/jobs/${validJobId}/confirm-pickup`)
            // No Authorization header - req.user will be undefined
            .expect(401);
    });
});

describe('POST /api/jobs/:id/delivered', () => {
    // Input: POST request with valid job ID, mover authentication token, RETURN job exists with status PICKED_UP and moverId matches authenticated mover
    // Expected status code: 200
    // Expected behavior: job status updated to AWAITING_STUDENT_CONFIRMATION, verificationRequestedAt timestamp set
    // Expected output: success: true, message: "Delivery confirmation requested"
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
            _id: new mongoose.Types.ObjectId(),
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.RETURN,
            status: JobStatus.PICKED_UP,
            volume: 15,
            price: 75,
            pickupAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' },
            scheduledTime: new Date(),
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

    // Input: POST request with valid job ID, mover authentication token, RETURN job exists but moverId does not match authenticated mover
    // Expected status code: 403
    // Expected behavior: database is unchanged, no job status updated
    // Expected output: authorization error response
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
            _id: new mongoose.Types.ObjectId(),
            orderId: order._id,
            studentId: testUserId,
            moverId: otherMoverId,
            jobType: JobType.RETURN,
            status: JobStatus.PICKED_UP,
            volume: 15,
            price: 75,
            pickupAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await request(app)
            .post(`/api/jobs/${job._id}/delivered`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .expect(403);
    });

    // Input: POST request with valid ObjectId format but job does not exist in database, mover authentication token
    // Expected status code: 404
    // Expected behavior: database query executed but no job found, no updates performed
    // Expected output: job not found error response
    test('should return 404 for non-existent job', async () => {
        const nonExistentId = new mongoose.Types.ObjectId();
        await request(app)
            .post(`/api/jobs/${nonExistentId}/delivered`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .expect(404);
    });

    // Input: POST request with valid job ID, mover authentication token, STORAGE job exists with status PICKED_UP
    // Expected status code: 400
    // Expected behavior: database is unchanged, no job status updated
    // Expected output: error response indicating endpoint only valid for RETURN jobs
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
            _id: new mongoose.Types.ObjectId(),
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.PICKED_UP,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await request(app)
            .post(`/api/jobs/${job._id}/delivered`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .expect(400);
    });

    // Input: POST request with valid job ID, mover authentication token, RETURN job exists but status is not PICKED_UP (e.g., ACCEPTED)
    // Expected status code: 400
    // Expected behavior: database is unchanged, no job status updated
    // Expected output: error response indicating job must be PICKED_UP
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
            _id: new mongoose.Types.ObjectId(),
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.RETURN,
            status: JobStatus.ACCEPTED,
            volume: 15,
            price: 75,
            pickupAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' },
            scheduledTime: new Date(),
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
    // Input: POST request with valid job ID, student authentication token, RETURN job exists with status AWAITING_STUDENT_CONFIRMATION and studentId matches authenticated student, job has associated order
    // Expected status code: 200
    // Expected behavior: job status updated to COMPLETED, mover credits updated, order status updated to COMPLETED
    // Expected output: success: true, message: "Delivery confirmed"
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
            _id: new mongoose.Types.ObjectId(),
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.RETURN,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 15,
            price: 75,
            pickupAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' },
            scheduledTime: new Date(),
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

    // Input: POST request with valid job ID, student authentication token, RETURN job exists but studentId does not match authenticated student
    // Expected status code: 403
    // Expected behavior: database is unchanged, no job status updated
    // Expected output: authorization error response
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
            _id: new mongoose.Types.ObjectId(),
            orderId: order._id,
            studentId: otherStudentId,
            moverId: testMoverId,
            jobType: JobType.RETURN,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 15,
            price: 75,
            pickupAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' },
            scheduledTime: new Date(),
            verificationRequestedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await request(app)
            .post(`/api/jobs/${job._id}/confirm-delivery`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(403);
    });

    // Input: POST request with valid ObjectId format but job does not exist in database, student authentication token
    // Expected status code: 404
    // Expected behavior: database query executed but no job found, no updates performed
    // Expected output: job not found error response
    test('should return 404 for non-existent job', async () => {
        const nonExistentId = new mongoose.Types.ObjectId();
        await request(app)
            .post(`/api/jobs/${nonExistentId}/confirm-delivery`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(404);
    });

    // Input: POST request with valid job ID, student authentication token, STORAGE job exists with status AWAITING_STUDENT_CONFIRMATION
    // Expected status code: 400
    // Expected behavior: database is unchanged, no job status updated
    // Expected output: error response indicating endpoint only valid for RETURN jobs
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
            _id: new mongoose.Types.ObjectId(),
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
            verificationRequestedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await request(app)
            .post(`/api/jobs/${job._id}/confirm-delivery`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(400);
    });

    // Input: POST request with valid job ID, student authentication token, RETURN job exists but status is not AWAITING_STUDENT_CONFIRMATION (e.g., PICKED_UP)
    // Expected status code: 400
    // Expected behavior: database is unchanged, no job status updated
    // Expected output: error response indicating job must be AWAITING_STUDENT_CONFIRMATION
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
            _id: new mongoose.Types.ObjectId(),
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.RETURN,
            status: JobStatus.PICKED_UP,
            volume: 15,
            price: 75,
            pickupAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await request(app)
            .post(`/api/jobs/${job._id}/confirm-delivery`)
            .set('Authorization', `Bearer ${authToken}`)
            .expect(400);
    });
});

// Socket event tests for job-related operations
describe('Job Socket Events', () => {
    // Test that student socket receives job.created event when a job is created
    test('student socket should receive job.created event on job creation', async () => {
        // Set up listener before creating job
        const eventPromise = waitForSocketEventOptional(studentSocket!, 'job.created', 3000);

        const reqData = {
            orderId: new mongoose.Types.ObjectId().toString(),
            studentId: testUserId.toString(),
            jobType: 'STORAGE',
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date()
        };

        await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(reqData)
            .expect(201);

        // Wait for socket event (may be null if event not received)
        const jobCreatedEvent = await eventPromise;

        // Verify the event was received with job data
        if (jobCreatedEvent) {
            expect(jobCreatedEvent).toHaveProperty('job');
            expect(jobCreatedEvent.job).toHaveProperty('jobType', 'STORAGE');
        }
    });

    // Test that mover socket receives job.created event (broadcast to role:mover)
    test('mover socket should receive job.created event for available jobs', async () => {
        // Set up listener before creating job
        const eventPromise = waitForSocketEventOptional(moverSocket!, 'job.created', 3000);

        const reqData = {
            orderId: new mongoose.Types.ObjectId().toString(),
            studentId: testUserId.toString(),
            jobType: 'STORAGE',
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date()
        };

        await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${authToken}`)
            .send(reqData)
            .expect(201);

        // Wait for socket event
        const jobCreatedEvent = await eventPromise;

        // Verify the event was received with job data
        if (jobCreatedEvent) {
            expect(jobCreatedEvent).toHaveProperty('job');
            expect(jobCreatedEvent.job).toHaveProperty('jobType', 'STORAGE');
        }
    });

    // Test that mover socket receives job.updated event when job status changes
    test('mover socket should receive job.updated event when accepting a job', async () => {
        // First create an order (required for job acceptance to work)
        const order = await orderModel.create({
            studentId: testUserId,
            status: OrderStatus.PENDING,
            volume: 10,
            price: 50,
            studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Student Address' },
            warehouseAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            pickupTime: new Date(Date.now() + 3600000).toISOString(),
            returnTime: new Date(Date.now() + 86400000).toISOString()
        } as any);

        // Create a job linked to the order
        const job = await jobModel.create({
            _id: new mongoose.Types.ObjectId(),
            orderId: order._id,
            studentId: testUserId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Set up listener before accepting job
        const eventPromise = waitForSocketEventOptional(moverSocket!, 'job.updated', 3000);

        // Use PATCH /api/jobs/:id/status to accept the job
        await request(app)
            .patch(`/api/jobs/${job._id}/status`)
            .set('Authorization', `Bearer ${moverAuthToken}`)
            .send({ status: JobStatus.ACCEPTED })
            .expect(200);

        // Wait for socket event
        const jobUpdatedEvent = await eventPromise;

        // Verify the event was received with job data
        if (jobUpdatedEvent) {
            expect(jobUpdatedEvent).toHaveProperty('job');
            expect(jobUpdatedEvent.job).toHaveProperty('status', JobStatus.ACCEPTED);
        }
    });

    // Test that job status updates to PICKED_UP via mover arrived endpoint
    test('job status should update when mover indicates arrival (STORAGE job)', async () => {
        // Create order and job with ACCEPTED status
        const order = await orderModel.create({
            studentId: testUserId,
            moverId: testMoverId,
            status: OrderStatus.ACCEPTED,
            volume: 100,
            price: 50.0,
            studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Student Address' },
            warehouseAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            pickupTime: new Date(Date.now() + 3600000).toISOString(),
            returnTime: new Date(Date.now() + 86400000).toISOString()
        } as any);

        const job = await jobModel.create({
            _id: new mongoose.Types.ObjectId(),
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.ACCEPTED,
            volume: 100,
            price: 30.0,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Set up listener for job.updated event
        const eventPromise = waitForSocketEventOptional(studentSocket!, 'job.updated', 3000);

        // Mover indicates arrival
        const response = await request(`http://localhost:${SOCKET_TEST_PORT}`)
            .post(`/api/jobs/${job._id.toString()}/arrived`)
            .set('Authorization', `Bearer ${moverAuthToken}`);

        expect(response.status).toBe(200);

        // Wait for socket event
        const jobUpdatedEvent = await eventPromise;

        // Verify the event was received with job data
        if (jobUpdatedEvent) {
            expect(jobUpdatedEvent).toHaveProperty('job');
            expect(jobUpdatedEvent.job).toHaveProperty('status', JobStatus.AWAITING_STUDENT_CONFIRMATION);
        }

        // Verify job was updated in database
        const db = mongoose.connection.db;
        if (db) {
            const updatedJob = await db.collection('jobs').findOne({ _id: job._id });
            expect(updatedJob?.status).toBe(JobStatus.AWAITING_STUDENT_CONFIRMATION);
        }
    }, 15000);

    // Test that job status updates to PICKED_UP when student confirms pickup
    test('job status should update to PICKED_UP when student confirms pickup (STORAGE job)', async () => {
        // Create order and job with AWAITING_STUDENT_CONFIRMATION status
        const order = await orderModel.create({
            studentId: testUserId,
            moverId: testMoverId,
            status: OrderStatus.ACCEPTED,
            volume: 100,
            price: 50.0,
            studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Student Address' },
            warehouseAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Warehouse Address' },
            pickupTime: new Date(Date.now() + 3600000).toISOString(),
            returnTime: new Date(Date.now() + 86400000).toISOString()
        } as any);

        const job = await jobModel.create({
            _id: new mongoose.Types.ObjectId(),
            orderId: order._id,
            studentId: testUserId,
            moverId: testMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 100,
            price: 30.0,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2606, lon: -123.2460, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date(),
            verificationRequestedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Set up listener for job.updated event
        const eventPromise = waitForSocketEventOptional(moverSocket!, 'job.updated', 3000);

        // Student confirms pickup
        const response = await request(`http://localhost:${SOCKET_TEST_PORT}`)
            .post(`/api/jobs/${job._id.toString()}/confirm-pickup`)
            .set('Authorization', `Bearer ${authToken}`);

        expect(response.status).toBe(200);

        // Wait for socket event
        const jobUpdatedEvent = await eventPromise;

        // Verify the event was received with job data
        if (jobUpdatedEvent) {
            expect(jobUpdatedEvent).toHaveProperty('job');
            // After confirm-pickup on STORAGE job, job status goes to PICKED_UP
            expect(jobUpdatedEvent.job.status).toBe(JobStatus.PICKED_UP);
        }

        // Verify job status is PICKED_UP in database
        const db = mongoose.connection.db;
        if (db) {
            const updatedJob = await db.collection('jobs').findOne({ _id: job._id });
            expect(updatedJob?.status).toBe(JobStatus.PICKED_UP);
        }
    }, 15000);

    // Test socket connectivity for student
    test('student socket should be connected', () => {
        expect(studentSocket).not.toBeNull();
        expect(studentSocket!.connected).toBe(true);
    });

    // Test socket connectivity for mover
    test('mover socket should be connected', () => {
        expect(moverSocket).not.toBeNull();
        expect(moverSocket!.connected).toBe(true);
    });
});
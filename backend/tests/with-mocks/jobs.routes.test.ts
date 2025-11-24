import { describe, expect, test, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { JobStatus, JobType } from '../../src/types/job.type';
import { OrderStatus } from '../../src/types/order.types';
import { InternalServerError, JobNotFoundError } from '../../src/utils/errors.util';

// Mock the database connection to avoid actual DB connections in mock tests
jest.mock('../../src/config/database', () => ({
    connectDB: jest.fn(() => Promise.resolve()),
    disconnectDB: jest.fn(() => Promise.resolve()),
}));

// Mock Firebase admin for notification service tests
const mockFirebaseMessaging = {
    send: jest.fn(),
};

const mockFirebaseAdmin = {
    messaging: jest.fn(() => mockFirebaseMessaging),
    credential: {
        cert: jest.fn(),
    },
    initializeApp: jest.fn(),
};

jest.mock('firebase-admin', () => ({
    __esModule: true,
    default: mockFirebaseAdmin,
}));

// Mock Firebase config to prevent initialization
jest.mock('../../src/config/firebase', () => ({
    __esModule: true,
    default: mockFirebaseAdmin,
}));

// Mock the authentication middleware to allow any token
// Use a variable to allow per-test configuration
let testUserId: mongoose.Types.ObjectId | null = null;
let testUserRole: string = 'STUDENT';

jest.mock('../../src/middleware/auth.middleware', () => ({
    authenticateToken: (req: any, res: any, next: any) => {
        // Mock user object for authenticated requests
        // Use testUserId if set, otherwise create a random one
        req.user = {
            _id: testUserId || new (require('mongoose').Types.ObjectId)(),
            userRole: testUserRole,
        };
        next();
    },
}));

// Mock validation middleware to allow bypassing for specific tests
const validationModule = jest.requireActual('../../src/middleware/validation.middleware') as {
    validateBody: <T>(schema: any) => any;
};
const originalValidateBody = validationModule.validateBody;
let shouldBypassValidation = false;

jest.mock('../../src/middleware/validation.middleware', () => ({
    validateBody: (schema: any) => {
        return (req: any, res: any, next: any) => {
            if (shouldBypassValidation) {
                // Bypass validation - pass through req.body as-is
                next();
            } else {
                // Use original validation
                return originalValidateBody(schema)(req, res, next);
            }
        };
    },
}));

// Mock external dependencies - shared across all tests
const mockJobModel: any = {
    create: jest.fn(),
    findAllJobs: jest.fn(),
    findAvailableJobs: jest.fn(),
    findByMoverId: jest.fn(),
    findByStudentId: jest.fn(),
    findByOrderId: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    tryAcceptJob: jest.fn(),
};

const mockOrderService: any = {
    updateOrderStatus: jest.fn(),
};

const mockNotificationService: any = {
    sendJobStatusNotification: jest.fn(),
};

const mockEventEmitter: any = {
    emitJobUpdated: jest.fn(),
    emitJobCreated: jest.fn(),
    emitOrderUpdated: jest.fn(),
};

const mockJobMapper: any = {
    toJobListItems: jest.fn((jobs: any) => jobs),
};

const mockUserModel: any = {
    findByIdAndUpdate: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    clearInvalidFcmToken: jest.fn(),
};

// Mock all external dependencies
jest.mock('../../src/models/job.model', () => ({
    jobModel: mockJobModel,
}));

jest.mock('../../src/services/order.service', () => ({
    orderService: mockOrderService,
    OrderService: {
        getInstance: jest.fn(() => mockOrderService),
    },
}));

jest.mock('../../src/services/notification.service', () => ({
    notificationService: mockNotificationService,
}));

jest.mock('../../src/utils/eventEmitter.util', () => ({
    EventEmitter: mockEventEmitter,
    emitJobUpdated: mockEventEmitter.emitJobUpdated,
    emitJobCreated: mockEventEmitter.emitJobCreated,
    emitOrderUpdated: mockEventEmitter.emitOrderUpdated,
}));

jest.mock('../../src/mappers/job.mapper', () => ({
    JobMapper: mockJobMapper,
}));

jest.mock('../../src/models/user.model', () => ({
    userModel: mockUserModel,
}));

const mockPaymentService: any = {
    refundPayment: jest.fn(),
};

jest.mock('../../src/services/payment.service', () => ({
    paymentService: mockPaymentService,
}));

// Import app after mocking dependencies (but NOT the service itself)
import app from '../../src/app';

describe('POST /api/jobs', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Mocked behavior: jobModel.create throws an error
    // Input: valid job data with all required fields
    // Expected status code: 500
    // Expected behavior: the error was handled gracefully, no job created
    // Expected output: error response
    test('should handle database error when creating job (jobModel.create throws error)', async () => {
        mockJobModel.create.mockRejectedValue(new Error('Database connection failed'));

        const reqData = {
            orderId: new mongoose.Types.ObjectId().toString(),
            studentId: new mongoose.Types.ObjectId().toString(),
            jobType: JobType.STORAGE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString()
        };

        const response = await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer fake-token`)
            .send(reqData);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.create).toHaveBeenCalled();
    });

    // Mocked behavior: jobModel.create throws a generic Error
    // Input: valid job data with all required fields
    // Expected status code: 500
    // Expected behavior: the error was handled gracefully, no job created
    // Expected output: error response
    test('should handle generic error when creating job (service throws Error)', async () => {
        mockJobModel.create.mockRejectedValue(new Error('Failed to create job'));

        const reqData = {
            orderId: new mongoose.Types.ObjectId().toString(),
            studentId: new mongoose.Types.ObjectId().toString(),
            jobType: JobType.STORAGE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString()
        };

        const response = await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer fake-token`)
            .send(reqData);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.create).toHaveBeenCalled();
    });

    // Mocked behavior: validation middleware uses original Zod validation
    // Input: job data with invalid orderId (not a valid MongoDB ObjectId)
    // Expected status code: 400
    // Expected behavior: validation error caught, database is unchanged, no job created
    // Expected output: validation error response with field: 'orderId', message: 'Invalid order ID'
    test('should handle validation error with invalid orderId', async () => {
        // Test the Zod validation for invalid order ID
        // The jobSchema uses mongoose.isValidObjectId(val) which should fail for invalid format
        const reqData = {
            orderId: 'not-a-valid-mongodb-objectid', // Invalid ObjectId - triggers Zod refine validation
            studentId: new mongoose.Types.ObjectId().toString(),
            jobType: JobType.STORAGE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString()
        };

        const response = await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer fake-token`)
            .send(reqData)
            .expect(400);

        // Verify the error response contains validation details
        expect(response.body).toHaveProperty('error', 'Validation error');
        expect(response.body).toHaveProperty('details');
        expect(response.body.details[0]).toHaveProperty('field', 'orderId');
        expect(response.body.details[0]).toHaveProperty('message', 'Invalid order ID');
        expect(mockJobModel.create).not.toHaveBeenCalled();
    });

    // Mocked behavior: validation middleware uses original Zod validation
    // Input: job data with invalid studentId (not a valid MongoDB ObjectId)
    // Expected status code: 400
    // Expected behavior: validation error caught, database is unchanged, no job created
    // Expected output: validation error response with field: 'studentId', message: 'Invalid student ID'
    test('should handle validation error with invalid studentId', async () => {
        // Test the Zod validation for invalid student ID
        // The jobSchema uses mongoose.isValidObjectId(val) which should fail for invalid format
        const reqData = {
            orderId: new mongoose.Types.ObjectId().toString(),
            studentId: 'invalid-student-id-format', // Invalid ObjectId - triggers Zod refine validation
            jobType: JobType.STORAGE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString()
        };

        const response = await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer fake-token`)
            .send(reqData)
            .expect(400);

        // Verify the error response contains validation details
        expect(response.body).toHaveProperty('error', 'Validation error');
        expect(response.body).toHaveProperty('details');
        expect(response.body.details[0]).toHaveProperty('field', 'studentId');
        expect(response.body.details[0]).toHaveProperty('message', 'Invalid student ID');
        expect(mockJobModel.create).not.toHaveBeenCalled();
    });

});

describe('GET /api/jobs', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Mocked behavior: jobModel.findAllJobs throws an error
    // Input: GET request with valid authentication token
    // Expected status code: 500
    // Expected behavior: the error was handled gracefully
    // Expected output: error response
    test('should handle database error in getAllJobs (triggers controller catch block)', async () => {
        mockJobModel.findAllJobs.mockRejectedValue(new Error('Database query failed'));

        const response = await request(app)
            .get('/api/jobs')
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findAllJobs).toHaveBeenCalled();
    });


});

describe('GET /api/jobs/available', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Mocked behavior: jobModel.findAvailableJobs throws an error
    // Input: GET request with valid authentication token
    // Expected status code: 500
    // Expected behavior: the error was handled gracefully
    // Expected output: error response
    test('should handle database error in getAllAvailableJobs (triggers controller catch block)', async () => {
        mockJobModel.findAvailableJobs.mockRejectedValue(new Error('Failed to get available jobs'));

        const response = await request(app)
            .get('/api/jobs/available')
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findAvailableJobs).toHaveBeenCalled();
    });


});

describe('GET /api/jobs/mover', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Mocked behavior: jobModel.findByMoverId throws an error
    // Input: GET request with valid authentication token
    // Expected status code: 500
    // Expected behavior: the error was handled gracefully
    // Expected output: error response
    test('should handle database error in getMoverJobs (triggers controller catch block)', async () => {
        mockJobModel.findByMoverId.mockRejectedValue(new Error('Failed to get mover jobs'));

        const response = await request(app)
            .get('/api/jobs/mover')
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findByMoverId).toHaveBeenCalled();
    });
});

describe('GET /api/jobs/student', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Mocked behavior: jobModel.findByStudentId throws an error
    // Input: GET request with valid authentication token
    // Expected status code: 500
    // Expected behavior: the error was handled gracefully
    // Expected output: error response
    test('should handle database error in getStudentJobs (triggers controller catch block)', async () => {
        mockJobModel.findByStudentId.mockRejectedValue(new Error('Failed to get student jobs'));

        const response = await request(app)
            .get('/api/jobs/student')
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findByStudentId).toHaveBeenCalled();
    });
});

describe('GET /api/jobs/:id', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Mocked behavior: jobModel.findById throws an error
    // Input: GET request with valid job ID and authentication token
    // Expected status code: 500
    // Expected behavior: the error was handled gracefully
    // Expected output: error response
    test('should handle database error in getJobById (triggers controller catch block)', async () => {
        mockJobModel.findById.mockRejectedValue(new Error('Failed to get job'));

        const jobId = new mongoose.Types.ObjectId().toString();
        const response = await request(app)
            .get(`/api/jobs/${jobId}`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });

    // Mocked behavior: jobModel.findById returns null
    // Input: GET request with valid job ID and authentication token
    // Expected status code: 404
    // Expected behavior: JobNotFoundError is thrown and handled
    // Expected output: job not found error response
    test('should handle JobNotFoundError in getJobById', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        mockJobModel.findById.mockResolvedValue(null as any);

        const response = await request(app)
            .get(`/api/jobs/${jobId}`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBe(404);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });

    // Mocked behavior: jobModel.findById returns a mock job, JobMapper.toJobResponse uses actual implementation
    // Input: GET request with valid job ID and authentication token
    // Expected status code: 200
    // Expected behavior: job is retrieved and mapped using toJobResponse
    // Expected output: data.job object with all job details properly mapped
    test('should successfully get job by id and map response using toJobResponse', async () => {
        // Import actual mapper to test it
        const actualMapper = jest.requireActual('../../src/mappers/job.mapper') as typeof import('../../src/mappers/job.mapper');
        
        const jobId = new mongoose.Types.ObjectId();
        const orderId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        const moverId = new mongoose.Types.ObjectId();

        const mockJob = {
            _id: jobId,
            orderId: orderId, 
            studentId: studentId,
            moverId: moverId,
            jobType: JobType.STORAGE,
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date('2025-11-15T10:00:00Z'),
            createdAt: new Date('2025-11-10T08:00:00Z'),
            updatedAt: new Date('2025-11-11T09:00:00Z'),
            calendarEventLink: 'https://calendar.example.com/event/123',
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);

        // Mock the job mapper to use the actual implementation
        const jobMapperModule = require('../../src/mappers/job.mapper');
        jobMapperModule.toJobResponse = actualMapper.toJobResponse;

        const response = await request(app)
            .get(`/api/jobs/${jobId.toString()}`)
            .set('Authorization', 'Bearer fake-token')
            .expect(200);

        expect(response.body).toHaveProperty('message', 'Job retrieved successfully');
        expect(response.body.data).toHaveProperty('job');
        expect(response.body.data.job).toHaveProperty('id', jobId.toString());
        expect(response.body.data.job).toHaveProperty('orderId', orderId.toString());
        expect(response.body.data.job).toHaveProperty('studentId', studentId.toString());
        expect(response.body.data.job).toHaveProperty('moverId', moverId.toString());
        expect(response.body.data.job).toHaveProperty('jobType', JobType.STORAGE);
        expect(response.body.data.job).toHaveProperty('status', JobStatus.ACCEPTED);
        expect(mockJobModel.findById).toHaveBeenCalledWith(jobId);
    });

    // Mocked behavior: jobModel.findById returns a mock job with undefined moverId, JobMapper.toJobResponse uses actual implementation
    // Input: GET request with valid job ID and authentication token
    // Expected status code: 200
    // Expected behavior: job is retrieved and mapped, moverId ternary branch is covered
    // Expected output: data.job object with undefined moverId
    test('should get job by id with undefined moverId', async () => {
        const actualMapper = jest.requireActual('../../src/mappers/job.mapper') as typeof import('../../src/mappers/job.mapper');
        
        const jobId = new mongoose.Types.ObjectId();
        const orderId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();

        const mockJob = {
            _id: jobId,
            orderId: orderId,
            studentId: studentId,
            moverId: undefined, // Test the undefined moverId branch
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 5,
            price: 30,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date('2025-11-20T14:00:00Z'),
            createdAt: new Date('2025-11-15T10:00:00Z'),
            updatedAt: new Date('2025-11-16T11:00:00Z'),
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);

        const jobMapperModule = require('../../src/mappers/job.mapper');
        jobMapperModule.toJobResponse = actualMapper.toJobResponse;

        const response = await request(app)
            .get(`/api/jobs/${jobId.toString()}`)
            .set('Authorization', 'Bearer fake-token')
            .expect(200);

        expect(response.body.data.job).toHaveProperty('id', jobId.toString());
        expect(response.body.data.job.moverId).toBeUndefined();
    });

    // Mocked behavior: jobModel.findById returns a mock job with string timestamps, JobMapper.toJobResponse uses actual implementation
    // Input: GET request with valid job ID and authentication token
    // Expected status code: 200
    // Expected behavior: job is retrieved and mapped, date ternary branches are covered
    // Expected output: data.job object with string timestamps preserved
    test('should get job by id with string timestamps', async () => {
        const actualMapper = jest.requireActual('../../src/mappers/job.mapper') as typeof import('../../src/mappers/job.mapper');
        
        const jobId = new mongoose.Types.ObjectId();
        const orderId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();

        const mockJob = {
            _id: jobId,
            orderId: orderId,
            studentId: studentId,
            moverId: undefined,
            jobType: JobType.RETURN,
            status: JobStatus.AVAILABLE,
            volume: 8,
            price: 45,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: '2025-11-25T09:00:00Z', // String instead of Date
            createdAt: '2025-11-18T08:30:00Z',     // String instead of Date
            updatedAt: '2025-11-19T10:15:00Z',     // String instead of Date
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);

        const jobMapperModule = require('../../src/mappers/job.mapper');
        jobMapperModule.toJobResponse = actualMapper.toJobResponse;

        const response = await request(app)
            .get(`/api/jobs/${jobId.toString()}`)
            .set('Authorization', 'Bearer fake-token')
            .expect(200);

        expect(response.body.data.job).toHaveProperty('id', jobId.toString());
        expect(response.body.data.job).toHaveProperty('scheduledTime', '2025-11-25T09:00:00Z');
        expect(response.body.data.job).toHaveProperty('createdAt', '2025-11-18T08:30:00Z');
        expect(response.body.data.job).toHaveProperty('updatedAt', '2025-11-19T10:15:00Z');
    });
});

describe('PATCH /api/jobs/:id/status', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Mocked behavior: jobModel.findById throws an error
    // Input: PATCH request with valid job ID, status, and authentication token
    // Expected status code: 500
    // Expected behavior: the error was handled gracefully
    // Expected output: error response
    test('should handle database error in updateJobStatus (triggers controller catch block)', async () => {
        mockJobModel.findById.mockRejectedValue(new Error('Failed to update job status'));

        const jobId = new mongoose.Types.ObjectId().toString();
        const response = await request(app)
            .patch(`/api/jobs/${jobId}/status`)
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.ACCEPTED });

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });

    // Mocked behavior: jobModel.findById returns null
    // Input: PATCH request with valid job ID, status: ACCEPTED, and authentication token
    // Expected status code: 404
    // Expected behavior: JobNotFoundError is thrown and handled
    // Expected output: job not found error response
    test('should handle JobNotFoundError in updateJobStatus', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        mockJobModel.findById.mockResolvedValue(null as any);

        const response = await request(app)
            .patch(`/api/jobs/${jobId}/status`)
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.ACCEPTED });

        expect(response.status).toBe(404);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });

    // Mocked behavior: route parameter is empty (//status)
    // Input: PATCH request with empty job ID in URL, status: ACCEPTED, and authentication token
    // Expected status code: 400
    // Expected behavior: validation error, no database query executed
    // Expected output: validation error response
    test('should handle missing jobId ', async () => {
        const response = await request(app)
            .patch('/api/jobs//status')
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.ACCEPTED });

        expect(response.status).toBeGreaterThanOrEqual(400);
    });

    // Mocked behavior: jobModel.findById returns a mock job, request body is empty (no status field)
    // Input: PATCH request with valid job ID, empty request body, and authentication token
    // Expected status code: 400
    // Expected behavior: validation error, no job status updated
    // Expected output: validation error response
    test('should handle missing status ', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        mockJobModel.findById.mockResolvedValue({
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: new mongoose.Types.ObjectId(),
            studentId: new mongoose.Types.ObjectId(),
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        } as any);

        const response = await request(app)
            .patch(`/api/jobs/${jobId}/status`)
            .set('Authorization', `Bearer fake-token`)
            .send({}); // Missing status

        expect(response.status).toBeGreaterThanOrEqual(400);
    });

    // Mocked behavior: jobModel.findById returns a mock job, jobModel.update returns null
    // Input: PATCH request with valid job ID, status: PICKED_UP, and authentication token
    // Expected status code: 500
    // Expected behavior: job not found after update, error thrown
    // Expected output: error response
    test('should handle job not found ', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        mockJobModel.findById.mockResolvedValue(null as any);

        const response = await request(app)
            .patch(`/api/jobs/${jobId}/status`)
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.ACCEPTED });

        expect(response.status).toBe(404);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });

    // Mocked behavior: jobModel.findById returns a mock job, jobModel.tryAcceptJob returns null (job already accepted)
    // Input: PATCH request with valid job ID, status: ACCEPTED, moverId, and authentication token
    // Expected status code: 400
    // Expected behavior: job already accepted error, no job status updated
    // Expected output: error response indicating job already accepted
    test('should handle job already accepted', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const moverId = new mongoose.Types.ObjectId().toString();
        const orderId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.tryAcceptJob.mockResolvedValue(null as any); // Job already accepted

        const response = await request(app)
            .patch(`/api/jobs/${jobId}/status`)
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.ACCEPTED, moverId });

        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(mockJobModel.tryAcceptJob).toHaveBeenCalled();
    });

    // Mocked behavior: jobModel.findById returns a mock job with null orderId, jobModel.tryAcceptJob returns updated job with null orderId
    // Input: PATCH request with valid job ID, status: ACCEPTED, moverId, and authentication token
    // Expected status code: 500
    // Expected behavior: invalid orderId error thrown
    // Expected output: error response
    test('should handle invalid orderId in ACCEPTED flow ', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const moverId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: null, // Invalid orderId
            studentId: studentId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        };

        const mockUpdatedJob = {
            ...mockJob,
            orderId: null, // Invalid orderId
            moverId: new mongoose.Types.ObjectId(moverId),
            status: JobStatus.ACCEPTED,
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.tryAcceptJob.mockResolvedValue(mockUpdatedJob as any);

        const response = await request(app)
            .patch(`/api/jobs/${jobId}/status`)
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.ACCEPTED, moverId });

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.tryAcceptJob).toHaveBeenCalled();
    });

    // Mocked behavior: jobModel.findById returns a mock job, jobModel.tryAcceptJob returns updated job, orderService.updateOrderStatus throws an error
    // Input: PATCH request with valid job ID, status: ACCEPTED, moverId, and authentication token
    // Expected status code: 500
    // Expected behavior: orderService error is thrown and handled
    // Expected output: error response
    test('should handle orderService error in ACCEPTED flow ', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const moverId = new mongoose.Types.ObjectId().toString();
        const orderId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        };

        const mockUpdatedJob = {
            ...mockJob,
            moverId: new mongoose.Types.ObjectId(moverId),
            status: JobStatus.ACCEPTED,
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.tryAcceptJob.mockResolvedValue(mockUpdatedJob as any);
        mockOrderService.updateOrderStatus.mockRejectedValue(new Error('Order service error') as any);

        const response = await request(app)
            .patch(`/api/jobs/${jobId}/status`)
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.ACCEPTED, moverId });

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockOrderService.updateOrderStatus).toHaveBeenCalled();
    });

    // Mocked behavior: jobModel.findById returns a mock job, jobModel.tryAcceptJob returns updated job, orderService.updateOrderStatus succeeds, EventEmitter.emitJobUpdated throws an error
    // Input: PATCH request with valid job ID, status: ACCEPTED, moverId, and authentication token
    // Expected status code: 200
    // Expected behavior: EventEmitter error is caught and logged, request still succeeds
    // Expected output: success response with updated job status
    test('should handle EventEmitter error in ACCEPTED flow ', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const moverId = new mongoose.Types.ObjectId().toString();
        const orderId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        };

        const mockUpdatedJob = {
            ...mockJob,
            moverId: new mongoose.Types.ObjectId(moverId),
            status: JobStatus.ACCEPTED,
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.tryAcceptJob.mockResolvedValue(mockUpdatedJob as any);
        mockOrderService.updateOrderStatus.mockResolvedValue(undefined as any);
        mockNotificationService.sendJobStatusNotification.mockResolvedValue(undefined as any);
        mockEventEmitter.emitJobUpdated.mockImplementation(() => {
            throw new Error('EventEmitter error');
        });

        // Should not throw, just log warning - request should succeed
        const response = await request(app)
            .patch(`/api/jobs/${jobId}/status`)
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.ACCEPTED, moverId });

        expect(response.status).toBe(200);
        expect(mockEventEmitter.emitJobUpdated).toHaveBeenCalled();
    });

    // Mocked behavior: jobModel.findById returns a mock RETURN job twice, jobModel.update returns updated job, orderService.updateOrderStatus succeeds
    // Input: PATCH request with valid job ID, status: PICKED_UP, moverId, and authentication token
    // Expected status code: 200
    // Expected behavior: job status updated to PICKED_UP, order status updated
    // Expected output: success response with status: PICKED_UP
    test('should handle RETURN job PICKED_UP flow ', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const moverId = new mongoose.Types.ObjectId().toString();
        const orderId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            moverId: new mongoose.Types.ObjectId(moverId),
            jobType: JobType.RETURN,
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        };

        const mockUpdatedJob = {
            ...mockJob,
            status: JobStatus.PICKED_UP,
        };

        mockJobModel.findById
            .mockResolvedValueOnce(mockJob as any) // First call for initial check
            .mockResolvedValueOnce(mockJob as any); // Second call in PICKED_UP flow
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);
        mockOrderService.updateOrderStatus.mockResolvedValue(undefined as any);
        mockNotificationService.sendJobStatusNotification.mockResolvedValue(undefined as any);

        const response = await request(app)
            .patch(`/api/jobs/${jobId}/status`)
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.PICKED_UP, moverId });

        expect(response.status).toBe(200);
        expect(response.body.status).toBe(JobStatus.PICKED_UP);
        expect(mockOrderService.updateOrderStatus).toHaveBeenCalled();
    });

    // Mocked behavior: jobModel.findById returns a mock job, jobModel.update returns null
    // Input: PATCH request with valid job ID, status: PICKED_UP, and authentication token
    // Expected status code: 500
    // Expected behavior: job not found after update in else branch, error thrown
    // Expected output: error response
    test('should handle job not found in else branch ', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const orderId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            jobType: JobType.STORAGE,
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.update.mockResolvedValue(null as any); // Job not found after update

        const response = await request(app)
            .patch(`/api/jobs/${jobId}/status`)
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.PICKED_UP });

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.update).toHaveBeenCalled();
    });

    // Mocked behavior: jobModel.findById returns a mock job, jobModel.update returns updated job, EventEmitter.emitJobUpdated throws an error
    // Input: PATCH request with valid job ID, status: PICKED_UP, and authentication token
    // Expected status code: 200
    // Expected behavior: EventEmitter error is caught and logged, request still succeeds
    // Expected output: success response with updated job status
    test('should handle EventEmitter error in else branch ', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const orderId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            jobType: JobType.STORAGE,
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        };

        const mockUpdatedJob = {
            ...mockJob,
            status: JobStatus.PICKED_UP,
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);
        mockEventEmitter.emitJobUpdated.mockImplementation(() => {
            throw new Error('EventEmitter error');
        });

        // Should not throw, just log warning - request should succeed
        const response = await request(app)
            .patch(`/api/jobs/${jobId}/status`)
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.PICKED_UP });

        expect(response.status).toBe(200);
        expect(mockEventEmitter.emitJobUpdated).toHaveBeenCalled();
    });

    // Mocked behavior: jobModel.findById returns a mock job initially, jobModel.update returns updated job, jobModel.findById returns null on second call (in COMPLETED flow)
    // Input: PATCH request with valid job ID, status: COMPLETED, and authentication token
    // Expected status code: 404
    // Expected behavior: job not found in COMPLETED flow check, error thrown
    // Expected output: job not found error response
    test('should handle job not found in COMPLETED flow ', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const orderId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            jobType: JobType.STORAGE,
            status: JobStatus.PICKED_UP,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        };

        const mockUpdatedJob = {
            ...mockJob,
            status: JobStatus.COMPLETED,
            moverId: new mongoose.Types.ObjectId(),
        };

        // Make job null when checking in COMPLETED flow
        mockJobModel.findById.mockResolvedValueOnce(mockJob as any); // Initial check
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);
        // Simulate job being deleted between update and COMPLETED check
        mockJobModel.findById.mockResolvedValueOnce(null as any); // COMPLETED flow check

        const response = await request(app)
            .patch(`/api/jobs/${jobId}/status`)
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.COMPLETED });

        expect(response.status).toBe(404);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });

    // Mocked behavior: jobModel.findById returns a mock job with null orderId, jobModel.update returns updated job with null orderId
    // Input: PATCH request with valid job ID, status: COMPLETED, and authentication token
    // Expected status code: 500
    // Expected behavior: invalid orderId error thrown
    // Expected output: error response
    test('should handle invalid orderId in COMPLETED flow', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: null, // Invalid orderId
            studentId: studentId,
            jobType: JobType.STORAGE,
            status: JobStatus.PICKED_UP,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        };

        const mockUpdatedJob = {
            ...mockJob,
            status: JobStatus.COMPLETED,
            moverId: new mongoose.Types.ObjectId(),
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);

        const response = await request(app)
            .patch(`/api/jobs/${jobId}/status`)
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.COMPLETED });

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.update).toHaveBeenCalled();
    });

    // Mocked behavior: jobModel.findById returns a mock job, jobModel.update returns updated job, userModel.findByIdAndUpdate succeeds, orderService.updateOrderStatus throws an error
    // Input: PATCH request with valid job ID, status: COMPLETED, and authentication token
    // Expected status code: 500
    // Expected behavior: orderService error is thrown and handled
    // Expected output: error response
    test('should handle orderService error in COMPLETED flow ', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const orderId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            jobType: JobType.STORAGE,
            status: JobStatus.PICKED_UP,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        };

        const mockUpdatedJob = {
            ...mockJob,
            status: JobStatus.COMPLETED,
            moverId: new mongoose.Types.ObjectId(),
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);
        mockUserModel.findByIdAndUpdate.mockResolvedValue({} as any); // addCreditsToMover
        mockOrderService.updateOrderStatus.mockRejectedValue(new Error('Order service error') as any);

        const response = await request(app)
            .patch(`/api/jobs/${jobId}/status`)
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.COMPLETED });

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockOrderService.updateOrderStatus).toHaveBeenCalled();
    });

    // Mocked behavior: jobModel.findById returns a mock job, jobModel.tryAcceptJob returns updated job, orderService is unmocked and uses real implementation, orderModel.update returns null
    // Input: PATCH request with valid job ID, status: ACCEPTED, moverId, and authentication token
    // Expected status code: 500
    // Expected behavior: orderModel.update returns null, updateOrderStatus throws "Order not found" error
    // Expected output: error response
    test('should orderModel.update returns null in updateOrderStatus', async () => {
        
        const jobId = new mongoose.Types.ObjectId().toString();
        const moverId = new mongoose.Types.ObjectId().toString();
        const orderId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        };

        const mockUpdatedJob = {
            ...mockJob,
            moverId: new mongoose.Types.ObjectId(moverId),
            status: JobStatus.ACCEPTED,
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.tryAcceptJob.mockResolvedValue(mockUpdatedJob as any);
        
        // Temporarily restore the real orderService and mock orderModel instead
        jest.unmock('../../src/services/order.service');
        const { orderService: realOrderService } = require('../../src/services/order.service');
        const { orderModel } = require('../../src/models/order.model');
        const originalUpdate = orderModel.update;
        
        // Mock orderModel.update to return null, triggering line 423
        orderModel.update = jest.fn(async () => null as any);
        
        // Temporarily replace mockOrderService with real one
        const originalMockUpdate = mockOrderService.updateOrderStatus;
        mockOrderService.updateOrderStatus = realOrderService.updateOrderStatus.bind(realOrderService);

        try {
            const response = await request(app)
                .patch(`/api/jobs/${jobId}/status`)
                .set('Authorization', `Bearer fake-token`)
                .send({ status: JobStatus.ACCEPTED, moverId });

            // Should return 500 because updateOrderStatus throws "Order not found"
            expect(response.status).toBe(500);
            expect(orderModel.update).toHaveBeenCalled();
        } finally {
            // Restore mocks
            orderModel.update = originalUpdate;
            mockOrderService.updateOrderStatus = originalMockUpdate;
        }
    });

    // Mocked behavior: jobModel.findById returns a mock job, jobModel.tryAcceptJob returns updated job, orderService is unmocked and uses real implementation, orderModel.update throws an error
    // Input: PATCH request with valid job ID, status: ACCEPTED, moverId, and authentication token
    // Expected status code: 500
    // Expected behavior: orderModel.update throws error, catch block in updateOrderStatus is executed
    // Expected output: error response
    test('should hit catch block in updateOrderStatus when orderModel.update throws', async () => {
        // Test to cover the catch block in updateOrderStatus (lines 436-441)
        const jobId = new mongoose.Types.ObjectId().toString();
        const moverId = new mongoose.Types.ObjectId().toString();
        const orderId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        };

        const mockUpdatedJob = {
            ...mockJob,
            moverId: new mongoose.Types.ObjectId(moverId),
            status: JobStatus.ACCEPTED,
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.tryAcceptJob.mockResolvedValue(mockUpdatedJob as any);
        
        // Temporarily restore the real orderService and mock orderModel instead
        jest.unmock('../../src/services/order.service');
        const { orderService: realOrderService } = require('../../src/services/order.service');
        const { orderModel } = require('../../src/models/order.model');
        const originalUpdate = orderModel.update;
        
        // Mock orderModel.update to throw error, triggering catch block
        orderModel.update = jest.fn(async () => {
            throw new Error('Database update failed');
        }) as any;
        
        // Temporarily replace mockOrderService with real one
        const originalMockUpdate = mockOrderService.updateOrderStatus;
        mockOrderService.updateOrderStatus = realOrderService.updateOrderStatus.bind(realOrderService);

        try {
            const response = await request(app)
                .patch(`/api/jobs/${jobId}/status`)
                .set('Authorization', `Bearer fake-token`)
                .send({ status: JobStatus.ACCEPTED, moverId });

            // Should return 500 because updateOrderStatus catches and rethrows error
            expect(response.status).toBe(500);
            expect(orderModel.update).toHaveBeenCalled();
        } finally {
            // Restore mocks
            orderModel.update = originalUpdate;
            mockOrderService.updateOrderStatus = originalMockUpdate;
        }
    });

});

describe('POST /api/jobs/:id/arrived', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Mocked behavior: jobModel.findById throws an error
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 500
    // Expected behavior: the error was handled gracefully
    // Expected output: error response
    test('should handle database error in requestPickupConfirmation (triggers controller catch block)', async () => {
        mockJobModel.findById.mockRejectedValue(new Error('Database error during pickup confirmation'));

        const jobId = new mongoose.Types.ObjectId().toString();
        const response = await request(app)
            .post(`/api/jobs/${jobId}/arrived`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });

    // Mocked behavior: jobModel.findById returns null
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 404
    // Expected behavior: JobNotFoundError is thrown and handled
    // Expected output: job not found error response
    test('should handle JobNotFoundError in requestPickupConfirmation', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        mockJobModel.findById.mockResolvedValue(null as any);

        const response = await request(app)
            .post(`/api/jobs/${jobId}/arrived`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBe(404);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });
});

describe('POST /api/jobs/:id/confirm-pickup', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Mocked behavior: jobModel.findById throws an error
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 500
    // Expected behavior: the error was handled gracefully
    // Expected output: error response
    test('should handle database error in confirmPickup (triggers controller catch block)', async () => {
        mockJobModel.findById.mockRejectedValue(new Error('Database error during pickup confirmation'));

        const jobId = new mongoose.Types.ObjectId().toString();
        const response = await request(app)
            .post(`/api/jobs/${jobId}/confirm-pickup`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });

    // Mocked behavior: jobModel.findById returns null
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 404
    // Expected behavior: JobNotFoundError is thrown and handled
    // Expected output: job not found error response
    test('should handle JobNotFoundError in confirmPickup', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        mockJobModel.findById.mockResolvedValue(null as any);

        const response = await request(app)
            .post(`/api/jobs/${jobId}/confirm-pickup`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBe(404);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });
});

describe('POST /api/jobs/:id/delivered', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Mocked behavior: jobModel.findById throws an error
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 500
    // Expected behavior: the error was handled gracefully
    // Expected output: error response
    test('should handle database error in requestDeliveryConfirmation (triggers controller catch block)', async () => {
        mockJobModel.findById.mockRejectedValue(new Error('Database error during delivery confirmation'));

        const jobId = new mongoose.Types.ObjectId().toString();
        const response = await request(app)
            .post(`/api/jobs/${jobId}/delivered`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });

    // Mocked behavior: jobModel.findById returns null
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 404
    // Expected behavior: JobNotFoundError is thrown and handled
    // Expected output: job not found error response
    test('should handle JobNotFoundError in requestDeliveryConfirmation', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        mockJobModel.findById.mockResolvedValue(null as any);

        const response = await request(app)
            .post(`/api/jobs/${jobId}/delivered`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBe(404);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });

    // Mocked behavior: jobModel.findById returns a mock RETURN job, testUserId is set to wrongMoverId (different from job's moverId)
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 400
    // Expected behavior: moverId validation fails, no job status updated
    // Expected output: error response indicating only assigned mover can request confirmation
    test('should cover requestDeliveryConfirmation with wrong moverId (line 697)', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const correctMoverId = new mongoose.Types.ObjectId();
        const wrongMoverId = new mongoose.Types.ObjectId(); // Different mover
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: new mongoose.Types.ObjectId(),
            studentId: new mongoose.Types.ObjectId(),
            moverId: correctMoverId, // Job assigned to correctMoverId
            jobType: JobType.RETURN,
            status: JobStatus.PICKED_UP,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);

        // Set testUserId to wrongMoverId (not matching the job's moverId)
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = wrongMoverId; // Different from correctMoverId
        testUserRole = 'MOVER';

        try {
            // Should return 400 or 500 because moverId doesn't match (line 697)
        const response = await request(app)
            .post(`/api/jobs/${jobId}/delivered`)
                .set('Authorization', `Bearer fake-token`)
                .expect(400);

            expect(response.status).toBe(400);
            expect(mockJobModel.findById).toHaveBeenCalled();
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });
});

describe('POST /api/jobs/:id/confirm-delivery', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Mocked behavior: jobModel.findById throws an error
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 500
    // Expected behavior: the error was handled gracefully
    // Expected output: error response
    test('should handle database error in confirmDelivery (triggers controller catch block)', async () => {
        mockJobModel.findById.mockRejectedValue(new Error('Database error during delivery confirmation'));

        const jobId = new mongoose.Types.ObjectId().toString();
        const response = await request(app)
            .post(`/api/jobs/${jobId}/confirm-delivery`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });

    // Mocked behavior: jobModel.findById returns null
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 404
    // Expected behavior: JobNotFoundError is thrown and handled
    // Expected output: job not found error response
    test('should handle JobNotFoundError in confirmDelivery', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        mockJobModel.findById.mockResolvedValue(null as any);

        const response = await request(app)
            .post(`/api/jobs/${jobId}/confirm-delivery`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBe(404);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });

    // Mocked behavior: jobModel.findById returns a mock RETURN job, jobModel.update returns updated job, userModel methods succeed, orderService.updateOrderStatus succeeds, notificationService and EventEmitter succeed, testUserId matches job's studentId
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 200
    // Expected behavior: job status updated to COMPLETED, mover credits updated, order status updated, notifications sent, events emitted
    // Expected output: success: true, data.status: COMPLETED
    test('should successfully confirm delivery with notification and event emission ', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId();
        const moverId = new mongoose.Types.ObjectId();
        const orderId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            moverId: moverId,
            jobType: JobType.RETURN,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const mockUpdatedJob = {
            ...mockJob,
            status: JobStatus.COMPLETED,
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);
        mockUserModel.findById.mockResolvedValue({
            _id: moverId,
            userRole: 'MOVER',
            credits: 100,
        } as any);
        mockUserModel.update.mockResolvedValue({} as any);
        mockOrderService.updateOrderStatus.mockResolvedValue(undefined as any);
        mockNotificationService.sendJobStatusNotification.mockResolvedValue(undefined as any);
        mockEventEmitter.emitJobUpdated.mockReturnValue(undefined);

        // Set testUserId to match the job's studentId
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = studentId;
        testUserRole = 'STUDENT';

        try {
        const response = await request(app)
            .post(`/api/jobs/${jobId}/confirm-delivery`)
                .set('Authorization', `Bearer fake-token`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.status).toBe(JobStatus.COMPLETED);
            expect(mockOrderService.updateOrderStatus).toHaveBeenCalledWith(
                orderId,
                expect.any(String),
                expect.any(String)
            );
            expect(mockUserModel.findById).toHaveBeenCalledWith(moverId);
        expect(mockEventEmitter.emitJobUpdated).toHaveBeenCalled();
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });



    test('should cover confirmDelivery with null updatedJob immediately after update (line 777)', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId();
        const moverId = new mongoose.Types.ObjectId();
        const orderId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            moverId: moverId,
            jobType: JobType.RETURN,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        // Make update return null to trigger line 777 immediately after update
        mockJobModel.update.mockResolvedValue(null as any);

        // Set testUserId to match the job's studentId
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = studentId;
        testUserRole = 'STUDENT';

        try {
            // Should return 500 because updatedJob is null (line 777)
            const response = await request(app)
                .post(`/api/jobs/${jobId}/confirm-delivery`)
                .set('Authorization', `Bearer fake-token`)
                .expect(500);

            expect(response.status).toBe(500);
            expect(mockJobModel.update).toHaveBeenCalled();
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });

    // Mocked behavior: jobModel.findById returns a mock RETURN job with null orderId, jobModel.update returns updated job with null orderId, testUserId matches job's studentId
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 500
    // Expected behavior: invalid orderId error thrown
    // Expected output: error response
    test('should cover confirmDelivery with invalid orderId (line 779)', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId();
        const moverId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: null, // Invalid orderId
            studentId: studentId,
            moverId: moverId,
            jobType: JobType.RETURN,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const mockUpdatedJob = {
            ...mockJob,
            status: JobStatus.COMPLETED,
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);
        mockUserModel.findById.mockResolvedValue({
            _id: moverId,
            userRole: 'MOVER',
            credits: 100,
        } as any);
        mockUserModel.update.mockResolvedValue({} as any);

        // Set testUserId to match the job's studentId
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = studentId;
        testUserRole = 'STUDENT';

        try {
            // Should return 500 because orderId is invalid (line 779)
            const response = await request(app)
                .post(`/api/jobs/${jobId}/confirm-delivery`)
                .set('Authorization', `Bearer fake-token`)
                .expect(500);

            expect(response.status).toBe(500);
            expect(mockJobModel.update).toHaveBeenCalled();
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });

    // Mocked behavior: jobModel.findById returns a mock RETURN job, jobModel.update returns updated job, userModel methods succeed, orderService.updateOrderStatus throws an error, testUserId matches job's studentId
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 500
    // Expected behavior: updateOrderStatus error caught in catch block (lines 791-795)
    // Expected output: error response
    test('should cover confirmDelivery catch block when updateOrderStatus fails (lines 791-795)', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId();
        const moverId = new mongoose.Types.ObjectId();
        const orderId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            moverId: moverId,
            jobType: JobType.RETURN,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const mockUpdatedJob = {
            ...mockJob,
            status: JobStatus.COMPLETED,
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);
        mockUserModel.findById.mockResolvedValue({
            _id: moverId,
            userRole: 'MOVER',
            credits: 100,
        } as any);
        mockUserModel.update.mockResolvedValue({} as any);
        // Make updateOrderStatus throw an error to trigger catch block (lines 791-795)
        mockOrderService.updateOrderStatus.mockRejectedValue(new Error('Order service failed'));

        // Set testUserId to match the job's studentId
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = studentId;
        testUserRole = 'STUDENT';

        try {
            // Should return 500 because updateOrderStatus throws (lines 791-795)
            const response = await request(app)
                .post(`/api/jobs/${jobId}/confirm-delivery`)
                .set('Authorization', `Bearer fake-token`)
                .expect(500);

            expect(response.status).toBe(500);
        expect(mockOrderService.updateOrderStatus).toHaveBeenCalled();
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });

    // Mocked behavior: jobModel.findById returns a mock RETURN job, jobModel.update returns updated job, userModel methods succeed, orderService.updateOrderStatus succeeds, EventEmitter.emitJobUpdated throws an error, testUserId matches job's studentId
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 200
    // Expected behavior: EventEmitter error is caught and logged, request still succeeds
    // Expected output: success: true, data.status: COMPLETED
    test('should handle EventEmitter error gracefully during confirmDelivery ', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId();
        const moverId = new mongoose.Types.ObjectId();
        const orderId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            moverId: moverId,
            jobType: JobType.RETURN,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const mockUpdatedJob = {
            ...mockJob,
            status: JobStatus.COMPLETED,
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);
        mockUserModel.findById.mockResolvedValue({
            _id: moverId,
            userRole: 'MOVER',
            credits: 100,
        } as any);
        mockUserModel.update.mockResolvedValue({} as any);
        mockOrderService.updateOrderStatus.mockResolvedValue(undefined as any);
        mockEventEmitter.emitJobUpdated.mockImplementation(() => {
            throw new Error('Event emitter failed');
        });

        // Set testUserId to match the job's studentId
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = studentId;
        testUserRole = 'STUDENT';

        try {
        // Should still succeed despite emitter error
            const response = await request(app)
                .post(`/api/jobs/${jobId}/confirm-delivery`)
                .set('Authorization', `Bearer fake-token`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.status).toBe(JobStatus.COMPLETED);
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });

    // Mocked behavior: jobModel.findById returns a mock RETURN job, jobModel.update returns updated job, userModel methods succeed, orderService.updateOrderStatus succeeds, EventEmitter succeeds, testUserId matches job's studentId
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 200
    // Expected behavior: job status updated to COMPLETED, all operations succeed
    // Expected output: success: true, data with id and status: COMPLETED
    test('should return completed job details successfully ', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId();
        const moverId = new mongoose.Types.ObjectId();
        const orderId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            moverId: moverId,
            jobType: JobType.RETURN,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const mockUpdatedJob = {
            ...mockJob,
            status: JobStatus.COMPLETED,
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);
        mockUserModel.findById.mockResolvedValue({
            _id: moverId,
            userRole: 'MOVER',
            credits: 100,
        } as any);
        mockUserModel.update.mockResolvedValue({} as any);
        mockOrderService.updateOrderStatus.mockResolvedValue(undefined as any);
        mockEventEmitter.emitJobUpdated.mockReturnValue(undefined);

        // Set testUserId to match the job's studentId
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = studentId;
        testUserRole = 'STUDENT';

        try {
            const response = await request(app)
                .post(`/api/jobs/${jobId}/confirm-delivery`)
                .set('Authorization', `Bearer fake-token`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveProperty('id');
            expect(response.body.data).toHaveProperty('status');
            expect(response.body.data.status).toBe(JobStatus.COMPLETED);
            expect(response.body.data.id).toBe(mockUpdatedJob._id.toString());
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });
});

describe('POST /api/jobs/:id/delivered - requestDeliveryConfirmation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Mocked behavior: jobModel.findById returns a mock RETURN job, jobModel.update returns updated job, notificationService and EventEmitter succeed, testUserId matches job's moverId
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 200
    // Expected behavior: job status updated to AWAITING_STUDENT_CONFIRMATION, notification sent, event emitted
    // Expected output: success: true, data.status: AWAITING_STUDENT_CONFIRMATION
    test('should successfully request delivery confirmation with notification', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const moverId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: new mongoose.Types.ObjectId(),
            studentId: new mongoose.Types.ObjectId(),
            moverId: moverId,
            jobType: JobType.RETURN,
            status: JobStatus.PICKED_UP,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const mockUpdatedJob = {
            ...mockJob,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            verificationRequestedAt: new Date(),
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);
        mockNotificationService.sendJobStatusNotification.mockResolvedValue(undefined as any);
        mockEventEmitter.emitJobUpdated.mockReturnValue(undefined);

        // Set testUserId to match the job's moverId
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = moverId;
        testUserRole = 'MOVER';

        try {
            const response = await request(app)
                .post(`/api/jobs/${jobId}/delivered`)
                .set('Authorization', `Bearer fake-token`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.status).toBe(JobStatus.AWAITING_STUDENT_CONFIRMATION);
        expect(mockNotificationService.sendJobStatusNotification).toHaveBeenCalledWith(
            expect.any(mongoose.Types.ObjectId),
            JobStatus.AWAITING_STUDENT_CONFIRMATION
        );
        expect(mockEventEmitter.emitJobUpdated).toHaveBeenCalled();
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });

    // Mocked behavior: jobModel.findById returns a mock RETURN job, jobModel.update returns updated job, notificationService succeeds, EventEmitter.emitJobUpdated throws an error, testUserId matches job's moverId
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 200
    // Expected behavior: EventEmitter error is caught and logged, request still succeeds
    // Expected output: success: true, data.status: AWAITING_STUDENT_CONFIRMATION
    test('should handle EventEmitter error gracefully in requestDeliveryConfirmation', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const moverId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: new mongoose.Types.ObjectId(),
            studentId: new mongoose.Types.ObjectId(),
            moverId: moverId,
            jobType: JobType.RETURN,
            status: JobStatus.PICKED_UP,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const mockUpdatedJob = {
            ...mockJob,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            verificationRequestedAt: new Date(),
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);
        mockNotificationService.sendJobStatusNotification.mockResolvedValue(undefined as any);
        mockEventEmitter.emitJobUpdated.mockImplementation(() => {
            throw new Error('Event emitter error');
        });

        // Set testUserId to match the job's moverId
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = moverId;
        testUserRole = 'MOVER';

        try {
        // Should still succeed despite emitter error
            const response = await request(app)
                .post(`/api/jobs/${jobId}/delivered`)
                .set('Authorization', `Bearer fake-token`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.status).toBe(JobStatus.AWAITING_STUDENT_CONFIRMATION);
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });

    // Mocked behavior: route parameter is empty (//delivered), testUserId is set to moverId
    // Input: POST request with empty job ID in URL and authentication token
    // Expected status code: 400, 404, or 500
    // Expected behavior: route validation error, no database query executed
    // Expected output: error response
    test('should handle missing jobId in requestDeliveryConfirmation', async () => {
        // Test via API endpoint - empty jobId will result in 404 or 400
        const moverId = new mongoose.Types.ObjectId();

        // Set testUserId to match moverId
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = moverId;
        testUserRole = 'MOVER';

        try {
            // Empty jobId in URL will likely result in 404 (route won't match) or 400
            const response = await request(app)
                .post('/api/jobs//delivered')
                .set('Authorization', `Bearer fake-token`);

            // Should return an error status
            expect([400, 404, 500]).toContain(response.status);
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });

    // Mocked behavior: jobModel.findById returns a mock STORAGE job (not RETURN), testUserId matches job's moverId
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 400
    // Expected behavior: job type validation fails, no job status updated
    // Expected output: error response indicating endpoint only valid for RETURN jobs
    test('should handle non-RETURN job type in requestDeliveryConfirmation', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const moverId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: new mongoose.Types.ObjectId(),
            studentId: new mongoose.Types.ObjectId(),
            moverId: moverId,
            jobType: JobType.STORAGE, // Not RETURN
            status: JobStatus.PICKED_UP,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);

        // Set testUserId to match the job's moverId
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = moverId;
        testUserRole = 'MOVER';

        try {
            const response = await request(app)
                .post(`/api/jobs/${jobId}/delivered`)
                .set('Authorization', `Bearer fake-token`)
                .expect(400);

            expect(response.status).toBe(400);
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });

    // Mocked behavior: jobModel.findById returns a mock RETURN job with status ACCEPTED (not PICKED_UP), testUserId matches job's moverId
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 400
    // Expected behavior: job status validation fails, no job status updated
    // Expected output: error response indicating job must be PICKED_UP
    test('should handle wrong job status in requestDeliveryConfirmation', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const moverId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: new mongoose.Types.ObjectId(),
            studentId: new mongoose.Types.ObjectId(),
            moverId: moverId,
            jobType: JobType.RETURN,
            status: JobStatus.ACCEPTED, // Not PICKED_UP
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);

        // Set testUserId to match the job's moverId
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = moverId;
        testUserRole = 'MOVER';

        try {
            const response = await request(app)
                .post(`/api/jobs/${jobId}/delivered`)
                .set('Authorization', `Bearer fake-token`)
                .expect(400);

            expect(response.status).toBe(400);
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });
});

describe('POST /api/jobs/:id/confirm-delivery - Additional error cases', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Mocked behavior: route parameter is empty (//confirm-delivery), testUserId is set to studentId
    // Input: POST request with empty job ID in URL and authentication token
    // Expected status code: 400, 404, or 500
    // Expected behavior: route validation error, no database query executed
    // Expected output: error response
    test('should handle missing parameters in confirmDelivery', async () => {
        // Test via API endpoint - empty jobId will result in 404 or 400
        const studentId = new mongoose.Types.ObjectId();

        // Set testUserId to match studentId
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = studentId;
        testUserRole = 'STUDENT';

        try {
            // Empty jobId in URL will likely result in 404 (route won't match) or 400
            const response = await request(app)
                .post('/api/jobs//confirm-delivery')
                .set('Authorization', `Bearer fake-token`);

            // Should return an error status
            expect([400, 404, 500]).toContain(response.status);
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });

    // Mocked behavior: jobModel.findById returns a mock STORAGE job (not RETURN), testUserId matches job's studentId
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 400
    // Expected behavior: job type validation fails, no job status updated
    // Expected output: error response indicating endpoint only valid for RETURN jobs
    test('should handle non-RETURN job type in confirmDelivery', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: new mongoose.Types.ObjectId(),
            studentId: studentId,
            moverId: new mongoose.Types.ObjectId(),
            jobType: JobType.STORAGE, // Not RETURN
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);

        // Set testUserId to match the job's studentId
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = studentId;
        testUserRole = 'STUDENT';

        try {
            const response = await request(app)
                .post(`/api/jobs/${jobId}/confirm-delivery`)
                .set('Authorization', `Bearer fake-token`)
                .expect(400);

            expect(response.status).toBe(400);
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });

    // Mocked behavior: jobModel.findById returns a mock RETURN job with status PICKED_UP (not AWAITING_STUDENT_CONFIRMATION), testUserId matches job's studentId
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 400
    // Expected behavior: job status validation fails, no job status updated
    // Expected output: error response indicating job must be AWAITING_STUDENT_CONFIRMATION
    test('should handle wrong job status in confirmDelivery', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: new mongoose.Types.ObjectId(),
            studentId: studentId,
            moverId: new mongoose.Types.ObjectId(),
            jobType: JobType.RETURN,
            status: JobStatus.PICKED_UP, // Not AWAITING_STUDENT_CONFIRMATION
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);

        // Set testUserId to match the job's studentId
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = studentId;
        testUserRole = 'STUDENT';

        try {
            const response = await request(app)
                .post(`/api/jobs/${jobId}/confirm-delivery`)
                .set('Authorization', `Bearer fake-token`)
                .expect(400);

            expect(response.status).toBe(400);
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });
});

describe('POST /api/jobs/:id/arrived - requestPickupConfirmation error cases', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Mocked behavior: route parameter is empty (//arrived), testUserId is set to moverId
    // Input: POST request with empty job ID in URL and authentication token
    // Expected status code: 400, 404, or 500
    // Expected behavior: route validation error, no database query executed
    // Expected output: error response
    test('should handle missing parameters in requestPickupConfirmation', async () => {
        // Test via API endpoint - empty jobId will result in 404 or 400
        const moverId = new mongoose.Types.ObjectId();

        // Set testUserId to match moverId
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = moverId;
        testUserRole = 'MOVER';

        try {
            // Empty jobId in URL will likely result in 404 (route won't match) or 400
            const response = await request(app)
                .post('/api/jobs//arrived')
                .set('Authorization', `Bearer fake-token`);

            // Should return an error status
            expect([400, 404, 500]).toContain(response.status);
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });

    // Mocked behavior: jobModel.findById returns a mock RETURN job (not STORAGE), testUserId matches job's moverId
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 400
    // Expected behavior: job type validation fails, no job status updated
    // Expected output: error response indicating endpoint only valid for STORAGE jobs
    test('should handle non-STORAGE job type in requestPickupConfirmation', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const moverId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: new mongoose.Types.ObjectId(),
            studentId: new mongoose.Types.ObjectId(),
            moverId: moverId,
            jobType: JobType.RETURN, // Not STORAGE
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);

        // Set testUserId to match the job's moverId
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = moverId;
        testUserRole = 'MOVER';

        try {
            const response = await request(app)
                .post(`/api/jobs/${jobId}/arrived`)
                .set('Authorization', `Bearer fake-token`)
                .expect(400);

            expect(response.status).toBe(400);
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });

    // Mocked behavior: jobModel.findById returns a mock STORAGE job, testUserId is set to different moverId (not matching job's moverId)
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 403
    // Expected behavior: mover authorization fails, no job status updated
    // Expected output: authorization error response
    test('should handle wrong mover in requestPickupConfirmation', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const moverId = new mongoose.Types.ObjectId();
        const wrongMoverId = new mongoose.Types.ObjectId(); // Different mover
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: new mongoose.Types.ObjectId(),
            studentId: new mongoose.Types.ObjectId(),
            moverId: wrongMoverId,
            jobType: JobType.STORAGE,
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);

        // Set testUserId to a different moverId (not matching the job's moverId)
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = moverId; // Different from wrongMoverId
        testUserRole = 'MOVER';

        try {
            const response = await request(app)
                .post(`/api/jobs/${jobId}/arrived`)
                .set('Authorization', `Bearer fake-token`)
                .expect(403);

            expect(response.status).toBe(403);
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });

    // Mocked behavior: jobModel.findById returns a mock STORAGE job with status AVAILABLE (not ACCEPTED), testUserId matches job's moverId
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 400
    // Expected behavior: job status validation fails, no job status updated
    // Expected output: error response indicating job must be ACCEPTED
    test('should handle wrong job status in requestPickupConfirmation', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const moverId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: new mongoose.Types.ObjectId(),
            studentId: new mongoose.Types.ObjectId(),
            moverId: moverId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE, // Not ACCEPTED
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);

        // Set testUserId to match the job's moverId
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = moverId;
        testUserRole = 'MOVER';

        try {
            const response = await request(app)
                .post(`/api/jobs/${jobId}/arrived`)
                .set('Authorization', `Bearer fake-token`)
                .expect(400);

            expect(response.status).toBe(400);
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });
});

describe('POST /api/jobs/:id/confirm-pickup - confirmPickup error cases', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Mocked behavior: route parameter is empty (//confirm-pickup), testUserId is set to studentId
    // Input: POST request with empty job ID in URL and authentication token
    // Expected status code: 400, 404, or 500
    // Expected behavior: route validation error, no database query executed
    // Expected output: error response
    test('should handle missing parameters in confirmPickup', async () => {
        // Test via API endpoint - empty jobId will result in 404 or 400
        const studentId = new mongoose.Types.ObjectId();

        // Set testUserId to match studentId
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = studentId;
        testUserRole = 'STUDENT';

        try {
            // Empty jobId in URL will likely result in 404 (route won't match) or 400
            const response = await request(app)
                .post('/api/jobs//confirm-pickup')
                .set('Authorization', `Bearer fake-token`);

            // Should return an error status
            expect([400, 404, 500]).toContain(response.status);
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });

    // Mocked behavior: jobModel.findById returns a mock RETURN job (not STORAGE), testUserId matches job's studentId
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 400
    // Expected behavior: job type validation fails, no job status updated
    // Expected output: error response indicating endpoint only valid for STORAGE jobs
    test('should handle non-STORAGE job type in confirmPickup', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: new mongoose.Types.ObjectId(),
            studentId: studentId,
            moverId: new mongoose.Types.ObjectId(),
            jobType: JobType.RETURN, // Not STORAGE
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);

        // Set testUserId to match the job's studentId
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = studentId;
        testUserRole = 'STUDENT';

        try {
            const response = await request(app)
                .post(`/api/jobs/${jobId}/confirm-pickup`)
                .set('Authorization', `Bearer fake-token`)
                .expect(400);

            expect(response.status).toBe(400);
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });

    // Mocked behavior: jobModel.findById returns a mock STORAGE job, testUserId is set to different studentId (not matching job's studentId)
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 403
    // Expected behavior: student authorization fails, no job status updated
    // Expected output: authorization error response
    test('should handle wrong student in confirmPickup', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId();
        const wrongStudentId = new mongoose.Types.ObjectId(); // Different student
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: new mongoose.Types.ObjectId(),
            studentId: wrongStudentId,
            moverId: new mongoose.Types.ObjectId(),
            jobType: JobType.STORAGE,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);

        // Set testUserId to a different studentId (not matching the job's studentId)
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = studentId; // Different from wrongStudentId
        testUserRole = 'STUDENT';

        try {
            const response = await request(app)
                .post(`/api/jobs/${jobId}/confirm-pickup`)
                .set('Authorization', `Bearer fake-token`)
                .expect(403);

            expect(response.status).toBe(403);
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });

    // Mocked behavior: jobModel.findById returns a mock STORAGE job with status ACCEPTED (not AWAITING_STUDENT_CONFIRMATION), testUserId matches job's studentId
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 400
    // Expected behavior: job status validation fails, no job status updated
    // Expected output: error response indicating job must be AWAITING_STUDENT_CONFIRMATION
    test('should handle wrong job status in confirmPickup', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: new mongoose.Types.ObjectId(),
            studentId: studentId,
            moverId: new mongoose.Types.ObjectId(),
            jobType: JobType.STORAGE,
            status: JobStatus.ACCEPTED, // Not AWAITING_STUDENT_CONFIRMATION
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);

        // Set testUserId to match the job's studentId
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = studentId;
        testUserRole = 'STUDENT';

        try {
            const response = await request(app)
                .post(`/api/jobs/${jobId}/confirm-pickup`)
                .set('Authorization', `Bearer fake-token`)
                .expect(400);

            expect(response.status).toBe(400);
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });

    // Mocked behavior: jobModel.findById returns a mock STORAGE job, jobModel.update returns null, testUserId matches job's studentId
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 500
    // Expected behavior: updatedJob is null immediately after update, error thrown
    // Expected output: error response
    test('should cover confirmPickup with null updatedJob immediately after update (line 628)', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId();
        const orderId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            moverId: new mongoose.Types.ObjectId(),
            jobType: JobType.STORAGE,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        // Make update return null to trigger line 628 immediately after update
        mockJobModel.update.mockResolvedValue(null as any);

        // Set testUserId to match the job's studentId
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = studentId;
        testUserRole = 'STUDENT';

        try {
            // Should return 500 because updatedJob is null (line 628)
            const response = await request(app)
                .post(`/api/jobs/${jobId}/confirm-pickup`)
                .set('Authorization', `Bearer fake-token`)
                .expect(500);

            expect(response.status).toBe(500);
            expect(mockJobModel.update).toHaveBeenCalled();
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });

    // Mocked behavior: jobModel.findById returns a mock STORAGE job with null orderId, jobModel.update returns updated job with null orderId, testUserId matches job's studentId
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 500
    // Expected behavior: invalid orderId error thrown
    // Expected output: error response
    test('should handle invalid orderId in confirmPickup', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: null, // Invalid orderId
            studentId: studentId,
            moverId: new mongoose.Types.ObjectId(),
            jobType: JobType.STORAGE,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const mockUpdatedJob = {
            ...mockJob,
            status: JobStatus.PICKED_UP,
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);

        // Set testUserId to match the job's studentId
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = studentId;
        testUserRole = 'STUDENT';

        try {
            const response = await request(app)
                .post(`/api/jobs/${jobId}/confirm-pickup`)
                .set('Authorization', `Bearer fake-token`)
                .expect(500);

            expect(response.status).toBe(500);
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });

    // Mocked behavior: jobModel.findById returns a mock STORAGE job, jobModel.update returns updated job, orderService.updateOrderStatus throws an error, testUserId matches job's studentId
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 500
    // Expected behavior: orderService error is thrown and handled
    // Expected output: error response
    test('should handle orderService error in confirmPickup', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId();
        const orderId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            moverId: new mongoose.Types.ObjectId(),
            jobType: JobType.STORAGE,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const mockUpdatedJob = {
            ...mockJob,
            status: JobStatus.PICKED_UP,
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);
        mockOrderService.updateOrderStatus.mockRejectedValue(new Error('Order service failed'));

        // Set testUserId to match the job's studentId
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = studentId;
        testUserRole = 'STUDENT';

        try {
            const response = await request(app)
                .post(`/api/jobs/${jobId}/confirm-pickup`)
                .set('Authorization', `Bearer fake-token`)
                .expect(500);

            expect(response.status).toBe(500);
        expect(mockOrderService.updateOrderStatus).toHaveBeenCalled();
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });

    // Mocked behavior: jobModel.findById returns a mock STORAGE job, jobModel.update returns updated job, orderService.updateOrderStatus succeeds, EventEmitter.emitJobUpdated throws an error, testUserId matches job's studentId
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 200
    // Expected behavior: EventEmitter error is caught and logged, request still succeeds
    // Expected output: success: true, data.status: PICKED_UP
    test('should handle EventEmitter error in confirmPickup', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId();
        const orderId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            moverId: new mongoose.Types.ObjectId(),
            jobType: JobType.STORAGE,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const mockUpdatedJob = {
            ...mockJob,
            status: JobStatus.PICKED_UP,
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);
        mockOrderService.updateOrderStatus.mockResolvedValue(undefined as any);
        mockEventEmitter.emitJobUpdated.mockImplementation(() => {
            throw new Error('Event emitter failed');
        });

        // Set testUserId to match the job's studentId
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = studentId;
        testUserRole = 'STUDENT';

        try {
            // Should still succeed despite emitter error
            const response = await request(app)
                .post(`/api/jobs/${jobId}/confirm-pickup`)
                .set('Authorization', `Bearer fake-token`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.status).toBe(JobStatus.PICKED_UP);
        } finally {
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });
});

describe('JobService - Additional Coverage Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Mocked behavior: jobModel.findByStudentId returns a mock jobs array
    // Input: GET request with valid authentication token
    // Expected status code: 200
    // Expected behavior: jobs are retrieved and mapped using mapper
    // Expected output: data.jobs array with mapped job items
    test('should cover getStudentJobs mapper call (line 239)', async () => {
        const studentId = new mongoose.Types.ObjectId().toString();
        const mockJobs = [{
            _id: new mongoose.Types.ObjectId(),
            orderId: new mongoose.Types.ObjectId(),
            studentId: new mongoose.Types.ObjectId(studentId),
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        }];

        mockJobModel.findByStudentId.mockResolvedValue(mockJobs as any);

        const response = await request(app)
            .get('/api/jobs/student')
            .set('Authorization', `Bearer fake-token`)
            .expect(200);

        expect(response.body.data.jobs).toBeDefined();
        expect(Array.isArray(response.body.data.jobs)).toBe(true);
        expect(mockJobModel.findByStudentId).toHaveBeenCalled();
    });

    // Mocked behavior: route parameter is a space character ( /status), testUserId is set
    // Input: PATCH request with space character as job ID, status: ACCEPTED, and authentication token
    // Expected status code: 400, 404, or 500
    // Expected behavior: validation error for missing/invalid jobId
    // Expected output: error response
    test('should cover updateJobStatus missing jobId validation (lines 272-273)', async () => {
        // Test via API endpoint - empty jobId will result in 404 or 400
        // Since Express routes won't match empty params, we'll test with a space or invalid ID
        const originalTestUserId = testUserId;
        testUserId = new mongoose.Types.ObjectId();

        try {
            // Test with space character - route might match and pass space to service
            const response = await request(app)
                .patch('/api/jobs/ /status')
                .set('Authorization', `Bearer fake-token`)
                .send({ status: JobStatus.ACCEPTED });

            // Should return an error status (400, 404, or 500)
            expect([400, 404, 500]).toContain(response.status);
        } finally {
            testUserId = originalTestUserId;
        }
    });

    // Mocked behavior: jobModel.findById returns a mock RETURN job, jobModel.update returns null
    // Input: PATCH request with valid job ID, status: PICKED_UP, and authentication token
    // Expected status code: 500
    // Expected behavior: updatedJob is null, error thrown
    // Expected output: error response
    test('should cover RETURN job PICKED_UP flow with null updatedJob (line 368)', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const orderId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            moverId: new mongoose.Types.ObjectId(),
            jobType: JobType.RETURN,
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.update.mockResolvedValue(null as any); // Return null to trigger line 368

        await request(app)
            .patch(`/api/jobs/${jobId}/status`)
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.PICKED_UP })
            .expect(500);
    });

    // Mocked behavior: jobModel.findById returns a mock RETURN job initially, jobModel.update returns updated job, jobModel.findById returns null on second call
    // Input: PATCH request with valid job ID, status: PICKED_UP, and authentication token
    // Expected status code: 404
    // Expected behavior: job not found after update in RETURN PICKED_UP flow, error thrown
    // Expected output: job not found error response
    test('should cover RETURN job PICKED_UP flow with job not found after update (line 384)', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const orderId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            moverId: new mongoose.Types.ObjectId(),
            jobType: JobType.RETURN,
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        };

        const mockUpdatedJob = {
            ...mockJob,
            status: JobStatus.PICKED_UP,
        };

        mockJobModel.findById
            .mockResolvedValueOnce(mockJob as any) // First call
            .mockResolvedValueOnce(null as any); // Second call returns null (line 384)
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);

        await request(app)
            .patch(`/api/jobs/${jobId}/status`)
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.PICKED_UP })
            .expect(404);
    });

    // Mocked behavior: jobModel.findById returns a mock RETURN job with null orderId twice, jobModel.update returns updated job with null orderId
    // Input: PATCH request with valid job ID, status: PICKED_UP, and authentication token
    // Expected status code: 500
    // Expected behavior: invalid orderId error thrown
    // Expected output: error response
    test('should cover RETURN job PICKED_UP flow with invalid orderId (lines 392-393)', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: null, // Invalid orderId
            studentId: studentId,
            moverId: new mongoose.Types.ObjectId(),
            jobType: JobType.RETURN,
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        };

        const mockUpdatedJob = {
            ...mockJob,
            status: JobStatus.PICKED_UP,
        };

        mockJobModel.findById
            .mockResolvedValueOnce(mockJob as any) // First call
            .mockResolvedValueOnce(mockJob as any); // Second call
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);

        await request(app)
            .patch(`/api/jobs/${jobId}/status`)
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.PICKED_UP })
            .expect(500);
    });

    // Mocked behavior: jobModel.findById returns a mock RETURN job twice, jobModel.update returns updated job, orderService.updateOrderStatus throws an error
    // Input: PATCH request with valid job ID, status: PICKED_UP, and authentication token
    // Expected status code: 200
    // Expected behavior: orderService error is caught and logged, request still succeeds
    // Expected output: success response with status: PICKED_UP
    test('should cover RETURN job PICKED_UP flow error handling (line 410)', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const orderId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            moverId: new mongoose.Types.ObjectId(),
            jobType: JobType.RETURN,
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        };

        const mockUpdatedJob = {
            ...mockJob,
            status: JobStatus.PICKED_UP,
        };

        mockJobModel.findById
            .mockResolvedValueOnce(mockJob as any) // First call
            .mockResolvedValueOnce(mockJob as any); // Second call
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);
        mockOrderService.updateOrderStatus.mockRejectedValue(new Error('Order service error') as any);

        // Should not throw, error is caught and logged (line 410)
        const response = await request(app)
            .patch(`/api/jobs/${jobId}/status`)
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.PICKED_UP })
            .expect(200);
        
        expect(response.body.status).toBe(JobStatus.PICKED_UP);
    });

    // Mocked behavior: jobModel.findById returns a mock STORAGE job with null orderId, jobModel.update returns updated job with null orderId, userModel.findByIdAndUpdate succeeds
    // Input: PATCH request with valid job ID, status: COMPLETED, and authentication token
    // Expected status code: 500
    // Expected behavior: invalid orderId error thrown
    // Expected output: error response
    test('should cover COMPLETED flow with invalid orderId (lines 450-451)', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: null, // Invalid orderId
            studentId: studentId,
            moverId: new mongoose.Types.ObjectId(),
            jobType: JobType.STORAGE,
            status: JobStatus.PICKED_UP,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        };

        const mockUpdatedJob = {
            ...mockJob,
            status: JobStatus.COMPLETED,
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);
        mockUserModel.findByIdAndUpdate.mockResolvedValue({} as any);

        await request(app)
            .patch(`/api/jobs/${jobId}/status`)
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.COMPLETED })
            .expect(500);
    });

    // Mocked behavior: jobModel.findById returns a mock RETURN job, jobModel.update returns updated job, userModel methods succeed, orderService.updateOrderStatus succeeds, notificationService succeeds
    // Input: PATCH request with valid job ID, status: COMPLETED, and authentication token
    // Expected status code: 200
    // Expected behavior: job status updated to COMPLETED, mover credits updated, order status updated to RETURNED
    // Expected output: success response with status: COMPLETED
    test('should cover RETURN job COMPLETED flow (lines 479-488)', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const orderId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        const moverId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            moverId: moverId,
            jobType: JobType.RETURN, // RETURN job
            status: JobStatus.PICKED_UP,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        };

        const mockUpdatedJob = {
            ...mockJob,
            status: JobStatus.COMPLETED,
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);
        mockUserModel.findById.mockResolvedValue({
            _id: moverId,
            userRole: 'MOVER',
            credits: 100,
        } as any);
        mockUserModel.update.mockResolvedValue({} as any);
        mockOrderService.updateOrderStatus.mockResolvedValue(undefined as any);
        mockNotificationService.sendJobStatusNotification.mockResolvedValue(undefined as any);

        const response = await request(app)
            .patch(`/api/jobs/${jobId}/status`)
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.COMPLETED })
            .expect(200);

        expect(response.body.status).toBe(JobStatus.COMPLETED);
        expect(mockOrderService.updateOrderStatus).toHaveBeenCalledWith(
            orderId,
            OrderStatus.RETURNED,
            expect.any(String)
        );
    });

    // Mocked behavior: jobModel.findById returns a mock job, jobModel.update returns updated job with null orderId
    // Input: PATCH request with valid job ID, status: PICKED_UP, and authentication token
    // Expected status code: 500
    // Expected behavior: invalid orderId error thrown at end of updateJobStatus
    // Expected output: error response
    test('should cover invalid orderId at end of updateJobStatus (line 504)', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: new mongoose.Types.ObjectId(),
            studentId: studentId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        };

        const mockUpdatedJob = {
            ...mockJob,
            orderId: null, // Invalid orderId at the end
            status: JobStatus.PICKED_UP,
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);

        await request(app)
            .patch(`/api/jobs/${jobId}/status`)
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.PICKED_UP })
            .expect(500);
    });

    // Mocked behavior: extractObjectId is mocked to return valid ObjectId when field is null, jobModel.findById returns a mock STORAGE job, jobModel.update returns null, orderService and EventEmitter succeed
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 500
    // Expected behavior: updatedJob is null, error thrown at line 661
    // Expected output: error response
    test('should cover confirmPickup with null updatedJob (line 661)', async () => {
        // Mock extractObjectId to return a valid ObjectId even when updatedJob is null
        // This allows us to bypass the earlier throw and reach line 661
        const mongooseUtil = require('../../src/utils/mongoose.util');
        const originalExtractObjectId = mongooseUtil.extractObjectId;
        
        mongooseUtil.extractObjectId = jest.fn((field) => {
            if (field == null) {
                // Return a valid ObjectId to bypass the early throw
                return new mongoose.Types.ObjectId();
            }
            return originalExtractObjectId(field);
        });

        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId().toString();
        const orderId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: new mongoose.Types.ObjectId(studentId),
            moverId: new mongoose.Types.ObjectId(),
            jobType: JobType.STORAGE,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.update.mockResolvedValue(null as any); // Return null to trigger line 661
        mockOrderService.updateOrderStatus.mockResolvedValue(undefined as any);
        mockEventEmitter.emitJobUpdated.mockResolvedValue(undefined as any);

        await request(app)
            .post(`/api/jobs/${jobId}/confirm-pickup`)
            .set('Authorization', `Bearer fake-token`)
            .expect(500);

        // Restore original function
        mongooseUtil.extractObjectId = originalExtractObjectId;
    });

    // Mocked behavior: extractObjectId is mocked to return valid ObjectId when field is null, jobModel.findById returns a mock RETURN job, jobModel.update returns null, userModel methods succeed, orderService and EventEmitter succeed
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 500
    // Expected behavior: updatedJob is null, error thrown at line 812
    // Expected output: error response
    test('should cover confirmDelivery with null updatedJob (line 812)', async () => {
        // Mock extractObjectId to return a valid ObjectId even when updatedJob is null
        // This allows us to bypass the earlier throw and reach line 812
        const mongooseUtil = require('../../src/utils/mongoose.util');
        const originalExtractObjectId = mongooseUtil.extractObjectId;
        
        mongooseUtil.extractObjectId = jest.fn((field) => {
            if (field == null) {
                // Return a valid ObjectId to bypass the early throw
                return new mongoose.Types.ObjectId();
            }
            return originalExtractObjectId(field);
        });

        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId().toString();
        const orderId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: new mongoose.Types.ObjectId(studentId),
            moverId: new mongoose.Types.ObjectId(),
            jobType: JobType.RETURN,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.update.mockResolvedValue(null as any); // Return null to trigger line 812
        mockUserModel.findById.mockResolvedValue({
            _id: new mongoose.Types.ObjectId(),
            userRole: 'MOVER',
            credits: 100,
        } as any);
        mockUserModel.update.mockResolvedValue({} as any);
        mockOrderService.updateOrderStatus.mockResolvedValue(undefined as any);
        mockEventEmitter.emitJobUpdated.mockResolvedValue(undefined as any);

        await request(app)
            .post(`/api/jobs/${jobId}/confirm-delivery`)
            .set('Authorization', `Bearer fake-token`)
            .expect(500);

        // Restore original function
        mongooseUtil.extractObjectId = originalExtractObjectId;
    });

    // Mocked behavior: jobModel.findById returns a mock STORAGE job with invalid moverId object, jobModel.update returns updated job, userModel.findByIdAndUpdate succeeds, orderService and notificationService succeed
    // Input: PATCH request with valid job ID, status: COMPLETED, and authentication token
    // Expected status code: 200
    // Expected behavior: invalid moverId is handled gracefully (extractObjectId returns null), request still succeeds
    // Expected output: success response with status: COMPLETED
    test('should cover addCreditsToMover with invalid moverId (lines 43-44)', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const orderId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            moverId: { invalid: 'object' }, // Invalid moverId that extractObjectId can't convert (truthy but not extractable)
            jobType: JobType.STORAGE,
            status: JobStatus.PICKED_UP,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        };

        const mockUpdatedJob = {
            ...mockJob,
            status: JobStatus.COMPLETED,
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);
        mockUserModel.findByIdAndUpdate.mockResolvedValue({} as any);
        mockOrderService.updateOrderStatus.mockResolvedValue(undefined as any);
        mockNotificationService.sendJobStatusNotification.mockResolvedValue(undefined as any);

        // Should not throw, invalid moverId is handled gracefully (extractObjectId returns null)
        const response = await request(app)
            .patch(`/api/jobs/${jobId}/status`)
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.COMPLETED })
            .expect(200);
        
        expect(response.body.status).toBe(JobStatus.COMPLETED);
    });

    // Mocked behavior: jobModel.findById returns a mock STORAGE job, jobModel.update returns updated job, userModel.findById throws an error, orderService and notificationService succeed
    // Input: PATCH request with valid job ID, status: COMPLETED, and authentication token
    // Expected status code: 200
    // Expected behavior: credit error is caught and logged, request still succeeds
    // Expected output: success response with status: COMPLETED
    test('should cover addCreditsToMover catch block (line 62)', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const orderId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        const moverId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            moverId: moverId,
            jobType: JobType.STORAGE,
            status: JobStatus.PICKED_UP,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        };

        const mockUpdatedJob = {
            ...mockJob,
            status: JobStatus.COMPLETED,
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);
        mockUserModel.findById.mockRejectedValue(new Error('Database error') as any); // Trigger catch block
        mockOrderService.updateOrderStatus.mockResolvedValue(undefined as any);
        mockNotificationService.sendJobStatusNotification.mockResolvedValue(undefined as any);

        // Should not throw, credit error is caught and logged
        const response = await request(app)
            .patch(`/api/jobs/${jobId}/status`)
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.COMPLETED })
            .expect(200);
        
        expect(response.body.status).toBe(JobStatus.COMPLETED);
    });

    // Mocked behavior: orderService is unmocked and uses real implementation, orderModel.findActiveOrder returns a mock order, orderModel.update succeeds, jobModel.findByOrderId returns mock jobs array, jobModel.update succeeds for both jobs, paymentService.refundPayment succeeds, EventEmitter succeeds
    // Input: DELETE request to /api/orders/cancel-order with valid authentication token
    // Expected status code: 200
    // Expected behavior: all jobs for the order are cancelled, order is cancelled, payment is refunded
    // Expected output: success: true
    test('should cover cancelJobsForOrder method (lines 70-129) via order cancellation endpoint', async () => {
        const orderId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        const jobId1 = new mongoose.Types.ObjectId();
        const jobId2 = new mongoose.Types.ObjectId();
        
        const mockOrder = {
            _id: orderId,
            studentId: studentId,
            status: OrderStatus.PENDING,
            volume: 10,
            price: 50,
        };

        const mockJobs = [
            {
                _id: jobId1,
                orderId: orderId,
                studentId: studentId,
                jobType: JobType.STORAGE,
                status: JobStatus.AVAILABLE,
                volume: 10,
                price: 50,
            },
            {
                _id: jobId2,
                orderId: orderId,
                studentId: studentId,
                jobType: JobType.RETURN,
                status: JobStatus.ACCEPTED,
                volume: 15,
                price: 75,
            },
        ];

        const mockUpdatedJob1 = {
            ...mockJobs[0],
            status: JobStatus.CANCELLED,
        };

        const mockUpdatedJob2 = {
            ...mockJobs[1],
            status: JobStatus.CANCELLED,
        };

        const mockUpdatedOrder = {
            ...mockOrder,
            status: OrderStatus.CANCELLED,
        };

        // Temporarily restore the real order service and mock orderModel instead
        jest.unmock('../../src/services/order.service');
        const { orderService: realOrderService } = require('../../src/services/order.service');
        const { orderModel } = require('../../src/models/order.model');
        const originalFindActiveOrder = orderModel.findActiveOrder;
        const originalUpdate = orderModel.update;
        
        orderModel.findActiveOrder = jest.fn().mockResolvedValue(mockOrder);
        orderModel.update = jest.fn().mockResolvedValue(mockUpdatedOrder);

        // Temporarily replace mockOrderService with real one
        const originalMockUpdate = mockOrderService.updateOrderStatus;
        mockOrderService.updateOrderStatus = realOrderService.updateOrderStatus.bind(realOrderService);
        const originalCancelOrder = mockOrderService.cancelOrder;
        mockOrderService.cancelOrder = realOrderService.cancelOrder.bind(realOrderService);

        mockJobModel.findByOrderId.mockResolvedValue(mockJobs as any);
        mockJobModel.update
            .mockResolvedValueOnce(mockUpdatedJob1 as any)
            .mockResolvedValueOnce(mockUpdatedJob2 as any);
        mockEventEmitter.emitJobUpdated.mockReturnValue(undefined);
        mockPaymentService.refundPayment.mockResolvedValue(undefined);

        try {
            const response = await request(app)
                .delete('/api/orders/cancel-order')
                .set('Authorization', `Bearer fake-token`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(mockJobModel.findByOrderId).toHaveBeenCalled();
            expect(mockJobModel.update).toHaveBeenCalledTimes(2);
        } finally {
            // Restore mocks
            orderModel.findActiveOrder = originalFindActiveOrder;
            orderModel.update = originalUpdate;
            mockOrderService.updateOrderStatus = originalMockUpdate;
            if (originalCancelOrder) {
                mockOrderService.cancelOrder = originalCancelOrder;
            }
        }
    });

    // Mocked behavior: orderService is unmocked and uses real implementation, orderModel methods succeed, jobModel.findByOrderId returns mock jobs array, jobModel.update returns null
    // Input: DELETE request to /api/orders/cancel-order with valid authentication token
    // Expected status code: 200
    // Expected behavior: job update returns null (lines 100-104), error is logged but order cancellation still succeeds
    // Expected output: success: true
    test('should cover cancelJobsForOrder with update returning null (lines 100-104)', async () => {
        const orderId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        const jobId = new mongoose.Types.ObjectId();
        
        const mockOrder = {
            _id: orderId,
            studentId: studentId,
            status: OrderStatus.PENDING,
            volume: 10,
            price: 50,
        };

        const mockJobs = [{
            _id: jobId,
            orderId: orderId,
            studentId: studentId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
        }];

        const mockUpdatedOrder = {
            ...mockOrder,
            status: OrderStatus.CANCELLED,
        };

        // Temporarily restore the real order service and mock orderModel instead
        jest.unmock('../../src/services/order.service');
        const { orderService: realOrderService } = require('../../src/services/order.service');
        const { orderModel } = require('../../src/models/order.model');
        const originalFindActiveOrder = orderModel.findActiveOrder;
        const originalUpdate = orderModel.update;
        
        orderModel.findActiveOrder = jest.fn().mockResolvedValue(mockOrder);
        orderModel.update = jest.fn().mockResolvedValue(mockUpdatedOrder);

        const originalMockUpdate = mockOrderService.updateOrderStatus;
        mockOrderService.updateOrderStatus = realOrderService.updateOrderStatus.bind(realOrderService);
        const originalCancelOrder = mockOrderService.cancelOrder;
        mockOrderService.cancelOrder = realOrderService.cancelOrder.bind(realOrderService);

        mockJobModel.findByOrderId.mockResolvedValue(mockJobs as any);
        mockJobModel.update.mockResolvedValue(null as any); // Return null to trigger lines 100-104

        try {
            const response = await request(app)
                .delete('/api/orders/cancel-order')
                .set('Authorization', `Bearer fake-token`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(mockJobModel.findByOrderId).toHaveBeenCalled();
            expect(mockJobModel.update).toHaveBeenCalled();
        } finally {
            // Restore mocks
            orderModel.findActiveOrder = originalFindActiveOrder;
            orderModel.update = originalUpdate;
            mockOrderService.updateOrderStatus = originalMockUpdate;
            if (originalCancelOrder) {
                mockOrderService.cancelOrder = originalCancelOrder;
            }
        }
    });

    // Mocked behavior: orderService is unmocked and uses real implementation, orderModel methods succeed, jobModel.findByOrderId returns mock jobs array, first jobModel.update succeeds, second jobModel.update throws an error
    // Input: DELETE request to /api/orders/cancel-order with valid authentication token
    // Expected status code: 200
    // Expected behavior: error in update loop (lines 118-123) is caught and logged, order cancellation still succeeds
    // Expected output: success: true
    test('should cover cancelJobsForOrder with error in update loop (lines 118-123)', async () => {
        const orderId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        const jobId1 = new mongoose.Types.ObjectId();
        const jobId2 = new mongoose.Types.ObjectId();
        
        const mockOrder = {
            _id: orderId,
            studentId: studentId,
            status: OrderStatus.PENDING,
            volume: 10,
            price: 50,
        };

        const mockJobs = [
            {
                _id: jobId1,
                orderId: orderId,
                studentId: studentId,
                jobType: JobType.STORAGE,
                status: JobStatus.AVAILABLE,
                volume: 10,
                price: 50,
            },
            {
                _id: jobId2,
                orderId: orderId,
                studentId: studentId,
                jobType: JobType.RETURN,
                status: JobStatus.ACCEPTED,
                volume: 15,
                price: 75,
            },
        ];

        const mockUpdatedJob1 = {
            ...mockJobs[0],
            status: JobStatus.CANCELLED,
        };

        const mockUpdatedOrder = {
            ...mockOrder,
            status: OrderStatus.CANCELLED,
        };

        // Temporarily restore the real order service and mock orderModel instead
        jest.unmock('../../src/services/order.service');
        const { orderService: realOrderService } = require('../../src/services/order.service');
        const { orderModel } = require('../../src/models/order.model');
        const originalFindActiveOrder = orderModel.findActiveOrder;
        const originalUpdate = orderModel.update;
        
        orderModel.findActiveOrder = jest.fn().mockResolvedValue(mockOrder);
        orderModel.update = jest.fn().mockResolvedValue(mockUpdatedOrder);

        const originalMockUpdate = mockOrderService.updateOrderStatus;
        mockOrderService.updateOrderStatus = realOrderService.updateOrderStatus.bind(realOrderService);
        const originalCancelOrder = mockOrderService.cancelOrder;
        mockOrderService.cancelOrder = realOrderService.cancelOrder.bind(realOrderService);

        mockJobModel.findByOrderId.mockResolvedValue(mockJobs as any);
        mockJobModel.update
            .mockResolvedValueOnce(mockUpdatedJob1 as any)
            .mockRejectedValueOnce(new Error('Update failed') as any); // Second update fails (lines 118-123)

        try {
            const response = await request(app)
                .delete('/api/orders/cancel-order')
                .set('Authorization', `Bearer fake-token`)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(mockJobModel.findByOrderId).toHaveBeenCalled();
        } finally {
            // Restore mocks
            orderModel.findActiveOrder = originalFindActiveOrder;
            orderModel.update = originalUpdate;
            mockOrderService.updateOrderStatus = originalMockUpdate;
            if (originalCancelOrder) {
                mockOrderService.cancelOrder = originalCancelOrder;
            }
        }
    });

    // Mocked behavior: orderService is unmocked and uses real implementation, orderModel methods succeed, jobModel.findByOrderId throws an error
    // Input: DELETE request to /api/orders/cancel-order with valid authentication token
    // Expected status code: 200
    // Expected behavior: catch block (lines 127-129) is executed, error is logged, order cancellation still succeeds
    // Expected output: success: true
    test('should cover cancelJobsForOrder catch block (lines 127-129)', async () => {
        const orderId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockOrder = {
            _id: orderId,
            studentId: studentId,
            status: OrderStatus.PENDING,
            volume: 10,
            price: 50,
        };

        const mockUpdatedOrder = {
            ...mockOrder,
            status: OrderStatus.CANCELLED,
        };

        // Temporarily restore the real order service and mock orderModel instead
        jest.unmock('../../src/services/order.service');
        const { orderService: realOrderService } = require('../../src/services/order.service');
        const { orderModel } = require('../../src/models/order.model');
        const originalFindActiveOrder = orderModel.findActiveOrder;
        const originalUpdate = orderModel.update;
        
        orderModel.findActiveOrder = jest.fn().mockResolvedValue(mockOrder);
        orderModel.update = jest.fn().mockResolvedValue(mockUpdatedOrder);

        const originalMockUpdate = mockOrderService.updateOrderStatus;
        mockOrderService.updateOrderStatus = realOrderService.updateOrderStatus.bind(realOrderService);
        const originalCancelOrder = mockOrderService.cancelOrder;
        mockOrderService.cancelOrder = realOrderService.cancelOrder.bind(realOrderService);

        mockJobModel.findByOrderId.mockRejectedValue(new Error('Database error') as any); // Trigger catch block (lines 127-129)

        try {
            const response = await request(app)
                .delete('/api/orders/cancel-order')
                .set('Authorization', `Bearer fake-token`)
                .expect(200); // Order cancellation still succeeds, job cancellation error is caught

            expect(response.body.success).toBe(true);
            expect(mockJobModel.findByOrderId).toHaveBeenCalled();
        } finally {
            // Restore mocks
            orderModel.findActiveOrder = originalFindActiveOrder;
            orderModel.update = originalUpdate;
            mockOrderService.updateOrderStatus = originalMockUpdate;
            if (originalCancelOrder) {
                mockOrderService.cancelOrder = originalCancelOrder;
            }
        }
    });

    // Mocked behavior: validation middleware is bypassed (shouldBypassValidation = true), jobModel.create is not called
    // Input: POST request with empty orderId or empty studentId and authentication token
    // Expected status code: 500
    // Expected behavior: service-level validation fails for missing orderId/studentId
    // Expected output: error response
    test('should cover createJob missing orderId/studentId validation (lines 135-139)', async () => {
        // Bypass validation middleware to reach service-level checks
        shouldBypassValidation = true;
        
        try {
            // Test missing orderId
            const response1 = await request(app)
                .post('/api/jobs')
                .set('Authorization', `Bearer fake-token`)
                .send({
                    orderId: '',
                    studentId: new mongoose.Types.ObjectId().toString(),
                    jobType: JobType.STORAGE,
                    volume: 10,
                    price: 50,
                    pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
                    dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
                    scheduledTime: new Date().toISOString(),
                });
            expect(response1.status).toBeGreaterThanOrEqual(500);

            // Test missing studentId
            const response2 = await request(app)
                .post('/api/jobs')
                .set('Authorization', `Bearer fake-token`)
                .send({
                    orderId: new mongoose.Types.ObjectId().toString(),
                    studentId: '',
                    jobType: JobType.STORAGE,
                    volume: 10,
                    price: 50,
                    pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
                    dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
                    scheduledTime: new Date().toISOString(),
                });
            expect(response2.status).toBeGreaterThanOrEqual(500);
        } finally {
            shouldBypassValidation = false;
        }
    });

    // Mocked behavior: validation middleware is bypassed (shouldBypassValidation = true), jobModel.create is not called
    // Input: POST request with volume = 0 or volume < 0 and authentication token
    // Expected status code: 500
    // Expected behavior: service-level validation fails for invalid volume
    // Expected output: error response
    test('should cover createJob invalid volume validation (lines 143-144)', async () => {
        // Bypass validation middleware to reach service-level checks
        shouldBypassValidation = true;
        
        try {
            // Test volume = 0
            const response1 = await request(app)
                .post('/api/jobs')
                .set('Authorization', `Bearer fake-token`)
                .send({
                    orderId: new mongoose.Types.ObjectId().toString(),
                    studentId: new mongoose.Types.ObjectId().toString(),
                    jobType: JobType.STORAGE,
                    volume: 0,
                    price: 50,
                    pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
                    dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
                    scheduledTime: new Date().toISOString(),
                });
            expect(response1.status).toBeGreaterThanOrEqual(500);

            // Test volume < 0
            const response2 = await request(app)
                .post('/api/jobs')
                .set('Authorization', `Bearer fake-token`)
                .send({
                    orderId: new mongoose.Types.ObjectId().toString(),
                    studentId: new mongoose.Types.ObjectId().toString(),
                    jobType: JobType.STORAGE,
                    volume: -5,
                    price: 50,
                    pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
                    dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
                    scheduledTime: new Date().toISOString(),
                });
            expect(response2.status).toBeGreaterThanOrEqual(500);
        } finally {
            shouldBypassValidation = false;
        }
    });

    // Mocked behavior: validation middleware is bypassed (shouldBypassValidation = true), jobModel.create is not called
    // Input: POST request with price = 0 or price < 0 and authentication token
    // Expected status code: 500
    // Expected behavior: service-level validation fails for invalid price
    // Expected output: error response
    test('should cover createJob invalid price validation (lines 148-149)', async () => {
        // Bypass validation middleware to reach service-level checks
        shouldBypassValidation = true;
        
        try {
            // Test price = 0
            const response1 = await request(app)
                .post('/api/jobs')
                .set('Authorization', `Bearer fake-token`)
                .send({
                    orderId: new mongoose.Types.ObjectId().toString(),
                    studentId: new mongoose.Types.ObjectId().toString(),
                    jobType: JobType.STORAGE,
                    volume: 10,
                    price: 0,
                    pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
                    dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
                    scheduledTime: new Date().toISOString(),
                });
            expect(response1.status).toBeGreaterThanOrEqual(500);

            // Test price < 0
            const response2 = await request(app)
                .post('/api/jobs')
                .set('Authorization', `Bearer fake-token`)
                .send({
                    orderId: new mongoose.Types.ObjectId().toString(),
                    studentId: new mongoose.Types.ObjectId().toString(),
                    jobType: JobType.STORAGE,
                    volume: 10,
                    price: -10,
                    pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
                    dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
                    scheduledTime: new Date().toISOString(),
                });
            expect(response2.status).toBeGreaterThanOrEqual(500);
        } finally {
            shouldBypassValidation = false;
        }
    });

    // Mocked behavior: jobModel.findAllJobs returns a mock jobs array
    // Input: GET request with valid authentication token
    // Expected status code: 200
    // Expected behavior: jobs are retrieved and mapped using mapper
    // Expected output: data.jobs array with mapped job items
    test('should cover getAllJobs mapper call (line 196)', async () => {
        const mockJobs = [{
            _id: new mongoose.Types.ObjectId(),
            orderId: new mongoose.Types.ObjectId(),
            studentId: new mongoose.Types.ObjectId(),
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        }];

        mockJobModel.findAllJobs.mockResolvedValue(mockJobs as any);

        const response = await request(app)
            .get('/api/jobs')
            .set('Authorization', `Bearer fake-token`)
            .expect(200);

        expect(response.body.data.jobs).toBeDefined();
        expect(Array.isArray(response.body.data.jobs)).toBe(true);
        expect(mockJobModel.findAllJobs).toHaveBeenCalled();
    });

    // Mocked behavior: jobModel.findAvailableJobs returns a mock jobs array
    // Input: GET request with valid authentication token
    // Expected status code: 200
    // Expected behavior: available jobs are retrieved and mapped using mapper
    // Expected output: data.jobs array with mapped job items
    test('should cover getAllAvailableJobs mapper call (lines 207-209)', async () => {
        const mockJobs = [{
            _id: new mongoose.Types.ObjectId(),
            orderId: new mongoose.Types.ObjectId(),
            studentId: new mongoose.Types.ObjectId(),
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        }];

        mockJobModel.findAvailableJobs.mockResolvedValue(mockJobs as any);

        const response = await request(app)
            .get('/api/jobs/available')
            .set('Authorization', `Bearer fake-token`)
            .expect(200);

        expect(response.body.data.jobs).toBeDefined();
        expect(Array.isArray(response.body.data.jobs)).toBe(true);
        expect(mockJobModel.findAvailableJobs).toHaveBeenCalled();
    });

    // Mocked behavior: jobModel.findByMoverId returns a mock jobs array
    // Input: GET request with valid authentication token
    // Expected status code: 200
    // Expected behavior: mover jobs are retrieved and mapped using mapper
    // Expected output: data.jobs array with mapped job items
    test('should cover getMoverJobs mapper call (line 224)', async () => {
        const moverId = new mongoose.Types.ObjectId().toString();
        const mockJobs = [{
            _id: new mongoose.Types.ObjectId(),
            orderId: new mongoose.Types.ObjectId(),
            studentId: new mongoose.Types.ObjectId(),
            moverId: new mongoose.Types.ObjectId(moverId),
            jobType: JobType.STORAGE,
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            scheduledTime: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        }];

        mockJobModel.findByMoverId.mockResolvedValue(mockJobs as any);

        const response = await request(app)
            .get('/api/jobs/mover')
            .set('Authorization', `Bearer fake-token`)
            .expect(200);

        expect(response.body.data.jobs).toBeDefined();
        expect(Array.isArray(response.body.data.jobs)).toBe(true);
        expect(mockJobModel.findByMoverId).toHaveBeenCalled();
    });

    // Mocked behavior: jobModel.findById returns a mock STORAGE job, jobModel.update returns updated job, notificationService and EventEmitter succeed, testUserId matches job's moverId
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 200
    // Expected behavior: job status updated to AWAITING_STUDENT_CONFIRMATION, notification sent, event emitted, all lines 560-584 executed
    // Expected output: success: true, message: "Confirmation requested", data with id and status
    test('should cover requestPickupConfirmation successful path (lines 560-584)', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const moverId = new mongoose.Types.ObjectId();
        const moverIdStr = moverId.toString();
        const orderId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            moverId: moverId, // Use the same moverId
            jobType: JobType.STORAGE,
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        };

        const mockUpdatedJob = {
            ...mockJob,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            verificationRequestedAt: new Date(),
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);
        mockNotificationService.sendJobStatusNotification.mockResolvedValue(undefined as any);
        mockEventEmitter.emitJobUpdated.mockReturnValue(undefined);

        // Set the test user ID to match the job's moverId
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = moverId;
        testUserRole = 'MOVER';

        try {
            // Successful path - all lines 560-584 should be executed
            const response = await request(app)
                .post(`/api/jobs/${jobId}/arrived`)
                .set('Authorization', `Bearer fake-token`)
                .expect(200);
            
            expect(response.body.success).toBe(true);
            expect(response.body.message).toBe('Confirmation requested');
            
            // Verify all lines 560-584 are covered:
            // Line 560: jobModel.update called
            expect(mockJobModel.update).toHaveBeenCalledWith(
                mockJob._id,
                expect.objectContaining({
                    status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
                    verificationRequestedAt: expect.any(Date),
                    updatedAt: expect.any(Date),
                })
            );
            
            // Lines 566-569: notificationService.sendJobStatusNotification called
            expect(mockNotificationService.sendJobStatusNotification).toHaveBeenCalledWith(
                new mongoose.Types.ObjectId(jobId),
                JobStatus.AWAITING_STUDENT_CONFIRMATION
            );
            
            // Lines 572-576: emitJobUpdated called successfully (no error)
            expect(mockEventEmitter.emitJobUpdated).toHaveBeenCalledWith(
                mockUpdatedJob,
                expect.objectContaining({
                    by: moverIdStr,
                    ts: expect.any(String),
                })
            );
            
            // Line 584: return statement executed (response contains id and status)
            expect(response.body.data).toHaveProperty('id', jobId);
            expect(response.body.data).toHaveProperty('status', JobStatus.AWAITING_STUDENT_CONFIRMATION);
        } finally {
            // Restore original test user settings
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });

    // Mocked behavior: jobModel.findById returns a mock STORAGE job, jobModel.update returns updated job, notificationService succeeds, EventEmitter.emitJobUpdated throws an error, testUserId matches job's moverId
    // Input: POST request with valid job ID and authentication token
    // Expected status code: 200
    // Expected behavior: EventEmitter error is caught and logged (lines 577-582), request still succeeds, all lines 560-584 executed
    // Expected output: success: true, data with id and status: AWAITING_STUDENT_CONFIRMATION
    test('should cover requestPickupConfirmation with EventEmitter error (lines 560-584)', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const moverId = new mongoose.Types.ObjectId();
        const moverIdStr = moverId.toString();
        const orderId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            moverId: moverId, // Use the same moverId
            jobType: JobType.STORAGE,
            status: JobStatus.ACCEPTED,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        };

        const mockUpdatedJob = {
            ...mockJob,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
            verificationRequestedAt: new Date(),
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);
        mockNotificationService.sendJobStatusNotification.mockResolvedValue(undefined as any);
        mockEventEmitter.emitJobUpdated.mockImplementation(() => {
            throw new Error('EventEmitter error');
        });

        // Set the test user ID to match the job's moverId
        const originalTestUserId = testUserId;
        const originalTestUserRole = testUserRole;
        testUserId = moverId;
        testUserRole = 'MOVER';

        try {
            // Should not throw, error is caught and logged (lines 577-582)
            const response = await request(app)
                .post(`/api/jobs/${jobId}/arrived`)
                .set('Authorization', `Bearer fake-token`)
                .expect(200);
            
            expect(response.body.success).toBe(true);
            
            // Verify lines 560-584 are covered:
            // Line 560: jobModel.update called
            expect(mockJobModel.update).toHaveBeenCalled();
            
            // Lines 566-569: notificationService.sendJobStatusNotification called
            expect(mockNotificationService.sendJobStatusNotification).toHaveBeenCalled();
            
            // Lines 572-576: emitJobUpdated called (throws error)
            // Lines 577-582: catch block executed
            expect(mockEventEmitter.emitJobUpdated).toHaveBeenCalled();
            
            // Line 584: return statement executed despite error
            expect(response.body.data).toHaveProperty('id');
            expect(response.body.data).toHaveProperty('status', JobStatus.AWAITING_STUDENT_CONFIRMATION);
        } finally {
            // Restore original test user settings
            testUserId = originalTestUserId;
            testUserRole = originalTestUserRole;
        }
    });
});

describe('NotificationService Coverage Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset Firebase messaging mock
        mockFirebaseMessaging.send.mockClear();
        mockFirebaseAdmin.messaging.mockReturnValue(mockFirebaseMessaging);
    });

    // Mocked behavior: notificationService is unmocked and uses real implementation, jobModel.findById returns a mock job, userModel.findById returns a mock student with FCM token, Firebase messaging succeeds
    // Input: jobId and JobStatus.ACCEPTED
    // Expected status code: N/A (direct service call)
    // Expected behavior: notification is sent with title "Job Accepted" and body "A mover has accepted your job!"
    // Expected output: None (void function)
    test('should cover sendJobStatusNotification with ACCEPTED status', async () => {
        // Unmock notification service to test real implementation
        jest.unmock('../../src/services/notification.service');
        const { notificationService: realNotificationService } = require('../../src/services/notification.service');

        const jobId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        const fcmToken = 'test-fcm-token-123';

        const mockJob = {
            _id: jobId,
            studentId: studentId,
            jobType: JobType.STORAGE,
            status: JobStatus.AVAILABLE,
        };

        const mockStudent = {
            _id: studentId,
            fcmToken: fcmToken,
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockUserModel.findById.mockResolvedValue(mockStudent as any);
        mockFirebaseMessaging.send.mockResolvedValue('success-message-id');

        // Temporarily replace mock with real service
        const originalMock = mockNotificationService.sendJobStatusNotification;
        mockNotificationService.sendJobStatusNotification = realNotificationService.sendJobStatusNotification.bind(realNotificationService);

        try {
            await realNotificationService.sendJobStatusNotification(jobId, JobStatus.ACCEPTED);

            expect(mockJobModel.findById).toHaveBeenCalledWith(jobId);
            expect(mockUserModel.findById).toHaveBeenCalledWith(studentId);
            expect(mockFirebaseMessaging.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    token: fcmToken,
                    notification: {
                        title: 'Job Accepted',
                        body: 'A mover has accepted your job!',
                    },
                })
            );
        } finally {
            mockNotificationService.sendJobStatusNotification = originalMock;
        }
    });

    // Mocked behavior: notificationService is unmocked and uses real implementation, jobModel.findById returns a mock job, userModel.findById returns a mock student with FCM token, Firebase messaging succeeds
    // Input: jobId and JobStatus.PICKED_UP
    // Expected status code: N/A (direct service call)
    // Expected behavior: notification is sent with title "Job Update" and body "Your mover has picked up your items!"
    // Expected output: None (void function)
    test('should cover sendJobStatusNotification with PICKED_UP status', async () => {
        jest.unmock('../../src/services/notification.service');
        const { notificationService: realNotificationService } = require('../../src/services/notification.service');

        const jobId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        const fcmToken = 'test-fcm-token-456';

        const mockJob = {
            _id: jobId,
            studentId: studentId,
            jobType: JobType.STORAGE,
        };

        const mockStudent = {
            _id: studentId,
            fcmToken: fcmToken,
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockUserModel.findById.mockResolvedValue(mockStudent as any);
        mockFirebaseMessaging.send.mockResolvedValue('success-message-id');

        const originalMock = mockNotificationService.sendJobStatusNotification;
        mockNotificationService.sendJobStatusNotification = realNotificationService.sendJobStatusNotification.bind(realNotificationService);

        try {
            await realNotificationService.sendJobStatusNotification(jobId, JobStatus.PICKED_UP);

            expect(mockFirebaseMessaging.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    notification: {
                        title: 'Job Update',
                        body: 'Your mover has picked up your items!',
                    },
                })
            );
        } finally {
            mockNotificationService.sendJobStatusNotification = originalMock;
        }
    });

    // Mocked behavior: notificationService is unmocked and uses real implementation, jobModel.findById returns a mock job, userModel.findById returns a mock student with FCM token, Firebase messaging succeeds
    // Input: jobId and JobStatus.AWAITING_STUDENT_CONFIRMATION
    // Expected status code: N/A (direct service call)
    // Expected behavior: notification is sent with title "Your mover is here!" and body "Please meet your mover to begin the pickup."
    // Expected output: None (void function)
    test('should cover sendJobStatusNotification with AWAITING_STUDENT_CONFIRMATION status', async () => {
        jest.unmock('../../src/services/notification.service');
        const { notificationService: realNotificationService } = require('../../src/services/notification.service');

        const jobId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        const fcmToken = 'test-fcm-token-789';

        const mockJob = {
            _id: jobId,
            studentId: studentId,
            jobType: JobType.STORAGE,
        };

        const mockStudent = {
            _id: studentId,
            fcmToken: fcmToken,
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockUserModel.findById.mockResolvedValue(mockStudent as any);
        mockFirebaseMessaging.send.mockResolvedValue('success-message-id');

        const originalMock = mockNotificationService.sendJobStatusNotification;
        mockNotificationService.sendJobStatusNotification = realNotificationService.sendJobStatusNotification.bind(realNotificationService);

        try {
            await realNotificationService.sendJobStatusNotification(jobId, JobStatus.AWAITING_STUDENT_CONFIRMATION);

            expect(mockFirebaseMessaging.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    notification: {
                        title: 'Your mover is here!',
                        body: 'Please meet your mover to begin the pickup.',
                    },
                })
            );
        } finally {
            mockNotificationService.sendJobStatusNotification = originalMock;
        }
    });

    // Mocked behavior: notificationService is unmocked and uses real implementation, jobModel.findById returns a mock STORAGE job, userModel.findById returns a mock student with FCM token, Firebase messaging succeeds
    // Input: jobId and JobStatus.COMPLETED
    // Expected status code: N/A (direct service call)
    // Expected behavior: notification is sent with title "Delivery Update" and body "Your items have been moved to storage!"
    // Expected output: None (void function)
    test('should cover sendJobStatusNotification with COMPLETED status for STORAGE job', async () => {
        jest.unmock('../../src/services/notification.service');
        const { notificationService: realNotificationService } = require('../../src/services/notification.service');

        const jobId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        const fcmToken = 'test-fcm-token-storage';

        const mockJob = {
            _id: jobId,
            studentId: studentId,
            jobType: JobType.STORAGE,
        };

        const mockStudent = {
            _id: studentId,
            fcmToken: fcmToken,
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockUserModel.findById.mockResolvedValue(mockStudent as any);
        mockFirebaseMessaging.send.mockResolvedValue('success-message-id');

        const originalMock = mockNotificationService.sendJobStatusNotification;
        mockNotificationService.sendJobStatusNotification = realNotificationService.sendJobStatusNotification.bind(realNotificationService);

        try {
            await realNotificationService.sendJobStatusNotification(jobId, JobStatus.COMPLETED);

            expect(mockFirebaseMessaging.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    notification: {
                        title: 'Delivery Update',
                        body: 'Your items have been moved to storage!',
                    },
                })
            );
        } finally {
            mockNotificationService.sendJobStatusNotification = originalMock;
        }
    });

    // Mocked behavior: notificationService is unmocked and uses real implementation, jobModel.findById returns a mock RETURN job, userModel.findById returns a mock student with FCM token, Firebase messaging succeeds
    // Input: jobId and JobStatus.COMPLETED
    // Expected status code: N/A (direct service call)
    // Expected behavior: notification is sent with title "Delivery Update" and body "Your items have been returned to your address."
    // Expected output: None (void function)
    test('should cover sendJobStatusNotification with COMPLETED status for RETURN job', async () => {
        jest.unmock('../../src/services/notification.service');
        const { notificationService: realNotificationService } = require('../../src/services/notification.service');

        const jobId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        const fcmToken = 'test-fcm-token-return';

        const mockJob = {
            _id: jobId,
            studentId: studentId,
            jobType: JobType.RETURN,
        };

        const mockStudent = {
            _id: studentId,
            fcmToken: fcmToken,
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockUserModel.findById.mockResolvedValue(mockStudent as any);
        mockFirebaseMessaging.send.mockResolvedValue('success-message-id');

        const originalMock = mockNotificationService.sendJobStatusNotification;
        mockNotificationService.sendJobStatusNotification = realNotificationService.sendJobStatusNotification.bind(realNotificationService);

        try {
            await realNotificationService.sendJobStatusNotification(jobId, JobStatus.COMPLETED);

            expect(mockFirebaseMessaging.send).toHaveBeenCalledWith(
                expect.objectContaining({
                    notification: {
                        title: 'Delivery Update',
                        body: 'Your items have been returned to your address.',
                    },
                })
            );
        } finally {
            mockNotificationService.sendJobStatusNotification = originalMock;
        }
    });

    // Mocked behavior: notificationService is unmocked and uses real implementation, jobModel.findById returns null
    // Input: jobId and JobStatus.ACCEPTED
    // Expected status code: N/A (direct service call)
    // Expected behavior: job not found, early return, no notification sent
    // Expected output: None (void function)
    test('should cover sendJobStatusNotification when job not found', async () => {
        jest.unmock('../../src/services/notification.service');
        const { notificationService: realNotificationService } = require('../../src/services/notification.service');

        const jobId = new mongoose.Types.ObjectId();

        mockJobModel.findById.mockResolvedValue(null as any);

        const originalMock = mockNotificationService.sendJobStatusNotification;
        mockNotificationService.sendJobStatusNotification = realNotificationService.sendJobStatusNotification.bind(realNotificationService);

        try {
            await realNotificationService.sendJobStatusNotification(jobId, JobStatus.ACCEPTED);

            expect(mockJobModel.findById).toHaveBeenCalledWith(jobId);
            expect(mockUserModel.findById).not.toHaveBeenCalled();
            expect(mockFirebaseMessaging.send).not.toHaveBeenCalled();
        } finally {
            mockNotificationService.sendJobStatusNotification = originalMock;
        }
    });

    // Mocked behavior: notificationService is unmocked and uses real implementation, jobModel.findById returns a mock job, userModel.findById returns null
    // Input: jobId and JobStatus.ACCEPTED
    // Expected status code: N/A (direct service call)
    // Expected behavior: student not found, early return, no notification sent
    // Expected output: None (void function)
    test('should cover sendJobStatusNotification when student not found', async () => {
        jest.unmock('../../src/services/notification.service');
        const { notificationService: realNotificationService } = require('../../src/services/notification.service');

        const jobId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();

        const mockJob = {
            _id: jobId,
            studentId: studentId,
            jobType: JobType.STORAGE,
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockUserModel.findById.mockResolvedValue(null as any);

        const originalMock = mockNotificationService.sendJobStatusNotification;
        mockNotificationService.sendJobStatusNotification = realNotificationService.sendJobStatusNotification.bind(realNotificationService);

        try {
            await realNotificationService.sendJobStatusNotification(jobId, JobStatus.ACCEPTED);

            expect(mockJobModel.findById).toHaveBeenCalledWith(jobId);
            expect(mockUserModel.findById).toHaveBeenCalledWith(studentId);
            expect(mockFirebaseMessaging.send).not.toHaveBeenCalled();
        } finally {
            mockNotificationService.sendJobStatusNotification = originalMock;
        }
    });

    // Mocked behavior: notificationService is unmocked and uses real implementation, jobModel.findById returns a mock job, userModel.findById returns a mock student with null fcmToken
    // Input: jobId and JobStatus.ACCEPTED
    // Expected status code: N/A (direct service call)
    // Expected behavior: student has no FCM token, early return, no notification sent
    // Expected output: None (void function)
    test('should cover sendJobStatusNotification when student has no FCM token', async () => {
        jest.unmock('../../src/services/notification.service');
        const { notificationService: realNotificationService } = require('../../src/services/notification.service');

        const jobId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();

        const mockJob = {
            _id: jobId,
            studentId: studentId,
            jobType: JobType.STORAGE,
        };

        const mockStudent = {
            _id: studentId,
            fcmToken: null, // No FCM token
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockUserModel.findById.mockResolvedValue(mockStudent as any);

        const originalMock = mockNotificationService.sendJobStatusNotification;
        mockNotificationService.sendJobStatusNotification = realNotificationService.sendJobStatusNotification.bind(realNotificationService);

        try {
            await realNotificationService.sendJobStatusNotification(jobId, JobStatus.ACCEPTED);

            expect(mockJobModel.findById).toHaveBeenCalledWith(jobId);
            expect(mockUserModel.findById).toHaveBeenCalledWith(studentId);
            expect(mockFirebaseMessaging.send).not.toHaveBeenCalled();
        } finally {
            mockNotificationService.sendJobStatusNotification = originalMock;
        }
    });

    // Mocked behavior: notificationService is unmocked and uses real implementation, Firebase messaging.send succeeds
    // Input: notification payload with valid FCM token, title, body, and data
    // Expected status code: N/A (direct service call)
    // Expected behavior: notification is successfully sent via Firebase
    // Expected output: None (void function)
    test('should cover sendNotificationToDevice success path', async () => {
        jest.unmock('../../src/services/notification.service');
        const { notificationService: realNotificationService } = require('../../src/services/notification.service');

        const fcmToken = 'valid-fcm-token';
        const notificationPayload = {
            fcmToken: fcmToken,
            title: 'Test Title',
            body: 'Test Body',
            data: { jobId: '123', status: 'ACCEPTED' },
        };

        mockFirebaseMessaging.send.mockResolvedValue('success-message-id');

        await realNotificationService.sendNotificationToDevice(notificationPayload);

        expect(mockFirebaseMessaging.send).toHaveBeenCalledWith(
            expect.objectContaining({
                token: fcmToken,
                notification: {
                    title: 'Test Title',
                    body: 'Test Body',
                },
                data: notificationPayload.data,
            })
        );
    });

    // Mocked behavior: notificationService is unmocked and uses real implementation, Firebase messaging.send throws error with code 'messaging/registration-token-not-registered', userModel.clearInvalidFcmToken succeeds
    // Input: notification payload with invalid FCM token
    // Expected status code: N/A (direct service call)
    // Expected behavior: error is caught, invalid token is cleared from database
    // Expected output: None (void function)
    test('should cover sendNotificationToDevice with invalid token error (registration-token-not-registered)', async () => {
        jest.unmock('../../src/services/notification.service');
        const { notificationService: realNotificationService } = require('../../src/services/notification.service');

        const fcmToken = 'invalid-fcm-token';
        const notificationPayload = {
            fcmToken: fcmToken,
            title: 'Test Title',
            body: 'Test Body',
            data: {},
        };

        const error = {
            code: 'messaging/registration-token-not-registered',
            message: 'Token not registered',
        };

        mockFirebaseMessaging.send.mockRejectedValue(error);
        mockUserModel.clearInvalidFcmToken = jest.fn().mockResolvedValue(undefined);

        await realNotificationService.sendNotificationToDevice(notificationPayload);

        expect(mockFirebaseMessaging.send).toHaveBeenCalled();
        expect(mockUserModel.clearInvalidFcmToken).toHaveBeenCalledWith(fcmToken);
    });

    // Mocked behavior: notificationService is unmocked and uses real implementation, Firebase messaging.send throws error with code 'messaging/invalid-argument', userModel.clearInvalidFcmToken succeeds
    // Input: notification payload with invalid FCM token
    // Expected status code: N/A (direct service call)
    // Expected behavior: error is caught, invalid token is cleared from database
    // Expected output: None (void function)
    test('should cover sendNotificationToDevice with invalid argument error', async () => {
        jest.unmock('../../src/services/notification.service');
        const { notificationService: realNotificationService } = require('../../src/services/notification.service');

        const fcmToken = 'invalid-fcm-token';
        const notificationPayload = {
            fcmToken: fcmToken,
            title: 'Test Title',
            body: 'Test Body',
            data: {},
        };

        const error = {
            code: 'messaging/invalid-argument',
            message: 'Invalid argument',
        };

        mockFirebaseMessaging.send.mockRejectedValue(error);
        mockUserModel.clearInvalidFcmToken = jest.fn().mockResolvedValue(undefined);

        await realNotificationService.sendNotificationToDevice(notificationPayload);

        expect(mockFirebaseMessaging.send).toHaveBeenCalled();
        expect(mockUserModel.clearInvalidFcmToken).toHaveBeenCalledWith(fcmToken);
    });

    // Mocked behavior: notificationService is unmocked and uses real implementation, Firebase messaging.send throws error with code 'messaging/other-error' (not token-related)
    // Input: notification payload with valid FCM token
    // Expected status code: N/A (direct service call)
    // Expected behavior: error is caught and logged, token is not cleared
    // Expected output: None (void function)
    test('should cover sendNotificationToDevice with other error (not token-related)', async () => {
        jest.unmock('../../src/services/notification.service');
        const { notificationService: realNotificationService } = require('../../src/services/notification.service');

        const fcmToken = 'valid-fcm-token';
        const notificationPayload = {
            fcmToken: fcmToken,
            title: 'Test Title',
            body: 'Test Body',
            data: {},
        };

        const error = {
            code: 'messaging/other-error',
            message: 'Other error',
        };

        mockFirebaseMessaging.send.mockRejectedValue(error);

        await realNotificationService.sendNotificationToDevice(notificationPayload);

        expect(mockFirebaseMessaging.send).toHaveBeenCalled();
        expect(mockUserModel.clearInvalidFcmToken).not.toHaveBeenCalled();
    });

    // Mocked behavior: notificationService is unmocked and uses real implementation, Firebase messaging.send throws error with code 'messaging/registration-token-not-registered', userModel.clearInvalidFcmToken throws an error
    // Input: notification payload with invalid FCM token
    // Expected status code: N/A (direct service call)
    // Expected behavior: error is caught, clearInvalidFcmToken error is caught and logged
    // Expected output: None (void function)
    test('should cover sendNotificationToDevice when clearInvalidFcmToken fails', async () => {
        jest.unmock('../../src/services/notification.service');
        const { notificationService: realNotificationService } = require('../../src/services/notification.service');

        const fcmToken = 'invalid-fcm-token';
        const notificationPayload = {
            fcmToken: fcmToken,
            title: 'Test Title',
            body: 'Test Body',
            data: {},
        };

        const error = {
            code: 'messaging/registration-token-not-registered',
            message: 'Token not registered',
        };

        mockFirebaseMessaging.send.mockRejectedValue(error);
        mockUserModel.clearInvalidFcmToken = jest.fn().mockRejectedValue(new Error('Failed to clear token'));

        await realNotificationService.sendNotificationToDevice(notificationPayload);

        expect(mockFirebaseMessaging.send).toHaveBeenCalled();
        expect(mockUserModel.clearInvalidFcmToken).toHaveBeenCalledWith(fcmToken);
    });

    // Mocked behavior: notificationService is unmocked and uses real implementation, jobModel.findById throws an error
    // Input: jobId and JobStatus.ACCEPTED
    // Expected status code: N/A (direct service call)
    // Expected behavior: error is caught and logged, no notification sent
    // Expected output: None (void function)
    test('should cover sendJobStatusNotification catch block', async () => {
        jest.unmock('../../src/services/notification.service');
        const { notificationService: realNotificationService } = require('../../src/services/notification.service');

        const jobId = new mongoose.Types.ObjectId();

        mockJobModel.findById.mockRejectedValue(new Error('Database error'));

        const originalMock = mockNotificationService.sendJobStatusNotification;
        mockNotificationService.sendJobStatusNotification = realNotificationService.sendJobStatusNotification.bind(realNotificationService);

        try {
            // Should not throw, error is caught and logged
            await realNotificationService.sendJobStatusNotification(jobId, JobStatus.ACCEPTED);

            expect(mockJobModel.findById).toHaveBeenCalledWith(jobId);
        } finally {
            mockNotificationService.sendJobStatusNotification = originalMock;
        }
    });
});

describe('Route Handler Catch Blocks Coverage', () => {
    let originalMethods: any = {};

    beforeEach(() => {
        jest.clearAllMocks();
        // Restore original methods before each test
        if (Object.keys(originalMethods).length > 0) {
            const { JobController } = require('../../src/controllers/job.controller');
            Object.keys(originalMethods).forEach(method => {
                if (originalMethods[method]) {
                    JobController.prototype[method] = originalMethods[method];
                }
            });
            originalMethods = {};
        }
    });

    afterEach(() => {
        // Restore original methods after each test
        if (Object.keys(originalMethods).length > 0) {
            const { JobController } = require('../../src/controllers/job.controller');
            Object.keys(originalMethods).forEach(method => {
                if (originalMethods[method]) {
                    JobController.prototype[method] = originalMethods[method];
                }
            });
            originalMethods = {};
        }
    });

    // Mocked behavior: JobController.getAllJobs returns a rejected promise directly (bypassing controller try-catch)
    // Input: GET /api/jobs
    // Expected status code: 500
    // Expected behavior: route handler catch block (line 14) is executed
    // Expected output: error response
    test('should cover route handler catch block for getAllJobs (line 14)', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        originalMethods.getAllJobs = JobController.prototype.getAllJobs;
        
        JobController.prototype.getAllJobs = jest.fn().mockReturnValue(Promise.reject(new Error('Route handler catch test')));

        const response = await request(app)
            .get('/api/jobs')
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
    });

    // Mocked behavior: JobController.getAllAvailableJobs returns a rejected promise directly
    // Input: GET /api/jobs/available
    // Expected status code: 500
    // Expected behavior: route handler catch block (line 21) is executed
    // Expected output: error response
    test('should cover route handler catch block for getAllAvailableJobs (line 21)', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        originalMethods.getAllAvailableJobs = JobController.prototype.getAllAvailableJobs;
        
        JobController.prototype.getAllAvailableJobs = jest.fn().mockReturnValue(Promise.reject(new Error('Route handler catch test')));

        const response = await request(app)
            .get('/api/jobs/available')
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
    });

    // Mocked behavior: JobController.getMoverJobs returns a rejected promise directly
    // Input: GET /api/jobs/mover
    // Expected status code: 500
    // Expected behavior: route handler catch block (line 28) is executed
    // Expected output: error response
    test('should cover route handler catch block for getMoverJobs (line 28)', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        originalMethods.getMoverJobs = JobController.prototype.getMoverJobs;
        
        JobController.prototype.getMoverJobs = jest.fn().mockReturnValue(Promise.reject(new Error('Route handler catch test')));

        const response = await request(app)
            .get('/api/jobs/mover')
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
    });

    // Mocked behavior: JobController.getStudentJobs returns a rejected promise directly
    // Input: GET /api/jobs/student
    // Expected status code: 500
    // Expected behavior: route handler catch block (line 35) is executed
    // Expected output: error response
    test('should cover route handler catch block for getStudentJobs (line 35)', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        originalMethods.getStudentJobs = JobController.prototype.getStudentJobs;
        
        JobController.prototype.getStudentJobs = jest.fn().mockReturnValue(Promise.reject(new Error('Route handler catch test')));

        const response = await request(app)
            .get('/api/jobs/student')
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
    });

    // Mocked behavior: JobController.getJobById returns a rejected promise directly
    // Input: GET /api/jobs/:id
    // Expected status code: 500
    // Expected behavior: route handler catch block (line 42) is executed
    // Expected output: error response
    test('should cover route handler catch block for getJobById (line 42)', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        originalMethods.getJobById = JobController.prototype.getJobById;
        
        JobController.prototype.getJobById = jest.fn().mockReturnValue(Promise.reject(new Error('Route handler catch test')));

        const jobId = new mongoose.Types.ObjectId();
        const response = await request(app)
            .get(`/api/jobs/${jobId}`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
    });

    // Mocked behavior: JobController.createJob returns a rejected promise directly
    // Input: POST /api/jobs
    // Expected status code: 500
    // Expected behavior: route handler catch block (line 52) is executed
    // Expected output: error response
    test('should cover route handler catch block for createJob (line 52)', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        originalMethods.createJob = JobController.prototype.createJob;
        
        JobController.prototype.createJob = jest.fn().mockReturnValue(Promise.reject(new Error('Route handler catch test')));

        const reqData = {
            orderId: new mongoose.Types.ObjectId().toString(),
            studentId: new mongoose.Types.ObjectId().toString(),
            jobType: JobType.STORAGE,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
            scheduledTime: new Date().toISOString()
        };

        const response = await request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer fake-token`)
            .send(reqData);

        expect(response.status).toBeGreaterThanOrEqual(500);
    });

    // Mocked behavior: JobController.updateJobStatus returns a rejected promise directly
    // Input: PATCH /api/jobs/:id/status
    // Expected status code: 500
    // Expected behavior: route handler catch block (line 60) is executed
    // Expected output: error response
    test('should cover route handler catch block for updateJobStatus (line 60)', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        originalMethods.updateJobStatus = JobController.prototype.updateJobStatus;
        
        JobController.prototype.updateJobStatus = jest.fn().mockReturnValue(Promise.reject(new Error('Route handler catch test')));

        const jobId = new mongoose.Types.ObjectId();
        const response = await request(app)
            .patch(`/api/jobs/${jobId}/status`)
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.ACCEPTED });

        expect(response.status).toBeGreaterThanOrEqual(500);
    });

    // Mocked behavior: JobController.send_arrival_confirmation returns a rejected promise directly
    // Input: POST /api/jobs/:id/arrived
    // Expected status code: 500
    // Expected behavior: route handler catch block (line 69) is executed
    // Expected output: error response
    test('should cover route handler catch block for send_arrival_confirmation (line 69)', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        originalMethods.send_arrival_confirmation = JobController.prototype.send_arrival_confirmation;
        
        JobController.prototype.send_arrival_confirmation = jest.fn().mockReturnValue(Promise.reject(new Error('Route handler catch test')));

        const jobId = new mongoose.Types.ObjectId();
        const response = await request(app)
            .post(`/api/jobs/${jobId}/arrived`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
    });

    // Mocked behavior: JobController.confirmPickup returns a rejected promise directly
    // Input: POST /api/jobs/:id/confirm-pickup
    // Expected status code: 500
    // Expected behavior: route handler catch block (line 76) is executed
    // Expected output: error response
    test('should cover route handler catch block for confirmPickup (line 76)', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        originalMethods.confirmPickup = JobController.prototype.confirmPickup;
        
        JobController.prototype.confirmPickup = jest.fn().mockReturnValue(Promise.reject(new Error('Route handler catch test')));

        const jobId = new mongoose.Types.ObjectId();
        const response = await request(app)
            .post(`/api/jobs/${jobId}/confirm-pickup`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
    });

    // Mocked behavior: JobController.delivered returns a rejected promise directly
    // Input: POST /api/jobs/:id/delivered
    // Expected status code: 500
    // Expected behavior: route handler catch block (line 83) is executed
    // Expected output: error response
    test('should cover route handler catch block for delivered (line 83)', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        originalMethods.delivered = JobController.prototype.delivered;
        
        JobController.prototype.delivered = jest.fn().mockReturnValue(Promise.reject(new Error('Route handler catch test')));

        const jobId = new mongoose.Types.ObjectId();
        const response = await request(app)
            .post(`/api/jobs/${jobId}/delivered`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
    });

    // Mocked behavior: JobController.confirmDelivery returns a rejected promise directly
    // Input: POST /api/jobs/:id/confirm-delivery
    // Expected status code: 500
    // Expected behavior: route handler catch block (line 90) is executed
    // Expected output: error response
    test('should cover route handler catch block for confirmDelivery (line 90)', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        originalMethods.confirmDelivery = JobController.prototype.confirmDelivery;
        
        JobController.prototype.confirmDelivery = jest.fn().mockReturnValue(Promise.reject(new Error('Route handler catch test')));

        const jobId = new mongoose.Types.ObjectId();
        const response = await request(app)
            .post(`/api/jobs/${jobId}/confirm-delivery`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
    });
});


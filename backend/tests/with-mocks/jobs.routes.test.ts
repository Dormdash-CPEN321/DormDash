import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { JobStatus, JobType } from '../../src/types/job.type';
import { InternalServerError, JobNotFoundError } from '../../src/utils/errors.util';

// Mock the database connection to avoid actual DB connections in mock tests
jest.mock('../../src/config/database', () => ({
    connectDB: jest.fn(() => Promise.resolve()),
    disconnectDB: jest.fn(() => Promise.resolve()),
}));

// Mock the authentication middleware to allow any token
jest.mock('../../src/middleware/auth.middleware', () => ({
    authenticateToken: (req: any, res: any, next: any) => {
        // Mock user object for authenticated requests
        req.user = {
            _id: new (require('mongoose').Types.ObjectId)(),
            userRole: 'STUDENT',
        };
        next();
    },
}));

// Mock external dependencies - shared across all tests
const mockJobModel: any = {
    create: jest.fn(),
    findAllJobs: jest.fn(),
    findAvailableJobs: jest.fn(),
    findByMoverId: jest.fn(),
    findByStudentId: jest.fn(),
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

// Import app after mocking dependencies (but NOT the service itself)
import app from '../../src/app';

describe('POST /api/jobs', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

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

    test('should call next(err) when controller promise rejects', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const controllerProto = JobController.prototype;
        const originalMethod = controllerProto.createJob;

        controllerProto.createJob = jest.fn().mockRejectedValue(new Error('Controller error'));

        const response = await request(app)
            .post('/api/jobs')
            .set('Authorization', 'Bearer fake-token')
            .send({
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: JobType.STORAGE,
                volume: 10,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
            });

        expect(response.status).toBe(500);
        expect(controllerProto.createJob).toHaveBeenCalled();

        // Restore original method
        controllerProto.createJob = originalMethod;
    });

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

    test('should trigger catch block and call next(err) when createJob throws after validation', async () => {
        // This test covers the error handling in the catch block
        // Mock the controller to throw an error after validation passes
        const { JobController } = require('../../src/controllers/job.controller');
        const controllerProto = JobController.prototype;
        const originalMethod = controllerProto.createJob;

        // Mock createJob to throw an error, simulating a runtime error after validation
        controllerProto.createJob = jest.fn().mockImplementation(() => {
            return Promise.reject(new Error('Async error during job creation'));
        });

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

        // Should return 500 error from error handler
        expect(response.status).toBe(500);
        expect(controllerProto.createJob).toHaveBeenCalled();

        // Restore original method
        controllerProto.createJob = originalMethod;
    });
});

describe('GET /api/jobs', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should handle database error in getAllJobs (triggers controller catch block)', async () => {
        mockJobModel.findAllJobs.mockRejectedValue(new Error('Database query failed'));

        const response = await request(app)
            .get('/api/jobs')
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findAllJobs).toHaveBeenCalled();
    });

    test('should handle generic error in getAllJobs', async () => {
        mockJobModel.findAllJobs.mockRejectedValue(new Error('Unexpected error'));

        const response = await request(app)
            .get('/api/jobs')
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findAllJobs).toHaveBeenCalled();
    });

    test('should handle database error in getAllJobs ', async () => {
        mockJobModel.findAllJobs.mockRejectedValue(new Error('Database error') as any);

        const response = await request(app)
            .get('/api/jobs')
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findAllJobs).toHaveBeenCalled();
    });

    test('should call next(err) when controller promise rejects', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const controllerProto = JobController.prototype;
        const originalMethod = controllerProto.getAllJobs;

        controllerProto.getAllJobs = jest.fn().mockRejectedValue(new Error('Controller error'));

        const response = await request(app)
            .get('/api/jobs')
            .set('Authorization', 'Bearer fake-token');

        expect(response.status).toBe(500);
        expect(controllerProto.getAllJobs).toHaveBeenCalled();

        // Restore original method
        controllerProto.getAllJobs = originalMethod;
    });
});

describe('GET /api/jobs/available', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should handle database error in getAllAvailableJobs (triggers controller catch block)', async () => {
        mockJobModel.findAvailableJobs.mockRejectedValue(new Error('Failed to get available jobs'));

        const response = await request(app)
            .get('/api/jobs/available')
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findAvailableJobs).toHaveBeenCalled();
    });

    test('should handle database error', async () => {
        mockJobModel.findAvailableJobs.mockRejectedValue(new Error('Database error') as any);

        const response = await request(app)
            .get('/api/jobs/available')
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findAvailableJobs).toHaveBeenCalled();
    });

    test('should call next(err) when controller promise rejects', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const controllerProto = JobController.prototype;
        const originalMethod = controllerProto.getAllAvailableJobs;

        controllerProto.getAllAvailableJobs = jest.fn().mockRejectedValue(new Error('Controller error'));

        const response = await request(app)
            .get('/api/jobs/available')
            .set('Authorization', 'Bearer fake-token');

        expect(response.status).toBe(500);
        expect(controllerProto.getAllAvailableJobs).toHaveBeenCalled();

        // Restore original method
        controllerProto.getAllAvailableJobs = originalMethod;
    });
});

describe('GET /api/jobs/mover', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should handle database error in getMoverJobs (triggers controller catch block)', async () => {
        mockJobModel.findByMoverId.mockRejectedValue(new Error('Failed to get mover jobs'));

        const response = await request(app)
            .get('/api/jobs/mover')
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findByMoverId).toHaveBeenCalled();
    });

    test('should handle database error ', async () => {
        mockJobModel.findByMoverId.mockRejectedValue(new Error('Database error') as any);

        const response = await request(app)
            .get('/api/jobs/mover')
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findByMoverId).toHaveBeenCalled();
    });

    test('should call next(err) when controller promise rejects', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const controllerProto = JobController.prototype;
        const originalMethod = controllerProto.getMoverJobs;

        controllerProto.getMoverJobs = jest.fn().mockRejectedValue(new Error('Controller error'));

        const response = await request(app)
            .get('/api/jobs/mover')
            .set('Authorization', 'Bearer fake-token');

        expect(response.status).toBe(500);
        expect(controllerProto.getMoverJobs).toHaveBeenCalled();

        // Restore original method
        controllerProto.getMoverJobs = originalMethod;
    });

    test('should call next with error when user is not authenticated ', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());

        const mockReq: any = { user: undefined };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.getMoverJobs(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        const error = mockNext.mock.calls[0][0] as Error;
        expect(error.message).toBe('User not authenticated');
    });
});

describe('GET /api/jobs/student', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should handle database error in getStudentJobs (triggers controller catch block)', async () => {
        mockJobModel.findByStudentId.mockRejectedValue(new Error('Failed to get student jobs'));

        const response = await request(app)
            .get('/api/jobs/student')
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findByStudentId).toHaveBeenCalled();
    });

    test('should handle database error ', async () => {
        mockJobModel.findByStudentId.mockRejectedValue(new Error('Database error') as any);

        const response = await request(app)
            .get('/api/jobs/student')
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findByStudentId).toHaveBeenCalled();
    });

    test('should call next(err) when controller promise rejects', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const controllerProto = JobController.prototype;
        const originalMethod = controllerProto.getStudentJobs;

        controllerProto.getStudentJobs = jest.fn().mockRejectedValue(new Error('Controller error'));

        const response = await request(app)
            .get('/api/jobs/student')
            .set('Authorization', 'Bearer fake-token');

        expect(response.status).toBe(500);
        expect(controllerProto.getStudentJobs).toHaveBeenCalled();

        // Restore original method
        controllerProto.getStudentJobs = originalMethod;
    });

    test('should call next with error when user is not authenticated ', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());

        const mockReq: any = { user: undefined };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.getStudentJobs(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        const error = mockNext.mock.calls[0][0] as Error;
        expect(error.message).toBe('User not authenticated');
    });
});

describe('GET /api/jobs/:id', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should handle database error in getJobById (triggers controller catch block)', async () => {
        mockJobModel.findById.mockRejectedValue(new Error('Failed to get job'));

        const jobId = new mongoose.Types.ObjectId().toString();
        const response = await request(app)
            .get(`/api/jobs/${jobId}`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });

    test('should handle JobNotFoundError in getJobById', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        mockJobModel.findById.mockResolvedValue(null as any);

        const response = await request(app)
            .get(`/api/jobs/${jobId}`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBe(404);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });

    test('should call next(err) when controller promise rejects', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const controllerProto = JobController.prototype;
        const originalMethod = controllerProto.getJobById;

        controllerProto.getJobById = jest.fn().mockRejectedValue(new Error('Controller error'));

        const jobId = new mongoose.Types.ObjectId().toString();
        const response = await request(app)
            .get(`/api/jobs/${jobId}`)
            .set('Authorization', 'Bearer fake-token');

        expect(response.status).toBe(500);
        expect(controllerProto.getJobById).toHaveBeenCalled();

        // Restore original method
        controllerProto.getJobById = originalMethod;
    });

    // Test toJobResponse mapper coverage 
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

    // Test toJobResponse mapper with undefined moverId (covers moverId ternary branch)
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

    // Test toJobResponse mapper with string timestamps (covers date ternary branches)
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

    test('should handle missing jobId ', async () => {
        const response = await request(app)
            .patch('/api/jobs//status')
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.ACCEPTED });

        expect(response.status).toBeGreaterThanOrEqual(400);
    });

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

    test('should call next(err) when controller promise rejects', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const controllerProto = JobController.prototype;
        const originalMethod = controllerProto.updateJobStatus;

        controllerProto.updateJobStatus = jest.fn().mockRejectedValue(new Error('Controller error'));

        const jobId = new mongoose.Types.ObjectId().toString();
        const response = await request(app)
            .patch(`/api/jobs/${jobId}/status`)
            .set('Authorization', 'Bearer fake-token')
            .send({ status: JobStatus.ACCEPTED });

        expect(response.status).toBe(500);
        expect(controllerProto.updateJobStatus).toHaveBeenCalled();

        // Restore original method
        controllerProto.updateJobStatus = originalMethod;
    });

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

    test('should handle database error in requestPickupConfirmation (triggers controller catch block)', async () => {
        mockJobModel.findById.mockRejectedValue(new Error('Database error during pickup confirmation'));

        const jobId = new mongoose.Types.ObjectId().toString();
        const response = await request(app)
            .post(`/api/jobs/${jobId}/arrived`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });

    test('should handle JobNotFoundError in requestPickupConfirmation', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        mockJobModel.findById.mockResolvedValue(null as any);

        const response = await request(app)
            .post(`/api/jobs/${jobId}/arrived`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBe(404);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });

    test('should handle EventEmitter error', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const moverId = new mongoose.Types.ObjectId().toString();
        const orderId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: studentId,
            moverId: new mongoose.Types.ObjectId(moverId),
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
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);
        mockNotificationService.sendJobStatusNotification.mockResolvedValue(undefined as any);
        mockEventEmitter.emitJobUpdated.mockImplementation(() => {
            throw new Error('EventEmitter error');
        });

        // Should not throw, just log warning - request should succeed
        const response = await request(app)
            .post(`/api/jobs/${jobId}/arrived`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBe(200);
        expect(mockEventEmitter.emitJobUpdated).toHaveBeenCalled();
    });

    test('should call next(err) when controller promise rejects', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const controllerProto = JobController.prototype;
        const originalMethod = controllerProto.send_arrival_confirmation;

        controllerProto.send_arrival_confirmation = jest.fn().mockRejectedValue(new Error('Controller error'));

        const jobId = new mongoose.Types.ObjectId().toString();
        const response = await request(app)
            .post(`/api/jobs/${jobId}/arrived`)
            .set('Authorization', 'Bearer fake-token');

        expect(response.status).toBe(500);
        expect(controllerProto.send_arrival_confirmation).toHaveBeenCalled();

        // Restore original method
        controllerProto.send_arrival_confirmation = originalMethod;
    });

    test('should call next with error when user is not authenticated ', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());

        const jobId = new mongoose.Types.ObjectId().toString();
        const mockReq: any = { user: undefined, params: { id: jobId } };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.send_arrival_confirmation(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        const error = mockNext.mock.calls[0][0] as Error;
        expect(error.message).toBe('User not authenticated');
    });
});

describe('POST /api/jobs/:id/confirm-pickup', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should handle database error in confirmPickup (triggers controller catch block)', async () => {
        mockJobModel.findById.mockRejectedValue(new Error('Database error during pickup confirmation'));

        const jobId = new mongoose.Types.ObjectId().toString();
        const response = await request(app)
            .post(`/api/jobs/${jobId}/confirm-pickup`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });

    test('should handle JobNotFoundError in confirmPickup', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        mockJobModel.findById.mockResolvedValue(null as any);

        const response = await request(app)
            .post(`/api/jobs/${jobId}/confirm-pickup`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBe(404);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });

    test('should handle invalid orderId ', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId().toString();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: null, // Invalid orderId
            studentId: new mongoose.Types.ObjectId(studentId),
            jobType: JobType.STORAGE,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
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

        const response = await request(app)
            .post(`/api/jobs/${jobId}/confirm-pickup`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });

    test('should handle orderService error ', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId().toString();
        const orderId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: new mongoose.Types.ObjectId(studentId),
            jobType: JobType.STORAGE,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
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
        mockOrderService.updateOrderStatus.mockRejectedValue(new Error('Order service error') as any);

        const response = await request(app)
            .post(`/api/jobs/${jobId}/confirm-pickup`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockOrderService.updateOrderStatus).toHaveBeenCalled();
    });

    test('should handle EventEmitter error ', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId().toString();
        const orderId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: new mongoose.Types.ObjectId(studentId),
            jobType: JobType.STORAGE,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
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
        mockOrderService.updateOrderStatus.mockResolvedValue(undefined as any);
        mockEventEmitter.emitJobUpdated.mockImplementation(() => {
            throw new Error('EventEmitter error');
        });

        // Should not throw, just log warning - request should succeed
        const response = await request(app)
            .post(`/api/jobs/${jobId}/confirm-pickup`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBe(200);
        expect(mockEventEmitter.emitJobUpdated).toHaveBeenCalled();
    });

    test('should call next(err) when controller promise rejects', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const controllerProto = JobController.prototype;
        const originalMethod = controllerProto.confirmPickup;

        controllerProto.confirmPickup = jest.fn().mockRejectedValue(new Error('Controller error'));

        const jobId = new mongoose.Types.ObjectId().toString();
        const response = await request(app)
            .post(`/api/jobs/${jobId}/confirm-pickup`)
            .set('Authorization', 'Bearer fake-token');

        expect(response.status).toBe(500);
        expect(controllerProto.confirmPickup).toHaveBeenCalled();

        // Restore original method
        controllerProto.confirmPickup = originalMethod;
    });

    test('should call next with error when user is not authenticated ', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());

        const jobId = new mongoose.Types.ObjectId().toString();
        const mockReq: any = { user: undefined, params: { id: jobId } };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.confirmPickup(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        const error = mockNext.mock.calls[0][0] as Error;
        expect(error.message).toBe('User not authenticated');
    });
});

describe('POST /api/jobs/:id/delivered', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should handle database error in requestDeliveryConfirmation (triggers controller catch block)', async () => {
        mockJobModel.findById.mockRejectedValue(new Error('Database error during delivery confirmation'));

        const jobId = new mongoose.Types.ObjectId().toString();
        const response = await request(app)
            .post(`/api/jobs/${jobId}/delivered`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });

    test('should handle JobNotFoundError in requestDeliveryConfirmation', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        mockJobModel.findById.mockResolvedValue(null as any);

        const response = await request(app)
            .post(`/api/jobs/${jobId}/delivered`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBe(404);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });

    test('should handle EventEmitter error ', async () => {
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
            status: JobStatus.PICKED_UP,
            volume: 10,
            price: 50,
            pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
            dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
        };

        const mockUpdatedJob = {
            ...mockJob,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
        };

        mockJobModel.findById.mockResolvedValue(mockJob as any);
        mockJobModel.update.mockResolvedValue(mockUpdatedJob as any);
        mockNotificationService.sendJobStatusNotification.mockResolvedValue(undefined as any);
        mockEventEmitter.emitJobUpdated.mockImplementation(() => {
            throw new Error('EventEmitter error');
        });

        // Should not throw, just log warning - request should succeed
        const response = await request(app)
            .post(`/api/jobs/${jobId}/delivered`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBe(200);
        expect(mockEventEmitter.emitJobUpdated).toHaveBeenCalled();
    });

    test('should call next(err) when controller promise rejects', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const controllerProto = JobController.prototype;
        const originalMethod = controllerProto.delivered;

        controllerProto.delivered = jest.fn().mockRejectedValue(new Error('Controller error'));

        const jobId = new mongoose.Types.ObjectId().toString();
        const response = await request(app)
            .post(`/api/jobs/${jobId}/delivered`)
            .set('Authorization', 'Bearer fake-token');

        expect(response.status).toBe(500);
        expect(controllerProto.delivered).toHaveBeenCalled();

        // Restore original method
        controllerProto.delivered = originalMethod;
    });

    test('should call next with error when user is not authenticated ', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());

        const jobId = new mongoose.Types.ObjectId().toString();
        const mockReq: any = { user: undefined, params: { id: jobId } };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.delivered(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        const error = mockNext.mock.calls[0][0] as Error;
        expect(error.message).toBe('User not authenticated');
    });
});

describe('POST /api/jobs/:id/confirm-delivery', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should handle database error in confirmDelivery (triggers controller catch block)', async () => {
        mockJobModel.findById.mockRejectedValue(new Error('Database error during delivery confirmation'));

        const jobId = new mongoose.Types.ObjectId().toString();
        const response = await request(app)
            .post(`/api/jobs/${jobId}/confirm-delivery`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });

    test('should handle JobNotFoundError in confirmDelivery', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        mockJobModel.findById.mockResolvedValue(null as any);

        const response = await request(app)
            .post(`/api/jobs/${jobId}/confirm-delivery`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBe(404);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });

    test('should handle invalid orderId in confirmDelivery', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId().toString();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: null, // Invalid orderId
            studentId: new mongoose.Types.ObjectId(studentId),
            jobType: JobType.RETURN,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
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
        mockUserModel.findByIdAndUpdate.mockResolvedValue({} as any); // addCreditsToMover

        const response = await request(app)
            .post(`/api/jobs/${jobId}/confirm-delivery`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });

    test('should handle orderService error in confirmDelivery', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId().toString();
        const orderId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: new mongoose.Types.ObjectId(studentId),
            jobType: JobType.RETURN,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
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
        mockUserModel.findByIdAndUpdate.mockResolvedValue({} as any); // addCreditsToMover
        mockOrderService.updateOrderStatus.mockRejectedValue(new Error('Order service error') as any);

        const response = await request(app)
            .post(`/api/jobs/${jobId}/confirm-delivery`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockOrderService.updateOrderStatus).toHaveBeenCalled();
    });

    test('should handle EventEmitter error in confirmDelivery', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        const studentId = new mongoose.Types.ObjectId().toString();
        const orderId = new mongoose.Types.ObjectId();
        
        const mockJob = {
            _id: new mongoose.Types.ObjectId(jobId),
            orderId: orderId,
            studentId: new mongoose.Types.ObjectId(studentId),
            jobType: JobType.RETURN,
            status: JobStatus.AWAITING_STUDENT_CONFIRMATION,
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
        mockUserModel.findByIdAndUpdate.mockResolvedValue({} as any); // addCreditsToMover
        mockOrderService.updateOrderStatus.mockResolvedValue(undefined as any);
        mockEventEmitter.emitJobUpdated.mockImplementation(() => {
            throw new Error('EventEmitter error');
        });

        // Should not throw, just log warning - request should succeed
        const response = await request(app)
            .post(`/api/jobs/${jobId}/confirm-delivery`)
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBe(200);
        expect(mockEventEmitter.emitJobUpdated).toHaveBeenCalled();
    });

    test('should call next(err) when controller promise rejects', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const controllerProto = JobController.prototype;
        const originalMethod = controllerProto.confirmDelivery;

        controllerProto.confirmDelivery = jest.fn().mockRejectedValue(new Error('Controller error'));

        const jobId = new mongoose.Types.ObjectId().toString();
        const response = await request(app)
            .post(`/api/jobs/${jobId}/confirm-delivery`)
            .set('Authorization', 'Bearer fake-token');

        expect(response.status).toBe(500);
        expect(controllerProto.confirmDelivery).toHaveBeenCalled();

        // Restore original method
        controllerProto.confirmDelivery = originalMethod;
    });

    test('should call next with error when user is not authenticated ', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());

        const jobId = new mongoose.Types.ObjectId().toString();
        const mockReq: any = { user: undefined, params: { id: jobId } };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.confirmDelivery(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        const error = mockNext.mock.calls[0][0] as Error;
        expect(error.message).toBe('User not authenticated');
    });

    test('should successfully confirm delivery with notification and event emission ', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());
        
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

        const mockReq: any = {
            user: { _id: studentId, userRole: 'STUDENT' },
            params: { id: jobId }
        };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.confirmDelivery(mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(200);
        const jsonArg = mockRes.json.mock.calls[0][0];
        expect(jsonArg.success).toBe(true);
        expect(jsonArg.data.status).toBe(JobStatus.COMPLETED);
        expect(mockOrderService.updateOrderStatus).toHaveBeenCalledWith(
            orderId,
            expect.any(String),
            expect.any(String)
        );
        expect(mockUserModel.findById).toHaveBeenCalledWith(moverId);
        expect(mockEventEmitter.emitJobUpdated).toHaveBeenCalled();
    });

    test('should handle invalid orderId during confirmDelivery ', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());
        
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

        const mockReq: any = {
            user: { _id: studentId, userRole: 'STUDENT' },
            params: { id: jobId }
        };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.confirmDelivery(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    test('should handle orderService error in confirmDelivery', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());
        
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
        mockOrderService.updateOrderStatus.mockRejectedValue(new Error('Order update failed'));

        const mockReq: any = {
            user: { _id: studentId, userRole: 'STUDENT' },
            params: { id: jobId }
        };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.confirmDelivery(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        expect(mockOrderService.updateOrderStatus).toHaveBeenCalled();
    });

    test('should handle EventEmitter error gracefully during confirmDelivery ', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());
        
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

        const mockReq: any = {
            user: { _id: studentId, userRole: 'STUDENT' },
            params: { id: jobId }
        };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.confirmDelivery(mockReq, mockRes, mockNext);

        // Should still succeed despite emitter error
        expect(mockRes.status).toHaveBeenCalledWith(200);
        const jsonArg = mockRes.json.mock.calls[0][0];
        expect(jsonArg.success).toBe(true);
        expect(jsonArg.data.status).toBe(JobStatus.COMPLETED);
    });

    test('should return completed job details successfully ', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());
        
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

        const mockReq: any = {
            user: { _id: studentId, userRole: 'STUDENT' },
            params: { id: jobId }
        };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.confirmDelivery(mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(200);
        const jsonCall = mockRes.json.mock.calls[0][0];
        expect(jsonCall.success).toBe(true);
        expect(jsonCall.data).toHaveProperty('id');
        expect(jsonCall.data).toHaveProperty('status');
        expect(jsonCall.data.status).toBe(JobStatus.COMPLETED);
        expect(jsonCall.data.id).toBe(mockUpdatedJob._id.toString());
    });
});

describe('POST /api/jobs/:id/delivered - requestDeliveryConfirmation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should successfully request delivery confirmation with notification', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());
        
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

        const mockReq: any = {
            user: { _id: moverId, userRole: 'MOVER' },
            params: { id: jobId }
        };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.delivered(mockReq, mockRes, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(200);
        const jsonArg = mockRes.json.mock.calls[0][0];
        expect(jsonArg.success).toBe(true);
        expect(jsonArg.data.status).toBe(JobStatus.AWAITING_STUDENT_CONFIRMATION);
        expect(mockNotificationService.sendJobStatusNotification).toHaveBeenCalledWith(
            expect.any(mongoose.Types.ObjectId),
            JobStatus.AWAITING_STUDENT_CONFIRMATION
        );
        expect(mockEventEmitter.emitJobUpdated).toHaveBeenCalled();
    });

    test('should handle EventEmitter error gracefully in requestDeliveryConfirmation', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());
        
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

        const mockReq: any = {
            user: { _id: moverId, userRole: 'MOVER' },
            params: { id: jobId }
        };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.delivered(mockReq, mockRes, mockNext);

        // Should still succeed despite emitter error
        expect(mockRes.status).toHaveBeenCalledWith(200);
        const jsonArg = mockRes.json.mock.calls[0][0];
        expect(jsonArg.success).toBe(true);
        expect(jsonArg.data.status).toBe(JobStatus.AWAITING_STUDENT_CONFIRMATION);
    });

    test('should handle missing jobId in requestDeliveryConfirmation', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());
        
        const moverId = new mongoose.Types.ObjectId();

        const mockReq: any = {
            user: { _id: moverId, userRole: 'MOVER' },
            params: { id: '' }
        };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.delivered(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        const error = mockNext.mock.calls[0][0];
        expect(error.message).toContain('jobId and moverId are required');
    });

    test('should handle non-RETURN job type in requestDeliveryConfirmation', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());
        
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

        const mockReq: any = {
            user: { _id: moverId, userRole: 'MOVER' },
            params: { id: jobId }
        };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.delivered(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        const error = mockNext.mock.calls[0][0];
        expect(error.message).toContain('Delivery confirmation only valid for return jobs');
    });

    test('should handle wrong job status in requestDeliveryConfirmation', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());
        
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

        const mockReq: any = {
            user: { _id: moverId, userRole: 'MOVER' },
            params: { id: jobId }
        };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.delivered(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        const error = mockNext.mock.calls[0][0];
        expect(error.message).toContain('Job must be PICKED_UP');
    });
});

describe('POST /api/jobs/:id/confirm-delivery - Additional error cases', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should handle missing parameters in confirmDelivery', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());
        
        const studentId = new mongoose.Types.ObjectId();

        const mockReq: any = {
            user: { _id: studentId, userRole: 'STUDENT' },
            params: { id: '' } // Missing jobId
        };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.confirmDelivery(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        const error = mockNext.mock.calls[0][0];
        expect(error.message).toContain('jobId and studentId are required');
    });

    test('should handle non-RETURN job type in confirmDelivery', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());
        
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

        const mockReq: any = {
            user: { _id: studentId, userRole: 'STUDENT' },
            params: { id: jobId }
        };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.confirmDelivery(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        const error = mockNext.mock.calls[0][0];
        expect(error.message).toContain('Confirm delivery only valid for return jobs');
    });

    test('should handle wrong job status in confirmDelivery', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());
        
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

        const mockReq: any = {
            user: { _id: studentId, userRole: 'STUDENT' },
            params: { id: jobId }
        };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.confirmDelivery(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        const error = mockNext.mock.calls[0][0];
        expect(error.message).toContain('Job must be awaiting student confirmation');
    });

    test('should handle null updatedJob in confirmDelivery', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());
        
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
        mockJobModel.update.mockResolvedValue(null as any); // Return null
        mockUserModel.findById.mockResolvedValue({
            _id: moverId,
            userRole: 'MOVER',
            credits: 100,
        } as any);
        mockUserModel.update.mockResolvedValue({} as any);
        mockOrderService.updateOrderStatus.mockResolvedValue(undefined as any);

        const mockReq: any = {
            user: { _id: studentId, userRole: 'STUDENT' },
            params: { id: jobId }
        };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.confirmDelivery(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        const error = mockNext.mock.calls[0][0] as Error;
        // The error occurs when trying to extract orderId from null updatedJob
        expect(error.message).toContain('Invalid orderId');
    });
});

describe('POST /api/jobs/:id/arrived - requestPickupConfirmation error cases', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should handle missing parameters in requestPickupConfirmation', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());
        
        const moverId = new mongoose.Types.ObjectId();

        const mockReq: any = {
            user: { _id: moverId, userRole: 'MOVER' },
            params: { id: '' } // Missing jobId
        };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.send_arrival_confirmation(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        const error = mockNext.mock.calls[0][0];
        expect(error.message).toContain('jobId and moverId are required');
    });

    test('should handle non-STORAGE job type in requestPickupConfirmation', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());
        
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

        const mockReq: any = {
            user: { _id: moverId, userRole: 'MOVER' },
            params: { id: jobId }
        };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.send_arrival_confirmation(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        const error = mockNext.mock.calls[0][0];
        expect(error.message).toContain('Arrival confirmation only valid for storage jobs');
    });

    test('should handle wrong mover in requestPickupConfirmation', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());
        
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

        const mockReq: any = {
            user: { _id: moverId, userRole: 'MOVER' },
            params: { id: jobId }
        };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.send_arrival_confirmation(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        const error = mockNext.mock.calls[0][0];
        expect(error.message).toContain('Only assigned mover can request confirmation');
    });

    test('should handle wrong job status in requestPickupConfirmation', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());
        
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

        const mockReq: any = {
            user: { _id: moverId, userRole: 'MOVER' },
            params: { id: jobId }
        };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.send_arrival_confirmation(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        const error = mockNext.mock.calls[0][0];
        expect(error.message).toContain('Job must be ACCEPTED to request confirmation');
    });
});

describe('POST /api/jobs/:id/confirm-pickup - confirmPickup error cases', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should handle missing parameters in confirmPickup', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());
        
        const studentId = new mongoose.Types.ObjectId();

        const mockReq: any = {
            user: { _id: studentId, userRole: 'STUDENT' },
            params: { id: '' } // Missing jobId
        };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.confirmPickup(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        const error = mockNext.mock.calls[0][0];
        expect(error.message).toContain('jobId and studentId are required');
    });

    test('should handle non-STORAGE job type in confirmPickup', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());
        
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

        const mockReq: any = {
            user: { _id: studentId, userRole: 'STUDENT' },
            params: { id: jobId }
        };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.confirmPickup(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        const error = mockNext.mock.calls[0][0];
        expect(error.message).toContain('Confirm pickup only valid for storage jobs');
    });

    test('should handle wrong student in confirmPickup', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());
        
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

        const mockReq: any = {
            user: { _id: studentId, userRole: 'STUDENT' },
            params: { id: jobId }
        };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.confirmPickup(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        const error = mockNext.mock.calls[0][0];
        expect(error.message).toContain('Only the student can confirm pickup');
    });

    test('should handle wrong job status in confirmPickup', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());
        
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

        const mockReq: any = {
            user: { _id: studentId, userRole: 'STUDENT' },
            params: { id: jobId }
        };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.confirmPickup(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        const error = mockNext.mock.calls[0][0];
        expect(error.message).toContain('Job must be awaiting student confirmation');
    });

    test('should handle invalid orderId in confirmPickup', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());
        
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

        const mockReq: any = {
            user: { _id: studentId, userRole: 'STUDENT' },
            params: { id: jobId }
        };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.confirmPickup(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        const error = mockNext.mock.calls[0][0];
        expect(error.message).toContain('Invalid orderId');
    });

    test('should handle orderService error in confirmPickup', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());
        
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

        const mockReq: any = {
            user: { _id: studentId, userRole: 'STUDENT' },
            params: { id: jobId }
        };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.confirmPickup(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        expect(mockOrderService.updateOrderStatus).toHaveBeenCalled();
    });

    test('should handle EventEmitter error in confirmPickup', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());
        
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

        const mockReq: any = {
            user: { _id: studentId, userRole: 'STUDENT' },
            params: { id: jobId }
        };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.confirmPickup(mockReq, mockRes, mockNext);

        // Should still succeed despite emitter error
        expect(mockRes.status).toHaveBeenCalledWith(200);
        const jsonArg = mockRes.json.mock.calls[0][0];
        expect(jsonArg.success).toBe(true);
        expect(jsonArg.data.status).toBe(JobStatus.PICKED_UP);
    });

    test('should handle null updatedJob in confirmPickup', async () => {
        const { JobController } = require('../../src/controllers/job.controller');
        const { JobService } = require('../../src/services/job.service');
        const controller = new JobController(new JobService());
        
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
        mockJobModel.update.mockResolvedValue(null as any); // Return null
        mockOrderService.updateOrderStatus.mockResolvedValue(undefined as any);

        const mockReq: any = {
            user: { _id: studentId, userRole: 'STUDENT' },
            params: { id: jobId }
        };
        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        const mockNext = jest.fn();

        await controller.confirmPickup(mockReq, mockRes, mockNext);

        expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
        const error = mockNext.mock.calls[0][0] as Error;
        // The error occurs when trying to extract orderId from null updatedJob
        expect(error.message).toContain('Invalid orderId');
    });
});


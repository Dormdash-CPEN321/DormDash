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
};

const mockJobMapper: any = {
    toJobListItems: jest.fn((jobs: any) => jobs),
};

const mockUserModel: any = {
    findByIdAndUpdate: jest.fn(),
};

// Mock all external dependencies
jest.mock('../../src/models/job.model', () => ({
    jobModel: mockJobModel,
}));

jest.mock('../../src/services/order.service', () => ({
    orderService: mockOrderService,
}));

jest.mock('../../src/services/notification.service', () => ({
    notificationService: mockNotificationService,
}));

jest.mock('../../src/utils/eventEmitter.util', () => ({
    EventEmitter: mockEventEmitter,
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

    test('should handle database error in getAllJobs (lines 154-155)', async () => {
        mockJobModel.findAllJobs.mockRejectedValue(new Error('Database error') as any);

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

    test('should handle database error in getAllAvailableJobs (triggers controller catch block)', async () => {
        mockJobModel.findAvailableJobs.mockRejectedValue(new Error('Failed to get available jobs'));

        const response = await request(app)
            .get('/api/jobs/available')
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findAvailableJobs).toHaveBeenCalled();
    });

    test('should handle database error (lines 167-168)', async () => {
        mockJobModel.findAvailableJobs.mockRejectedValue(new Error('Database error') as any);

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

    test('should handle database error in getMoverJobs (triggers controller catch block)', async () => {
        mockJobModel.findByMoverId.mockRejectedValue(new Error('Failed to get mover jobs'));

        const response = await request(app)
            .get('/api/jobs/mover')
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findByMoverId).toHaveBeenCalled();
    });

    test('should handle database error (lines 180-181)', async () => {
        mockJobModel.findByMoverId.mockRejectedValue(new Error('Database error') as any);

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

    test('should handle database error in getStudentJobs (triggers controller catch block)', async () => {
        mockJobModel.findByStudentId.mockRejectedValue(new Error('Failed to get student jobs'));

        const response = await request(app)
            .get('/api/jobs/student')
            .set('Authorization', `Bearer fake-token`);

        expect(response.status).toBeGreaterThanOrEqual(500);
        expect(mockJobModel.findByStudentId).toHaveBeenCalled();
    });

    test('should handle database error (lines 193-194)', async () => {
        mockJobModel.findByStudentId.mockRejectedValue(new Error('Database error') as any);

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

    test('should handle missing jobId (lines 220-221)', async () => {
        const response = await request(app)
            .patch('/api/jobs//status')
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.ACCEPTED });

        expect(response.status).toBeGreaterThanOrEqual(400);
    });

    test('should handle missing status (lines 225-226)', async () => {
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

    test('should handle job not found (line 245)', async () => {
        const jobId = new mongoose.Types.ObjectId().toString();
        mockJobModel.findById.mockResolvedValue(null as any);

        const response = await request(app)
            .patch(`/api/jobs/${jobId}/status`)
            .set('Authorization', `Bearer fake-token`)
            .send({ status: JobStatus.ACCEPTED });

        expect(response.status).toBe(404);
        expect(mockJobModel.findById).toHaveBeenCalled();
    });

    test('should handle job already accepted (line 253)', async () => {
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

    test('should handle invalid orderId in ACCEPTED flow (lines 261-262)', async () => {
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

    test('should handle orderService error in ACCEPTED flow (lines 271-272)', async () => {
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

    test('should handle EventEmitter error in ACCEPTED flow (line 278)', async () => {
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

    test('should handle RETURN job PICKED_UP flow (lines 286-326)', async () => {
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

    test('should handle job not found in else branch (line 338)', async () => {
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

    test('should handle EventEmitter error in else branch (line 345)', async () => {
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

    test('should handle job not found in COMPLETED flow (line 353)', async () => {
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

    test('should handle invalid orderId in COMPLETED flow (lines 361-362)', async () => {
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

    test('should handle orderService error in COMPLETED flow (lines 384-385)', async () => {
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

    test('should handle EventEmitter error (line 440)', async () => {
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

    test('should handle invalid orderId (line 480)', async () => {
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

    test('should handle orderService error (lines 486-487)', async () => {
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

    test('should handle EventEmitter error (line 494)', async () => {
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

    test('should handle EventEmitter error (line 534)', async () => {
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

    test('should handle invalid orderId (line 577)', async () => {
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

    test('should handle orderService error (lines 583-584)', async () => {
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

    test('should handle EventEmitter error (line 591)', async () => {
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
});


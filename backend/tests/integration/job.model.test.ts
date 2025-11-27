import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { JobStatus, JobType } from '../../src/types/job.type';

// Mock the database connection to avoid actual DB connections in integration tests
jest.mock('../../src/config/database', () => ({
    connectDB: jest.fn(() => Promise.resolve()),
    disconnectDB: jest.fn(() => Promise.resolve()),
}));

// Mock job model for setup (will be unmocked in tests)
const mockJobModel = {
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findAvailableJobs: jest.fn(),
    findJobsByMoverId: jest.fn(),
    findJobsByStudentId: jest.fn(),
    tryAcceptJob: jest.fn(),
};

jest.mock('../../src/models/job.model', () => ({
    JobModel: jest.fn(() => mockJobModel),
    jobModel: mockJobModel,
}));

describe('JobModel Error Handling Coverage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // Mocked behavior: jobModel is unmocked, mongoose operations throw errors to trigger catch blocks
    // Input: POST /api/jobs with valid job data
    // Expected status code: 500
    // Expected behavior: jobModel.create catch block (lines 77-78) is executed
    // Expected output: error response
    test('should cover jobModel.create catch block (lines 77-78)', async () => {
        // Temporarily unmock jobModel to test actual error handling
        jest.unmock('../../src/models/job.model');
        jest.resetModules();
        
        // Clear mongoose model cache
        const mongoose = require('mongoose');
        if (mongoose.models && mongoose.models.Job) {
            delete mongoose.models.Job;
        }
        if (mongoose.modelSchemas && mongoose.modelSchemas.Job) {
            delete mongoose.modelSchemas.Job;
        }
        
        // Mock mongoose.model to return a model with create that throws
        const originalModel = mongoose.model;
        const mockModelInstance = {
            create: jest.fn().mockRejectedValue(new Error('Database error'))
        };
        mongoose.model = jest.fn(() => mockModelInstance);
        
        // Require fresh job model instance
        const { JobModel } = require('../../src/models/job.model');
        const realJobModel = new JobModel();

        try {
            // Test the method directly to trigger catch block
            const newJob = {
                _id: new mongoose.Types.ObjectId(),
                orderId: new mongoose.Types.ObjectId(),
                studentId: new mongoose.Types.ObjectId(),
                jobType: JobType.STORAGE,
                status: JobStatus.AVAILABLE,
                volume: 10,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            await expect(realJobModel.create(newJob as any)).rejects.toThrow('Failed to create job');
            expect(mockModelInstance.create).toHaveBeenCalled();
        } finally {
            mongoose.model = originalModel;
            jest.resetModules();
        }
    });

    // Mocked behavior: jobModel is unmocked, mongoose operations throw errors to trigger catch blocks
    // Input: GET /api/jobs/:id with valid job ID
    // Expected status code: 500
    // Expected behavior: jobModel.findById catch block (lines 87-88) is executed
    // Expected output: error response
    test('should cover jobModel.findById catch block (lines 87-88)', async () => {
        // Temporarily unmock jobModel to test actual error handling
        jest.unmock('../../src/models/job.model');
        jest.resetModules();
        
        // Clear mongoose model cache
        const mongoose = require('mongoose');
        if (mongoose.models && mongoose.models.Job) {
            delete mongoose.models.Job;
        }
        if (mongoose.modelSchemas && mongoose.modelSchemas.Job) {
            delete mongoose.modelSchemas.Job;
        }
        
        // Mock mongoose.model to return a model with findById that throws
        const originalModel = mongoose.model;
        const mockModelInstance = {
            findById: jest.fn().mockRejectedValue(new Error('Database error'))
        };
        mongoose.model = jest.fn(() => mockModelInstance);
        
        // Require fresh job model instance
        const { JobModel } = require('../../src/models/job.model');
        const realJobModel = new JobModel();

        try {
            // Test the method directly to trigger catch block
            const jobId = new mongoose.Types.ObjectId();
            await expect(realJobModel.findById(jobId)).rejects.toThrow('Failed to find job');
            expect(mockModelInstance.findById).toHaveBeenCalled();
        } finally {
            mongoose.model = originalModel;
            jest.resetModules();
        }
    });

    // Mocked behavior: jobModel is unmocked, mongoose operations throw errors to trigger catch blocks
    // Input: DELETE /api/order/cancel-order (which calls cancelJobsForOrder -> findByOrderId)
    // Expected status code: 500
    // Expected behavior: jobModel.findByOrderId catch block (lines 97-98) is executed
    // Expected output: error response
    test('should cover jobModel.findByOrderId catch block (lines 97-98)', async () => {
        // Temporarily unmock jobModel to test actual error handling
        jest.unmock('../../src/models/job.model');
        jest.resetModules();
        
        // Clear mongoose model cache
        const mongoose = require('mongoose');
        if (mongoose.models && mongoose.models.Job) {
            delete mongoose.models.Job;
        }
        if (mongoose.modelSchemas && mongoose.modelSchemas.Job) {
            delete mongoose.modelSchemas.Job;
        }
        
        // Mock mongoose.model to return a model with find that throws
        const originalModel = mongoose.model;
        const mockModelInstance = {
            find: jest.fn().mockRejectedValue(new Error('Database error'))
        };
        mongoose.model = jest.fn(() => mockModelInstance);
        
        // Require fresh job model instance
        const { JobModel } = require('../../src/models/job.model');
        const realJobModel = new JobModel();

        try {
            // Test the method directly to trigger catch block
            const orderId = new mongoose.Types.ObjectId();
            await expect(realJobModel.findByOrderId(orderId)).rejects.toThrow('Failed to find jobs');
            expect(mockModelInstance.find).toHaveBeenCalled();
        } finally {
            mongoose.model = originalModel;
            jest.resetModules();
        }
    });

    // Mocked behavior: jobModel is unmocked, mongoose operations throw errors to trigger catch blocks
    // Input: GET /api/jobs/available
    // Expected status code: 500
    // Expected behavior: jobModel.findAvailableJobs catch block (lines 108-109) is executed
    // Expected output: error response
    test('should cover jobModel.findAvailableJobs catch block (lines 108-109)', async () => {
        // Temporarily unmock jobModel to test actual error handling
        jest.unmock('../../src/models/job.model');
        jest.resetModules();
        
        // Clear mongoose model cache
        const mongoose = require('mongoose');
        if (mongoose.models && mongoose.models.Job) {
            delete mongoose.models.Job;
        }
        if (mongoose.modelSchemas && mongoose.modelSchemas.Job) {
            delete mongoose.modelSchemas.Job;
        }
        
        // Mock mongoose.model to return a model with find that throws
        const originalModel = mongoose.model;
        const mockModelInstance = {
            find: jest.fn().mockRejectedValue(new Error('Database error'))
        };
        mongoose.model = jest.fn(() => mockModelInstance);
        
        // Require fresh job model instance that will use our mocked mongoose model
        const { JobModel } = require('../../src/models/job.model');
        const realJobModel = new JobModel();
        
        // Access private job property to verify it's using our mock
        const privateJob = (realJobModel as any).job;

        try {
            // Test the method directly to trigger catch block
            await expect(realJobModel.findAvailableJobs()).rejects.toThrow('Failed to find available jobs');
            expect(mockModelInstance.find).toHaveBeenCalled();
        } finally {
            mongoose.model = originalModel;
            jest.resetModules();
        }
    });

    // Mocked behavior: jobModel is unmocked, mongoose operations throw errors to trigger catch blocks
    // Input: GET /api/jobs
    // Expected status code: 500
    // Expected behavior: jobModel.findAllJobs catch block (lines 117-118) is executed
    // Expected output: error response
    test('should cover jobModel.findAllJobs catch block (lines 117-118)', async () => {
        // Temporarily unmock jobModel to test actual error handling
        jest.unmock('../../src/models/job.model');
        jest.resetModules();
        
        // Clear mongoose model cache
        const mongoose = require('mongoose');
        if (mongoose.models && mongoose.models.Job) {
            delete mongoose.models.Job;
        }
        if (mongoose.modelSchemas && mongoose.modelSchemas.Job) {
            delete mongoose.modelSchemas.Job;
        }
        
        // Mock mongoose.model to return a model with find that throws
        const originalModel = mongoose.model;
        const mockModelInstance = {
            find: jest.fn().mockRejectedValue(new Error('Database error'))
        };
        mongoose.model = jest.fn(() => mockModelInstance);
        
        // Require fresh job model instance
        const { JobModel } = require('../../src/models/job.model');
        const realJobModel = new JobModel();

        try {
            // Test the method directly to trigger catch block
            await expect(realJobModel.findAllJobs()).rejects.toThrow('Failed to find all jobs');
            expect(mockModelInstance.find).toHaveBeenCalled();
        } finally {
            mongoose.model = originalModel;
            jest.resetModules();
        }
    });

    // Mocked behavior: jobModel is unmocked, mongoose operations throw errors to trigger catch blocks
    // Input: GET /api/jobs/mover
    // Expected status code: 500
    // Expected behavior: jobModel.findByMoverId catch block (lines 126-127) is executed
    // Expected output: error response
    test('should cover jobModel.findByMoverId catch block (lines 126-127)', async () => {
        // Temporarily unmock jobModel to test actual error handling
        jest.unmock('../../src/models/job.model');
        jest.resetModules();
        
        // Clear mongoose model cache
        const mongoose = require('mongoose');
        if (mongoose.models && mongoose.models.Job) {
            delete mongoose.models.Job;
        }
        if (mongoose.modelSchemas && mongoose.modelSchemas.Job) {
            delete mongoose.modelSchemas.Job;
        }
        
        // Mock mongoose.model to return a model with find that throws
        const originalModel = mongoose.model;
        const mockModelInstance = {
            find: jest.fn().mockRejectedValue(new Error('Database error'))
        };
        mongoose.model = jest.fn(() => mockModelInstance);
        
        // Require fresh job model instance
        const { JobModel } = require('../../src/models/job.model');
        const realJobModel = new JobModel();

        try {
            // Test the method directly to trigger catch block
            const moverId = new mongoose.Types.ObjectId();
            await expect(realJobModel.findByMoverId(moverId)).rejects.toThrow('Failed to find mover jobs');
            expect(mockModelInstance.find).toHaveBeenCalled();
        } finally {
            mongoose.model = originalModel;
            jest.resetModules();
        }
    });

    // Mocked behavior: jobModel is unmocked, mongoose operations throw errors to trigger catch blocks
    // Input: GET /api/jobs/student
    // Expected status code: 500
    // Expected behavior: jobModel.findByStudentId catch block (lines 135-136) is executed
    // Expected output: error response
    test('should cover jobModel.findByStudentId catch block (lines 135-136)', async () => {
        // Temporarily unmock jobModel to test actual error handling
        jest.unmock('../../src/models/job.model');
        jest.resetModules();
        
        // Clear mongoose model cache
        const mongoose = require('mongoose');
        if (mongoose.models && mongoose.models.Job) {
            delete mongoose.models.Job;
        }
        if (mongoose.modelSchemas && mongoose.modelSchemas.Job) {
            delete mongoose.modelSchemas.Job;
        }
        
        // Mock mongoose.model to return a model with find that throws
        const originalModel = mongoose.model;
        const mockModelInstance = {
            find: jest.fn().mockRejectedValue(new Error('Database error'))
        };
        mongoose.model = jest.fn(() => mockModelInstance);
        
        // Require fresh job model instance
        const { JobModel } = require('../../src/models/job.model');
        const realJobModel = new JobModel();

        try {
            // Test the method directly to trigger catch block
            const studentId = new mongoose.Types.ObjectId();
            await expect(realJobModel.findByStudentId(studentId)).rejects.toThrow('Failed to find student jobs');
            expect(mockModelInstance.find).toHaveBeenCalled();
        } finally {
            mongoose.model = originalModel;
            jest.resetModules();
        }
    });

    // Mocked behavior: jobModel is unmocked, mongoose operations throw errors to trigger catch blocks
    // Input: PATCH /api/jobs/:id/status
    // Expected status code: 500
    // Expected behavior: jobModel.update catch block (lines 147-148) is executed
    // Expected output: error response
    test('should cover jobModel.update catch block (lines 147-148)', async () => {
        // Temporarily unmock jobModel to test actual error handling
        jest.unmock('../../src/models/job.model');
        jest.resetModules();
        
        // Clear mongoose model cache
        const mongoose = require('mongoose');
        if (mongoose.models && mongoose.models.Job) {
            delete mongoose.models.Job;
        }
        if (mongoose.modelSchemas && mongoose.modelSchemas.Job) {
            delete mongoose.modelSchemas.Job;
        }
        
        // Mock mongoose.model to return a model with findByIdAndUpdate that throws
        const originalModel = mongoose.model;
        const mockModelInstance = {
            findByIdAndUpdate: jest.fn().mockRejectedValue(new Error('Database error'))
        };
        mongoose.model = jest.fn(() => mockModelInstance);
        
        // Require fresh job model instance
        const { JobModel } = require('../../src/models/job.model');
        const realJobModel = new JobModel();

        try {
            // Test the method directly to trigger catch block
            const jobId = new mongoose.Types.ObjectId();
            await expect(realJobModel.update(jobId, { status: JobStatus.ACCEPTED })).rejects.toThrow('Failed to update job');
            expect(mockModelInstance.findByIdAndUpdate).toHaveBeenCalled();
        } finally {
            mongoose.model = originalModel;
            jest.resetModules();
        }
    });

    // Mocked behavior: jobModel is unmocked, mongoose operations throw errors to trigger catch blocks
    // Input: PATCH /api/jobs/:id/status with status ACCEPTED
    // Expected status code: 500
    // Expected behavior: jobModel.tryAcceptJob catch block (lines 171-172) is executed
    // Expected output: error response
    test('should cover jobModel.tryAcceptJob catch block (lines 171-172)', async () => {
        // Temporarily unmock jobModel to test actual error handling
        jest.unmock('../../src/models/job.model');
        jest.resetModules();
        
        // Clear mongoose model cache
        const mongoose = require('mongoose');
        if (mongoose.models && mongoose.models.Job) {
            delete mongoose.models.Job;
        }
        if (mongoose.modelSchemas && mongoose.modelSchemas.Job) {
            delete mongoose.modelSchemas.Job;
        }
        
        // Mock mongoose.model to return a model with findOneAndUpdate that throws
        const originalModel = mongoose.model;
        const mockModelInstance = {
            findOneAndUpdate: jest.fn().mockRejectedValue(new Error('Database error'))
        };
        mongoose.model = jest.fn(() => mockModelInstance);
        
        // Require fresh job model instance
        const { JobModel } = require('../../src/models/job.model');
        const realJobModel = new JobModel();

        try {
            // Test the method directly to trigger catch block
            const jobId = new mongoose.Types.ObjectId();
            const moverId = new mongoose.Types.ObjectId();
            await expect(realJobModel.tryAcceptJob(jobId, moverId)).rejects.toThrow('Failed to accept job');
            expect(mockModelInstance.findOneAndUpdate).toHaveBeenCalled();
        } finally {
            mongoose.model = originalModel;
            jest.resetModules();
        }
    });

    // Mocked behavior: jobModel is unmocked, mongoose operations throw errors to trigger catch blocks
    // Input: Direct call to jobModel.delete
    // Expected status code: N/A (direct model call)
    // Expected behavior: jobModel.delete catch block (lines 180-181) is executed
    // Expected output: error thrown
    test('should cover jobModel.delete catch block (lines 180-181)', async () => {
        // Temporarily unmock jobModel to test actual error handling
        jest.unmock('../../src/models/job.model');
        jest.resetModules();
        
        // Clear mongoose model cache
        const mongoose = require('mongoose');
        if (mongoose.models && mongoose.models.Job) {
            delete mongoose.models.Job;
        }
        if (mongoose.modelSchemas && mongoose.modelSchemas.Job) {
            delete mongoose.modelSchemas.Job;
        }
        
        // Mock mongoose.model to return a model with deleteMany that throws
        const originalModel = mongoose.model;
        const mockModelInstance = {
            deleteMany: jest.fn().mockRejectedValue(new Error('Database error'))
        };
        mongoose.model = jest.fn(() => mockModelInstance);
        
        // Require fresh job model instance
        const { JobModel } = require('../../src/models/job.model');
        const realJobModel = new JobModel();

        try {
            // jobModel.delete is not directly exposed via HTTP, so we test it directly
            await expect(realJobModel.delete({})).rejects.toThrow('Failed to delete jobs');
            expect(mockModelInstance.deleteMany).toHaveBeenCalled();
        } finally {
            mongoose.model = originalModel;
            jest.resetModules();
        }
    });
});

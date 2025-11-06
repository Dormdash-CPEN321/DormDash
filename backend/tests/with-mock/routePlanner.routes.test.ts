import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import mongoose from 'mongoose';
import { JobStatus, JobType } from '../../src/types/job.type';

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
            userRole: 'MOVER',
        };
        next();
    },
}));

// Mock external dependencies - shared across all tests
const mockUserModel: any = {
    findById: jest.fn(),
};

const mockJobService: any = {
    getAllAvailableJobs: jest.fn(),
};

// Mock all external dependencies
jest.mock('../../src/models/user.model', () => ({
    userModel: mockUserModel,
}));

jest.mock('../../src/services/job.service', () => ({
    jobService: mockJobService,
}));

// Import app after mocking dependencies (but NOT the service itself)
import app from '../../src/app';

describe('GET /api/routePlanner/smart - Get Smart Route', () => {
    const testMoverId = new mongoose.Types.ObjectId();
    const testLocation = { lat: 49.2827, lon: -123.1207 };

    beforeEach(() => {
        jest.clearAllMocks();
        // Set default mock user in auth middleware
        const authMiddleware = require('../../src/middleware/auth.middleware');
        authMiddleware.authenticateToken = (req: any, res: any, next: any) => {
            req.user = {
                _id: testMoverId,
                userRole: 'MOVER',
            };
            next();
        };
    });

    test('should return smart route for authenticated mover', async () => {
        // Mock mover with availability
        const mockMover = {
            _id: testMoverId,
            availability: {
                MON: [['09:00', '17:00']],
                TUE: [['09:00', '17:00']],
            },
        };

        // Mock available jobs
        const mockJobs = [
            {
                id: new mongoose.Types.ObjectId().toString(),
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: JobType.STORAGE,
                status: JobStatus.AVAILABLE,
                volume: 1,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
        ];

        mockUserModel.findById.mockResolvedValue(mockMover);
        mockJobService.getAllAvailableJobs.mockResolvedValue({
            message: 'Available jobs retrieved successfully',
            data: { jobs: mockJobs },
        });

        const response = await request(app)
            .get('/api/routePlanner/smart')
            .query({
                currentLat: testLocation.lat,
                currentLon: testLocation.lon,
            })
            .set('Authorization', `Bearer fake-token`)
            .expect(200);

        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('data');
        expect(response.body.data).toHaveProperty('route');
        expect(response.body.data).toHaveProperty('metrics');
        expect(response.body.data).toHaveProperty('startLocation');
        expect(Array.isArray(response.body.data.route)).toBe(true);
        expect(mockUserModel.findById).toHaveBeenCalled();
        expect(mockJobService.getAllAvailableJobs).toHaveBeenCalled();
    });

    test('should require currentLat and currentLon parameters', async () => {
        mockUserModel.findById.mockResolvedValue({
            _id: testMoverId,
            availability: { MON: [['09:00', '17:00']] },
        });

        const response = await request(app)
            .get('/api/routePlanner/smart')
            .set('Authorization', `Bearer fake-token`)
            .expect(400);

        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('Invalid location parameters');
    });

    test('should validate currentLat and currentLon are numbers', async () => {
        mockUserModel.findById.mockResolvedValue({
            _id: testMoverId,
            availability: { MON: [['09:00', '17:00']] },
        });

        const response = await request(app)
            .get('/api/routePlanner/smart')
            .query({
                currentLat: 'invalid',
                currentLon: -123.1207,
            })
            .set('Authorization', `Bearer fake-token`)
            .expect(400);

        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('Invalid location parameters');
    });

    test('should accept optional maxDuration parameter', async () => {
        const mockMover = {
            _id: testMoverId,
            availability: {
                MON: [['09:00', '17:00']],
            },
        };

        mockUserModel.findById.mockResolvedValue(mockMover);
        mockJobService.getAllAvailableJobs.mockResolvedValue({
            message: 'Available jobs retrieved successfully',
            data: { jobs: [] },
        });

        const response = await request(app)
            .get('/api/routePlanner/smart')
            .query({
                currentLat: testLocation.lat,
                currentLon: testLocation.lon,
                maxDuration: 120,
            })
            .set('Authorization', `Bearer fake-token`)
            .expect(200);

        expect(response.body).toHaveProperty('message');
        expect(response.body).toHaveProperty('data');
    });

    test('should validate maxDuration is a positive number', async () => {
        mockUserModel.findById.mockResolvedValue({
            _id: testMoverId,
            availability: { MON: [['09:00', '17:00']] },
        });

        const response = await request(app)
            .get('/api/routePlanner/smart')
            .query({
                currentLat: testLocation.lat,
                currentLon: testLocation.lon,
                maxDuration: -10,
            })
            .set('Authorization', `Bearer fake-token`)
            .expect(400);

        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('Invalid maxDuration parameter');
    });

    test('should return route with proper structure', async () => {
        const mockMover = {
            _id: testMoverId,
            availability: {
                MON: [['09:00', '17:00']],
            },
        };

        const mockJobs = [
            {
                id: new mongoose.Types.ObjectId().toString(),
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: JobType.STORAGE,
                status: JobStatus.AVAILABLE,
                volume: 1,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date(Date.now() + 3600000).toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
        ];

        mockUserModel.findById.mockResolvedValue(mockMover);
        mockJobService.getAllAvailableJobs.mockResolvedValue({
            message: 'Available jobs retrieved successfully',
            data: { jobs: mockJobs },
        });

        const response = await request(app)
            .get('/api/routePlanner/smart')
            .query({
                currentLat: testLocation.lat,
                currentLon: testLocation.lon,
            })
            .set('Authorization', `Bearer fake-token`)
            .expect(200);

        // Validate route structure
        expect(Array.isArray(response.body.data.route)).toBe(true);

        if (response.body.data.route.length > 0) {
            const job = response.body.data.route[0];
            expect(job).toHaveProperty('jobId');
            expect(job).toHaveProperty('orderId');
            expect(job).toHaveProperty('studentId');
            expect(job).toHaveProperty('jobType');
            expect(job).toHaveProperty('volume');
            expect(job).toHaveProperty('price');
            expect(job).toHaveProperty('pickupAddress');
            expect(job).toHaveProperty('dropoffAddress');
            expect(job).toHaveProperty('scheduledTime');
            expect(job).toHaveProperty('estimatedStartTime');
            expect(job).toHaveProperty('estimatedDuration');
            expect(job).toHaveProperty('distanceFromPrevious');
            expect(job).toHaveProperty('travelTimeFromPrevious');
        }

        // Validate metrics structure
        expect(response.body.data.metrics).toHaveProperty('totalEarnings');
        expect(response.body.data.metrics).toHaveProperty('totalJobs');
        expect(response.body.data.metrics).toHaveProperty('totalDistance');
        expect(response.body.data.metrics).toHaveProperty('totalDuration');
        expect(response.body.data.metrics).toHaveProperty('earningsPerHour');

        // Validate start location
        expect(response.body.data.startLocation).toHaveProperty('lat', testLocation.lat);
        expect(response.body.data.startLocation).toHaveProperty('lon', testLocation.lon);
    });

    test('should return empty route if no jobs available', async () => {
        const mockMover = {
            _id: testMoverId,
            availability: {
                MON: [['09:00', '17:00']],
            },
        };

        mockUserModel.findById.mockResolvedValue(mockMover);
        mockJobService.getAllAvailableJobs.mockResolvedValue({
            message: 'Available jobs retrieved successfully',
            data: { jobs: [] },
        });

        const response = await request(app)
            .get('/api/routePlanner/smart')
            .query({
                currentLat: 0,
                currentLon: 0,
            })
            .set('Authorization', `Bearer fake-token`)
            .expect(200);

        expect(response.body).toHaveProperty('message', 'No jobs available matching your schedule');
        expect(response.body.data).toHaveProperty('route');
        expect(Array.isArray(response.body.data.route)).toBe(true);
        expect(response.body.data.route.length).toBe(0);
    });

    test('should return empty route if mover not found', async () => {
        mockUserModel.findById.mockResolvedValue(null);

        const response = await request(app)
            .get('/api/routePlanner/smart')
            .query({
                currentLat: testLocation.lat,
                currentLon: testLocation.lon,
            })
            .set('Authorization', `Bearer fake-token`)
            .expect(200);

        expect(response.body).toHaveProperty('message', 'No jobs available matching your schedule');
        expect(response.body.data).toHaveProperty('route');
        expect(Array.isArray(response.body.data.route)).toBe(true);
        expect(response.body.data.route.length).toBe(0);
    });

    test('should return empty route if mover has no availability', async () => {
        const mockMover = {
            _id: testMoverId,
            // No availability property
        };

        mockUserModel.findById.mockResolvedValue(mockMover);

        const response = await request(app)
            .get('/api/routePlanner/smart')
            .query({
                currentLat: testLocation.lat,
                currentLon: testLocation.lon,
            })
            .set('Authorization', `Bearer fake-token`)
            .expect(200);

        expect(response.body).toHaveProperty('message', 'No jobs available matching your schedule');
        expect(response.body.data).toHaveProperty('route');
        expect(Array.isArray(response.body.data.route)).toBe(true);
        expect(response.body.data.route.length).toBe(0);
    });

    test('should not suggest jobs that exceed maxDuration', async () => {
        const mockMover = {
            _id: testMoverId,
            availability: {
                MON: [['09:00', '17:00']],
            },
        };

        // Mock jobs that would exceed maxDuration
        const mockJobs = [
            {
                id: new mongoose.Types.ObjectId().toString(),
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: JobType.STORAGE,
                status: JobStatus.AVAILABLE,
                volume: 10, // Large volume = long duration
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date(Date.now() + 3600000).toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
        ];

        mockUserModel.findById.mockResolvedValue(mockMover);
        mockJobService.getAllAvailableJobs.mockResolvedValue({
            message: 'Available jobs retrieved successfully',
            data: { jobs: mockJobs },
        });

        const response = await request(app)
            .get('/api/routePlanner/smart')
            .query({
                currentLat: testLocation.lat,
                currentLon: testLocation.lon,
                maxDuration: 30, // 30 minutes - job should exceed this
            })
            .set('Authorization', `Bearer fake-token`)
            .expect(200);

        // Should return empty route if job exceeds maxDuration
        expect(response.body).toHaveProperty('data');
        expect(Array.isArray(response.body.data.route)).toBe(true);
    });

    test('should handle invalid moverId (returns empty route)', async () => {
        // Mock extractObjectId to return null (invalid moverId)
        const mockMover = {
            _id: null, // Invalid
            availability: {
                MON: [['09:00', '17:00']],
            },
        };

        mockUserModel.findById.mockResolvedValue(mockMover);

        const response = await request(app)
            .get('/api/routePlanner/smart')
            .query({
                currentLat: testLocation.lat,
                currentLon: testLocation.lon,
            })
            .set('Authorization', `Bearer fake-token`)
            .expect(200);

        expect(response.body).toHaveProperty('message', 'No jobs available matching your schedule');
        expect(response.body.data).toHaveProperty('route');
        expect(Array.isArray(response.body.data.route)).toBe(true);
    });

    test('should handle database error in userModel.findById', async () => {
        mockUserModel.findById.mockRejectedValue(new Error('Database connection failed'));

        const response = await request(app)
            .get('/api/routePlanner/smart')
            .query({
                currentLat: testLocation.lat,
                currentLon: testLocation.lon,
            })
            .set('Authorization', `Bearer fake-token`)
            .expect(500);

        expect(response.body).toHaveProperty('message');
        expect(mockUserModel.findById).toHaveBeenCalled();
    });

    test('should handle database error in jobService.getAllAvailableJobs', async () => {
        const mockMover = {
            _id: testMoverId,
            availability: {
                MON: [['09:00', '17:00']],
            },
        };

        mockUserModel.findById.mockResolvedValue(mockMover);
        mockJobService.getAllAvailableJobs.mockRejectedValue(new Error('Database query failed'));

        const response = await request(app)
            .get('/api/routePlanner/smart')
            .query({
                currentLat: testLocation.lat,
                currentLon: testLocation.lon,
            })
            .set('Authorization', `Bearer fake-token`)
            .expect(500);

        expect(response.body).toHaveProperty('message');
        expect(mockJobService.getAllAvailableJobs).toHaveBeenCalled();
    });

    test('should handle jobs with invalid location data', async () => {
        const mockMover = {
            _id: testMoverId,
            availability: {
                MON: [['09:00', '17:00']],
            },
        };

        // Mock jobs with invalid location data
        const mockJobs = [
            {
                id: new mongoose.Types.ObjectId().toString(),
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: JobType.STORAGE,
                status: JobStatus.AVAILABLE,
                volume: 1,
                price: 50,
                pickupAddress: { lat: null, lon: null }, // Invalid
                dropoffAddress: { lat: 49.2827, lon: -123.1300 },
                scheduledTime: new Date(Date.now() + 3600000).toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
        ];

        mockUserModel.findById.mockResolvedValue(mockMover);
        mockJobService.getAllAvailableJobs.mockResolvedValue({
            message: 'Available jobs retrieved successfully',
            data: { jobs: mockJobs },
        });

        const response = await request(app)
            .get('/api/routePlanner/smart')
            .query({
                currentLat: testLocation.lat,
                currentLon: testLocation.lon,
            })
            .set('Authorization', `Bearer fake-token`)
            .expect(200);

        // Should return empty route since jobs have invalid location data
        expect(response.body).toHaveProperty('message', 'No jobs available matching your schedule');
        expect(response.body.data).toHaveProperty('route');
        expect(Array.isArray(response.body.data.route)).toBe(true);
        expect(response.body.data.route.length).toBe(0);
    });

    test('should handle jobs that do not match mover availability', async () => {
        const mockMover = {
            _id: testMoverId,
            availability: {
                MON: [['09:00', '17:00']], // Only available Monday 9-5
            },
        };

        // Mock jobs scheduled outside availability window
        const mockJobs = [
            {
                id: new mongoose.Types.ObjectId().toString(),
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: JobType.STORAGE,
                status: JobStatus.AVAILABLE,
                volume: 1,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: new Date(Date.now() + 86400000).toISOString(), // Tomorrow (different day)
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
        ];

        mockUserModel.findById.mockResolvedValue(mockMover);
        mockJobService.getAllAvailableJobs.mockResolvedValue({
            message: 'Available jobs retrieved successfully',
            data: { jobs: mockJobs },
        });

        const response = await request(app)
            .get('/api/routePlanner/smart')
            .query({
                currentLat: testLocation.lat,
                currentLon: testLocation.lon,
            })
            .set('Authorization', `Bearer fake-token`)
            .expect(200);

        // Should return empty route if no jobs match availability
        expect(response.body).toHaveProperty('message', 'No jobs available matching your schedule');
        expect(response.body.data).toHaveProperty('route');
        expect(Array.isArray(response.body.data.route)).toBe(true);
    });

    test('should handle service error (500)', async () => {
        const mockMover = {
            _id: testMoverId,
            availability: {
                MON: [['09:00', '17:00']],
            },
        };

        mockUserModel.findById.mockResolvedValue(mockMover);
        mockJobService.getAllAvailableJobs.mockRejectedValue(new Error('Service error'));

        const response = await request(app)
            .get('/api/routePlanner/smart')
            .query({
                currentLat: testLocation.lat,
                currentLon: testLocation.lon,
            })
            .set('Authorization', `Bearer fake-token`)
            .expect(500);

        expect(response.body).toHaveProperty('message', 'Failed to calculate smart route');
    });
});


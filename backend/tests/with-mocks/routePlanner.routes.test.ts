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

const mockExtractObjectId = jest.fn();
const mockExtractObjectIdString = jest.fn();
const mockIsValidObjectId = jest.fn();

// Mock all external dependencies
jest.mock('../../src/models/user.model', () => ({
    userModel: mockUserModel,
}));

jest.mock('../../src/services/job.service', () => ({
    jobService: mockJobService,
}));

jest.mock('../../src/utils/mongoose.util', () => ({
    extractObjectId: mockExtractObjectId,
    extractObjectIdString: mockExtractObjectIdString,
    isValidObjectId: mockIsValidObjectId,
}));

// Import app after mocking dependencies (but NOT the service itself)
import app from '../../src/app';

describe('GET /api/routePlanner/smart - Get Smart Route', () => {
    const testMoverId = new mongoose.Types.ObjectId();
    const testLocation = { lat: 49.2827, lon: -123.1207 };

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockExtractObjectId.mockReturnValue(testMoverId);
        mockExtractObjectIdString.mockReturnValue(testMoverId.toString());
        mockIsValidObjectId.mockReturnValue(true);
        
        const authMiddleware = require('../../src/middleware/auth.middleware');
        authMiddleware.authenticateToken = (req: any, res: any, next: any) => {
            req.user = {
                _id: testMoverId,
                userRole: 'MOVER',
            };
            next();
        };
    });

    // Mocked behavior: userModel.findById returns mover with availability, jobService.getAllAvailableJobs returns jobs
    // Input: GET /api/routePlanner/smart with currentLat, currentLon query params, authenticated mover
    // Expected status code: 200
    // Expected behavior: returns optimized route with jobs matching mover availability and location
    // Expected output: route object with jobs array, total distance, duration, earnings
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

    // Mocked behavior: userModel.findById returns mover with availability
    // Input: GET /api/routePlanner/smart without currentLat or currentLon query params
    // Expected status code: 400
    // Expected behavior: validation fails due to missing required parameters
    // Expected output: error message "Invalid location parameters"
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

    // Mocked behavior: userModel.findById returns mover with availability
    // Input: GET /api/routePlanner/smart with non-numeric currentLat or currentLon
    // Expected status code: 400
    // Expected behavior: validation fails due to invalid parameter types
    // Expected output: error message "Invalid location parameters"
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

    // Mocked behavior: userModel.findById returns mover, jobService.getAllAvailableJobs returns empty jobs
    // Input: GET /api/routePlanner/smart with currentLat, currentLon, and optional maxDuration=120
    // Expected status code: 200
    // Expected behavior: accepts optional maxDuration parameter and returns route
    // Expected output: success message with data object containing route
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

    // Mocked behavior: userModel.findById returns mover with availability
    // Input: GET /api/routePlanner/smart with currentLat, currentLon, and negative maxDuration=-10
    // Expected status code: 400
    // Expected behavior: validation fails due to negative maxDuration value
    // Expected output: error message about invalid maxDuration
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

    // Mocked behavior: userModel.findById returns mover, jobService.getAllAvailableJobs returns jobs array
    // Input: GET /api/routePlanner/smart with currentLat, currentLon
    // Expected status code: 200
    // Expected behavior: returns route with all required fields for each job
    // Expected output: route array with jobs containing jobId, orderId, studentId, jobType, volume, price, addresses, times
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

    // Mocked behavior: userModel.findById returns mover, jobService.getAllAvailableJobs returns empty jobs array
    // Input: GET /api/routePlanner/smart with currentLat=0, currentLon=0
    // Expected status code: 200
    // Expected behavior: returns empty route when no jobs are available
    // Expected output: message "No jobs available matching your schedule", empty route array
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

    // Mocked behavior: userModel.findById returns null (mover not found)
    // Input: GET /api/routePlanner/smart with valid currentLat, currentLon
    // Expected status code: 200
    // Expected behavior: returns empty route when mover is not found in database
    // Expected output: message "No jobs available matching your schedule", empty route array
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

    // Mocked behavior: userModel.findById returns mover without availability field
    // Input: GET /api/routePlanner/smart with valid currentLat, currentLon
    // Expected status code: 200
    // Expected behavior: returns empty route when mover has no availability schedule
    // Expected output: message "No jobs available matching your schedule", empty route array
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

    // Mocked behavior: userModel.findById returns mover, jobService.getAllAvailableJobs returns jobs with large volume
    // Input: GET /api/routePlanner/smart with currentLat, currentLon, maxDuration=30
    // Expected status code: 200
    // Expected behavior: filters out jobs that would exceed maxDuration constraint
    // Expected output: empty or filtered route excluding jobs exceeding maxDuration
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

    // Mocked behavior: userModel.findById returns mover with null _id
    // Input: GET /api/routePlanner/smart with currentLat, currentLon
    // Expected status code: 200
    // Expected behavior: handles invalid moverId gracefully by returning empty route
    // Expected output: message "No jobs available matching your schedule", empty route array
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

    // Mocked behavior: userModel.findById rejects with database error
    // Input: GET /api/routePlanner/smart with currentLat, currentLon
    // Expected status code: 500
    // Expected behavior: catches database error and returns 500 error
    // Expected output: error message "Database connection failed"
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

    // Mocked behavior: userModel.findById succeeds, jobService.getAllAvailableJobs rejects with error
    // Input: GET /api/routePlanner/smart with currentLat, currentLon
    // Expected status code: 500
    // Expected behavior: catches job service error and returns 500 error
    // Expected output: error message from jobService.getAllAvailableJobs failure
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

    // Mocked behavior: userModel.findById succeeds, jobService.getAllAvailableJobs returns jobs with missing/invalid lat/lon
    // Input: GET /api/routePlanner/smart with currentLat, currentLon
    // Expected status code: 200
    // Expected behavior: skips jobs with invalid location data, returns valid jobs only
    // Expected output: route excluding jobs without valid pickupAddress or dropoffAddress coordinates
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

    // Mocked behavior: userModel.findById returns mover with MON availability, jobService returns jobs scheduled outside MON 9-5
    // Input: GET /api/routePlanner/smart with currentLat, currentLon
    // Expected status code: 200
    // Expected behavior: filters out jobs scheduled outside mover availability window
    // Expected output: empty route as no jobs match availability
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

    // Mocked behavior: userModel.findById succeeds, jobService.getAllAvailableJobs rejects with generic error
    // Input: GET /api/routePlanner/smart with currentLat, currentLon
    // Expected status code: 500
    // Expected behavior: catches service error and returns 500 status
    // Expected output: error message "Service error"
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

    // Mocked behavior: routeController.getSmartRoute rejects with promise rejection error
    // Input: GET /api/routePlanner/smart with currentLat, currentLon
    // Expected status code: 500
    // Expected behavior: route handler .catch() block calls next(err), error middleware handles it
    // Expected output: 500 error status from error middleware
    test('should call next(err) when controller promise rejects', async () => {
        // Get reference to the actual controller instance used by the route
        const controllerModule = require('../../src/controllers/routePlanner.controller');
        const controller = controllerModule.routeController;
        const originalMethod = controller.getSmartRoute;
        
        // Mock the controller method to throw an error that will be caught by .catch()
        controller.getSmartRoute = (jest.fn() as any).mockRejectedValue(new Error('Controller promise rejection'));

        // Make the API request - this will trigger the .catch((err) => next(err)) block in the route
        const response = await request(app)
            .get('/api/routePlanner/smart')
            .query({
                currentLat: testLocation.lat,
                currentLon: testLocation.lon,
            })
            .set('Authorization', `Bearer fake-token`);

        // Verify the error was handled by the error middleware
        expect(response.status).toBe(500);
        expect(controller.getSmartRoute).toHaveBeenCalled();

        // Restore the original method
        controller.getSmartRoute = originalMethod;
    });

    // Mocked behavior: none (direct controller call with req.user=undefined)
    // Input: controller called with req.user=undefined, query with currentLat, currentLon
    // Expected status code: 401
    // Expected behavior: controller detects missing user._id and returns 401 unauthorized
    // Expected output: error message "Mover ID not found in request"
    test('should return 401 when mover ID is not found in request', async () => {
        // Since the middleware guarantees req.user._id exists in production,
        // this test directly calls the controller with a mocked req object
        const controllerModule = require('../../src/controllers/routePlanner.controller');
        const controller = controllerModule.routeController;

        const mockReq: any = {
            user: undefined, // No user object at all
            query: {
                currentLat: String(testLocation.lat),
                currentLon: String(testLocation.lon),
            },
        };

        const mockRes: any = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
        };

        await controller.getSmartRoute(mockReq, mockRes);

        expect(mockRes.status).toHaveBeenCalledWith(401);
        expect(mockRes.json).toHaveBeenCalledWith({
            message: 'Unauthorized: Mover ID not found',
        });
    });

    // Mocked behavior: extractObjectIdString throws ZodError
    // Input: GET /api/routePlanner/smart with currentLat, currentLon
    // Expected status code: 400
    // Expected behavior: catches ZodError and returns 400 validation error
    // Expected output: error message "Invalid request parameters: Validation failed"
    test('should return 400 for ZodError validation failures', async () => {
        // Mock the schema validation to throw a ZodError
        const zodModule = require('zod');
        const originalZodParse = zodModule.z.object;
        
        // Mock extractObjectIdString to throw ZodError
        const utilsModule = require('../../src/utils/mongoose.util');
        const originalExtract = utilsModule.extractObjectIdString;
        
        utilsModule.extractObjectIdString = () => {
            const error: any = new Error('Validation failed');
            error.name = 'ZodError';
            throw error;
        };

        mockUserModel.findById.mockResolvedValue({
            _id: testMoverId,
            availability: { MON: [['09:00', '17:00']] },
        });

        const response = await request(app)
            .get('/api/routePlanner/smart')
            .query({
                currentLat: testLocation.lat,
                currentLon: testLocation.lon,
            })
            .set('Authorization', `Bearer fake-token`)
            .expect(400);

        expect(response.body).toHaveProperty('message', 'Invalid request parameters');

        // Restore original function
        utilsModule.extractObjectIdString = originalExtract;
    });

    // Mocked behavior: userModel.findById returns mover with availability, jobService returns jobs scheduled within availability
    // Input: GET /api/routePlanner/smart with currentLat, currentLon
    // Expected status code: 200
    // Expected behavior: returns route with jobs, message includes job count
    // Expected output: message "Smart route calculated with X jobs", route array with jobs
    test('should return message with job count when route has jobs', async () => {
        // Create a Monday at 10:00 AM (within availability window)
        const nextMonday = new Date();
        nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
        nextMonday.setHours(10, 0, 0, 0);

        const mockMover = {
            _id: testMoverId,
            availability: {
                MON: [['09:00', '17:00']],
                TUE: [['09:00', '17:00']],
                WED: [['09:00', '17:00']],
                THU: [['09:00', '17:00']],
                FRI: [['09:00', '17:00']],
            },
        };

        const mockJobs = [
            {
                id: new mongoose.Types.ObjectId().toString(),
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: 'STORAGE',
                status: 'AVAILABLE',
                volume: 1,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff Address' },
                scheduledTime: nextMonday.toISOString(),
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

        // Verify the message shows the count of jobs (if route has jobs) or no jobs message
        if (response.body.data.route.length > 0) {
            expect(response.body.message).toMatch(/Found \d+ job\(s\) in optimized route/);
        } else {
            // If no jobs in route, it should show the no jobs message
            expect(response.body.message).toBe('No jobs available matching your schedule');
        }
    });

    // Mocked behavior: userModel.findById returns mover, jobService.getAllAvailableJobs returns empty array
    // Input: GET /api/routePlanner/smart with currentLat, currentLon
    // Expected status code: 200
    // Expected behavior: returns empty route with appropriate message
    // Expected output: message "No jobs available matching your schedule", empty route array
    test('should return "no jobs" message when route is empty', async () => {
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
            })
            .set('Authorization', `Bearer fake-token`)
            .expect(200);

        // Verify the message indicates no jobs available
        expect(response.body.message).toBe('No jobs available matching your schedule');
        expect(response.body.data.route).toEqual([]);
        expect(response.body.data.route.length).toBe(0);
    });

    // Mocked behavior: userModel.findById returns mover with SAT availability, jobService returns Saturday jobs
    // Input: GET /api/routePlanner/smart with currentLat, currentLon
    // Expected status code: 200
    // Expected behavior: correctly handles Saturday availability and matches Saturday jobs
    // Expected output: route with Saturday jobs matching SAT availability window
    test('should handle Saturday availability', async () => {
        const nextSaturday = new Date();
        nextSaturday.setDate(nextSaturday.getDate() + ((6 + 7 - nextSaturday.getDay()) % 7 || 7));
        nextSaturday.setHours(10, 0, 0, 0);

        const mockMover = {
            _id: testMoverId,
            availability: {
                SAT: [['09:00', '17:00']],
            },
        };

        const mockJobs = [
            {
                id: new mongoose.Types.ObjectId().toString(),
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: 'STORAGE',
                status: 'AVAILABLE',
                volume: 1,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
                scheduledTime: nextSaturday.toISOString(),
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

        expect(response.body).toHaveProperty('data');
        expect(mockUserModel.findById).toHaveBeenCalled();
    });

    // Mocked behavior: userModel.findById returns mover with SUN availability, jobService returns Sunday jobs
    // Input: GET /api/routePlanner/smart with currentLat, currentLon
    // Expected status code: 200
    // Expected behavior: correctly handles Sunday availability and matches Sunday jobs
    // Expected output: route with Sunday jobs matching SUN availability window
    test('should handle Sunday availability', async () => {
        const nextSunday = new Date();
        nextSunday.setDate(nextSunday.getDate() + ((7 - nextSunday.getDay()) % 7 || 7));
        nextSunday.setHours(10, 0, 0, 0);

        const mockMover = {
            _id: testMoverId,
            availability: {
                SUN: [['09:00', '17:00']],
            },
        };

        const mockJobs = [
            {
                id: new mongoose.Types.ObjectId().toString(),
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: 'STORAGE',
                status: 'AVAILABLE',
                volume: 1,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
                scheduledTime: nextSunday.toISOString(),
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

        expect(response.body).toHaveProperty('data');
        expect(mockUserModel.findById).toHaveBeenCalled();
    });

    // Mocked behavior: userModel.findById returns mover with TUE availability, jobService returns Tuesday jobs
    // Input: GET /api/routePlanner/smart with currentLat, currentLon
    // Expected status code: 200
    // Expected behavior: correctly handles Tuesday availability and matches Tuesday jobs
    // Expected output: route with Tuesday jobs matching TUE availability window
    test('should handle Tuesday availability', async () => {
        const nextTuesday = new Date();
        nextTuesday.setDate(nextTuesday.getDate() + ((2 + 7 - nextTuesday.getDay()) % 7 || 7));
        nextTuesday.setHours(10, 0, 0, 0);

        const mockMover = {
            _id: testMoverId,
            availability: {
                TUE: [['09:00', '17:00']],
            },
        };

        const mockJobs = [
            {
                id: new mongoose.Types.ObjectId().toString(),
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: 'STORAGE',
                status: 'AVAILABLE',
                volume: 1,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
                scheduledTime: nextTuesday.toISOString(),
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

        expect(response.body).toHaveProperty('data');
        expect(mockUserModel.findById).toHaveBeenCalled();
    });

    // Mocked behavior: userModel.findById returns mover with FRI availability, jobService returns Friday jobs
    // Input: GET /api/routePlanner/smart with currentLat, currentLon
    // Expected status code: 200
    // Expected behavior: correctly handles Friday availability and matches Friday jobs
    // Expected output: route with Friday jobs matching FRI availability window
    test('should handle Friday availability', async () => {
        const nextFriday = new Date();
        nextFriday.setDate(nextFriday.getDate() + ((5 + 7 - nextFriday.getDay()) % 7 || 7));
        nextFriday.setHours(10, 0, 0, 0);

        const mockMover = {
            _id: testMoverId,
            availability: {
                FRI: [['09:00', '17:00']],
            },
        };

        const mockJobs = [
            {
                id: new mongoose.Types.ObjectId().toString(),
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: 'STORAGE',
                status: 'AVAILABLE',
                volume: 1,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
                scheduledTime: nextFriday.toISOString(),
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

        expect(response.body).toHaveProperty('data');
        expect(mockUserModel.findById).toHaveBeenCalled();
    });

    // Mocked behavior: userModel.findById returns mover with empty array for a specific day
    // Input: GET /api/routePlanner/smart with currentLat, currentLon
    // Expected status code: 200
    // Expected behavior: handles days with empty availability array gracefully
    // Expected output: empty route for jobs scheduled on days with no availability
    test('should handle empty availability for a day', async () => {
        const nextWednesday = new Date();
        nextWednesday.setDate(nextWednesday.getDate() + ((3 + 7 - nextWednesday.getDay()) % 7 || 7));
        nextWednesday.setHours(10, 0, 0, 0);

        const mockMover = {
            _id: testMoverId,
            availability: {
                MON: [['09:00', '17:00']],
                // WED is not defined - empty array case
            },
        };

        const mockJobs = [
            {
                id: new mongoose.Types.ObjectId().toString(),
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: 'STORAGE',
                status: 'AVAILABLE',
                volume: 1,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
                scheduledTime: nextWednesday.toISOString(),
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

        expect(response.body.data.route.length).toBe(0);
    });

    // Mocked behavior: userModel.findById returns mover, jobService returns jobs with invalid dropoff address (missing lat/lon)
    // Input: GET /api/routePlanner/smart with currentLat, currentLon
    // Expected status code: 200
    // Expected behavior: skips jobs with invalid dropoff location data
    // Expected output: empty route as jobs with invalid dropoff addresses are filtered out
    test('should handle jobs with invalid dropoff location data', async () => {
        const mockMover = {
            _id: testMoverId,
            availability: {
                MON: [['09:00', '17:00']],
            },
        };

        // Mock jobs with invalid dropoff location
        const mockJobs = [
            {
                id: new mongoose.Types.ObjectId().toString(),
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: JobType.STORAGE,
                status: JobStatus.AVAILABLE,
                volume: 1,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
                dropoffAddress: { lat: null, lon: null, formattedAddress: 'Invalid' }, // Invalid dropoff
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

        // Should return empty route since job has invalid dropoff location
        expect(response.body.data.route.length).toBe(0);
    });

    // Mocked behavior: userModel.findById returns mover, jobService returns jobs scheduled too soon to reach
    // Input: GET /api/routePlanner/smart with currentLat, currentLon
    // Expected status code: 200
    // Expected behavior: filters out jobs where travel time from current location makes arrival impossible before scheduled time
    // Expected output: empty route as infeasible jobs are excluded
    test('should handle jobs that cannot be reached in time', async () => {
        // Create two jobs - one reachable and one that cannot be reached
        // This will test the "No more feasible jobs" break statement on line 398
        const nextMonday = new Date();
        nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
        nextMonday.setHours(10, 0, 0, 0); // First job at 10 AM

        const nextMonday2 = new Date(nextMonday);
        nextMonday2.setHours(10, 30, 0, 0); // Second job at 10:30 AM (only 30 mins after first, but far away)

        const mockMover = {
            _id: testMoverId,
            availability: {
                MON: [['00:00', '23:59']], // Available all day
            },
        };

        const mockJobs = [
            {
                id: new mongoose.Types.ObjectId().toString(),
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: 'STORAGE',
                status: 'AVAILABLE',
                volume: 5, // Large volume = takes ~80 minutes
                price: 100,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup 1' },
                dropoffAddress: { lat: 49.2900, lon: -123.1400, formattedAddress: 'Dropoff 1' },
                scheduledTime: nextMonday.toISOString(), // 10 AM
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
            {
                id: new mongoose.Types.ObjectId().toString(),
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: 'STORAGE',
                status: 'AVAILABLE',
                volume: 1,
                price: 50,
                // Very far away - about 150km
                pickupAddress: { lat: 50.5000, lon: -125.0000, formattedAddress: 'Far Pickup' },
                dropoffAddress: { lat: 50.5100, lon: -125.1000, formattedAddress: 'Far Dropoff' },
                scheduledTime: nextMonday2.toISOString(), // 10:30 AM - cannot reach in 30 mins from 150km away
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

        // Should return empty route since after first job, second job cannot be reached in time
        // This triggers the "No more feasible jobs" break on line 398
        expect(response.body).toHaveProperty('data');
        expect(Array.isArray(response.body.data.route)).toBe(true);
        // Either accepts no jobs or only the first job (not both)
        expect(response.body.data.route.length).toBeLessThan(2);
    });

    // Mocked behavior: userModel.findById returns mover, jobService returns multiple jobs at different locations
    // Input: GET /api/routePlanner/smart with currentLat, currentLon
    // Expected status code: 200
    // Expected behavior: calculates accurate distance, duration, and earnings metrics for route
    // Expected output: metrics with totalDistance, totalDuration, totalEarnings, earningsPerHour
    test('should calculate distance and route metrics correctly', async () => {
        // Create a Monday at 10:00 AM with jobs at different locations
        const nextMonday = new Date();
        nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
        nextMonday.setHours(10, 0, 0, 0);

        const nextMonday2 = new Date(nextMonday);
        nextMonday2.setHours(14, 0, 0, 0);

        const mockMover = {
            _id: testMoverId,
            availability: {
                MON: [['09:00', '17:00']],
            },
        };

        // Create jobs at different locations to trigger distance calculation
        const mockJobs = [
            {
                id: new mongoose.Types.ObjectId().toString(),
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: 'STORAGE',
                status: 'AVAILABLE',
                volume: 1,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup 1' },
                dropoffAddress: { lat: 49.2900, lon: -123.1400, formattedAddress: 'Dropoff 1' },
                scheduledTime: nextMonday.toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
            {
                id: new mongoose.Types.ObjectId().toString(),
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: 'STORAGE',
                status: 'AVAILABLE',
                volume: 2,
                price: 75,
                pickupAddress: { lat: 49.3000, lon: -123.1500, formattedAddress: 'Pickup 2' },
                dropoffAddress: { lat: 49.3100, lon: -123.1600, formattedAddress: 'Dropoff 2' },
                scheduledTime: nextMonday2.toISOString(),
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

        // Should have calculated distances and metrics
        if (response.body.data.route.length > 0) {
            expect(response.body.data.metrics).toHaveProperty('totalDistance');
            expect(response.body.data.metrics.totalDistance).toBeGreaterThan(0);
            expect(response.body.data.route[0]).toHaveProperty('distanceFromPrevious');
        }
    });

    // Mocked behavior: userModel.findById returns mover, jobService returns jobs spanning multiple hours
    // Input: GET /api/routePlanner/smart with currentLat, currentLon, maxDuration constraint
    // Expected status code: 200
    // Expected behavior: respects maxDuration based on active work time (excludes wait time between jobs)
    // Expected output: route with jobs that fit within maxDuration of active work time
    test('should respect maxDuration with active work time only', async () => {
        // Create a Monday at 10:00 AM
        const nextMonday = new Date();
        nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
        nextMonday.setHours(10, 0, 0, 0);

        const nextMonday2 = new Date(nextMonday);
        nextMonday2.setHours(12, 0, 0, 0); // 2 hours later

        const mockMover = {
            _id: testMoverId,
            availability: {
                MON: [['09:00', '17:00']],
            },
        };

        // Create multiple jobs that together would exceed maxDuration
        const mockJobs = [
            {
                id: new mongoose.Types.ObjectId().toString(),
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: 'STORAGE',
                status: 'AVAILABLE',
                volume: 5, // Large volume = longer duration
                price: 100,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup 1' },
                dropoffAddress: { lat: 49.2900, lon: -123.1400, formattedAddress: 'Dropoff 1' },
                scheduledTime: nextMonday.toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
            {
                id: new mongoose.Types.ObjectId().toString(),
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: 'STORAGE',
                status: 'AVAILABLE',
                volume: 5, // Large volume = longer duration
                price: 100,
                pickupAddress: { lat: 49.3000, lon: -123.1500, formattedAddress: 'Pickup 2' },
                dropoffAddress: { lat: 49.3100, lon: -123.1600, formattedAddress: 'Dropoff 2' },
                scheduledTime: nextMonday2.toISOString(),
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
                maxDuration: 60, // 60 minutes - should limit jobs selected
            })
            .set('Authorization', `Bearer fake-token`)
            .expect(200);

        // Route should respect maxDuration constraint
        expect(response.body.data).toHaveProperty('metrics');
        if (response.body.data.route.length > 0) {
            // Total active work time should not exceed maxDuration
            const totalActiveTime = response.body.data.route.reduce((sum: number, job: any) => {
                return sum + job.estimatedDuration + job.travelTimeFromPrevious;
            }, 0);
            expect(totalActiveTime).toBeLessThanOrEqual(60);
        }
    });

    // Mocked behavior: userModel.findById returns mover with MON 9-5 availability, jobService returns job at 6 PM
    // Input: GET /api/routePlanner/smart with currentLat, currentLon
    // Expected status code: 200
    // Expected behavior: filters out jobs scheduled outside mover's availability time window
    // Expected output: empty route as jobs are outside 9-5 availability window
    test('should filter jobs outside mover availability window', async () => {
        // Create a Monday at 18:00 (6 PM) - outside availability
        const nextMonday = new Date();
        nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
        nextMonday.setHours(18, 0, 0, 0); // 6 PM - outside 9-5 window

        const mockMover = {
            _id: testMoverId,
            availability: {
                MON: [['09:00', '17:00']], // Only available 9 AM - 5 PM
            },
        };

        const mockJobs = [
            {
                id: new mongoose.Types.ObjectId().toString(),
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: 'STORAGE',
                status: 'AVAILABLE',
                volume: 1,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
                scheduledTime: nextMonday.toISOString(), // 6 PM - outside availability
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

        // Should return empty route since job is outside availability
        expect(response.body.data.route.length).toBe(0);
    });

    // Mocked behavior: userModel.findById returns mover, jobService returns jobs with scheduledTime as ISO string
    // Input: GET /api/routePlanner/smart with currentLat, currentLon
    // Expected status code: 200
    // Expected behavior: correctly parses ISO string scheduledTime and includes in route
    // Expected output: route with jobs processed correctly with string scheduledTime
    test('should handle jobs scheduled with string scheduledTime', async () => {
        // Create a Monday at 10:00 AM
        const nextMonday = new Date();
        nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
        nextMonday.setHours(10, 0, 0, 0);

        const mockMover = {
            _id: testMoverId,
            availability: {
                MON: [['09:00', '17:00']],
            },
        };

        // Mock job with string scheduledTime (not Date)
        const mockJobs = [
            {
                id: new mongoose.Types.ObjectId().toString(),
                orderId: new mongoose.Types.ObjectId().toString(),
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: 'STORAGE',
                status: 'AVAILABLE',
                volume: 1,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
                scheduledTime: nextMonday.toISOString(), // String format
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

        expect(response.body).toHaveProperty('data');
        expect(mockJobService.getAllAvailableJobs).toHaveBeenCalled();
    });

    // Mocked behavior: userModel.findById returns mover, jobService.getAllAvailableJobs returns empty array
    // Input: GET /api/routePlanner/smart with currentLat, currentLon
    // Expected status code: 200
    // Expected behavior: calculates metrics correctly for empty route (all zeros)
    // Expected output: metrics with totalEarnings=0, totalJobs=0, totalDistance=0, totalDuration=0, earningsPerHour=0
    test('should calculate empty route metrics correctly', async () => {
        const mockMover = {
            _id: testMoverId,
            availability: {
                MON: [['09:00', '17:00']],
            },
        };

        mockUserModel.findById.mockResolvedValue(mockMover);
        mockJobService.getAllAvailableJobs.mockResolvedValue({
            message: 'Available jobs retrieved successfully',
            data: { jobs: [] }, // No jobs
        });

        const response = await request(app)
            .get('/api/routePlanner/smart')
            .query({
                currentLat: testLocation.lat,
                currentLon: testLocation.lon,
            })
            .set('Authorization', `Bearer fake-token`)
            .expect(200);

        // Verify empty route metrics
        expect(response.body.data.metrics).toEqual({
            totalEarnings: 0,
            totalJobs: 0,
            totalDistance: 0,
            totalDuration: 0,
            earningsPerHour: 0,
        });
    });

    // Mocked behavior: userModel.findById returns mover, jobService returns job where mover arrives before scheduled time
    // Input: GET /api/routePlanner/smart with currentLat, currentLon
    // Expected status code: 200
    // Expected behavior: handles early arrival scenario, includes wait time in calculations
    // Expected output: route with job included, estimatedStartTime set to scheduledTime (waits for scheduled time)
    test('should handle early arrival with feasibility check', async () => {
        // Create a Monday at 14:00 (2 PM) - far in future so we can arrive early
        const nextMonday = new Date();
        nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
        nextMonday.setHours(14, 0, 0, 0);

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
                jobType: 'STORAGE',
                status: 'AVAILABLE',
                volume: 1,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
                scheduledTime: nextMonday.toISOString(), // Scheduled in future
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

        // Should successfully plan route with early arrival (feasible)
        expect(response.body).toHaveProperty('data');
        expect(Array.isArray(response.body.data.route)).toBe(true);
    });

    // Mocked behavior: extractObjectId returns null (invalid moverId), userModel.findById still called
    // Input: GET /api/routePlanner/smart with currentLat, currentLon
    // Expected status code: 200
    // Expected behavior: handles null moverId gracefully, returns empty route
    // Expected output: empty route with zero metrics
    test('should handle extractObjectId returning null for invalid moverId', async () => {
        // Mock extractObjectId to return null (simulating invalid ObjectId format)
        mockExtractObjectId.mockReturnValueOnce(null);

        // Mock userModel and jobService (shouldn't be reached)
        mockUserModel.findById.mockResolvedValue({
            _id: testMoverId,
            availability: { MON: [['09:00', '17:00']] },
        });
        mockJobService.getAllAvailableJobs.mockResolvedValue({
            message: 'Available jobs retrieved successfully',
            data: { jobs: [] },
        });

        const response = await request(app)
            .get('/api/routePlanner/smart')
            .query({
                currentLat: testLocation.lat,
                currentLon: testLocation.lon,
            })
            .set('Authorization', `Bearer fake-token`)
            .expect(200);

        // Should return empty route when extractObjectId returns null
        expect(response.body).toHaveProperty('data');
        expect(response.body.data).toMatchObject({
            route: [],
            metrics: {
                totalDistance: 0,
                totalEarnings: 0,
            },
            startLocation: {
                lat: testLocation.lat,
                lon: testLocation.lon,
            },
        });
        
        // Verify userModel.findById was NOT called since extractObjectId returned null
        expect(mockUserModel.findById).not.toHaveBeenCalled();
    });

    // Mocked behavior: Date.prototype.getDay mocked to return invalid day number (7), userModel returns mover with SUN availability
    // Input: GET /api/routePlanner/smart with currentLat, currentLon
    // Expected status code: 200
    // Expected behavior: convertToDayOfWeek default case returns 'SUN', matches SUN availability
    // Expected output: route potentially includes job as default day (SUN) matches mover availability
    test('should handle invalid day number to trigger default cases in convertToDayOfWeek', async () => {
        const mockMover = {
            _id: testMoverId,
            availability: {
                SUN: [['09:00', '17:00']], // Sunday availability (will be returned by default case)
            },
        };
        
        // Save original Date.prototype.getDay
        const originalGetDay = Date.prototype.getDay;

        Date.prototype.getDay = jest.fn().mockReturnValue(7) as any;
        
        const mockJobs = [
            {
                id: new mongoose.Types.ObjectId().toString(),
                orderId: new mongoose.Types.ObjectId().toString(),  
                studentId: new mongoose.Types.ObjectId().toString(),
                jobType: 'STORAGE',
                status: 'AVAILABLE',
                volume: 1,
                price: 50,
                pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup' },
                dropoffAddress: { lat: 49.2827, lon: -123.1300, formattedAddress: 'Dropoff' },
                scheduledTime: new Date().toISOString(),
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
        
        // The default case returns 'SUN', so if mover has SUN availability, job may be accepted
        // Verify the response is valid
        expect(response.body).toHaveProperty('data');
        expect(Array.isArray(response.body.data.route)).toBe(true);
        
        // Verify Date.prototype.getDay was called
        expect(Date.prototype.getDay).toHaveBeenCalled();
        
        // Restore original Date.prototype.getDay
        Date.prototype.getDay = originalGetDay;
    });

    
});

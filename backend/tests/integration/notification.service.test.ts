import { describe, expect, test, beforeEach, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { JobStatus, JobType } from '../../src/types/job.type';

// Mock the database connection to avoid actual DB connections in integration tests
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

// Mock job model
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

// Mock user model
const mockUserModel = {
    findById: jest.fn(),
    findByGoogleId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    getFcmToken: jest.fn(),
    clearInvalidFcmToken: jest.fn(),
};

jest.mock('../../src/models/user.model', () => ({
    UserModel: jest.fn(() => mockUserModel),
    userModel: mockUserModel,
}));

// Mock notification service for setup (will be unmocked in tests)
const mockNotificationService = {
    sendJobStatusNotification: jest.fn(),
    sendNotificationToDevice: jest.fn(),
};

jest.mock('../../src/services/notification.service', () => ({
    NotificationService: jest.fn(() => mockNotificationService),
    notificationService: mockNotificationService,
}));

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

    // Mocked behavior: notificationService uses real implementation, Firebase throws invalid-argument error
    // Input: jobId and JobStatus.ACCEPTED, Firebase rejects with 'messaging/invalid-argument'
    // Expected status code: N/A (direct service call)
    // Expected behavior: clearInvalidFcmToken is called (covers line 30 in notification.service.ts)
    // Expected output: None (void function, error is caught and logged)
    test('should cover line 30: Firebase invalid-argument error handling', async () => {
        jest.unmock('../../src/services/notification.service');
        const { notificationService: realNotificationService } = require('../../src/services/notification.service');

        const jobId = new mongoose.Types.ObjectId();
        const studentId = new mongoose.Types.ObjectId();
        const fcmToken = 'invalid-fcm-token';

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
        
        // Mock Firebase to throw an error with code 'messaging/invalid-argument'
        const firebaseError: any = {
            code: 'messaging/invalid-argument',
            message: 'The registration token is not a valid FCM registration token'
        };
        mockFirebaseMessaging.send.mockRejectedValue(firebaseError);
        mockUserModel.clearInvalidFcmToken.mockResolvedValue(undefined);

        // Temporarily replace mock with real service
        const originalMock = mockNotificationService.sendJobStatusNotification;
        mockNotificationService.sendJobStatusNotification = realNotificationService.sendJobStatusNotification.bind(realNotificationService);

        try {
            await realNotificationService.sendJobStatusNotification(jobId, JobStatus.ACCEPTED);

            // Verify that clearInvalidFcmToken was called (line 30 coverage)
            expect(mockUserModel.clearInvalidFcmToken).toHaveBeenCalledWith(fcmToken);
        } finally {
            mockNotificationService.sendJobStatusNotification = originalMock;
        }
    });

    // Mocked behavior: notificationService uses real implementation, jobModel.findById throws error
    // Input: jobId and JobStatus.ACCEPTED, jobModel.findById throws error
    // Expected status code: N/A (direct service call)
    // Expected behavior: outer catch block is executed (covers line 118 in notification.service.ts)
    // Expected output: None (void function, error is caught and logged)
    test('should cover line 118: catch block in sendJobStatusNotification', async () => {
        jest.unmock('../../src/services/notification.service');
        const { notificationService: realNotificationService } = require('../../src/services/notification.service');

        const jobId = new mongoose.Types.ObjectId();

        // Mock jobModel.findById to throw an error
        mockJobModel.findById.mockRejectedValue(new Error('Database connection failed'));

        // Temporarily replace mock with real service
        const originalMock = mockNotificationService.sendJobStatusNotification;
        mockNotificationService.sendJobStatusNotification = realNotificationService.sendJobStatusNotification.bind(realNotificationService);

        try {
            // This should not throw - the error is caught inside the function (line 118)
            await realNotificationService.sendJobStatusNotification(jobId, JobStatus.ACCEPTED);

            // Verify that jobModel.findById was called
            expect(mockJobModel.findById).toHaveBeenCalledWith(jobId);
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

    // Mocked behavior: notificationService uses real implementation, Firebase throws error without 'code' property
    // Input: notification payload with FCM token
    // Expected status code: N/A (direct service call)  
    // Expected behavior: error is caught, code extraction returns undefined (covers line 30 false branch)
    // Expected output: None (void function, error logged but token not cleared)
    test('should cover line 30: error object without code property', async () => {
        jest.unmock('../../src/services/notification.service');
        const { notificationService: realNotificationService } = require('../../src/services/notification.service');

        const fcmToken = 'test-fcm-token';
        const notificationPayload = {
            fcmToken: fcmToken,
            title: 'Test Title',
            body: 'Test Body',
            data: {},
        };

        // Error object without 'code' property - line 30 will evaluate to undefined
        const error = {
            message: 'Error without code property',
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

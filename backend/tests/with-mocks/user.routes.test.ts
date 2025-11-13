import { describe, expect, test, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../../src/config/database';
import { userModel } from '../../src/models/user.model';
import { IUser } from '../../src/types/user.types';

// Import app after mocks are set up
import app from '../../src/app';

let authToken: string;
let moverAuthToken: string;
const testUserId = new mongoose.Types.ObjectId();
const testMoverId = new mongoose.Types.ObjectId();

// Suppress console logs during tests
const originalConsole = {
  log: console.log,
  warn: console.warn,
  info: console.info,
};

beforeAll(async () => {
  // Suppress console output
  console.log = jest.fn();
  console.warn = jest.fn();
  console.info = jest.fn();

  await connectDB();

  // Clean up any existing test users
  const db = mongoose.connection.db;
  if (db) {
    await db.collection('users').deleteMany({
      googleId: {
        $in: [
          `test-google-id-user-mock-${testUserId.toString()}`,
          `test-google-id-mover-mock-${testMoverId.toString()}`
        ]
      }
    });
  }

  // Create test student user
  await (userModel as any).user.create({
    _id: testUserId,
    googleId: `test-google-id-user-mock-${testUserId.toString()}`,
    email: `usermock${testUserId.toString()}@example.com`,
    name: 'Test User Mock',
    userRole: 'STUDENT',
    fcmToken: 'initial-fcm-token'
  });

  // Create test mover user with credits
  await (userModel as any).user.create({
    _id: testMoverId,
    googleId: `test-google-id-mover-mock-${testMoverId.toString()}`,
    email: `movermock${testMoverId.toString()}@example.com`,
    name: 'Test Mover Mock',
    userRole: 'MOVER',
    credits: 150,
    carType: 'Sedan',
    capacity: 500,
    plateNumber: 'ABC123'
  });

  // Generate JWT tokens
  authToken = jwt.sign({ id: testUserId }, process.env.JWT_SECRET || 'default-secret');
  moverAuthToken = jwt.sign({ id: testMoverId }, process.env.JWT_SECRET || 'default-secret');
});

beforeEach(() => {
  jest.clearAllMocks();
});

afterAll(async () => {
  // Clean up test users
  const db = mongoose.connection.db;
  if (db) {
    await db.collection('users').deleteMany({
      googleId: {
        $in: [
          `test-google-id-user-mock-${testUserId.toString()}`,
          `test-google-id-mover-mock-${testMoverId.toString()}`
        ]
      }
    });
  }

  await disconnectDB();

  // Restore console
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
});

// Interface GET /api/user/profile
describe('GET /api/user/profile - Get User Profile (Mocked)', () => {
  // Mocked behavior: UserController.getProfile called with req.user = undefined
  // Input: authenticated request but controller simulates missing req.user
  // Expected status code: 401
  // Expected behavior: detects missing user authentication in controller
  // Expected output: error message 'User not authenticated'
  test('should return 401 when req.user is undefined ', async () => {
    const { UserController } = require('../../src/controllers/user.controller');
    const controllerProto = UserController.prototype;
    const originalMethod = controllerProto.getProfile;
    
    controllerProto.getProfile = jest.fn().mockImplementation((req: any, res: any) => {
      req.user = undefined;
      return originalMethod.call(controllerProto, req, res);
    });

    try {
      const response = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('User not authenticated');
      expect(controllerProto.getProfile).toHaveBeenCalled();
    } finally {
      controllerProto.getProfile = originalMethod;
    }
  });
});

// Interface POST /api/user/profile
describe('POST /api/user/profile - Update User Profile (Mocked)', () => {
  // Mocked behavior: UserController.updateProfile called with req.user = undefined
  // Input: authenticated request with name update but controller simulates missing req.user
  // Expected status code: 401
  // Expected behavior: detects missing user authentication in controller
  // Expected output: error message 'User not authenticated'
  test('should return 401 when req.user is undefined ', async () => {
    const { UserController } = require('../../src/controllers/user.controller');
    const controllerProto = UserController.prototype;
    const originalMethod = controllerProto.updateProfile;
    
    controllerProto.updateProfile = jest.fn().mockImplementation(async (req: any, res: any, next: any) => {
      req.user = undefined;
      return originalMethod.call(controllerProto, req, res, next);
    });

    try {
      const response = await request(app)
        .post('/api/user/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Should Fail' });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('User not authenticated');
      expect(controllerProto.updateProfile).toHaveBeenCalled();
    } finally {
      controllerProto.updateProfile = originalMethod;
    }
  });

  // Mocked behavior: UserController.updateProfile rejects with error
  // Input: authenticated student request with name update
  // Expected status code: 500
  // Expected behavior: error handler catches controller rejection
  // Expected output: 500 error response
  test('should call next(err) when controller promise rejects', async () => {
    const { UserController } = require('../../src/controllers/user.controller');
    const controllerProto = UserController.prototype;
    const originalMethod = controllerProto.updateProfile;
    controllerProto.updateProfile = (jest.fn() as any).mockRejectedValue(new Error('Mocked controller error'));
    const updateData = {
        name: 'Should Trigger Error'
        };
    const response = await request(app)
        .post('/api/user/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);
    expect(response.status).toBe(500);
    expect(controllerProto.updateProfile).toHaveBeenCalled();
    controllerProto.updateProfile = originalMethod;
  });

  // Mocked behavior: userModel.update resolves with null
  // Input: authenticated student request with name update
  // Expected status code: 404
  // Expected behavior: handles case where user not found during update
  // Expected output: error message 'User not found'
  test('should handle user model update returning null', async () => {
    const originalUpdate = userModel.update;
    userModel.update = (jest.fn() as any).mockResolvedValue(null);

    const updateData = {
      name: 'Should Not Find User'
    };

    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send(updateData)
      .expect(404);

    expect(response.body).toHaveProperty('message', 'User not found');

    userModel.update = originalUpdate;
  });

  // Mocked behavior: userModel.update rejects with unknown Error
  // Input: authenticated student request with name update
  // Expected status code: 500
  // Expected behavior: error handler catches database error
  // Expected output: error message 'Unknown database error'
  test('should trigger next(err) for unknown Error types during update', async () => {
    const originalUpdate = userModel.update;
    userModel.update = (jest.fn() as any).mockRejectedValue(new Error('Unknown database error'));

    const updateData = {
      name: 'Should Trigger Unknown Error'
    };

    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send(updateData)
      .expect(500);

    expect(response.body).toHaveProperty('message', 'Unknown database error');

    userModel.update = originalUpdate;
  });

  // Mocked behavior: userModel.update rejects with non-Error string
  // Input: authenticated student request with name update
  // Expected status code: 500
  // Expected behavior: error handler catches non-Error exception
  // Expected output: 500 error response
  test('should trigger next(err) for non-Error exceptions during update', async () => {
    const originalUpdate = userModel.update;
    userModel.update = (jest.fn() as any).mockRejectedValue('String error from database');

    const updateData = {
      name: 'Should Trigger Non-Error'
    };

    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send(updateData)
      .expect(500);

    expect(response.status).toBe(500);

    userModel.update = originalUpdate;
  });

  // Mocked behavior: userModel.update rejects with Error having empty message
  // Input: authenticated student request with name update
  // Expected status code: 500
  // Expected behavior: uses fallback error message when Error.message is empty
  // Expected output: error message 'Failed to update user info'
  test('should use fallback message when Error has no message during update', async () => {
    const originalUpdate = userModel.update;
    const errorWithoutMessage = new Error();
    errorWithoutMessage.message = ''; // Empty message
    userModel.update = (jest.fn() as any).mockRejectedValue(errorWithoutMessage);

    const updateData = {
      name: 'Should Use Fallback'
    };

    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send(updateData)
      .expect(500);

    expect(response.body).toHaveProperty('message', 'Failed to update user info');

    userModel.update = originalUpdate;
  });
});

// Interface POST /api/user/cash-out
describe('POST /api/user/cash-out - Cash Out (Mocked)', () => {
  // Mocked behavior: UserController.cashOut called with req.user = undefined
  // Input: authenticated mover request but controller simulates missing req.user
  // Expected status code: 401
  // Expected behavior: detects missing user authentication in controller
  // Expected output: error message 'User not authenticated'
  test('should return 401 when req.user is undefined ', async () => {
    const { UserController } = require('../../src/controllers/user.controller');
    const controllerProto = UserController.prototype;
    const originalMethod = controllerProto.cashOut;
    
    // Create a spy that calls the original but with req.user = undefined
    controllerProto.cashOut = jest.fn().mockImplementation(async (req: any, res: any, next: any) => {
      req.user = undefined; // Simulate missing user
      return originalMethod.call(controllerProto, req, res, next);
    });

    try {
      const response = await request(app)
        .post('/api/user/cash-out')
        .set('Authorization', `Bearer ${moverAuthToken}`);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('User not authenticated');
      expect(controllerProto.cashOut).toHaveBeenCalled();
    } finally {
      controllerProto.cashOut = originalMethod;
    }
  });

  // Mocked behavior: userModel.update resolves with mover having credits set to 0
  // Input: authenticated mover request
  // Expected status code: 200
  // Expected behavior: successfully processes cash out even for large amounts
  // Expected output: user with credits 0
  test('should handle cash out with large credit amounts', async () => {
    const originalUpdate = (userModel as any).update;
    (userModel as any).update = (jest.fn() as any).mockResolvedValue({
      _id: testMoverId.toString(),
      email: `movermock${testMoverId.toString()}@example.com`,
      name: 'Test Mover Mock',
      userRole: 'MOVER',
      credits: 0,
      carType: 'Sedan',
      capacity: 500,
      plateNumber: 'ABC123'
    });

    const response = await request(app)
      .post('/api/user/cash-out')
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .expect(200);

    expect(response.body.data.user.credits).toBe(0);

    (userModel as any).update = originalUpdate;
  });

  // Mocked behavior: userModel.update resolves with null
  // Input: authenticated mover request
  // Expected status code: 404
  // Expected behavior: handles case where user not found during cash out
  // Expected output: error message 'User not found'
  test('should handle error when user not found during cash out', async () => {
    const originalUpdate = (userModel as any).update;
    (userModel as any).update = (jest.fn() as any).mockResolvedValue(null);

    const response = await request(app)
      .post('/api/user/cash-out')
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .expect(404);

    expect(response.body).toHaveProperty('message', 'User not found');

    (userModel as any).update = originalUpdate;
  });

  // Mocked behavior: userModel.update rejects with database error
  // Input: authenticated mover request
  // Expected status code: 500
  // Expected behavior: handles database update failure during cash out
  // Expected output: error message 'Database update failed'
  test('should handle error when update fails during cash out', async () => {
    const originalUpdate = (userModel as any).update;
    (userModel as any).update = (jest.fn() as any).mockRejectedValue(new Error('Database update failed'));

    const response = await request(app)
      .post('/api/user/cash-out')
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .expect(500);

    expect(response.body).toHaveProperty('message', 'Database update failed');

    (userModel as any).update = originalUpdate;
  });

  // Mocked behavior: userModel.update rejects with non-Error object
  // Input: authenticated mover request
  // Expected status code: 500
  // Expected behavior: handles non-Error exception during cash out
  // Expected output: 500 error response
  test('should handle non-Error exceptions during cash out', async () => {
    const originalUpdate = (userModel as any).update;
    (userModel as any).update = (jest.fn() as any).mockRejectedValue({ code: 500, message: 'System error' });

    const response = await request(app)
      .post('/api/user/cash-out')
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .expect(500);

    expect(response.status).toBe(500);

    (userModel as any).update = originalUpdate;
  });

  // Mocked behavior: UserController.cashOut rejects with error
  // Input: authenticated mover request
  // Expected status code: 500
  // Expected behavior: error handler catches controller rejection
  // Expected output: 500 error response
  test('should call next(err) when controller promise rejects', async () => {
    const { UserController } = require('../../src/controllers/user.controller');
    const controllerProto = UserController.prototype;
    const originalMethod = controllerProto.cashOut;
    // Mock the cashOut method to reject
    controllerProto.cashOut = (jest.fn() as any).mockRejectedValue(new Error('Mocked controller error'));
    
    const response = await request(app)
      .post('/api/user/cash-out')
      .set('Authorization', `Bearer ${moverAuthToken}`);
    // Verify the error was handled by the error middleware
    expect(response.status).toBe(500);
    expect(controllerProto.cashOut).toHaveBeenCalled();
    controllerProto.cashOut = originalMethod;
  });

  // Mocked behavior: userModel.update rejects with Error having empty message
  // Input: authenticated mover request
  // Expected status code: 500
  // Expected behavior: uses fallback error message when Error.message is empty
  // Expected output: error message 'Failed to cash out credits'
  test('should use fallback message when Error has no message during cash out', async () => {
    const originalUpdate = (userModel as any).update;
    const errorWithoutMessage = new Error();
    errorWithoutMessage.message = ''; // Empty message
    (userModel as any).update = (jest.fn() as any).mockRejectedValue(errorWithoutMessage);

    const response = await request(app)
      .post('/api/user/cash-out')
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .expect(500);

    expect(response.body).toHaveProperty('message', 'Failed to cash out credits');

    (userModel as any).update = originalUpdate;
  });

});

// Interface DELETE /api/user/profile
describe('DELETE /api/user/profile - Delete User Profile (Mocked)', () => {
  // Mocked behavior: UserController.deleteProfile called with req.user = undefined
  // Input: authenticated request but controller simulates missing req.user
  // Expected status code: 401
  // Expected behavior: detects missing user authentication in controller
  // Expected output: error message 'User not authenticated'
  test('should return 401 when req.user is undefined', async () => {
    const { UserController } = require('../../src/controllers/user.controller');
    const controllerProto = UserController.prototype;
    const originalMethod = controllerProto.deleteProfile;
    
    // Create a spy that calls the original but with req.user = undefined
    controllerProto.deleteProfile = jest.fn().mockImplementation(async (req: any, res: any, next: any) => {
      req.user = undefined; // Simulate missing user
      return originalMethod.call(controllerProto, req, res, next);
    });

    try {
      const response = await request(app)
        .delete('/api/user/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('User not authenticated');
      expect(controllerProto.deleteProfile).toHaveBeenCalled();
    } finally {
      controllerProto.deleteProfile = originalMethod;
    }
  });

  // Mocked behavior: UserController.deleteProfile rejects with error
  // Input: authenticated student request
  // Expected status code: 500
  // Expected behavior: error handler catches controller rejection
  // Expected output: 500 error response
  test('should call next(err) when controller promise rejects', async () => {
    const { UserController } = require('../../src/controllers/user.controller');
    const controllerProto = UserController.prototype;
    const originalMethod = controllerProto.deleteProfile;

    // Mock the controller method to throw an error that will be caught by .catch()
    controllerProto.deleteProfile = (jest.fn() as any).mockRejectedValue(new Error('Controller promise rejection'));

    // Make the API request - this will trigger the .catch((err) => next(err)) block in the route
    const response = await request(app)
      .delete('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(500);
    expect(controllerProto.deleteProfile).toHaveBeenCalled();

    controllerProto.deleteProfile = originalMethod;
  });

  // Mocked behavior: userModel.delete rejects with database error
  // Input: authenticated student request
  // Expected status code: 500
  // Expected behavior: handles database deletion error
  // Expected output: error message 'Database deletion error'
  test('should trigger next(err) for unknown Error types during delete', async () => {
    const originalDelete = userModel.delete;
    userModel.delete = (jest.fn() as any).mockRejectedValue(new Error('Database deletion error'));

    const response = await request(app)
      .delete('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(500);

    expect(response.body).toHaveProperty('message', 'Database deletion error');

    userModel.delete = originalDelete;
  });

  // Mocked behavior: userModel.delete rejects with non-Error string
  // Input: authenticated student request
  // Expected status code: 500
  // Expected behavior: handles non-Error exception during delete
  // Expected output: 500 error response
  test('should trigger next(err) for non-Error exceptions during delete', async () => {
    const originalDelete = userModel.delete;
    userModel.delete = (jest.fn() as any).mockRejectedValue('String error during deletion');

    const response = await request(app)
      .delete('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(500);

    expect(response.status).toBe(500);

    userModel.delete = originalDelete;
  });

  // Mocked behavior: userModel.delete rejects with Error having empty message
  // Input: authenticated student request
  // Expected status code: 500
  // Expected behavior: uses fallback error message when Error.message is empty
  // Expected output: error message 'Failed to delete user'
  test('should use fallback message when Error has no message during delete', async () => {
    const originalDelete = userModel.delete;
    const errorWithoutMessage = new Error();
    errorWithoutMessage.message = ''; // Empty message
    userModel.delete = (jest.fn() as any).mockRejectedValue(errorWithoutMessage);

    const response = await request(app)
      .delete('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(500);

    expect(response.body).toHaveProperty('message', 'Failed to delete user');

    userModel.delete = originalDelete;
  });
});

// Interface UserModel - Database Error Handling via API Endpoints
describe('UserModel - Database Error Handling via API Endpoints', () => {

  describe('update - FCM token handling via endpoint', () => {
    // Mocked behavior: userModel.user.updateMany throws error during token cleanup
    // Input: authenticated student request with new FCM token
    // Expected status code: 500
    // Expected behavior: handles database error during FCM token cleanup operation
    // Expected output: 500 error response, updateMany spy called
    test('should handle database error during FCM token update via endpoint', async () => {
      const actualUserModel = (userModel as any).user;
      const updateManySpy = jest.spyOn(actualUserModel, 'updateMany').mockImplementation(() => {
        throw new Error('Database error during token cleanup');
      });

      try {
        const response = await request(app)
          .post('/api/user/profile')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ fcmToken: 'new-token-that-will-fail' });

        // Verify the spy was called (updateMany is called to clear token from other users)
        expect(updateManySpy).toHaveBeenCalled();
        expect(response.status).toBe(500);
      } finally {
        updateManySpy.mockRestore();
      }
    });
  });

  describe('create', () => {
    // Mocked behavior: AuthService.verifyGoogleToken resolves with valid data, userModel.user.create throws error
    // Input: POST /api/auth/signup with mock ID token
    // Expected status code: 500
    // Expected behavior: handles database creation error during signup
    // Expected output: 500 error response, create spy called
    test('should handle database error when creating user via signup endpoint', async () => {
      const { AuthService } = require('../../src/services/auth.service');
      const serviceProto = AuthService.prototype;
      const originalVerify = serviceProto.verifyGoogleToken;
      
      serviceProto.verifyGoogleToken = (jest.fn() as any).mockResolvedValue({
        googleId: 'test-google-id-for-db-error',
        email: 'dbtest@example.com',
        name: 'DB Error Test User',
      });

      // Mock the create method to throw an error
      const actualUserModel = (userModel as any).user;
      const createSpy = jest.spyOn(actualUserModel, 'create').mockImplementation(() => {
        throw new Error('Database creation error');
      });

      try {
        const response = await request(app)
          .post('/api/auth/signup')
          .send({
            idToken: 'mock-id-token-for-create-test'
          });

        // Verify the create function was called
        expect(createSpy).toHaveBeenCalled();
        // The response should be 500 with an error message
        expect(response.status).toBe(500);
      } finally {
        createSpy.mockRestore();
        serviceProto.verifyGoogleToken = originalVerify;
      }
    });

    // Mocked behavior: AuthService.verifyGoogleToken resolves with invalid data (empty googleId, invalid email)
    // Input: POST /api/auth/signup with mock ID token
    // Expected status code: 500
    // Expected behavior: handles validation error when creating user with invalid data
    // Expected output: 500 error response
    test('should handle validation error when creating user with invalid data via signup', async () => {
      const { AuthService } = require('../../src/services/auth.service');
      const serviceProto = AuthService.prototype;
      const originalVerify = serviceProto.verifyGoogleToken;
      
      serviceProto.verifyGoogleToken = (jest.fn() as any).mockResolvedValue({
        googleId: '', // Invalid: empty googleId
        email: 'invalid-email', // Invalid: not a proper email
        name: '',
      });

      try {
        const response = await request(app)
          .post('/api/auth/signup')
          .send({
            idToken: 'mock-id-token-invalid-data'
          });

        // Should return 500 status code
        expect(response.status).toBe(500);
      } finally {
        serviceProto.verifyGoogleToken = originalVerify;
      }
    });
  });

  describe('delete', () => {
    // Mocked behavior: userModel.user.findByIdAndDelete throws error
    // Input: DELETE /api/user/profile with authenticated temp user
    // Expected status code: 500
    // Expected behavior: handles database deletion error
    // Expected output: 500 error response, delete spy called
    test('should handle database error when deleting user via endpoint', async () => {
      const tempUserId = new mongoose.Types.ObjectId();
      await (userModel as any).user.create({
        _id: tempUserId,
        googleId: `delete-error-test-${tempUserId.toString()}`,
        email: `deleteerror${tempUserId.toString()}@example.com`,
        name: 'Delete Error Test User',
        userRole: 'STUDENT'
      });

      const tempToken = jwt.sign({ id: tempUserId }, process.env.JWT_SECRET || 'default-secret');

      // Mock the delete method to throw an error
      const actualUserModel = (userModel as any).user;
      const deleteSpy = jest.spyOn(actualUserModel, 'findByIdAndDelete').mockImplementation(() => {
        throw new Error('Database deletion error');
      });

      try {
        const response = await request(app)
          .delete('/api/user/profile')
          .set('Authorization', `Bearer ${tempToken}`)
          .expect(500);

        // Verify the delete function was called
        expect(deleteSpy).toHaveBeenCalled();
        expect(response.body).toHaveProperty('message');
      } finally {
        deleteSpy.mockRestore();
        await (userModel as any).user.findByIdAndDelete(tempUserId);
      }
    });

    // Mocked behavior: userModel.user.findByIdAndDelete resolves with null
    // Input: DELETE /api/user/profile with authenticated temp user
    // Expected status code: 200
    // Expected behavior: gracefully handles case where user not found (returns null but doesn't throw)
    // Expected output: success message despite user not found
    test('should handle deleting user gracefully via endpoint', async () => {
      const tempUserId = new mongoose.Types.ObjectId();
      await (userModel as any).user.create({
        _id: tempUserId,
        googleId: `delete-graceful-test-${tempUserId.toString()}`,
        email: `deletegraceful${tempUserId.toString()}@example.com`,
        name: 'Delete Graceful Test User',
        userRole: 'STUDENT'
      });

      const tempToken = jwt.sign({ id: tempUserId }, process.env.JWT_SECRET || 'default-secret');

      // Mock findByIdAndDelete to return null (simulating user not found, but not throwing)
      const actualUserModel = (userModel as any).user;
      const deleteSpy = jest.spyOn(actualUserModel, 'findByIdAndDelete').mockResolvedValue(null);

      try {
        const response = await request(app)
          .delete('/api/user/profile')
          .set('Authorization', `Bearer ${tempToken}`)
          .expect(200);

        expect(deleteSpy).toHaveBeenCalled();
        expect(response.body).toHaveProperty('message', 'User deleted successfully');
      } finally {
        deleteSpy.mockRestore();
        await (userModel as any).user.findByIdAndDelete(tempUserId);
      }
    });
  });
});

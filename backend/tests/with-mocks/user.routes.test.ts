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

describe('GET /api/user/profile - Get User Profile (Mocked)', () => {
  test('should return user profile for authenticated student', async () => {
    const response = await request(app)
      .get('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('message', 'Profile fetched successfully');
    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toHaveProperty('user');
    expect(response.body.data.user).toHaveProperty('email', `usermock${testUserId.toString()}@example.com`);
    expect(response.body.data.user).toHaveProperty('name', 'Test User Mock');
    expect(response.body.data.user).toHaveProperty('userRole', 'STUDENT');
    expect(response.body.data.user).toHaveProperty('_id', testUserId.toString());
  });

  test('should return user profile for authenticated mover with mover-specific fields', async () => {
    const response = await request(app)
      .get('/api/user/profile')
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('message', 'Profile fetched successfully');
    expect(response.body.data.user).toHaveProperty('userRole', 'MOVER');
    expect(response.body.data.user).toHaveProperty('credits', 150);
    expect(response.body.data.user).toHaveProperty('carType', 'Sedan');
    expect(response.body.data.user).toHaveProperty('capacity', 500);
    expect(response.body.data.user).toHaveProperty('plateNumber', 'ABC123');
  });

  test('should return 401 when no token provided', async () => {
    const response = await request(app)
      .get('/api/user/profile')
      .expect(401);

    expect(response.body).toHaveProperty('message');
  });

  test('should return 401 when invalid token provided', async () => {
    await request(app)
      .get('/api/user/profile')
      .set('Authorization', 'Bearer invalid-token-xyz')
      .expect(401);
  });

  test('should return 401 when token has invalid signature', async () => {
    const invalidToken = jwt.sign({ id: testUserId }, 'wrong-secret');
    
    await request(app)
      .get('/api/user/profile')
      .set('Authorization', `Bearer ${invalidToken}`)
      .expect(401);
  });

  test('should return 401 when token is expired', async () => {
    const expiredToken = jwt.sign(
      { id: testUserId },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: '-1h' }
    );
    
    await request(app)
      .get('/api/user/profile')
      .set('Authorization', `Bearer ${expiredToken}`)
      .expect(401);
  });
});

describe('POST /api/user/profile - Update User Profile (Mocked)', () => {
  test('should successfully update user name', async () => {
    const updateData = {
      name: 'Updated Mock User'
    };

    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send(updateData)
      .expect(200);

    expect(response.body).toHaveProperty('message', 'User info updated successfully');
    expect(response.body.data.user).toHaveProperty('name', 'Updated Mock User');
    expect(response.body.data.user).toHaveProperty('_id', testUserId.toString());
  });

  test('should successfully update user bio', async () => {
    const updateData = {
      bio: 'This is my test bio for the mocked user tests'
    };

    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send(updateData)
      .expect(200);

    expect(response.body.data.user).toHaveProperty('bio', 'This is my test bio for the mocked user tests');
  });

  test('should successfully update FCM token', async () => {
    const updateData = {
      fcmToken: 'new-mock-fcm-token-12345'
    };

    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send(updateData)
      .expect(200);

    expect(response.body).toHaveProperty('message', 'User info updated successfully');
    expect(response.body.data.user).toHaveProperty('fcmToken', 'new-mock-fcm-token-12345');
  });

  test('should successfully update multiple fields at once', async () => {
    const updateData = {
      name: 'Multi Update User',
      bio: 'Updated bio',
      fcmToken: 'multi-update-token'
    };

    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send(updateData)
      .expect(200);

    expect(response.body.data.user).toHaveProperty('name', 'Multi Update User');
    expect(response.body.data.user).toHaveProperty('bio', 'Updated bio');
    expect(response.body.data.user).toHaveProperty('fcmToken', 'multi-update-token');
  });

  test('should successfully update mover-specific fields', async () => {
    const updateData = {
      carType: 'SUV',
      capacity: 800,
      plateNumber: 'XYZ789'
    };

    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .send(updateData)
      .expect(200);

    expect(response.body.data.user).toHaveProperty('carType', 'SUV');
    expect(response.body.data.user).toHaveProperty('capacity', 800);
    expect(response.body.data.user).toHaveProperty('plateNumber', 'XYZ789');
  });

  test('should successfully update mover availability', async () => {
    const updateData = {
      availability: {
        MON: [['09:00', '17:00']],
        TUE: [['09:00', '12:00'], ['13:00', '17:00']],
        WED: [['10:00', '16:00']]
      }
    };

    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .send(updateData)
      .expect(200);

    expect(response.body).toHaveProperty('message', 'User info updated successfully');
    expect(response.body.data.user).toHaveProperty('availability');
  });

  test('should reject invalid time format in availability', async () => {
    const updateData = {
      availability: {
        MON: [['25:00', '26:00']] // Invalid hour
      }
    };

    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .send(updateData)
      .expect(400);

    expect(response.body).toHaveProperty('error', 'Validation error');
  });

  test('should reject availability where start time is after end time', async () => {
    const updateData = {
      availability: {
        MON: [['17:00', '09:00']] // End before start
      }
    };

    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .send(updateData)
      .expect(400);

    expect(response.body).toHaveProperty('error', 'Validation error');
  });

  test('should reject bio longer than 500 characters', async () => {
    const updateData = {
      bio: 'a'.repeat(501) // 501 characters
    };

    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send(updateData)
      .expect(400);

    expect(response.body).toHaveProperty('error', 'Validation error');
  });

  test('should reject negative capacity', async () => {
    const updateData = {
      capacity: -100
    };

    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .send(updateData)
      .expect(400);

    expect(response.body).toHaveProperty('error', 'Validation error');
  });

  test('should reject zero capacity', async () => {
    const updateData = {
      capacity: 0
    };

    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .send(updateData)
      .expect(400);

    expect(response.body).toHaveProperty('error', 'Validation error');
  });

  test('should reject negative credits', async () => {
    const updateData = {
      credits: -50
    };

    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .send(updateData)
      .expect(400);

    expect(response.body).toHaveProperty('error', 'Validation error');
  });

  test('should allow updating credits to zero', async () => {
    const updateData = {
      credits: 0
    };

    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .send(updateData)
      .expect(200);

    expect(response.body.data.user).toHaveProperty('credits', 0);
  });

  test('should reject invalid user role', async () => {
    const updateData = {
      userRole: 'ADMIN' // Invalid role
    };

    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send(updateData as any)
      .expect(400);

    expect(response.body).toHaveProperty('error', 'Validation error');
  });

  test('should accept empty optional fields', async () => {
    const updateData = {
      name: 'Name Only Update'
    };

    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send(updateData)
      .expect(200);

    expect(response.body.data.user).toHaveProperty('name', 'Name Only Update');
  });

  test('should return 401 when not authenticated', async () => {
    const updateData = {
      name: 'Should Fail'
    };

    await request(app)
      .post('/api/user/profile')
      .send(updateData)
      .expect(401);
  });

  test('should return 401 with invalid token', async () => {
    const updateData = {
      name: 'Should Fail'
    };

    await request(app)
      .post('/api/user/profile')
      .set('Authorization', 'Bearer invalid-token')
      .send(updateData)
      .expect(401);
  });

  test('should call next(err) when controller promise rejects', async () => {
    // Get reference to the UserController class
    const { UserController } = require('../../src/controllers/user.controller');
    const controllerProto = UserController.prototype;
    const originalMethod = controllerProto.updateProfile;
    // Mock the updateProfile method to reject
    controllerProto.updateProfile = (jest.fn() as any).mockRejectedValue(new Error('Mocked controller error'));
    const updateData = {
        name: 'Should Trigger Error'
        };
    const response = await request(app)
        .post('/api/user/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);
    // Verify the error was handled by the error middleware
    expect(response.status).toBe(500);
    expect(controllerProto.updateProfile).toHaveBeenCalled();
    // Restore the original method
    controllerProto.updateProfile = originalMethod;
  });

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

    // Restore original method
    userModel.update = originalUpdate;
  });

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

    // Restore original method
    userModel.update = originalUpdate;
  });

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

    // Should be caught by the error handler middleware
    expect(response.status).toBe(500);

    // Restore original method
    userModel.update = originalUpdate;
  });

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

    // Restore original method
    userModel.update = originalUpdate;
  });
});

describe('POST /api/user/cash-out - Cash Out (Mocked)', () => {
  test('should successfully cash out credits for mover', async () => {
    // First, ensure mover has credits
    await (userModel as any).user.updateOne(
      { _id: testMoverId },
      { $set: { credits: 200 } }
    );

    const response = await request(app)
      .post('/api/user/cash-out')
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('message', 'Credits cashed out successfully');
    expect(response.body).toHaveProperty('data');
    expect(response.body.data.user).toHaveProperty('credits', 0);
    expect(response.body.data.user).toHaveProperty('userRole', 'MOVER');
  });

  test('should successfully cash out when mover has zero credits', async () => {
    // Set credits to 0
    await (userModel as any).user.updateOne(
      { _id: testMoverId },
      { $set: { credits: 0 } }
    );

    const response = await request(app)
      .post('/api/user/cash-out')
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('message', 'Credits cashed out successfully');
    expect(response.body.data.user).toHaveProperty('credits', 0);
  });

  test('should return 403 when student tries to cash out', async () => {
    const response = await request(app)
      .post('/api/user/cash-out')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(403);

    expect(response.body).toHaveProperty('message', 'Only movers can cash out credits');
  });

  test('should return 401 when not authenticated', async () => {
    await request(app)
      .post('/api/user/cash-out')
      .expect(401);
  });

  test('should return 401 with invalid token', async () => {
    await request(app)
      .post('/api/user/cash-out')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });

  test('should handle cash out with large credit amounts', async () => {
    // Mock a mover with large credits
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

  test('should handle error when user not found during cash out', async () => {
    // Mock userModel.update to return null
    const originalUpdate = (userModel as any).update;
    (userModel as any).update = (jest.fn() as any).mockResolvedValue(null);

    const response = await request(app)
      .post('/api/user/cash-out')
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .expect(404);

    expect(response.body).toHaveProperty('message', 'User not found');

    // Restore original method
    (userModel as any).update = originalUpdate;
  });

  test('should handle error when update fails during cash out', async () => {
    // Mock userModel.update to throw an error
    const originalUpdate = (userModel as any).update;
    (userModel as any).update = (jest.fn() as any).mockRejectedValue(new Error('Database update failed'));

    const response = await request(app)
      .post('/api/user/cash-out')
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .expect(500);

    expect(response.body).toHaveProperty('message', 'Database update failed');

    // Restore original method
    (userModel as any).update = originalUpdate;
  });

  test('should handle non-Error exceptions during cash out', async () => {
    // Mock userModel.update to throw a non-Error object
    const originalUpdate = (userModel as any).update;
    (userModel as any).update = (jest.fn() as any).mockRejectedValue({ code: 500, message: 'System error' });

    const response = await request(app)
      .post('/api/user/cash-out')
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .expect(500);

    // Should be caught by the error handler middleware
    expect(response.status).toBe(500);

    // Restore original method
    (userModel as any).update = originalUpdate;
  });

  test('should call next(err) when controller promise rejects', async () => {
    // Get reference to the UserController class
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
    // Restore the original method
    controllerProto.cashOut = originalMethod;
  });

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

    // Restore original method
    (userModel as any).update = originalUpdate;
  });

});

describe('DELETE /api/user/profile - Delete User Profile (Mocked)', () => {
  test('should successfully delete user profile', async () => {
    // Create a temporary user for deletion
    const tempUserId = new mongoose.Types.ObjectId();
    await (userModel as any).user.create({
      _id: tempUserId,
      googleId: `temp-google-id-${tempUserId.toString()}`,
      email: `temp${tempUserId.toString()}@example.com`,
      name: 'Temp User',
      userRole: 'STUDENT'
    });

    const tempToken = jwt.sign({ id: tempUserId }, process.env.JWT_SECRET || 'default-secret');

    const response = await request(app)
      .delete('/api/user/profile')
      .set('Authorization', `Bearer ${tempToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('message', 'User deleted successfully');

    // Verify user was actually deleted
    const deletedUser = await (userModel as any).user.findById(tempUserId);
    expect(deletedUser).toBeNull();
  });

  test('should successfully delete mover profile with all mover-specific data', async () => {
    // Create a temporary mover for deletion
    const tempMoverId = new mongoose.Types.ObjectId();
    await (userModel as any).user.create({
      _id: tempMoverId,
      googleId: `temp-mover-google-id-${tempMoverId.toString()}`,
      email: `tempmover${tempMoverId.toString()}@example.com`,
      name: 'Temp Mover',
      userRole: 'MOVER',
      credits: 500,
      carType: 'Truck',
      capacity: 1000
    });

    const tempToken = jwt.sign({ id: tempMoverId }, process.env.JWT_SECRET || 'default-secret');

    const response = await request(app)
      .delete('/api/user/profile')
      .set('Authorization', `Bearer ${tempToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('message', 'User deleted successfully');

    // Verify mover was actually deleted
    const deletedMover = await (userModel as any).user.findById(tempMoverId);
    expect(deletedMover).toBeNull();
  });

  test('should return 401 when not authenticated', async () => {
    await request(app)
      .delete('/api/user/profile')
      .expect(401);
  });

  test('should return 401 with invalid token', async () => {
    await request(app)
      .delete('/api/user/profile')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });

  test('should successfully delete user with FCM token', async () => {
    // Create a temporary user with FCM token
    const tempUserId = new mongoose.Types.ObjectId();
    await (userModel as any).user.create({
      _id: tempUserId,
      googleId: `temp-fcm-google-id-${tempUserId.toString()}`,
      email: `tempfcm${tempUserId.toString()}@example.com`,
      name: 'Temp FCM User',
      userRole: 'STUDENT',
      fcmToken: 'temp-fcm-token-to-delete'
    });

    const tempToken = jwt.sign({ id: tempUserId }, process.env.JWT_SECRET || 'default-secret');

    const response = await request(app)
      .delete('/api/user/profile')
      .set('Authorization', `Bearer ${tempToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('message', 'User deleted successfully');

    // Verify user and their FCM token are deleted
    const deletedUser = await (userModel as any).user.findById(tempUserId);
    expect(deletedUser).toBeNull();
  });

  test('should call next(err) when controller promise rejects', async () => {
    // Get reference to the UserController class
    const { UserController } = require('../../src/controllers/user.controller');
    const controllerProto = UserController.prototype;
    const originalMethod = controllerProto.deleteProfile;

    // Mock the controller method to throw an error that will be caught by .catch()
    controllerProto.deleteProfile = (jest.fn() as any).mockRejectedValue(new Error('Controller promise rejection'));

    // Make the API request - this will trigger the .catch((err) => next(err)) block in the route
    const response = await request(app)
      .delete('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`);

    // Verify the error was handled by the error middleware
    expect(response.status).toBe(500);
    expect(controllerProto.deleteProfile).toHaveBeenCalled();

    // Restore the original method
    controllerProto.deleteProfile = originalMethod;
  });

  test('should trigger next(err) for unknown Error types during delete', async () => {
    const originalDelete = userModel.delete;
    userModel.delete = (jest.fn() as any).mockRejectedValue(new Error('Database deletion error'));

    const response = await request(app)
      .delete('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(500);

    expect(response.body).toHaveProperty('message', 'Database deletion error');

    // Restore original method
    userModel.delete = originalDelete;
  });

  test('should trigger next(err) for non-Error exceptions during delete', async () => {
    const originalDelete = userModel.delete;
    userModel.delete = (jest.fn() as any).mockRejectedValue('String error during deletion');

    const response = await request(app)
      .delete('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(500);

    // Should be caught by the error handler middleware
    expect(response.status).toBe(500);

    // Restore original method
    userModel.delete = originalDelete;
  });

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

    // Restore original method
    userModel.delete = originalDelete;
  });
});

describe('UserModel - Database Error Handling', () => {
  describe('findById', () => {
    test('should handle findOne throwing an error in findById', async () => {
      // Get access to the actual mongoose model
      const actualUserModel = (userModel as any).user;
      const findOneSpy = jest.spyOn(actualUserModel, 'findOne').mockImplementation(() => {
        throw new Error('Database connection error');
      });

      try {
        await userModel.findById(testUserId);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe('Failed to find user');
      } finally {
        findOneSpy.mockRestore();
      }
    });

    test('should return null when user not found by id', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const result = await userModel.findById(nonExistentId);
      expect(result).toBeNull();
    });
  });

  describe('findByGoogleId', () => {
    test('should handle findOne throwing an error in findByGoogleId', async () => {
      const actualUserModel = (userModel as any).user;
      const findOneSpy = jest.spyOn(actualUserModel, 'findOne').mockImplementation(() => {
        throw new Error('Database query failed');
      });

      try {
        await userModel.findByGoogleId('test-google-id');
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe('Failed to find user');
      } finally {
        findOneSpy.mockRestore();
      }
    });

    test('should return null when user not found by googleId', async () => {
      const result = await userModel.findByGoogleId('non-existent-google-id');
      expect(result).toBeNull();
    });

    test('should successfully find user by googleId', async () => {
      const result = await userModel.findByGoogleId(`test-google-id-user-mock-${testUserId.toString()}`);
      expect(result).not.toBeNull();
      expect(result?.googleId).toBe(`test-google-id-user-mock-${testUserId.toString()}`);
    });
  });

  describe('getFcmToken', () => {
    test('should handle database error when getting FCM token', async () => {
      const actualUserModel = (userModel as any).user;
      const findByIdSpy = jest.spyOn(actualUserModel, 'findById').mockImplementation(() => {
        throw new Error('Database read error');
      });

      try {
        await userModel.getFcmToken(testUserId);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe('Failed to get FCM token');
      } finally {
        findByIdSpy.mockRestore();
      }
    });

    test('should return null when user not found for FCM token', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const result = await userModel.getFcmToken(nonExistentId);
      expect(result).toBeNull();
    });

    test('should return FCM token when user exists', async () => {
      // Reset the user's FCM token to ensure test isolation
      await (userModel as any).user.findByIdAndUpdate(testUserId, { fcmToken: 'initial-fcm-token' });
      const result = await userModel.getFcmToken(testUserId);
      expect(result).toBe('initial-fcm-token');
    });

    test('should return null when user has no FCM token', async () => {
      const result = await userModel.getFcmToken(testMoverId);
      expect(result).toBeNull();
    });
  });

  describe('clearInvalidFcmToken', () => {
    test('should handle database error when clearing invalid FCM token', async () => {
      const actualUserModel = (userModel as any).user;
      const updateManySpy = jest.spyOn(actualUserModel, 'updateMany').mockImplementation(() => {
        throw new Error('Database update failed');
      });

      try {
        await userModel.clearInvalidFcmToken('invalid-token');
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe('Failed to clear invalid FCM token');
      } finally {
        updateManySpy.mockRestore();
      }
    });

    test('should successfully clear invalid FCM token', async () => {
      // First set a test token
      await (userModel as any).user.findByIdAndUpdate(
        testUserId,
        { fcmToken: 'test-invalid-token' }
      );

      // Clear it
      await userModel.clearInvalidFcmToken('test-invalid-token');

      // Verify it was cleared
      const user = await userModel.findById(testUserId);
      expect(user?.fcmToken).toBeNull();

      // Restore original token
      await (userModel as any).user.findByIdAndUpdate(
        testUserId,
        { fcmToken: 'initial-fcm-token' }
      );
    });

    test('should handle clearing non-existent token gracefully', async () => {
      // Should not throw error even if token doesn't exist
      await expect(
        userModel.clearInvalidFcmToken('non-existent-token-xyz')
      ).resolves.not.toThrow();
    });
  });

  describe('update - FCM token handling', () => {
    test('should handle database error during FCM token update', async () => {
      const actualUserModel = (userModel as any).user;
      const updateManySpy = jest.spyOn(actualUserModel, 'updateMany').mockImplementation(() => {
        throw new Error('Database error during token cleanup');
      });

      try {
        await userModel.update(testUserId, { fcmToken: 'new-token' });
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: any) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe('Failed to update user');
      } finally {
        updateManySpy.mockRestore();
      }
    });

    test('should clear FCM token from other users when assigning to new user', async () => {
      const sharedToken = 'shared-fcm-token-123';
      
      // Assign token to mover first
      await userModel.update(testMoverId, { fcmToken: sharedToken });
      let mover = await userModel.findById(testMoverId);
      expect(mover?.fcmToken).toBe(sharedToken);

      // Now assign same token to student - should clear from mover
      await userModel.update(testUserId, { fcmToken: sharedToken });
      
      // Verify mover's token was cleared
      mover = await userModel.findById(testMoverId);
      expect(mover?.fcmToken).toBeNull();

      // Verify student has the token
      const student = await userModel.findById(testUserId);
      expect(student?.fcmToken).toBe(sharedToken);

      // Restore original token
      await (userModel as any).user.findByIdAndUpdate(
        testUserId,
        { fcmToken: 'initial-fcm-token' }
      );
    });
  });

  describe('create', () => {
    test('should handle database error when creating user', async () => {
      const actualUserModel = (userModel as any).user;
      const createSpy = jest.spyOn(actualUserModel, 'create').mockImplementation(() => {
        throw new Error('Database creation error');
      });

      try {
        await expect(userModel.create({
          googleId: 'test-google-id',
          email: 'test@example.com',
          name: 'Test User',
        })).rejects.toThrow('Failed to update user');
      } finally {
        createSpy.mockRestore();
      }
    });

    test('should handle validation error when creating user with invalid data', async () => {
      await expect(userModel.create({
        googleId: '', // Invalid: empty googleId
        email: 'invalid-email', // Invalid: not a proper email
        name: '',
      } as any)).rejects.toThrow('Invalid update data');
    });

    test('should successfully create user with valid data', async () => {
      const newUserId = new mongoose.Types.ObjectId();
      const userData = {
        googleId: `create-test-${newUserId.toString()}`,
        email: `createtest${newUserId.toString()}@example.com`,
        name: 'Create Test User',
      };

      const createdUser = await userModel.create(userData);
      expect(createdUser).toBeDefined();
      expect(createdUser.googleId).toBe(userData.googleId);
      expect(createdUser.email).toBe(userData.email);
      expect(createdUser.name).toBe(userData.name);

      // Clean up
      await (userModel as any).user.findByIdAndDelete(createdUser._id);
    });
  });

  describe('delete', () => {
    test('should handle database error when deleting user', async () => {
      const actualUserModel = (userModel as any).user;
      const deleteSpy = jest.spyOn(actualUserModel, 'findByIdAndDelete').mockImplementation(() => {
        throw new Error('Database deletion error');
      });

      try {
        await expect(userModel.delete(testUserId)).rejects.toThrow('Failed to delete user');
      } finally {
        deleteSpy.mockRestore();
      }
    });

    test('should successfully delete user', async () => {
      // Create a temporary user to delete
      const tempUserId = new mongoose.Types.ObjectId();
      await (userModel as any).user.create({
        _id: tempUserId,
        googleId: `delete-test-${tempUserId.toString()}`,
        email: `deletetest${tempUserId.toString()}@example.com`,
        name: 'Delete Test User',
      });

      // Verify user exists
      const userBefore = await userModel.findById(tempUserId);
      expect(userBefore).not.toBeNull();

      // Delete the user
      await userModel.delete(tempUserId);

      // Verify user is deleted
      const userAfter = await userModel.findById(tempUserId);
      expect(userAfter).toBeNull();
    });

    test('should handle deleting non-existent user gracefully', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      
      // Should not throw an error even if user doesn't exist
      await expect(userModel.delete(nonExistentId)).resolves.not.toThrow();
    });
  });
});

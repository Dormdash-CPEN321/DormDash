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
  test('should return 401 when req.user is undefined (line 10)', async () => {
    // Mock the UserController's getProfile to simulate req.user being undefined
    const { UserController } = require('../../src/controllers/user.controller');
    const controllerProto = UserController.prototype;
    const originalMethod = controllerProto.getProfile;
    
    // Create a spy that calls the original but with req.user = undefined
    controllerProto.getProfile = jest.fn().mockImplementation((req: any, res: any) => {
      req.user = undefined; // Simulate missing user
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
  test('should return 401 when req.user is undefined (line 30)', async () => {
    // Mock the UserController's updateProfile to simulate req.user being undefined
    const { UserController } = require('../../src/controllers/user.controller');
    const controllerProto = UserController.prototype;
    const originalMethod = controllerProto.updateProfile;
    
    // Create a spy that calls the original but with req.user = undefined
    controllerProto.updateProfile = jest.fn().mockImplementation(async (req: any, res: any, next: any) => {
      req.user = undefined; // Simulate missing user
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
  test('should return 401 when req.user is undefined (line 92)', async () => {
    // Mock the UserController's cashOut to simulate req.user being undefined
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
  test('should return 401 when req.user is undefined (line 65)', async () => {
    // Mock the UserController's deleteProfile to simulate req.user being undefined
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

describe('UserModel - Database Error Handling via API Endpoints', () => {
  // Tests for userModel.update FCM token handling are done through POST /api/user/profile
  // Tests for userModel.findById are done through any authenticated endpoint (auth middleware)
  // Tests for userModel.findByGoogleId are done through /api/auth/signup and /api/auth/login in auth.routes.test.ts
  // Tests for userModel.create are done through /api/auth/signup
  // Tests for userModel.delete are done through DELETE /api/user/profile
  // Tests for userModel.getFcmToken and clearInvalidFcmToken are internal to notification service (not exposed via REST)

  describe('update - FCM token handling via endpoint', () => {
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

    test('should clear FCM token from other users when assigning to new user via endpoint', async () => {
      const sharedToken = 'shared-fcm-token-via-endpoint-123';
      
      // Assign token to mover first via endpoint
      await request(app)
        .post('/api/user/profile')
        .set('Authorization', `Bearer ${moverAuthToken}`)
        .send({ fcmToken: sharedToken })
        .expect(200);

      // Verify mover has the token
      let moverResponse = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${moverAuthToken}`)
        .expect(200);
      expect(moverResponse.body.data.user.fcmToken).toBe(sharedToken);

      // Now assign same token to student via endpoint - should clear from mover
      await request(app)
        .post('/api/user/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ fcmToken: sharedToken })
        .expect(200);
      
      // Verify mover's token was cleared
      moverResponse = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${moverAuthToken}`)
        .expect(200);
      expect(moverResponse.body.data.user.fcmToken).toBeNull();

      // Verify student has the token
      const studentResponse = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      expect(studentResponse.body.data.user.fcmToken).toBe(sharedToken);

      // Restore original token
      await request(app)
        .post('/api/user/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ fcmToken: 'initial-fcm-token' })
        .expect(200);
    });
  });

  describe('create', () => {
    test('should handle database error when creating user via signup endpoint', async () => {
      // Mock Google verification to return valid data first
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

    test('should handle validation error when creating user with invalid data via signup', async () => {
      // Mock the Google verification to return invalid data
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

    test('should successfully create user via signup endpoint', async () => {
      // Mock Google verification to return valid data
      const { AuthService } = require('../../src/services/auth.service');
      const serviceProto = AuthService.prototype;
      const originalVerify = serviceProto.verifyGoogleToken;
      
      const newUserId = new mongoose.Types.ObjectId();
      const mockUserData = {
        googleId: `signup-test-${newUserId.toString()}`,
        email: `signuptest${newUserId.toString()}@example.com`,
        name: 'Signup Test User',
      };

      serviceProto.verifyGoogleToken = (jest.fn() as any).mockResolvedValue(mockUserData);

      try {
        const response = await request(app)
          .post('/api/auth/signup')
          .send({
            idToken: 'mock-valid-id-token'
          })
          .expect(201);

        expect(response.body).toHaveProperty('message', 'User signed up successfully');
        expect(response.body.data.user).toHaveProperty('email', mockUserData.email);
        expect(response.body.data.user).toHaveProperty('name', mockUserData.name);
        expect(response.body.data).toHaveProperty('token');

        // Clean up - find and delete the created user
        const createdUser = await (userModel as any).user.findOne({ googleId: mockUserData.googleId });
        if (createdUser) {
          await (userModel as any).user.findByIdAndDelete(createdUser._id);
        }
      } finally {
        serviceProto.verifyGoogleToken = originalVerify;
      }
    });
  });

  describe('delete', () => {
    test('should handle database error when deleting user via endpoint', async () => {
      // Create a temporary user for this test
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
        // Clean up - manually delete the user
        await (userModel as any).user.findByIdAndDelete(tempUserId);
      }
    });

    test('should successfully delete user via endpoint', async () => {
      // Create a temporary user to delete
      const tempUserId = new mongoose.Types.ObjectId();
      await (userModel as any).user.create({
        _id: tempUserId,
        googleId: `delete-success-test-${tempUserId.toString()}`,
        email: `deletesuccess${tempUserId.toString()}@example.com`,
        name: 'Delete Success Test User',
        userRole: 'STUDENT'
      });

      const tempToken = jwt.sign({ id: tempUserId }, process.env.JWT_SECRET || 'default-secret');

      // Verify user exists before deletion
      const userBefore = await userModel.findById(tempUserId);
      expect(userBefore).not.toBeNull();

      // Delete the user via endpoint
      const response = await request(app)
        .delete('/api/user/profile')
        .set('Authorization', `Bearer ${tempToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'User deleted successfully');

      // Verify user is deleted
      const userAfter = await userModel.findById(tempUserId);
      expect(userAfter).toBeNull();
    });

    test('should handle deleting user gracefully via endpoint', async () => {
      // Create a temporary user
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
        // Clean up
        await (userModel as any).user.findByIdAndDelete(tempUserId);
      }
    });
  });
});

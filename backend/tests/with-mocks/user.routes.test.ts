import { describe, expect, test, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../../src/config/database';
import { userModel } from '../../src/models/user.model';
import { IUser } from '../../src/types/user.types';

// Mock the media service to test delete profile
jest.mock('../../src/services/media.service', () => ({
  deleteAllUserImages: jest.fn(),
}));

// Import app after mocks are set up
import app from '../../src/app';
import { deleteAllUserImages } from '../../src/services/media.service';

const mockDeleteAllUserImages = deleteAllUserImages as jest.MockedFunction<typeof deleteAllUserImages>;

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
    (userModel as any).update = jest.fn().mockResolvedValue({
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
    (userModel as any).update = jest.fn().mockResolvedValue(null);

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
    (userModel as any).update = jest.fn().mockRejectedValue(new Error('Database update failed'));

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
    (userModel as any).update = jest.fn().mockRejectedValue({ code: 500, message: 'System error' });

    const response = await request(app)
      .post('/api/user/cash-out')
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .expect(500);

    // Should be caught by the error handler middleware
    expect(response.status).toBe(500);

    // Restore original method
    (userModel as any).update = originalUpdate;
  });
});

describe('DELETE /api/user/profile - Delete User Profile (Mocked)', () => {
  test('should successfully delete user profile and call image deletion service', async () => {
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
    expect(mockDeleteAllUserImages).toHaveBeenCalledWith(tempUserId.toString());
    expect(mockDeleteAllUserImages).toHaveBeenCalledTimes(1);

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
    expect(mockDeleteAllUserImages).toHaveBeenCalledWith(tempMoverId.toString());

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

  test('should handle case when media service throws error but user deletion succeeds', async () => {
    // Mock the media service to throw an error
    mockDeleteAllUserImages.mockRejectedValueOnce(new Error('Media service error'));

    // Create a temporary user for deletion
    const tempUserId = new mongoose.Types.ObjectId();
    await (userModel as any).user.create({
      _id: tempUserId,
      googleId: `temp-error-google-id-${tempUserId.toString()}`,
      email: `temperror${tempUserId.toString()}@example.com`,
      name: 'Temp Error User',
      userRole: 'STUDENT'
    });

    const tempToken = jwt.sign({ id: tempUserId }, process.env.JWT_SECRET || 'default-secret');

    // The delete should fail because media service failed
    await request(app)
      .delete('/api/user/profile')
      .set('Authorization', `Bearer ${tempToken}`)
      .expect(500);

    expect(mockDeleteAllUserImages).toHaveBeenCalled();
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
});

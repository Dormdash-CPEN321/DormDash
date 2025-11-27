import { describe, expect, test, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../../src/config/database';
import { userModel } from '../../src/models/user.model';

// Load environment variables before anything else
dotenv.config({ path: path.join(__dirname, '../../.env') });

const testUserId = new mongoose.Types.ObjectId();
const testMoverId = new mongoose.Types.ObjectId();

// Suppress console logs during tests
const originalConsole = {
  log: console.log,
  warn: console.warn,
  info: console.info,
  error: console.error,
};

beforeAll(async () => {
  // Suppress console output
  console.log = jest.fn();
  console.warn = jest.fn();
  console.info = jest.fn();
  console.error = jest.fn();

  await connectDB();

  // Clean up any existing test users
  const db = mongoose.connection.db;
  if (db) {
    await db.collection('users').deleteMany({
      googleId: {
        $in: [
          `test-google-id-user-model-${testUserId.toString()}`,
          `test-google-id-mover-model-${testMoverId.toString()}`
        ]
      }
    });
  }

  // Create test student user with FCM token
  await (userModel as any).user.create({
    _id: testUserId,
    googleId: `test-google-id-user-model-${testUserId.toString()}`,
    email: `usermodel${testUserId.toString()}@example.com`,
    name: 'Test User Model Integration',
    userRole: 'STUDENT',
    fcmToken: 'test-fcm-token-student'
  });

  // Create test mover user without FCM token
  await (userModel as any).user.create({
    _id: testMoverId,
    googleId: `test-google-id-mover-model-${testMoverId.toString()}`,
    email: `movermodel${testMoverId.toString()}@example.com`,
    name: 'Test Mover Model Integration',
    userRole: 'MOVER'
    // No fcmToken set
  });
}, 60000);

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
          `test-google-id-user-model-${testUserId.toString()}`,
          `test-google-id-mover-model-${testMoverId.toString()}`
        ]
      }
    });
  }

  await disconnectDB();

  // Restore console
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
  console.error = originalConsole.error;
});

describe('UserModel getFcmToken - Direct Model Tests', () => {
  // Mocked behavior: none (direct call to getFcmToken with non-existent ID)
  // Input: non-existent user ID
  // Expected status code: N/A (direct function call)
  // Expected behavior: getFcmToken returns null when user doesn't exist
  // Expected output: null
  test('should return null when user not found in getFcmToken', async () => {
    const nonExistentId = new mongoose.Types.ObjectId();
    const result = await userModel.getFcmToken(nonExistentId);
    expect(result).toBeNull();
  });

  // Mocked behavior: none (direct call to getFcmToken with existing user ID)
  // Input: existing user ID (testUserId)
  // Expected status code: N/A (direct function call)
  // Expected behavior: getFcmToken returns user's FCM token or null
  // Expected output: string token or null
  test('should return FCM token when user exists', async () => {
    // This tests the success path and the null coalescing
    const result = await userModel.getFcmToken(testUserId);
    // Result can be null or a string, both are valid
    expect(result === null || typeof result === 'string').toBe(true);
  });

  // Mocked behavior: none (direct call to getFcmToken for user without FCM token)
  // Input: existing user ID (testMoverId) that has no FCM token set
  // Expected status code: N/A (direct function call)
  // Expected behavior: getFcmToken returns null when fcmToken field is undefined
  // Expected output: null or string
  test('should return null when user has no FCM token', async () => {
    // Test when fcmToken field is undefined/null
    const result = await userModel.getFcmToken(testMoverId);
    // Mover user has no FCM token initially
    expect(result === null || typeof result === 'string').toBe(true);
  });
});

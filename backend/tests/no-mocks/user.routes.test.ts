import { describe, expect, test, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../../src/app';
import { connectDB, disconnectDB } from '../../src/config/database';
import { userModel } from '../../src/models/user.model';

// Suppress console logs during tests
const originalConsole = {
  log: console.log,
  warn: console.warn,
  info: console.info,
};

let authToken: string;
const testUserId = new mongoose.Types.ObjectId('507f1f77bcf86cd799439022');

beforeAll(async () => {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.info = jest.fn();
  // Connect to test database
  await connectDB();

  // Clean up any existing test user by googleId
  const db = mongoose.connection.db;
  if (db) {
    await db.collection('users').deleteMany({ googleId: 'test-google-id-user' });
  }

  // Create a test user in DB with specific _id
  await (userModel as any).user.create({
    _id: testUserId,
    googleId: 'test-google-id-user',
    email: 'testuser@example.com',
    name: 'Test User',
    userRole: 'STUDENT',
    phoneNumber: '1234567890'
  });

  // Generate a real JWT token for testing
  const payload = { id: testUserId };
  authToken = jwt.sign(payload, process.env.JWT_SECRET || 'default-secret');
});

beforeEach(async () => {
  // Reset test user to default state before each test
  const db = mongoose.connection.db;
  if (db) {
    await db.collection('users').updateOne(
      { _id: testUserId },
      {
        $set: {
          googleId: 'test-google-id-user',
          email: 'testuser@example.com',
          name: 'Test User',
          userRole: 'STUDENT',
          phoneNumber: '1234567890'
        }
      }
    );
  }
});

afterAll(async () => {
  // Clean up test user
  const db = mongoose.connection.db;
  if (db) {
    await db.collection('users').deleteMany({ googleId: 'test-google-id-user' });
  }
  
  // Disconnect from test database
  await disconnectDB();
  
  // Restore console functions
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
});




describe('GET /api/user/profile - Get User Profile', () => {
  test('should return user profile for authenticated user', async () => {
    const response = await request(app)
      .get('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toHaveProperty('user');
    expect(response.body.data.user).toHaveProperty('email', 'testuser@example.com');
    expect(response.body.data.user).toHaveProperty('name', 'Test User');
    expect(response.body.data.user).toHaveProperty('userRole', 'STUDENT');
  });

  test('should require authentication', async () => {
    await request(app)
      .get('/api/user/profile')
      .expect(401);
  });

  test('should reject invalid token', async () => {
    await request(app)
      .get('/api/user/profile')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });
});

describe('POST /api/user/profile - Update User Profile', () => {
  test('should update user profile successfully', async () => {
    const updateData = {
      name: 'Updated Test User',
      phoneNumber: '9876543210'
    };

    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send(updateData)
      .expect(200);

    expect(response.body).toHaveProperty('message', 'User info updated successfully');
    expect(response.body).toHaveProperty('data');
    expect(response.body.data.user).toHaveProperty('name', 'Updated Test User');
    expect(response.body.data.user).toHaveProperty('phoneNumber', '9876543210');
  });

  test('should update FCM token', async () => {
    const updateData = {
      fcmToken: 'new-fcm-token-12345'
    };

    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send(updateData)
      .expect(200);

    expect(response.body).toHaveProperty('message', 'User info updated successfully');
    expect(response.body.data.user).toHaveProperty('fcmToken', 'new-fcm-token-12345');
  });

  test('should require authentication', async () => {
    const updateData = {
      name: 'Updated Name'
    };

    await request(app)
      .post('/api/user/profile')
      .send(updateData)
      .expect(401);
  });

  test('should validate request body', async () => {
    // Send invalid data (empty object or invalid fields)
    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send({})
      .expect(400);

    expect(response.body).toHaveProperty('message');
  });
});

describe('POST /api/user/cash-out - Cash Out', () => {
  test('should require authentication', async () => {
    await request(app)
      .post('/api/user/cash-out')
      .expect(401);
  });

  test('should handle cash out request for authenticated user', async () => {
    // Update user to be a mover with credits before cashing out
    const db = mongoose.connection.db;
    if (db) {
      await db.collection('users').updateOne(
        { _id: testUserId },
        { $set: { userRole: 'MOVER', credits: 100 } }
      );
    }

    const response = await request(app)
      .post('/api/user/cash-out')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('message');
    expect(response.body.message).toContain('cash');
  });
});

describe('DELETE /api/user/profile - Delete User Profile', () => {
  test('should require authentication', async () => {
    await request(app)
      .delete('/api/user/profile')
      .expect(401);
  });

  test('should delete user profile successfully', async () => {
    const response = await request(app)
      .delete('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('message');
    expect(response.body.message).toContain('deleted');
  });
});

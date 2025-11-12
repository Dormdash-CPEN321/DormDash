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
const testUserId = new mongoose.Types.ObjectId(); // Generate unique ID

beforeAll(async () => {
  // Suppress all console output during tests
  console.warn = jest.fn();
  console.info = jest.fn();
  // Connect to test database
  await connectDB();

    // Clean up any existing test user by googleId
  const db = mongoose.connection.db;
  if (db) {
    await db.collection('users').deleteMany({ googleId: `test-google-id-user-${testUserId.toString()}` });
  }

  // Create a test user in DB with specific _id
  await (userModel as any).user.create({
    _id: testUserId,
    googleId: `test-google-id-user-${testUserId.toString()}`,
    email: `user${testUserId.toString()}@example.com`,
    name: 'Test User',
    userRole: 'STUDENT'
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
          googleId: `test-google-id-user-${testUserId.toString()}`,
          email: `testuser${testUserId.toString()}@example.com`,
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
    await db.collection('users').deleteMany({ googleId: `test-google-id-user-${testUserId.toString()}` });
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
    expect(response.body.data.user).toHaveProperty('email', `testuser${testUserId.toString()}@example.com`);
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
      bio: 'This is my updated bio'
    };

    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send(updateData)
      .expect(200);

    expect(response.body).toHaveProperty('message', 'User info updated successfully');
    expect(response.body).toHaveProperty('data');
    expect(response.body.data.user).toHaveProperty('name', 'Updated Test User');
    expect(response.body.data.user).toHaveProperty('bio', 'This is my updated bio');
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

  test('should reject invalid bio that exceeds 500 characters', async () => {
    const updateData = {
      bio: 'a'.repeat(501) // 501 characters, exceeds limit
    };

    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send(updateData)
      .expect(400);

    expect(response.body).toHaveProperty('error', 'Validation error');
  });

  test('should reject invalid user role', async () => {
    const updateData = {
      userRole: 'INVALID_ROLE' as any
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
      .set('Authorization', `Bearer ${authToken}`)
      .send(updateData)
      .expect(400);

    expect(response.body).toHaveProperty('error', 'Validation error');
  });

  test('should accept valid mover availability schedule', async () => {
    const updateData = {
      availability: {
        MON: [['09:00', '17:00']],
        WED: [['10:00', '14:00'], ['15:00', '18:00']]
      }
    };

    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send(updateData)
      .expect(200);

    expect(response.body.data.user).toHaveProperty('availability');
  });

  test('should reject invalid time format in availability', async () => {
    const updateData = {
      availability: {
        MON: [['25:00', '26:00']] // Invalid hours
      }
    };

    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send(updateData)
      .expect(400);

    expect(response.body).toHaveProperty('error', 'Validation error');
  });
});

describe('POST /api/user/cash-out - Cash Out', () => {
  test('should require authentication', async () => {
    await request(app)
      .post('/api/user/cash-out')
      .expect(401);
  });

  test('should return 403 for non-mover users', async () => {
    // Test user is a STUDENT, not a MOVER
    const response = await request(app)
      .post('/api/user/cash-out')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(403);

    expect(response.body).toHaveProperty('message', 'Only movers can cash out credits');
  });

  test('should successfully cash out for mover with credits', async () => {
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

    expect(response.body).toHaveProperty('message', 'Credits cashed out successfully');
    expect(response.body.data.user).toHaveProperty('credits', 0);

    // Reset user back to STUDENT for other tests
    if (db) {
      await db.collection('users').updateOne(
        { _id: testUserId },
        { $set: { userRole: 'STUDENT', credits: 0 } }
      );
    }
  });

  test('should handle cash out when mover has zero credits', async () => {
    const db = mongoose.connection.db;
    if (db) {
      await db.collection('users').updateOne(
        { _id: testUserId },
        { $set: { userRole: 'MOVER', credits: 0 } }
      );
    }

    const response = await request(app)
      .post('/api/user/cash-out')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('message', 'Credits cashed out successfully');
    expect(response.body.data.user).toHaveProperty('credits', 0);

    // Reset user back to STUDENT
    if (db) {
      await db.collection('users').updateOne(
        { _id: testUserId },
        { $set: { userRole: 'STUDENT' } }
      );
    }
  });
});

describe('DELETE /api/user/profile - Delete Profile', () => {
  test('should require authentication', async () => {
    await request(app)
      .delete('/api/user/profile')
      .expect(401);
  });

  test('should successfully delete authenticated user profile', async () => {
    // Create a temporary user for deletion using User model
    const db = mongoose.connection.db;
    const tempUserId = new mongoose.Types.ObjectId();
    const tempGoogleId = `google-temp-${Date.now()}-${Math.random()}`;
    
    if (db) {
      await db.collection('users').insertOne({
        _id: tempUserId,
        name: 'Temp User',
        email: `temp-${Date.now()}@test.com`,
        googleId: tempGoogleId,
        userRole: 'STUDENT',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    const tempToken = jwt.sign(
      { id: tempUserId.toString(), userRole: 'STUDENT' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '24h' }
    );

    const response = await request(app)
      .delete('/api/user/profile')
      .set('Authorization', `Bearer ${tempToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('message', 'User deleted successfully');

    // Verify user is actually deleted
    if (db) {
      const deletedUser = await db.collection('users').findOne({ _id: tempUserId });
      expect(deletedUser).toBeNull();
    }
  });

  test('should handle deletion of user with FCM tokens', async () => {
    // Create a temporary user with FCM token
    const db = mongoose.connection.db;
    const tempUserId = new mongoose.Types.ObjectId();
    const tempGoogleId = `google-tempfcm-${Date.now()}-${Math.random()}`;
    
    if (db) {
      await db.collection('users').insertOne({
        _id: tempUserId,
        name: 'Temp User with FCM',
        email: `tempfcm-${Date.now()}@test.com`,
        googleId: tempGoogleId,
        userRole: 'STUDENT',
        fcmToken: 'test-fcm-token-delete',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    const tempToken = jwt.sign(
      { id: tempUserId.toString(), userRole: 'STUDENT' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '24h' }
    );

    const response = await request(app)
      .delete('/api/user/profile')
      .set('Authorization', `Bearer ${tempToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('message', 'User deleted successfully');

    // Verify user and FCM token are deleted
    if (db) {
      const deletedUser = await db.collection('users').findOne({ _id: tempUserId });
      expect(deletedUser).toBeNull();
    }
  });
});

describe('FCM Token Handling', () => {
  test('should move FCM token from one user to another on update', async () => {
    const db = mongoose.connection.db;
    const secondUserId = new mongoose.Types.ObjectId();
    const sharedFcmToken = `shared-fcm-token-${Date.now()}-${Math.random()}`;
    const secondGoogleId = `google-second-${Date.now()}-${Math.random()}`;

    // Create first user with FCM token
    if (db) {
      await db.collection('users').insertOne({
        _id: secondUserId,
        name: 'Second User',
        email: `second-${Date.now()}@test.com`,
        googleId: secondGoogleId,
        userRole: 'STUDENT',
        fcmToken: sharedFcmToken,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    // Update test user with same FCM token
    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ fcmToken: sharedFcmToken })
      .expect(200);

    expect(response.body.data.user).toHaveProperty('fcmToken', sharedFcmToken);

    // Verify the second user's FCM token was cleared (set to null by model)
    if (db) {
      const secondUser = await db.collection('users').findOne({ _id: secondUserId });
      expect(secondUser?.fcmToken).toBeNull();
    }

    // Cleanup
    if (db) {
      await db.collection('users').deleteOne({ _id: secondUserId });
    }
  });

  test('should handle multiple users trying to set same FCM token', async () => {
    const db = mongoose.connection.db;
    const user2Id = new mongoose.Types.ObjectId();
    const user3Id = new mongoose.Types.ObjectId();
    const conflictToken = `conflict-fcm-token-${Date.now()}-${Math.random()}`;
    const user2GoogleId = `google-user2-${Date.now()}-${Math.random()}`;
    const user3GoogleId = `google-user3-${Date.now()}-${Math.random()}`;

    // Create two additional users
    if (db) {
      await db.collection('users').insertMany([
        {
          _id: user2Id,
          name: 'User 2',
          email: `user2-${Date.now()}@test.com`,
          googleId: user2GoogleId,
          userRole: 'STUDENT',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          _id: user3Id,
          name: 'User 3',
          email: `user3-${Date.now()}@test.com`,
          googleId: user3GoogleId,
          userRole: 'STUDENT',
          fcmToken: conflictToken,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);
    }

    const user2Token = jwt.sign(
      { id: user2Id.toString(), userRole: 'STUDENT' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '24h' }
    );

    // User 2 tries to set the FCM token that user 3 has
    const response = await request(app)
      .post('/api/user/profile')
      .set('Authorization', `Bearer ${user2Token}`)
      .send({ fcmToken: conflictToken })
      .expect(200);

    expect(response.body.data.user).toHaveProperty('fcmToken', conflictToken);

    // Verify user 3's FCM token was cleared (set to null by model)
    if (db) {
      const user3 = await db.collection('users').findOne({ _id: user3Id });
      expect(user3?.fcmToken).toBeNull();
    }

    // Cleanup
    if (db) {
      await db.collection('users').deleteMany({ _id: { $in: [user2Id, user3Id] } });
    }
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

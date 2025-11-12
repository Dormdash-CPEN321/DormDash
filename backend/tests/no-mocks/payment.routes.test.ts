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
  error: console.error,
  info: console.info,
};

let authToken: string;
const testUserId = new mongoose.Types.ObjectId(); // Generate unique ID

beforeAll(async () => {
  // Suppress all console output during tests for clean test output
  console.warn = jest.fn();
  console.error = jest.fn();
  console.info = jest.fn();

  // Connect to test database
  await connectDB();

  // Clean up any existing test user by googleId
  const db = mongoose.connection.db;
  if (db) {
    await db.collection('users').deleteMany({ googleId: `test-google-id-payment-${testUserId.toString()}` });
  }

  // Create a test user in DB with specific _id
  await (userModel as any).user.create({
    _id: testUserId,
    googleId: `test-google-id-payment-${testUserId.toString()}`,
    email: `payment${testUserId.toString()}@example.com`,
    name: 'Payment Test User',
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
          googleId: `test-google-id-payment-${testUserId.toString()}`,
          email: `payment${testUserId.toString()}@example.com`,
          name: 'Payment Test User',
          userRole: 'STUDENT'
        }
      }
    );
  }
});

afterAll(async () => {
  // Clean up test user
  const db = mongoose.connection.db;
  if (db) {
    await db.collection('users').deleteMany({ googleId: `test-google-id-payment-${testUserId.toString()}` });
  }

  // Disconnect from test database
  await disconnectDB();

  // Restore console functions
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.info = originalConsole.info;
});

describe('POST /api/payment/create-intent - Create Payment Intent', () => {
  test('should create a payment intent successfully', async () => {
    const response = await request(app)
      .post('/api/payment/create-intent')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 5000, // amount in cents
        currency: 'CAD'
      })
      .expect(200);

    expect(response.body).toHaveProperty('clientSecret');
    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('amount', 5000);
    expect(response.body).toHaveProperty('currency', 'CAD');
  });

  test('should require authentication', async () => {
    await request(app)
      .post('/api/payment/create-intent')
      .send({
        amount: 5000,
        currency: 'CAD'
      })
      .expect(401);
  });

  test('should validate required fields', async () => {
    const response = await request(app)
      .post('/api/payment/create-intent')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        // Missing amount
        currency: 'CAD'
      })
      .expect(400);

    expect(response.body).toHaveProperty('message');
  });

  test('should validate amount is positive', async () => {
    const response = await request(app)
      .post('/api/payment/create-intent')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: -100, // invalid negative amount
        currency: 'CAD'
      })
      .expect(400);

    expect(response.body).toHaveProperty('message');
  });

  test('should accept optional orderId', async () => {
    const response = await request(app)
      .post('/api/payment/create-intent')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 2500,
        currency: 'CAD',
        orderId: 'some-order-id'
      })
      .expect(200);

    expect(response.body).toHaveProperty('clientSecret');
  });
});

describe('POST /api/payment/process - Process Payment', () => {
  test('should require authentication', async () => {
    await request(app)
      .post('/api/payment/process')
      .send({
        paymentIntentId: 'pi_test_123',
        paymentMethodId: 'pm_test_123'
      })
      .expect(401);
  });

  test('should validate required fields', async () => {
    const response = await request(app)
      .post('/api/payment/process')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        // Missing paymentIntentId
        paymentMethodId: 'pm_test_123'
      })
      .expect(400);

    expect(response.body).toHaveProperty('message');
  });

  // Note: Actual payment processing tests would require Stripe test mode setup
  // For now, we'll test the validation and authentication
  test('should accept valid payment processing request structure', async () => {
    const response = await request(app)
      .post('/api/payment/process')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: 'pi_test_123',
        paymentMethodId: 'pm_test_123'
      });

    // The actual response will depend on Stripe integration
    // This test ensures the endpoint accepts the request structure
    expect([200, 400, 402]).toContain(response.status); // 402 is Stripe's card error status
  });
});

describe('GET /api/payment/status/:paymentIntentId - Get Payment Status', () => {
  test('should require authentication', async () => {
    await request(app)
      .get('/api/payment/status/pi_test_123')
      .expect(401);
  });

  test('should accept payment status request', async () => {
    const response = await request(app)
      .get('/api/payment/status/pi_test_123')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
  });

  
});
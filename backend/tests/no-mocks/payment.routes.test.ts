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

describe('Unmocked POST /api/payment/create-intent', () => {
  // Input: authenticated request with amount 5000 and currency CAD
  // Expected status code: 200
  // Expected behavior: server creates a Stripe payment intent and returns clientSecret and id
  // Expected output: { clientSecret, id, amount: 5000, currency: 'CAD' }
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

  // Input: create-intent payload but missing Authorization header
  // Expected status code: 401
  // Expected behavior: request rejected due to missing authentication
  // Expected output: authentication error
  test('should require authentication', async () => {
    await request(app)
      .post('/api/payment/create-intent')
      .send({
        amount: 5000,
        currency: 'CAD'
      })
      .expect(401);
  });

  // Input: create-intent payload missing required `amount`
  // Expected status code: 400
  // Expected behavior: validation fails and request is rejected
  // Expected output: response body contains error message
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

  // Input: create-intent with a negative amount (-100)
  // Expected status code: 400
  // Expected behavior: validation fails because amount must be positive
  // Expected output: response body contains error message
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

  // Input: create-intent with optional orderId provided
  // Expected status code: 200
  // Expected behavior: payment intent is created and associated with orderId
  // Expected output: response contains clientSecret
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

describe('Unmocked POST /api/payment/process', () => {
  // Input: payment processing request without Authorization header
  // Expected status code: 401
  // Expected behavior: request rejected due to missing authentication
  // Expected output: authentication error
  test('should require authentication', async () => {
    await request(app)
      .post('/api/payment/process')
      .send({
        paymentIntentId: 'pi_test_123',
        paymentMethodId: 'pm_test_123'
      })
      .expect(401);
  });

  // Input: payment processing payload missing paymentIntentId
  // Expected status code: 400
  // Expected behavior: validation fails and returns error message
  // Expected output: error message 
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
});

describe('GET /api/payment/status/:paymentIntentId - Get Payment Status', () => {
  // Input: unauthenticated GET /api/payment/status/:paymentIntentId
  // Expected status code: 401
  // Expected behavior: request rejected due to missing authentication
  // Expected output: authentication error
  test('should require authentication', async () => {
    await request(app)
      .get('/api/payment/status/pi_test_123')
      .expect(401);
  });

  // Input: authenticated GET /api/payment/status/:paymentIntentId
  // Expected status code: 200
  // Expected behavior: endpoint returns current payment status
  // Expected output: 200 response (
  test('should accept payment status request', async () => {
    const response = await request(app)
      .get('/api/payment/status/pi_test_123')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
  });

  
});
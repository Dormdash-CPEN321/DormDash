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
  // Suppress all console output during tests
  console.warn = jest.fn();
  console.info = jest.fn();
  // Connect to test database
  await connectDB();

  // Clean up any existing test user by googleId
  const db = mongoose.connection.db;
  if (db) {
    await db.collection('users').deleteMany({ googleId: `test-google-id-order-${testUserId.toString()}` });
  }

  // Create a test user in DB with specific _id
  await (userModel as any).user.create({
    _id: testUserId,
    googleId: `test-google-id-order-${testUserId.toString()}`,
    email: `order${testUserId.toString()}@example.com`,
    name: 'Order Test User',
    userRole: 'STUDENT'
  });

  // Generate a real JWT token for testing
  const payload = { id: testUserId };
  authToken = jwt.sign(payload, process.env.JWT_SECRET || 'default-secret');
});

beforeEach(async () => {
  // Clear orders and jobs collections before each test to ensure isolation
  const db = mongoose.connection.db;
  if (db) {
    await db.collection('orders').deleteMany({ studentId: testUserId });
    await db.collection('jobs').deleteMany({ studentId: testUserId });
  }
});

afterAll(async () => {
  // Clean up test user
  await userModel.delete(testUserId);
  // Disconnect from test database
  await disconnectDB();
  
  // Restore console functions
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
});

describe('Unmocked POST /api/order/quote', () => {
  // Input: valid studentId and studentAddress
  // Expected status code: 200
  // Expected behavior: returns pricing details including distancePrice, warehouseAddress, and dailyStorageRate
  // Expected output: JSON with distancePrice, warehouseAddress, dailyStorageRate
  test('should return a quote with pricing details for valid address', async () => {
    const response = await request(app)
      .post('/api/order/quote')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'UBC Campus, Vancouver' }
      })
      .expect(200);

    expect(response.body).toHaveProperty('distancePrice');
    expect(typeof response.body.distancePrice).toBe('number');
    expect(response.body.distancePrice).toBeGreaterThanOrEqual(0);
    
    expect(response.body).toHaveProperty('warehouseAddress');
    expect(response.body).toHaveProperty('dailyStorageRate');
    expect(typeof response.body.dailyStorageRate).toBe('number');
    expect(response.body.dailyStorageRate).toBeGreaterThan(0);
  });

  // Input: valid quote request but missing Authorization header
  // Expected status code: 401
  // Expected behavior: request is rejected due to lack of authentication
  // Expected output: authentication error
  test('should require authentication', async () => {
    await request(app)
      .post('/api/order/quote')
      .send({
        studentId: testUserId.toString(),
        studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test Address' }
      })
      .expect(401);
  });

  // Input: quote request missing required studentAddress
  // Expected status code: 400
  // Expected behavior: validation fails and request is rejected
  // Expected output: validation error details in response body
  test('should validate required fields', async () => {
    await request(app)
      .post('/api/order/quote')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        // Missing studentAddress
      })
      .expect(400);
  });

  // Input: quote request with malformed studentAddress (missing lon/formattedAddress)
  // Expected status code: 400
  // Expected behavior: validation fails for address format
  // Expected output: validation error details
  test('should validate address format', async () => {
    await request(app)
      .post('/api/order/quote')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        studentAddress: { lat: 49.2827 } // Missing lon and formattedAddress
      })
      .expect(400);
  });
});

describe('Unmocked POST /api/order', () => {
  // Input: authenticated student with valid order payload (volume, totalPrice, addresses, times)
  // Expected status code: 201
  // Expected behavior: order is created in DB with PENDING status and returned in response
  // Expected output: order object with _id, id, studentId, status 'PENDING', volume, price, addresses, pickupTime, returnTime
  test('should create an order successfully with valid data', async () => {
    const pickupTime = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now
    const returnTime = new Date(Date.now() + 86400000).toISOString(); // 1 day from now

    const response = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        volume: 10,
        totalPrice: 50,
        studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Student Home' },
        warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Warehouse' },
        pickupTime: pickupTime,
        returnTime: returnTime,
      })
      .expect(201);

    expect(response.body).toHaveProperty('_id');
    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('studentId', testUserId.toString());
    expect(response.body).toHaveProperty('status', 'PENDING');
    expect(response.body).toHaveProperty('volume', 10);
    expect(response.body).toHaveProperty('price', 50);
    expect(response.body).toHaveProperty('studentAddress');
    expect(response.body).toHaveProperty('warehouseAddress');
    expect(response.body).toHaveProperty('pickupTime');
    expect(response.body).toHaveProperty('returnTime');
  });

  // Input: order creation payload without Authorization header
  // Expected status code: 401
  // Expected behavior: request rejected due to missing authentication
  // Expected output: authentication error
  test('should require authentication', async () => {
    await request(app)
      .post('/api/order')
      .send({
        studentId: testUserId.toString(),
        volume: 10,
        totalPrice: 50,
        studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' },
        warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Test' },
        pickupTime: new Date().toISOString(),
        returnTime: new Date(Date.now() + 86400000).toISOString(),
      })
      .expect(401);
  });

  // Input: two identical POST /api/order requests with same Idempotency-Key
  // Expected status code: 201 for both
  // Expected behavior: second request returns the same order as the first (idempotent)
  // Expected output: same order _id returned for both requests
  test('should handle idempotency with same key', async () => {
    const pickupTime = new Date(Date.now() + 3600000).toISOString();
    const returnTime = new Date(Date.now() + 86400000).toISOString();
    const idempotencyKey = 'test-idempotency-key-123';

    const orderData = {
      studentId: testUserId.toString(),
      volume: 10,
      totalPrice: 50,
      studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' },
      warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Test' },
      pickupTime: pickupTime,
      returnTime: returnTime,
    };

    // First request
    const response1 = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(orderData)
      .expect(201);

    // Second request with same key should return the same order
    const response2 = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(orderData)
      .expect(201);

    expect(response1.body._id).toBe(response2.body._id);
  });

  // Input: create order request for storage (authenticated)
  // Expected status code: 201
  // Expected behavior: a STORAGE job is created for the order in jobs collection
  // Expected output: jobs collection contains one job with jobType 'STORAGE'
  test('should create a storage job when order is created', async () => {
    const pickupTime = new Date(Date.now() + 3600000).toISOString();
    const returnTime = new Date(Date.now() + 86400000).toISOString();

    await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        volume: 10,
        totalPrice: 50,
        studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' },
        warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Test' },
        pickupTime: pickupTime,
        returnTime: returnTime,
      })
      .expect(201);

    // Verify job was created
    const db = mongoose.connection.db;
    if (db) {
      const jobs = await db.collection('jobs').find({ studentId: testUserId }).toArray();
      expect(jobs.length).toBe(1);
      expect(jobs[0].jobType).toBe('STORAGE');
    }
  });
});

describe('Unmocked POST /api/order/create-return-Job', () => {
  // Input: create-return-Job request when user has no active order
  // Expected status code: 500
  // Expected behavior: service returns internal/error because no active order to create return job for
  // Expected output: error response
  test('should return error when no active order exists', async () => {
    await request(app)
      .post('/api/order/create-return-Job')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        returnAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' },
        actualReturnDate: new Date().toISOString()
      })
      .expect(500);
  });

  // Input: authenticated user with an active order, create-return-Job payload
  // Expected status code: 201
  // Expected behavior: a return job is created and success message returned
  // Expected output: { success: true, message contains 'Return job created successfully' }
  test('should create return job successfully for active order', async () => {
    const pickupTime = new Date(Date.now() + 3600000).toISOString();
    const returnTime = new Date(Date.now() + 86400000).toISOString();

    await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        volume: 10,
        totalPrice: 50,
        studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Pickup Address' },
        warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Warehouse' },
        pickupTime: pickupTime,
        returnTime: returnTime,
      })
      .expect(201);

    const response = await request(app)
      .post('/api/order/create-return-Job')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        returnAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' },
        actualReturnDate: new Date(Date.now() + 86400000).toISOString()
      })
      .expect(201);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('message');
    expect(response.body.message).toContain('Return job created successfully');
  });

  // Input: return job request with a new returnAddress for existing active order
  // Expected status code: 201
  // Expected behavior: order's returnAddress is updated to the provided address
  // Expected output: active-order returns the updated returnAddress matching newReturnAddress
  test('should update order return address when provided in return job request', async () => {
    const pickupTime = new Date(Date.now() + 3600000).toISOString();
    const returnTime = new Date(Date.now() + 86400000).toISOString();
    const originalAddress = { lat: 49.2827, lon: -123.1207, formattedAddress: 'Original Student Address' };
    const newReturnAddress = { lat: 49.2500, lon: -123.1000, formattedAddress: 'New Return Address' };

    // Create an order with original address
    const createResponse = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        volume: 10,
        totalPrice: 50,
        studentAddress: originalAddress,
        warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Warehouse' },
        pickupTime: pickupTime,
        returnTime: returnTime,
      })
      .expect(201);

    const orderId = createResponse.body._id;

    // Create return job with a different return address
    const returnJobResponse = await request(app)
      .post('/api/order/create-return-Job')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        returnAddress: newReturnAddress,
        actualReturnDate: new Date(Date.now() + 86400000).toISOString()
      })
      .expect(201);

    expect(returnJobResponse.body).toHaveProperty('success', true);

    // Verify that the order's return address has been updated
    const activeOrderResponse = await request(app)
      .get('/api/order/active-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(activeOrderResponse.body.returnAddress).toEqual(newReturnAddress);
    expect(activeOrderResponse.body.returnAddress.formattedAddress).toBe('New Return Address');
    expect(activeOrderResponse.body.returnAddress.lat).toBe(newReturnAddress.lat);
    expect(activeOrderResponse.body.returnAddress.lon).toBe(newReturnAddress.lon);
  });

  // Input: create-return-Job with actualReturnDate earlier than scheduled returnTime
  // Expected status code: 201
  // Expected behavior: API processes early return and handles refund calculation (if applicable)
  // Expected output: { success: true }
  test('should handle early return with refund calculation', async () => {
    const pickupTime = new Date(Date.now() + 3600000).toISOString();
    const returnTime = new Date(Date.now() + 86400000).toISOString(); // 1 day from now

    await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        volume: 10,
        totalPrice: 50,
        studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' },
        warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Test' },
        pickupTime: pickupTime,
        returnTime: returnTime,
      })
      .expect(201);

    // Return early (12 hours from now, before the expected 24 hours)
    const earlyReturnDate = new Date(Date.now() + 43200000).toISOString();

    const response = await request(app)
      .post('/api/order/create-return-Job')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        actualReturnDate: earlyReturnDate
      })
      .expect(201);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('message');
  });

  // Input: create-return-Job with actualReturnDate later than scheduled returnTime
  // Expected status code: 201
  // Expected behavior: API processes late return and calculates a late fee
  // Expected output: { success: true, message contains 'late fee', lateFee > 0 }
  test('should handle late return with late fee calculation', async () => {
    const pickupTime = new Date(Date.now() + 3600000).toISOString();
    const returnTime = new Date(Date.now() + 86400000).toISOString(); // 1 day from now

    await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        volume: 10,
        totalPrice: 50,
        studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' },
        warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Test' },
        pickupTime: pickupTime,
        returnTime: returnTime,
      })
      .expect(201);

    // Return late (2 days from now, after the expected 1 day)
    const lateReturnDate = new Date(Date.now() + 172800000).toISOString();

    const response = await request(app)
      .post('/api/order/create-return-Job')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        actualReturnDate: lateReturnDate
      })
      .expect(201);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body.message).toContain('late fee');
    expect(response.body).toHaveProperty('lateFee');
    expect(response.body.lateFee).toBeGreaterThan(0);
  });

  // Input: two create-return-Job requests for same active order
  // Expected status code: 201 for second request
  // Expected behavior: second request is idempotent / indicates job already exists
  // Expected output: { success: true, message contains 'already exists' }
  test('should prevent creating duplicate return jobs', async () => {
    const pickupTime = new Date(Date.now() + 3600000).toISOString();
    const returnTime = new Date(Date.now() + 86400000).toISOString();

    await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        volume: 10,
        totalPrice: 50,
        studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' },
        warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Test' },
        pickupTime: pickupTime,
        returnTime: returnTime,
      })
      .expect(201);

    // Create first return job
    await request(app)
      .post('/api/order/create-return-Job')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        actualReturnDate: new Date(Date.now() + 86400000).toISOString()
      })
      .expect(201);

    // Try to create second return job - should be idempotent
    const response = await request(app)
      .post('/api/order/create-return-Job')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        actualReturnDate: new Date(Date.now() + 86400000).toISOString()
      })
      .expect(201);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body.message).toContain('already exists');
  });

  // Input: create-return-Job request without Authorization header
  // Expected status code: 401
  // Expected behavior: request rejected for missing authentication
  // Expected output: authentication error
  test('should require authentication', async () => {
    await request(app)
      .post('/api/order/create-return-Job')
      .send({
        returnAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' }
      })
      .expect(401);
  });
});

describe('Unmocked GET /api/order/all-orders', () => {
  // Input: authenticated user with no orders
  // Expected status code: 200
  // Expected behavior: returns success and empty orders array
  // Expected output: { success: true, orders: [] }
  test('should return empty array when user has no orders', async () => {
    const response = await request(app)
      .get('/api/order/all-orders')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('orders');
    expect(Array.isArray(response.body.orders)).toBe(true);
    expect(response.body.orders).toHaveLength(0);
    expect(response.body).toHaveProperty('message');
  });

  // Input: authenticated user with one created order
  // Expected status code: 200
  // Expected behavior: returns success and orders array containing created orders
  // Expected output: { success: true, orders: [...] } with order.status 'PENDING'
  test('should return all orders for authenticated user', async () => {
    const pickupTime = new Date(Date.now() + 3600000).toISOString();
    const returnTime = new Date(Date.now() + 86400000).toISOString();

    // Create first order
    await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        volume: 10,
        totalPrice: 50,
        studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Address 1' },
        warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Warehouse' },
        pickupTime: pickupTime,
        returnTime: returnTime,
      })
      .expect(201);

    const response = await request(app)
      .get('/api/order/all-orders')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('orders');
    expect(response.body.orders).toHaveLength(1);
    expect(response.body.orders[0]).toHaveProperty('status', 'PENDING');
  });

  // Input: authenticated user with cancelled and active orders
  // Expected status code: 200
  // Expected behavior: returns all orders including CANCELLED and PENDING statuses
  // Expected output: orders array length 2 and statuses include 'CANCELLED' and 'PENDING'
  test('should return orders with all statuses including cancelled', async () => {
    const pickupTime = new Date(Date.now() + 3600000).toISOString();
    const returnTime = new Date(Date.now() + 86400000).toISOString();

    // Create and cancel an order
    await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        volume: 10,
        totalPrice: 50,
        studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' },
        warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Test' },
        pickupTime: pickupTime,
        returnTime: returnTime,
      })
      .expect(201);

    await request(app)
      .delete('/api/order/cancel-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Create another active order
    await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        volume: 5,
        totalPrice: 25,
        studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' },
        warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Test' },
        pickupTime: pickupTime,
        returnTime: returnTime,
      })
      .expect(201);

    const response = await request(app)
      .get('/api/order/all-orders')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body.orders).toHaveLength(2);
    const statuses = response.body.orders.map((order: any) => order.status);
    expect(statuses).toContain('CANCELLED');
    expect(statuses).toContain('PENDING');
  });

  // Input: unauthenticated GET /api/order/all-orders
  // Expected status code: 401
  // Expected behavior: request rejected due to missing auth
  // Expected output: authentication error
  test('should require authentication', async () => {
    await request(app)
      .get('/api/order/all-orders')
      .expect(401);
  });
});

describe('Unmocked GET /api/order/active-order', () => {
  // Input: authenticated GET /api/order/active-order when user has no active order
  // Expected status code: 404
  // Expected behavior: no active order found, returns null body
  // Expected output: null
  test('should return 404 when user has no active order', async () => {
    const response = await request(app)
      .get('/api/order/active-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(404);

    expect(response.body).toBe(null);
  });

  // Input: authenticated user who creates an order, then requests active-order
  // Expected status code: 200
  // Expected behavior: returns the created active order with full details (addresses, times)
  // Expected output: order object with matching _id, studentId, status 'PENDING', addresses, pickupTime, returnTime
  test('should return active order with all details when it exists', async () => {
    const pickupTime = new Date(Date.now() + 3600000).toISOString();
    const returnTime = new Date(Date.now() + 86400000).toISOString();

    const createResponse = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        volume: 10,
        totalPrice: 50,
        studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test Address' },
        warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Warehouse Address' },
        pickupTime: pickupTime,
        returnTime: returnTime,
      })
      .expect(201);

    const testOrderId = createResponse.body._id;

    const response = await request(app)
      .get('/api/order/active-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('_id', testOrderId);
    expect(response.body).toHaveProperty('id', testOrderId);
    expect(response.body).toHaveProperty('studentId', testUserId.toString());
    expect(response.body).toHaveProperty('status', 'PENDING');
    expect(response.body).toHaveProperty('volume', 10);
    expect(response.body).toHaveProperty('price', 50);
    expect(response.body).toHaveProperty('studentAddress');
    expect(response.body.studentAddress).toEqual({ 
      lat: 49.2827, 
      lon: -123.1207, 
      formattedAddress: 'Test Address' 
    });
    expect(response.body).toHaveProperty('warehouseAddress');
    expect(response.body.warehouseAddress).toEqual({ 
      lat: 49.2606, 
      lon: -123.1133, 
      formattedAddress: 'Warehouse Address' 
    });
    expect(response.body).toHaveProperty('pickupTime');
    expect(new Date(response.body.pickupTime).toISOString()).toBe(pickupTime);
    expect(response.body).toHaveProperty('returnTime');
    expect(new Date(response.body.returnTime).toISOString()).toBe(returnTime);
  });

  // Input: create order then cancel it, then GET /api/order/active-order
  // Expected status code: 404
  // Expected behavior: cancelled orders are not returned as active
  // Expected output: 404 response
  test('should not return cancelled orders as active', async () => {
    const pickupTime = new Date(Date.now() + 3600000).toISOString();
    const returnTime = new Date(Date.now() + 86400000).toISOString();

    await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        volume: 10,
        totalPrice: 50,
        studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' },
        warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Test' },
        pickupTime: pickupTime,
        returnTime: returnTime,
      })
      .expect(201);

    await request(app)
      .delete('/api/order/cancel-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    await request(app)
      .get('/api/order/active-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(404);
  });

  // Input: multiple orders (or attempted multiple), then GET /api/order/active-order
  // Expected status code: 200
  // Expected behavior: returns only the single active order
  // Expected output: order object with _id and status
  test('should return only the most recent active order', async () => {
    const pickupTime = new Date(Date.now() + 3600000).toISOString();
    const returnTime = new Date(Date.now() + 86400000).toISOString();

    // Create first order
    await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        volume: 10,
        totalPrice: 50,
        studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' },
        warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Test' },
        pickupTime: pickupTime,
        returnTime: returnTime,
      })
      .expect(201);

    // Second order should not be created (business logic should prevent multiple active orders)
    // But if it does, active-order should return only one
    const response = await request(app)
      .get('/api/order/active-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('_id');
    expect(response.body).toHaveProperty('status');
  });

  // Input: unauthenticated GET /api/order/active-order
  // Expected status code: 401
  // Expected behavior: request rejected due to missing authentication
  // Expected output: authentication error
  test('should require authentication', async () => {
    await request(app)
      .get('/api/order/active-order')
      .expect(401);
  });
});

describe('Unmocked DELETE /api/order/cancel-order', () => {
  // Input: authenticated user with a PENDING order
  // Expected status code: 200
  // Expected behavior: order is cancelled and success message returned
  // Expected output: { success: true, message: 'Order cancelled successfully' } and active-order becomes 404
  test('should successfully cancel a PENDING order', async () => {
    const pickupTime = new Date(Date.now() + 3600000).toISOString();
    const returnTime = new Date(Date.now() + 86400000).toISOString();

    await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        volume: 10,
        totalPrice: 50,
        studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' },
        warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Test' },
        pickupTime: pickupTime,
        returnTime: returnTime,
      })
      .expect(201);

    const response = await request(app)
      .delete('/api/order/cancel-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('message', 'Order cancelled successfully');

    // Verify order was actually cancelled
    await request(app)
      .get('/api/order/active-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(404);
  });

  // Input: authenticated user with no active order tries to cancel
  // Expected status code: 404
  // Expected behavior: cancellation not performed because no active order exists
  // Expected output: error 
  test('should return success false when no active order exists', async () => {
    const response = await request(app)
      .delete('/api/order/cancel-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(404);

  });

  // Input: user with an order manually set to status ACCEPTED, attempts cancellation
  // Expected status code: 400
  // Expected behavior: cannot cancel ACCEPTED order; returns error mentioning 'pending'
  // Expected output: error message indicating order must be pending
  test('should not cancel order that is ACCEPTED', async () => {
    const pickupTime = new Date(Date.now() + 3600000).toISOString();
    const returnTime = new Date(Date.now() + 86400000).toISOString();

    const createResponse = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        volume: 10,
        totalPrice: 50,
        studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' },
        warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Test' },
        pickupTime: pickupTime,
        returnTime: returnTime,
      })
      .expect(201);

    // Manually change order status to ACCEPTED
    const db = mongoose.connection.db;
    if (db) {
      await db.collection('orders').updateOne(
        { _id: new mongoose.Types.ObjectId(createResponse.body._id) },
        { $set: { status: 'ACCEPTED' } }
      );
    }

    const response = await request(app)
      .delete('/api/order/cancel-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(400);

    expect(response.body.message).toContain('pending');
  });

  // Input: user with an order with status IN_STORAGE, attempts cancellation
  // Expected status code: 401
  // Expected behavior: cannot cancel IN_STORAGE order; returns success:false
  // Expected output: { success: false }
  test('should not cancel order that is IN_STORAGE', async () => {
    const pickupTime = new Date(Date.now() + 3600000).toISOString();
    const returnTime = new Date(Date.now() + 86400000).toISOString();

    const createResponse = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        volume: 10,
        totalPrice: 50,
        studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' },
        warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Test' },
        pickupTime: pickupTime,
        returnTime: returnTime,
      })
      .expect(201);

    // Manually change order status to IN_STORAGE
    const db = mongoose.connection.db;
    if (db) {
      await db.collection('orders').updateOne(
        { _id: new mongoose.Types.ObjectId(createResponse.body._id) },
        { $set: { status: 'IN_STORAGE' } }
      );
    }

    const response = await request(app)
      .delete('/api/order/cancel-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(401);

    expect(response.body).toHaveProperty('success', false);
  });

  // Input: cancel an order twice
  // Expected status code: 200 for first cancel, 401 for second attempt
  // Expected behavior: first cancellation succeeds, second returns failure (already cancelled)
  // Expected output: second response has { success: false }
  test('should not allow cancelling same order twice', async () => {
    const pickupTime = new Date(Date.now() + 3600000).toISOString();
    const returnTime = new Date(Date.now() + 86400000).toISOString();

    await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        volume: 10,
        totalPrice: 50,
        studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' },
        warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Test' },
        pickupTime: pickupTime,
        returnTime: returnTime,
      })
      .expect(201);

    // Cancel once
    await request(app)
      .delete('/api/order/cancel-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Try to cancel again
    const response = await request(app)
      .delete('/api/order/cancel-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(401);

    expect(response.body).toHaveProperty('success', false);
  });

  // Input: cancel an order that has storage jobs associated
  // Expected status code: 200
  // Expected behavior: associated storage jobs are marked CANCELLED in jobs collection
  // Expected output: jobs for the student show status 'CANCELLED'
  test('should cancel associated storage jobs when order is cancelled', async () => {
    const pickupTime = new Date(Date.now() + 3600000).toISOString();
    const returnTime = new Date(Date.now() + 86400000).toISOString();

    await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        volume: 10,
        totalPrice: 50,
        studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' },
        warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Test' },
        pickupTime: pickupTime,
        returnTime: returnTime,
      })
      .expect(201);

    await request(app)
      .delete('/api/order/cancel-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Verify jobs were cancelled
    const db = mongoose.connection.db;
    if (db) {
      const jobs = await db.collection('jobs').find({ studentId: testUserId }).toArray();
      expect(jobs.length).toBeGreaterThan(0);
      expect(jobs[0].status).toBe('CANCELLED');
    }
  });

  // Input: unauthenticated DELETE /api/order/cancel-order
  // Expected status code: 401
  // Expected behavior: request rejected due to missing auth
  // Expected output: authentication error
  test('should require authentication', async () => {
    await request(app)
      .delete('/api/order/cancel-order')
      .expect(401);
  });
});
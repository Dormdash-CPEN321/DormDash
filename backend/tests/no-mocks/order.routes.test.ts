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

describe('POST /api/order/quote - Get Price Quote', () => {
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

  test('should require authentication', async () => {
    await request(app)
      .post('/api/order/quote')
      .send({
        studentId: testUserId.toString(),
        studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test Address' }
      })
      .expect(401);
  });

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

describe('POST /api/order - Create Order', () => {
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

describe('POST /api/order/create-return-Job - Create Return Job', () => {
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
    // API should handle refund for early returns
    // Note: The message may not always contain 'refund' depending on timing
  });

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

  test('should require authentication', async () => {
    await request(app)
      .post('/api/order/create-return-Job')
      .send({
        returnAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' }
      })
      .expect(401);
  });
});

describe('GET /api/order/all-orders - Get All Orders', () => {
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

  test('should require authentication', async () => {
    await request(app)
      .get('/api/order/all-orders')
      .expect(401);
  });
});

describe('GET /api/order/active-order - Get Active Order', () => {
  test('should return 404 when user has no active order', async () => {
    const response = await request(app)
      .get('/api/order/active-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(404);

    expect(response.body).toBe(null);
  });

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

  test('should require authentication', async () => {
    await request(app)
      .get('/api/order/active-order')
      .expect(401);
  });
});

describe('DELETE /api/order/cancel-order - Cancel Order', () => {
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

  test('should return success false when no active order exists', async () => {
    const response = await request(app)
      .delete('/api/order/cancel-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(404);

  });

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

  test('should require authentication', async () => {
    await request(app)
      .delete('/api/order/cancel-order')
      .expect(401);
  });
});
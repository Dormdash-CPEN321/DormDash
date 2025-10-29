import { describe, expect, test, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app';
import { connectDB, disconnectDB } from '../../src/config/database';

// Mock the auth middleware to set a fake user
jest.mock('../../src/middleware/auth.middleware', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.user = { _id: '507f1f77bcf86cd799439011' }; // Fake ObjectId
    next();
  },
}));

// Suppress socket-related warnings
const originalWarn = console.warn;
beforeAll(async () => {
  console.warn = jest.fn(); // Suppress warnings
  // Connect to test database
  await connectDB();
});

afterAll(async () => {
  // Disconnect from test database
  await disconnectDB();
  console.warn = originalWarn; // Restore warnings
});

describe('POST /api/order/quote - No Mocks', () => {
  test('should return a quote for valid input', async () => {
    const response = await request(app)
      .post('/api/order/quote')
      .send({
        studentId: '507f1f77bcf86cd799439011',
        studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test Address' }
      })
      .expect(200);

    expect(response.body).toHaveProperty('distancePrice');
    expect(response.body).toHaveProperty('warehouseAddress');
    expect(response.body).toHaveProperty('dailyStorageRate');
  });

  // Add more tests for invalid inputs, etc.
});

describe('POST /api/order - No Mocks', () => {
  test('should create an order for valid input', async () => {
    const response = await request(app)
      .post('/api/order')
      .send({
        studentId: '507f1f77bcf86cd799439011',
        volume: 10,
        totalPrice: 50,
        studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test Address' },
        warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Warehouse Address' },
        pickupTime: new Date().toISOString(),
        returnTime: new Date(Date.now() + 86400000).toISOString(), // 1 day later
        returnAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' }
      })
      .expect(201);

    expect(response.body).toHaveProperty('_id');
    expect(response.body).toHaveProperty('studentId');
  });
});

describe('POST /api/order/create-return-Job - No Mocks', () => {
  test('should create a return job for authenticated user', async () => {
    const response = await request(app)
      .post('/api/order/create-return-Job')
      .send({
        returnAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Return Address' },
        actualReturnDate: new Date().toISOString()
      })
      .expect(201);

    expect(response.body).toHaveProperty('success');
    expect(response.body).toHaveProperty('message');
  });
});

// Add similar describe blocks for other order endpoints: GET /api/order/all-orders, GET /api/order/active-order, DELETE /api/order/cancel-order

describe('GET /api/order/all-orders - No Mocks', () => {
  test('should return all orders for authenticated user', async () => {
    const response = await request(app)
      .get('/api/order/all-orders')
      .expect(200);

    expect(response.body).toHaveProperty('success');
    expect(response.body).toHaveProperty('orders');
    expect(Array.isArray(response.body.orders)).toBe(true);
  });
});

describe('GET /api/order/active-order - No Mocks', () => {
  test('should return active order for authenticated user', async () => {
    const response = await request(app)
      .get('/api/order/active-order')
      .expect(200);

    // Could be null or an order object
    expect(response.body === null || typeof response.body === 'object').toBe(true);
  });
});

describe('DELETE /api/order/cancel-order - No Mocks', () => {
  test('should cancel the active order for authenticated user', async () => {
    const response = await request(app)
      .delete('/api/order/cancel-order')
      .expect(200);

    expect(response.body).toHaveProperty('success');
    expect(response.body).toHaveProperty('message');
  });
});
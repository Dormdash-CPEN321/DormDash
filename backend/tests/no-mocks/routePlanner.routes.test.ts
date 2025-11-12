import { describe, expect, test, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose, { mongo } from 'mongoose';
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
    await db.collection('users').deleteMany({ googleId: `test-google-id-route-planner-${testUserId.toString()}` });
  }

  // Create a test user in DB with specific _id
  await (userModel as any).user.create({
    _id: testUserId,
    googleId: `test-google-id-route-planner-${testUserId.toString()}`,
    email: `routeplanner${testUserId.toString()}@example.com`,
    name: 'Route Planner Test User',
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
          googleId: `test-google-id-route-planner-${testUserId.toString()}`,
          email: `routeplanner-${testUserId.toString()}@example.com`,
          name: 'Route Planner Test User',
          userRole: 'MOVER',
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
    await db.collection('users').deleteMany({ googleId: `test-google-id-route-planner-${testUserId.toString()}` });
  }

  // Disconnect from test database
  await disconnectDB();

  // Restore console functions
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
});

describe('GET /api/routePlanner/smart - Get Smart Route', () => {
  test('should return smart route for authenticated mover', async () => {
    const response = await request(app)
      .get('/api/routePlanner/smart')
      .query({
        currentLat: 49.2827,
        currentLon: -123.1207
      })
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('message');
    expect(response.body).toHaveProperty('data');
    expect(response.body.data).toHaveProperty('route');
    expect(response.body.data).toHaveProperty('metrics');
    expect(response.body.data).toHaveProperty('startLocation');
    expect(Array.isArray(response.body.data.route)).toBe(true);
  });

  test('should require authentication', async () => {
    await request(app)
      .get('/api/routePlanner/smart')
      .query({
        currentLat: 49.2827,
        currentLon: -123.1207
      })
      .expect(401);
  });

  test('should reject invalid token', async () => {
    await request(app)
      .get('/api/routePlanner/smart')
      .query({
        currentLat: 49.2827,
        currentLon: -123.1207
      })
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);
  });

  test('should require currentLat and currentLon parameters', async () => {
    const response = await request(app)
      .get('/api/routePlanner/smart')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(400);

    expect(response.body).toHaveProperty('message');
    expect(response.body.message).toContain('Invalid location parameters');
  });

  test('should validate currentLat and currentLon are numbers', async () => {
    const response = await request(app)
      .get('/api/routePlanner/smart')
      .query({
        currentLat: 'invalid',
        currentLon: -123.1207
      })
      .set('Authorization', `Bearer ${authToken}`)
      .expect(400);

    expect(response.body).toHaveProperty('message');
    expect(response.body.message).toContain('Invalid location parameters');
  });

  test('should accept optional maxDuration parameter', async () => {
    const response = await request(app)
      .get('/api/routePlanner/smart')
      .query({
        currentLat: 49.2827,
        currentLon: -123.1207,
        maxDuration: 120
      })
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('message');
    expect(response.body).toHaveProperty('data');
  });

  test('should validate maxDuration is a positive number', async () => {
    const response = await request(app)
      .get('/api/routePlanner/smart')
      .query({
        currentLat: 49.2827,
        currentLon: -123.1207,
        maxDuration: -10
      })
      .set('Authorization', `Bearer ${authToken}`)
      .expect(400);

    expect(response.body).toHaveProperty('message');
    expect(response.body.message).toContain('Invalid maxDuration parameter');
  });

  test('should return route with proper structure', async () => {
    const response = await request(app)
      .get('/api/routePlanner/smart')
      .query({
        currentLat: 49.2827,
        currentLon: -123.1207
      })
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Validate route structure
    expect(Array.isArray(response.body.data.route)).toBe(true);

    if (response.body.data.route.length > 0) {
      const job = response.body.data.route[0];
      expect(job).toHaveProperty('jobId');
      expect(job).toHaveProperty('orderId');
      expect(job).toHaveProperty('studentId');
      expect(job).toHaveProperty('jobType');
      expect(job).toHaveProperty('volume');
      expect(job).toHaveProperty('price');
      expect(job).toHaveProperty('pickupAddress');
      expect(job).toHaveProperty('dropoffAddress');
      expect(job).toHaveProperty('scheduledTime');
      expect(job).toHaveProperty('estimatedStartTime');
      expect(job).toHaveProperty('estimatedDuration');
      expect(job).toHaveProperty('distanceFromPrevious');
      expect(job).toHaveProperty('travelTimeFromPrevious');
    }

    // Validate metrics structure
    expect(response.body.data.metrics).toHaveProperty('totalEarnings');
    expect(response.body.data.metrics).toHaveProperty('totalJobs');
    expect(response.body.data.metrics).toHaveProperty('totalDistance');
    expect(response.body.data.metrics).toHaveProperty('totalDuration');
    expect(response.body.data.metrics).toHaveProperty('earningsPerHour');

    // Validate start location
    expect(response.body.data.startLocation).toHaveProperty('lat', 49.2827);
    expect(response.body.data.startLocation).toHaveProperty('lon', -123.1207);
  });

  test('should return empty route if no jobs available', async () => {
    const response = await request(app)
        .get('/api/routePlanner/smart')
        .query({
            currentLat: 0,
            currentLon: 0
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);   
    expect(response.body).toHaveProperty('message', 'No jobs available matching your schedule');
    expect(response.body.data).toHaveProperty('route');
    expect(Array.isArray(response.body.data.route)).toBe(true);
    expect(response.body.data.route.length).toBe(0);
  });
  
  test('should not suggest jobs that exceed maxDuration', async () => {
    //fist inject jobs that are within and beyond maxDuration
    mongoose.connection.db.collection('jobs').insertMany([
        {
            _id: new mongoose.Types.ObjectId(),
            studentId: new mongoose.Types.ObjectId(),
            orderId: new mongoose.Types.ObjectId(),
            jobType: 'PICKUP',
            volume: 1,
            price: 50,
            pickupAddress: '123 Test St, Test City, TC',
            dropoffAddress: '456 Sample Ave, Sample City, SC',
            scheduledTime: new Date(Date.now() + 3600000), // 1 hour from now
            status: 'PENDING'
        },
        {
            _id: new mongoose.Types.ObjectId(),
            studentId: new mongoose.Types.ObjectId(),
            orderId: new mongoose.Types.ObjectId(),
            jobType: 'DROPOFF',
            volume: 2,
            price: 100,
            pickupAddress: '789 Example Rd, Example City, EC',
            dropoffAddress: '101 Demo Blvd, Demo City, DC',
            scheduledTime: new Date(Date.now() + 7200000), // 2 hours from now
            status:
            'PENDING'
        }
    ]);

    const response = await request(app)
        .get('/api/routePlanner/smart')
        .query({
            currentLat: 49.2827,
            currentLon: -123.1207,
            maxDuration: 30 // 30 minutes
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

    expect(response.body).toHaveProperty('message', 'No jobs available matching your schedule');
    expect(response.body.data).toHaveProperty('route');
    expect(Array.isArray(response.body.data.route)).toBe(true);
    expect(response.body.data.route.length).toBe(0);
    
    // Clean up injected jobs
    await
    mongoose.connection.db.collection('jobs').deleteMany({
        pickupAddress: { $in: ['123 Test St, Test City, TC', '789 Example Rd, Example City, EC'] }
    });
  });   
});
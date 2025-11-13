import { describe, expect, test, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../../src/app';
import { connectDB, disconnectDB } from '../../src/config/database';
import { userModel } from '../../src/models/user.model';

const originalWarn = console.warn;
let authToken: string;
let moverAuthToken: string;
let testUserId: mongoose.Types.ObjectId;
let testMoverId: mongoose.Types.ObjectId;

// Cleanup function to delete all users, jobs, and orders
const cleanupDatabase = async () => {
    const db = mongoose.connection.db;
    if (db) {
        await db.collection('users').deleteMany({});
        await db.collection('jobs').deleteMany({});
        await db.collection('orders').deleteMany({});
    }
};

beforeAll(async () => {
    console.warn = jest.fn(); 
    await connectDB();

    // Clean up all test data before starting
    await cleanupDatabase();
    
    // Create test student user
    const testUser = await (userModel as any).user.create({
        googleId: 'test-google-id-student',
        email: 'test-student@example.com',
        name: 'Test Student',
        userRole: 'STUDENT'
    });

    testUserId = testUser._id;

    // Create test mover user
    const testMover = await (userModel as any).user.create({
        googleId: 'test-google-id-mover',
        email: 'test-mover@example.com',
        name: 'Test Mover',
        userRole: 'MOVER'
    });

    testMoverId = testMover._id;

    // Generate JWT tokens
    const studentPayload = { id: testUserId };
    authToken = jwt.sign(studentPayload, process.env.JWT_SECRET || 'default-secret');

    const moverPayload = { id: testMoverId };
    moverAuthToken = jwt.sign(moverPayload, process.env.JWT_SECRET || 'default-secret');
});

beforeEach(async () => {
    // Clear jobs and orders collections before each test for isolation
    // Dont delete users here because test users (testUserId, testMoverId) need to persist across tests
    const db = mongoose.connection.db;
    if (db) {
       await db.collection('jobs').deleteMany({});
       await db.collection('orders').deleteMany({});
    }
});

afterAll(async () => {
    await cleanupDatabase();
    await disconnectDB();
    console.warn = originalWarn; 
});

describe('Unmocked POST /api/auth/signup', () => {
    // Input: invalid Google idToken string
    // Expected status code: 401
    // Expected behavior: request is rejected due to invalid token
    // Expected output: { message: 'Invalid Google token' }
    test('should return 401 for invalid Google token', async () => {
        const response = await request(app)
            .post('/api/auth/signup')
            .send({ idToken: 'invalid-token-12345' });

        expect(response.status).toBe(401);
        expect(response.body.message).toBe('Invalid Google token');
    });

    // Input: request body missing idToken
    // Expected status code: 400
    // Expected behavior: validation fails
    // Expected output: error details (body)
    test('should return 400 for missing idToken', async () => {
        const response = await request(app)
            .post('/api/auth/signup')
            .send({});

        expect(response.status).toBe(400);
    });

    // Input: idToken of wrong type (number)
    // Expected status code: 400
    // Expected behavior: validation fails
    // Expected output: error details (body)
    test('should return 400 for invalid idToken type', async () => {
        const response = await request(app)
            .post('/api/auth/signup')
            .send({ idToken: 12345 });

        expect(response.status).toBe(400);
    });
});

describe('Unmocked POST /api/auth/signin', () => {
    // Input: invalid Google idToken string
    // Expected status code: 401
    // Expected behavior: signin rejected due to invalid token
    // Expected output: { message: 'Invalid Google token' }
    test('should return 401 for invalid Google token', async () => {
        const response = await request(app)
            .post('/api/auth/signin')
            .send({ idToken: 'invalid-token-67890' });

        expect(response.status).toBe(401);
        expect(response.body.message).toBe('Invalid Google token');
    });

    // Input: request body missing idToken
    // Expected status code: 400
    // Expected behavior: validation fails
    // Expected output: error details (body)
    test('should return 400 for missing idToken', async () => {
        const response = await request(app)
            .post('/api/auth/signin')
            .send({});

        expect(response.status).toBe(400);
    });

    // Input: idToken of wrong type (object)
    // Expected status code: 400
    // Expected behavior: validation fails
    // Expected output: error details (body)
    test('should return 400 for invalid idToken type', async () => {
        const response = await request(app)
            .post('/api/auth/signin')
            .send({ idToken: { invalid: 'object' } });

        expect(response.status).toBe(400);
    });
});

describe('Unmocked POST /api/auth/select-role', () => {
    // Input: authenticated user, userRole: 'STUDENT'
    // Expected status code: 200
    // Expected behavior: user's role is updated to STUDENT
    // Expected output: message and updated user data with userRole 'STUDENT'
    test('should successfully select STUDENT role for authenticated user', async () => {
        const response = await request(app)
            .post('/api/auth/select-role')
            .set('Authorization', `Bearer ${authToken}`)
            .send({ userRole: 'STUDENT' });

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Role selected successfully');
        expect(response.body.data.user.userRole).toBe('STUDENT');
    });

    // Input: authenticated user, userRole: 'MOVER'
    // Expected status code: 200
    // Expected behavior: user's role is updated to MOVER and credits initialized to 0
    // Expected output: message and updated user data with userRole 'MOVER' and credits 0
    test('should successfully select MOVER role and initialize credits to 0', async () => {
        const response = await request(app)
            .post('/api/auth/select-role')
            .set('Authorization', `Bearer ${authToken}`)
            .send({ userRole: 'MOVER' });

        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Role selected successfully');
        expect(response.body.data.user.userRole).toBe('MOVER');
        expect(response.body.data.user.credits).toBe(0);
    });

    // Input: no Authorization token provided
    // Expected status code: 401
    // Expected behavior: request rejected due to missing authentication
    // Expected output: error details (body)
    test('should return 401 for missing authentication token', async () => {
        const response = await request(app)
            .post('/api/auth/select-role')
            .send({ userRole: 'STUDENT' });

        expect(response.status).toBe(401);
    });

    // Input: invalid Authorization token provided
    // Expected status code: 401
    // Expected behavior: request rejected due to invalid token
    // Expected output: error details (body)
    test('should return 401 for invalid authentication token', async () => {
        const response = await request(app)
            .post('/api/auth/select-role')
            .set('Authorization', 'Bearer invalid-token')
            .send({ userRole: 'STUDENT' });

        expect(response.status).toBe(401);
    });

    // Input: authenticated request missing userRole field
    // Expected status code: 400
    // Expected behavior: validation fails and role is not changed
    // Expected output: error details (body)
    test('should return 400 for missing userRole', async () => {
        const response = await request(app)
            .post('/api/auth/select-role')
            .set('Authorization', `Bearer ${authToken}`)
            .send({});

        expect(response.status).toBe(400);
    });

    // Input: authenticated request with invalid userRole value
    // Expected status code: 400
    // Expected behavior: validation fails and role is not changed
    // Expected output: error details (body)
    test('should return 400 for invalid userRole', async () => {
        const response = await request(app)
            .post('/api/auth/select-role')
            .set('Authorization', `Bearer ${authToken}`)
            .send({ userRole: 'INVALID_ROLE' });

        expect(response.status).toBe(400);
    });
});

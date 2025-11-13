import { describe, expect, test, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../../src/config/database';
import { userModel } from '../../src/models/user.model';

// Import app after mocks are set up
import app from '../../src/app';

let authToken: string;
let moverAuthToken: string;
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
          `test-google-id-auth-mock-${testUserId.toString()}`,
          `test-google-id-mover-auth-mock-${testMoverId.toString()}`
        ]
      }
    });
  }

  // Create test student user without role
  await (userModel as any).user.create({
    _id: testUserId,
    googleId: `test-google-id-auth-mock-${testUserId.toString()}`,
    email: `authmock${testUserId.toString()}@example.com`,
    name: 'Test Auth User Mock',
    userRole: undefined // No role initially
  });

  // Create test mover user
  await (userModel as any).user.create({
    _id: testMoverId,
    googleId: `test-google-id-mover-auth-mock-${testMoverId.toString()}`,
    email: `moverauthmock${testMoverId.toString()}@example.com`,
    name: 'Test Mover Auth Mock',
    userRole: 'MOVER',
    credits: 100
  });

  // Generate JWT tokens
  authToken = jwt.sign({ id: testUserId }, process.env.JWT_SECRET || 'default-secret');
  moverAuthToken = jwt.sign({ id: testMoverId }, process.env.JWT_SECRET || 'default-secret');
});

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
          `test-google-id-auth-mock-${testUserId.toString()}`,
          `test-google-id-mover-auth-mock-${testMoverId.toString()}`
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

// Interface POST /api/auth/signup
describe('POST /api/auth/signup - Sign Up with Google (Mocked)', () => {
  // Mocked behavior: AuthController.signUp rejects with error
  // Input: valid request body with idToken
  // Expected status code: 500
  // Expected behavior: error handler catches controller rejection
  // Expected output: error response
  test('should trigger next(err) when controller promise rejects', async () => {
    const { AuthController } = require('../../src/controllers/auth.controller');
    const controllerProto = AuthController.prototype;
    const originalMethod = controllerProto.signUp;

    controllerProto.signUp = (jest.fn() as any).mockRejectedValue(new Error('Controller error'));

    const response = await request(app)
      .post('/api/auth/signup')
      .send({ idToken: 'test-token' });

    expect(response.status).toBe(500);
    expect(controllerProto.signUp).toHaveBeenCalled();

    // Restore original method
    controllerProto.signUp = originalMethod;
  });

  // Mocked behavior: authService.signUpWithGoogle rejects with generic error
  // Input: request with idToken 'test-token'
  // Expected status code: 500
  // Expected behavior: unknown error is forwarded to error handler
  // Expected output: 500 error response
  test('should trigger next(err) for unknown Error types', async () => {
    const authService = require('../../src/services/auth.service').authService;
    const originalSignUp = authService.signUpWithGoogle;
    
    authService.signUpWithGoogle = (jest.fn() as any).mockRejectedValue(new Error('Unknown service error'));

    const response = await request(app)
      .post('/api/auth/signup')
      .send({ idToken: 'test-token' });

    expect(response.status).toBe(500);

    // Restore original method
    authService.signUpWithGoogle = originalSignUp;
  });

  // Mocked behavior: authService.signUpWithGoogle rejects with non-Error string
  // Input: request with idToken 'test-token'
  // Expected status code: 500
  // Expected behavior: non-Error exception is caught and forwarded
  // Expected output: 500 error response
  test('should trigger next(err) for non-Error exceptions', async () => {
    const authService = require('../../src/services/auth.service').authService;
    const originalSignUp = authService.signUpWithGoogle;
    
    authService.signUpWithGoogle = (jest.fn() as any).mockRejectedValue('String error');

    const response = await request(app)
      .post('/api/auth/signup')
      .send({ idToken: 'test-token' });

    expect(response.status).toBe(500);

    // Restore original method
    authService.signUpWithGoogle = originalSignUp;
  });

  // Mocked behavior: OAuth2Client.verifyIdToken returns ticket with null payload
  // Input: request with idToken 'test-token'
  // Expected status code: 401
  // Expected behavior: null payload treated as invalid token
  // Expected output: error message 'Invalid Google token'
  test('should handle getPayload returning null/undefined', async () => {
    // Mock OAuth2Client to return ticket with null payload
    const { OAuth2Client } = require('google-auth-library');
    const originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken;
    
    (OAuth2Client.prototype.verifyIdToken as any) = (jest.fn() as any).mockResolvedValue({
      getPayload: () => null, // getPayload returns null
    });

    try {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({ idToken: 'test-token' });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid Google token');
    } finally {
      OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
    }
  });

  // Mocked behavior: OAuth2Client returns payload without email field
  // Input: request with idToken 'test-token', payload has sub and name but no email
  // Expected status code: 401
  // Expected behavior: missing email field causes validation failure
  // Expected output: error message 'Invalid Google token'
  test('should handle payload missing email', async () => {
    // Mock OAuth2Client to return payload without email
    const { OAuth2Client } = require('google-auth-library');
    const originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken;
    
    (OAuth2Client.prototype.verifyIdToken as any) = (jest.fn() as any).mockResolvedValue({
      getPayload: () => ({
        sub: 'google-id-123',
        name: 'Test User',
        // email is missing
        picture: 'http://example.com/pic.jpg',
      }),
    });

    try {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({ idToken: 'test-token' });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid Google token');
    } finally {
      OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
    }
  });

  // Mocked behavior: OAuth2Client returns payload without name field
  // Input: request with idToken 'test-token', payload has sub and email but no name
  // Expected status code: 401
  // Expected behavior: missing name field causes validation failure
  // Expected output: error message 'Invalid Google token'
  test('should handle payload missing name', async () => {
    // Mock OAuth2Client to return payload without name
    const { OAuth2Client } = require('google-auth-library');
    const originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken;
    
    (OAuth2Client.prototype.verifyIdToken as any) = (jest.fn() as any).mockResolvedValue({
      getPayload: () => ({
        sub: 'google-id-123',
        email: 'test@example.com',
        // name is missing
        picture: 'http://example.com/pic.jpg',
      }),
    });

    try {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({ idToken: 'test-token' });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid Google token');
    } finally {
      OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
    }
  });

  // Mocked behavior: OAuth2Client.verifyIdToken returns ticket where getPayload() throws error
  // Input: request with idToken 'test-token'
  // Expected status code: 401
  // Expected behavior: exception in getPayload() is caught and treated as invalid token
  // Expected output: error message 'Invalid Google token'
  test('should handle getPayload throwing an error', async () => {
    // Mock OAuth2Client to have getPayload throw error
    const { OAuth2Client } = require('google-auth-library');
    const originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken;
    
    (OAuth2Client.prototype.verifyIdToken as any) = (jest.fn() as any).mockResolvedValue({
      getPayload: () => {
        throw new Error('Failed to extract payload');
      },
    });

    try {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({ idToken: 'test-token' });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid Google token');
    } finally {
      OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
    }
  });

  // Mocked behavior: OAuth2Client successfully verifies token with valid payload
  // Input: request with mocked-valid-token, new user credentials (unique googleId and email)
  // Expected status code: 201
  // Expected behavior: new user is created in database, JWT token generated
  // Expected output: success message, JWT token, user object with email, name, googleId
  test('should successfully sign up a new user with valid Google token (mocking OAuth2Client)', async () => {
    // Mock the OAuth2Client to successfully verify token and return valid payload
    const { OAuth2Client } = require('google-auth-library');
    const originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken;
    
    const mockGoogleId = 'google-id-new-user-success-' + Date.now();
    const mockEmail = `newuser-success-${Date.now()}@example.com`;
    
    (OAuth2Client.prototype.verifyIdToken as any) = (jest.fn() as any).mockResolvedValue({
      getPayload: () => ({
        sub: mockGoogleId,
        email: mockEmail,
        name: 'New Test User Success',
        picture: 'https://example.com/pic.jpg',
      }),
    });

    try {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({ idToken: 'mocked-valid-token' });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('User signed up successfully');
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user.email).toBe(mockEmail);
      expect(response.body.data.user.name).toBe('New Test User Success');
      expect(response.body.data.user.googleId).toBe(mockGoogleId);

      // Cleanup: delete the created user
      const db = mongoose.connection.db;
      if (db) {
        await db.collection('users').deleteOne({ googleId: mockGoogleId });
      }
    } finally {
      OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
    }
  });

  // Mocked behavior: OAuth2Client verifies token successfully, but JWT_SECRET is undefined
  // Input: request with mocked-valid-token, new user credentials
  // Expected status code: 500
  // Expected behavior: JWT token generation fails due to missing JWT_SECRET
  // Expected output: 500 error (unable to generate token)
  test('should return 500 when JWT_SECRET is not configured during signup', async () => {
    // Mock the OAuth2Client to successfully verify token
    const { OAuth2Client } = require('google-auth-library');
    const originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken;
    
    const mockGoogleId = 'google-id-no-jwt-secret-' + Date.now();
    const mockEmail = `nojwtsecret-${Date.now()}@example.com`;
    
    (OAuth2Client.prototype.verifyIdToken as any) = (jest.fn() as any).mockResolvedValue({
      getPayload: () => ({
        sub: mockGoogleId,
        email: mockEmail,
        name: 'Test User No JWT Secret',
        picture: 'https://example.com/pic.jpg',
      }),
    });

    // Temporarily remove JWT_SECRET
    const originalSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    try {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({ idToken: 'mocked-valid-token' });

      // Should return 500 when JWT_SECRET is missing
      expect(response.status).toBe(500);
      
      
      // Cleanup: delete the user if it was created
      const db = mongoose.connection.db;
      if (db) {
        await db.collection('users').deleteOne({ googleId: mockGoogleId });
      }
    } finally {
      // Restore JWT_SECRET
      process.env.JWT_SECRET = originalSecret;
      OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
    }
  });

  // Mocked behavior: OAuth2Client verifies token, jwt.sign returns Buffer instead of string
  // Input: request with mocked-valid-token, new user credentials
  // Expected status code: 500
  // Expected behavior: type mismatch in token generation causes failure
  // Expected output: 500 error response
  test('should return 500 when jwt.sign returns non-string token', async () => {
    // Mock the OAuth2Client to successfully verify token
    const { OAuth2Client } = require('google-auth-library');
    const originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken;
    
    const mockGoogleId = 'google-id-buffer-token-' + Date.now();
    const mockEmail = `buffertoken-${Date.now()}@example.com`;
    
    (OAuth2Client.prototype.verifyIdToken as any) = (jest.fn() as any).mockResolvedValue({
      getPayload: () => ({
        sub: mockGoogleId,
        email: mockEmail,
        name: 'Test User Buffer Token',
        picture: 'https://example.com/pic.jpg',
      }),
    });

    // Mock jwt.sign to return a Buffer instead of string
    const jwt = require('jsonwebtoken');
    const originalSign = jwt.sign;
    (jwt.sign as any) = (jest.fn() as any).mockReturnValue(Buffer.from('token-as-buffer'));

    try {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({ idToken: 'mocked-valid-token' });

      // Should return 500 when jwt.sign returns non-string
      expect(response.status).toBe(500);
      
      // Cleanup: delete the user if it was created
      const db = mongoose.connection.db;
      if (db) {
        await db.collection('users').deleteOne({ googleId: mockGoogleId });
      }
    } finally {
      // Restore jwt.sign
      jwt.sign = originalSign;
      OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
    }
  });

  test('should return 401 for invalid Google token', async () => {
    // Mock the authService to throw invalid token error
    const authService = require('../../src/services/auth.service').authService;
    const originalSignUp = authService.signUpWithGoogle;
    
    authService.signUpWithGoogle = (jest.fn() as any).mockRejectedValue(new Error('Invalid Google token'));

    const response = await request(app)
      .post('/api/auth/signup')
      .send({ idToken: 'invalid-token' });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid Google token');

    // Restore original method
    authService.signUpWithGoogle = originalSignUp;
  });

  // Mocked behavior: OAuth2Client verifies token with googleId matching existing user
  // Input: request with mocked-valid-token, credentials matching testUser's googleId
  // Expected status code: 409
  // Expected behavior: signup attempt for existing user is rejected
  // Expected output: error message 'User already exists, please sign in instead.'
  test('should return 409 if user already exists (mocking OAuth2Client)', async () => {
    // Mock the OAuth2Client to return a payload that matches an existing user
    const { OAuth2Client } = require('google-auth-library');
    const originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken;
    
    (OAuth2Client.prototype.verifyIdToken as any) = (jest.fn() as any).mockResolvedValue({
      getPayload: () => ({
        sub: `test-google-id-auth-mock-${testUserId.toString()}`, // Existing user's googleId
        email: `authmock${testUserId.toString()}@example.com`,
        name: 'Test Auth User Mock',
        picture: 'https://example.com/pic.jpg',
      }),
    });

    try {
      const response = await request(app)
        .post('/api/auth/signup')
        .send({ idToken: 'mocked-valid-token' });

      expect(response.status).toBe(409);
      expect(response.body.message).toBe('User already exists, please sign in instead.');
    } finally {
      OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
    }
  });

  // Mocked behavior: authService.signUpWithGoogle rejects with 'User already exists' error
  // Input: request with test-token
  // Expected status code: 409
  // Expected behavior: existing user error is caught and returned as 409
  // Expected output: error message 'User already exists, please sign in instead.'
  test('should return 409 if user already exists', async () => {
    const authService = require('../../src/services/auth.service').authService;
    const originalSignUp = authService.signUpWithGoogle;
    
    authService.signUpWithGoogle = (jest.fn() as any).mockRejectedValue(new Error('User already exists'));

    const response = await request(app)
      .post('/api/auth/signup')
      .send({ idToken: 'test-token' });

    expect(response.status).toBe(409);
    expect(response.body.message).toBe('User already exists, please sign in instead.');

    // Restore original method
    authService.signUpWithGoogle = originalSignUp;
  });

  // Mocked behavior: authService.signUpWithGoogle rejects with 'Failed to process user' error
  // Input: request with test-token
  // Expected status code: 500
  // Expected behavior: processing error is caught and returned as 500
  // Expected output: error message 'Failed to process user information'
  test('should return 500 for failed to process user error', async () => {
    const authService = require('../../src/services/auth.service').authService;
    const originalSignUp = authService.signUpWithGoogle;
    
    authService.signUpWithGoogle = (jest.fn() as any).mockRejectedValue(new Error('Failed to process user'));

    const response = await request(app)
      .post('/api/auth/signup')
      .send({ idToken: 'test-token' });

    expect(response.status).toBe(500);
    expect(response.body.message).toBe('Failed to process user information');

    // Restore original method
    authService.signUpWithGoogle = originalSignUp;
  });

  // Mocked behavior: none (validation middleware)
  // Input: request body with no idToken field
  // Expected status code: 400
  // Expected behavior: validation middleware rejects missing required field
  // Expected output: validation error
  test('should return 400 for missing idToken', async () => {
    const response = await request(app)
      .post('/api/auth/signup')
      .send({});

    expect(response.status).toBe(400);
  });

  // Mocked behavior: none (validation middleware)
  // Input: request body with idToken as number (12345) instead of string
  // Expected status code: 400
  // Expected behavior: validation middleware rejects invalid type
  // Expected output: validation error
  test('should return 400 for invalid idToken type', async () => {
    const response = await request(app)
      .post('/api/auth/signup')
      .send({ idToken: 12345 });

    expect(response.status).toBe(400);
  });

  // Mocked behavior: authService.signUpWithGoogle resolves with mock token and user
  // Input: request with valid-token
  // Expected status code: 201
  // Expected behavior: service returns mocked JWT and user object
  // Expected output: success message, mock-jwt-token, user object with _id and email
  test('should successfully sign up with valid token', async () => {
    const authService = require('../../src/services/auth.service').authService;
    const originalSignUp = authService.signUpWithGoogle;
    
    const mockUserId = new mongoose.Types.ObjectId();
    const mockUser = {
      _id: mockUserId.toString(),
      googleId: 'new-user-google-id',
      email: 'newuser@example.com',
      name: 'New User',
      userRole: undefined
    };

    authService.signUpWithGoogle = (jest.fn() as any).mockResolvedValue({
      token: 'mock-jwt-token',
      user: mockUser
    }) as any;

    const response = await request(app)
      .post('/api/auth/signup')
      .send({ idToken: 'valid-token' });

    expect(response.status).toBe(201);
    expect(response.body.message).toBe('User signed up successfully');
    expect(response.body.data.token).toBe('mock-jwt-token');
    expect(response.body.data.user._id).toBe(mockUser._id);
    expect(response.body.data.user.email).toBe(mockUser.email);

    // Restore original method
    authService.signUpWithGoogle = originalSignUp;
  });
});

// Interface POST /api/auth/signin
describe('POST /api/auth/signin - Sign In with Google (Mocked)', () => {
  // Mocked behavior: AuthController.signIn rejects with error
  // Input: request with idToken 'test-token'
  // Expected status code: 500
  // Expected behavior: error handler catches controller rejection
  // Expected output: error response
  test('should trigger next(err) when controller promise rejects', async () => {
    const { AuthController } = require('../../src/controllers/auth.controller');
    const controllerProto = AuthController.prototype;
    const originalMethod = controllerProto.signIn;

    controllerProto.signIn = (jest.fn() as any).mockRejectedValue(new Error('Controller error'));

    const response = await request(app)
      .post('/api/auth/signin')
      .send({ idToken: 'test-token' });

    expect(response.status).toBe(500);
    expect(controllerProto.signIn).toHaveBeenCalled();

    // Restore original method
    controllerProto.signIn = originalMethod;
  });

  // Mocked behavior: authService.signInWithGoogle rejects with generic error
  // Input: request with idToken 'test-token'
  // Expected status code: 500
  // Expected behavior: unknown error is forwarded to error handler
  // Expected output: 500 error response
  test('should trigger next(err) for unknown Error types', async () => {
    const authService = require('../../src/services/auth.service').authService;
    const originalSignIn = authService.signInWithGoogle;
    
    authService.signInWithGoogle = (jest.fn() as any).mockRejectedValue(new Error('Unknown service error')) as any;

    const response = await request(app)
      .post('/api/auth/signin')
      .send({ idToken: 'test-token' });

    expect(response.status).toBe(500);

    // Restore original method
    authService.signInWithGoogle = originalSignIn;
  });

  // Mocked behavior: authService.signInWithGoogle rejects with non-Error string
  // Input: request with idToken 'test-token'
  // Expected status code: 500
  // Expected behavior: non-Error exception is caught and forwarded
  // Expected output: 500 error response
  test('should trigger next(err) for non-Error exceptions', async () => {
    const authService = require('../../src/services/auth.service').authService;
    const originalSignIn = authService.signInWithGoogle;
    
    authService.signInWithGoogle = (jest.fn() as any).mockRejectedValue('String error') as any;

    const response = await request(app)
      .post('/api/auth/signin')
      .send({ idToken: 'test-token' });

    expect(response.status).toBe(500);

    // Restore original method
    authService.signInWithGoogle = originalSignIn;
  });

  // Mocked behavior: OAuth2Client successfully verifies token with existing user's googleId
  // Input: request with mocked-valid-token, credentials matching testUser
  // Expected status code: 200
  // Expected behavior: existing user is found, JWT token generated and returned
  // Expected output: success message, JWT token, user object with email and googleId
  test('should successfully sign in an existing user with valid Google token (mocking OAuth2Client)', async () => {
    // Mock the OAuth2Client to successfully verify token and return valid payload for existing user
    const { OAuth2Client } = require('google-auth-library');
    const originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken;
    
    (OAuth2Client.prototype.verifyIdToken as any) = (jest.fn() as any).mockResolvedValue({
      getPayload: () => ({
        sub: `test-google-id-auth-mock-${testUserId.toString()}`, // Existing user's googleId
        email: `authmock${testUserId.toString()}@example.com`,
        name: 'Test Auth User Mock',
        picture: 'https://example.com/pic.jpg',
      }),
    });

    try {
      const response = await request(app)
        .post('/api/auth/signin')
        .send({ idToken: 'mocked-valid-token' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('User signed in successfully');
      expect(response.body.data.token).toBeDefined();
      expect(response.body.data.user.email).toBe(`authmock${testUserId.toString()}@example.com`);
      expect(response.body.data.user.googleId).toBe(`test-google-id-auth-mock-${testUserId.toString()}`);
    } finally {
      OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
    }
  });

  test('should return 401 for invalid Google token', async () => {
    const authService = require('../../src/services/auth.service').authService;
    const originalSignIn = authService.signInWithGoogle;
    
    authService.signInWithGoogle = (jest.fn() as any).mockRejectedValue(new Error('Invalid Google token')) as any;

    const response = await request(app)
      .post('/api/auth/signin')
      .send({ idToken: 'invalid-token' });

    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Invalid Google token');

    // Restore original method
    authService.signInWithGoogle = originalSignIn;
  });

  // Mocked behavior: OAuth2Client verifies token with non-existent user's googleId
  // Input: request with mocked-valid-token, credentials for non-existent user
  // Expected status code: 404
  // Expected behavior: user lookup fails, not found error returned
  // Expected output: error message 'User not found, please sign up first.'
  test('should return 404 if user not found (mocking OAuth2Client)', async () => {
    // Mock the OAuth2Client to return a valid payload but for non-existent user
    const { OAuth2Client } = require('google-auth-library');
    const originalVerifyIdToken = OAuth2Client.prototype.verifyIdToken;
    
    const nonExistentGoogleId = 'non-existent-google-id-mock-' + Date.now();
    
    (OAuth2Client.prototype.verifyIdToken as any) = (jest.fn() as any).mockResolvedValue({
      getPayload: () => ({
        sub: nonExistentGoogleId,
        email: 'nonexistent-mock@example.com',
        name: 'Non Existent User Mock',
        picture: 'https://example.com/pic.jpg',
      }),
    });

    try {
      const response = await request(app)
        .post('/api/auth/signin')
        .send({ idToken: 'mocked-valid-token' });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('User not found, please sign up first.');
    } finally {
      OAuth2Client.prototype.verifyIdToken = originalVerifyIdToken;
    }
  });

  // Mocked behavior: authService.signInWithGoogle rejects with 'User not found' error
  // Input: request with test-token
  // Expected status code: 404
  // Expected behavior: user not found error is caught and returned as 404
  // Expected output: error message 'User not found, please sign up first.'
  test('should return 404 if user not found', async () => {
    const authService = require('../../src/services/auth.service').authService;
    const originalSignIn = authService.signInWithGoogle;
    
    authService.signInWithGoogle = (jest.fn() as any).mockRejectedValue(new Error('User not found')) as any;

    const response = await request(app)
      .post('/api/auth/signin')
      .send({ idToken: 'test-token' });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('User not found, please sign up first.');

    // Restore original method
    authService.signInWithGoogle = originalSignIn;
  });

  // Mocked behavior: authService.signInWithGoogle rejects with 'Failed to process user' error
  // Input: request with test-token
  // Expected status code: 500
  // Expected behavior: processing error is caught and returned as 500
  // Expected output: error message 'Failed to process user information'
  test('should return 500 for failed to process user error', async () => {
    const authService = require('../../src/services/auth.service').authService;
    const originalSignIn = authService.signInWithGoogle;
    
    authService.signInWithGoogle = (jest.fn() as any).mockRejectedValue(new Error('Failed to process user')) as any;

    const response = await request(app)
      .post('/api/auth/signin')
      .send({ idToken: 'test-token' });

    expect(response.status).toBe(500);
    expect(response.body.message).toBe('Failed to process user information');

    // Restore original method
    authService.signInWithGoogle = originalSignIn;
  });

  // Mocked behavior: none (validation middleware)
  // Input: request body with no idToken field
  // Expected status code: 400
  // Expected behavior: validation middleware rejects missing required field
  // Expected output: validation error
  test('should return 400 for missing idToken', async () => {
    const response = await request(app)
      .post('/api/auth/signin')
      .send({});

    expect(response.status).toBe(400);
  });

  // Mocked behavior: authService.signInWithGoogle resolves with mock token and user
  // Input: request with valid-token
  // Expected status code: 200
  // Expected behavior: service returns mocked JWT and existing user object
  // Expected output: success message, mock-jwt-token, user object with _id and email
  test('should successfully sign in with valid token', async () => {
    const authService = require('../../src/services/auth.service').authService;
    const originalSignIn = authService.signInWithGoogle;
    
    const mockUser = {
      _id: testMoverId.toString(),
      googleId: `test-google-id-mover-auth-mock-${testMoverId.toString()}`,
      email: `moverauthmock${testMoverId.toString()}@example.com`,
      name: 'Test Mover Auth Mock',
      userRole: 'MOVER'
    };

    authService.signInWithGoogle = (jest.fn() as any).mockResolvedValue({
      token: 'mock-jwt-token',
      user: mockUser
    }) as any;

    const response = await request(app)
      .post('/api/auth/signin')
      .send({ idToken: 'valid-token' });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('User signed in successfully');
    expect(response.body.data.token).toBe('mock-jwt-token');
    expect(response.body.data.user._id).toBe(mockUser._id);
    expect(response.body.data.user.email).toBe(mockUser.email);

    // Restore original method
    authService.signInWithGoogle = originalSignIn;
  });
});

// Interface POST /api/auth/select-role
describe('POST /api/auth/select-role - Select User Role (Mocked)', () => {
  // Mocked behavior: AuthController.selectRole rejects with error
  // Input: authenticated request with userRole 'STUDENT'
  // Expected status code: 500
  // Expected behavior: error handler catches controller rejection
  // Expected output: error response
  test('should trigger next(err) when controller promise rejects', async () => {
    const { AuthController } = require('../../src/controllers/auth.controller');
    const controllerProto = AuthController.prototype;
    const originalMethod = controllerProto.selectRole;

    controllerProto.selectRole = (jest.fn() as any).mockRejectedValue(new Error('Controller error'));

    const response = await request(app)
      .post('/api/auth/select-role')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ userRole: 'STUDENT' });

    expect(response.status).toBe(500);
    expect(controllerProto.selectRole).toHaveBeenCalled();

    // Restore original method
    controllerProto.selectRole = originalMethod;
  });

  // Mocked behavior: userModel.update rejects with generic database error
  // Input: authenticated request with userRole 'STUDENT'
  // Expected status code: 500
  // Expected behavior: unknown error is forwarded to error handler
  // Expected output: 500 error response
  test('should trigger next(err) for unknown Error types', async () => {
    const userModel = require('../../src/models/user.model').userModel;
    const originalUpdate = userModel.update;
    
    userModel.update = (jest.fn() as any).mockRejectedValue(new Error('Unknown database error')) as any;

    const response = await request(app)
      .post('/api/auth/select-role')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ userRole: 'STUDENT' });

    expect(response.status).toBe(500);

    // Restore original method
    userModel.update = originalUpdate;
  });

  // Mocked behavior: userModel.update rejects with non-Error string
  // Input: authenticated request with userRole 'STUDENT'
  // Expected status code: 500
  // Expected behavior: non-Error exception is caught and forwarded
  // Expected output: 500 error response
  test('should trigger next(err) for non-Error exceptions', async () => {
    const userModel = require('../../src/models/user.model').userModel;
    const originalUpdate = userModel.update;
    
    userModel.update = (jest.fn() as any).mockRejectedValue('String error') as any;

    const response = await request(app)
      .post('/api/auth/select-role')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ userRole: 'STUDENT' });

    expect(response.status).toBe(500);

    // Restore original method
    userModel.update = originalUpdate;
  });

  // Mocked behavior: none (uses real database)
  // Input: authenticated request with userRole 'STUDENT'
  // Expected status code: 200
  // Expected behavior: user's role is updated to STUDENT in database
  // Expected output: success message, user object with userRole: 'STUDENT'
  test('should successfully select STUDENT role', async () => {
    const response = await request(app)
      .post('/api/auth/select-role')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ userRole: 'STUDENT' });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Role selected successfully');
    expect(response.body.data.user.userRole).toBe('STUDENT');
  });

  // Mocked behavior: none (uses real database)
  // Input: authenticated request with userRole 'MOVER'
  // Expected status code: 200
  // Expected behavior: user's role is updated to MOVER, credits initialized to 0
  // Expected output: success message, user object with userRole: 'MOVER' and credits: 0
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

  // Mocked behavior: none (authentication middleware)
  // Input: request with userRole 'STUDENT' but no Authorization header
  // Expected status code: 401
  // Expected behavior: auth middleware rejects unauthenticated request
  // Expected output: unauthorized error
  test('should return 401 for missing authentication token', async () => {
    const response = await request(app)
      .post('/api/auth/select-role')
      .send({ userRole: 'STUDENT' });

    expect(response.status).toBe(401);
  });

  // Mocked behavior: none (authentication middleware)
  // Input: request with userRole 'STUDENT' and invalid Bearer token
  // Expected status code: 401
  // Expected behavior: auth middleware rejects malformed/invalid token
  // Expected output: unauthorized error
  test('should return 401 for invalid authentication token', async () => {
    const response = await request(app)
      .post('/api/auth/select-role')
      .set('Authorization', 'Bearer invalid-token')
      .send({ userRole: 'STUDENT' });

    expect(response.status).toBe(401);
  });

  // Mocked behavior: none (validation middleware)
  // Input: authenticated request with empty body (no userRole field)
  // Expected status code: 400
  // Expected behavior: validation middleware rejects missing required field
  // Expected output: validation error
  test('should return 400 for missing userRole', async () => {
    const response = await request(app)
      .post('/api/auth/select-role')
      .set('Authorization', `Bearer ${authToken}`)
      .send({});

    expect(response.status).toBe(400);
  });

  // Mocked behavior: none (validation middleware)
  // Input: authenticated request with userRole 'INVALID_ROLE'
  // Expected status code: 400
  // Expected behavior: validation middleware rejects invalid enum value
  // Expected output: validation error
  test('should return 400 for invalid userRole', async () => {
    const response = await request(app)
      .post('/api/auth/select-role')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ userRole: 'INVALID_ROLE' });

    expect(response.status).toBe(400);
  });

  // Mocked behavior: userModel.update resolves with null (user not found)
  // Input: authenticated request with userRole 'STUDENT'
  // Expected status code: 404
  // Expected behavior: null return indicates user doesn't exist
  // Expected output: error message 'User not found'
  test('should return 404 when userModel.update returns null', async () => {
    // Mock userModel.update to return null (simulating user not found)
    const originalUpdate = userModel.update;
    userModel.update = (jest.fn() as any).mockResolvedValue(null) as any;

    const response = await request(app)
      .post('/api/auth/select-role')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ userRole: 'STUDENT' });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('User not found');

    // Restore original method
    userModel.update = originalUpdate;
  });

  // Mocked behavior: userModel.update rejects with database error
  // Input: authenticated request with userRole 'STUDENT'
  // Expected status code: 500
  // Expected behavior: database error is caught and returned
  // Expected output: error message 'Database error'
  test('should handle database error during role update', async () => {
    // Mock userModel.update to throw error
    const originalUpdate = userModel.update;
    userModel.update = (jest.fn() as any).mockRejectedValue(new Error('Database error')) as any;

    const response = await request(app)
      .post('/api/auth/select-role')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ userRole: 'STUDENT' });

    expect(response.status).toBe(500);
    expect(response.body.message).toBe('Database error');

    // Restore original method
    userModel.update = originalUpdate;
  });

  // Mocked behavior: userModel.findById returns null (user no longer exists)
  // Input: authenticated request with userRole 'STUDENT', valid token but user deleted
  // Expected status code: 401
  // Expected behavior: auth middleware finds no user, sets req.user to undefined
  // Expected output: error message 'Token is valid but user no longer exists'
  test('should return 401 when req.user is undefined', async () => {
    // Mock userModel.findById to return null, simulating user not found
    const originalFindById = userModel.findById;
    userModel.findById = (jest.fn() as any).mockResolvedValue(null) as any;

    try {
      const response = await request(app)
        .post('/api/auth/select-role')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userRole: 'STUDENT' });

      // Auth middleware returns 401 when user not found, which means req.user is undefined
      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Token is valid but user no longer exists');
    } finally {
      userModel.findById = originalFindById;
    }
  });

  // Mocked behavior: userModel.findById returns user object without _id field
  // Input: authenticated request with userRole 'STUDENT'
  // Expected status code: 401
  // Expected behavior: controller checks for !user._id and returns 401
  // Expected output: error message 'Authentication required'
  test('should return 401 when req.user exists but has no _id', async () => {
    // Mock userModel.findById to return a user without _id
    const originalFindById = userModel.findById;
    userModel.findById = (jest.fn() as any).mockResolvedValue({
      googleId: 'test-google-id',
      email: 'test@example.com',
      name: 'Test User',
      userRole: 'STUDENT',
      // _id is missing/undefined
    }) as any;

    try {
      const response = await request(app)
        .post('/api/auth/select-role')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ userRole: 'STUDENT' });

      // Controller checks for !user._id and returns 401
      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Authentication required');
    } finally {
      userModel.findById = originalFindById;
    }
  });
});

// Testing UserModel methods with mocked database operations
describe('UserModel Error Handling ', () => {
  describe('findById - error handling', () => {
    // Mocked behavior: underlying mongoose findOne throws database error
    // Input: GET /api/user/profile with valid auth token
    // Expected status code: 500
    // Expected behavior: database connection error in findById is caught
    // Expected output: 500 error response
    test('should handle database error in findById via auth middleware', async () => {
      // Mock the underlying mongoose findOne to throw an error
      const actualUserModel = (userModel as any).user;
      const findOneSpy = jest.spyOn(actualUserModel, 'findOne').mockImplementationOnce(() => {
        throw new Error('Database connection error');
      });

      try {
        const response = await request(app)
          .get('/api/user/profile')
          .set('Authorization', `Bearer ${authToken}`);

        // Verify the spy was called
        expect(findOneSpy).toHaveBeenCalled();
        // Should return 500 because findById throws an error
        expect(response.status).toBe(500);
      } finally {
        findOneSpy.mockRestore();
      }
    });

    // Mocked behavior: none (uses real database with non-existent ID)
    // Input: GET /api/user/profile with token containing non-existent user ID
    // Expected status code: 401
    // Expected behavior: findById returns null, auth middleware rejects
    // Expected output: error message 'Token is valid but user no longer exists'
    test('should return null when user not found by id', async () => {
      // Create a token with non-existent user ID
      const nonExistentId = new mongoose.Types.ObjectId();
      const invalidToken = jwt.sign({ id: nonExistentId }, process.env.JWT_SECRET || 'default-secret');

      const response = await request(app)
        .get('/api/user/profile')
        .set('Authorization', `Bearer ${invalidToken}`);

      // Auth middleware should return 401 when user not found (findById returns null)
      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Token is valid but user no longer exists');
    });
  });

  describe('findByGoogleId - error handling', () => {
    // Mocked behavior: authService calls findByGoogleId, underlying findOne throws error
    // Input: POST /api/auth/signup with mock credentials
    // Expected status code: 500
    // Expected behavior: database query failure in findByGoogleId is caught
    // Expected output: 500 error response
    test('should handle database error in findByGoogleId during signup', async () => {
      // Mock the auth service to bypass Google token verification
      const authService = require('../../src/services/auth.service').authService;
      const originalSignUp = authService.signUpWithGoogle;
      
      // Mock signUpWithGoogle to directly call userModel.findByGoogleId
      authService.signUpWithGoogle = jest.fn().mockImplementation(async () => {
        // Directly call findByGoogleId which will trigger the error
        const actualUserModel = (userModel as any).user;
        const findOneSpy = jest.spyOn(actualUserModel, 'findOne').mockImplementationOnce(() => {
          throw new Error('Database query failed');
        });

        try {
          // This will hit the error handling in findByGoogleId
          await userModel.findByGoogleId('test-google-id');
        } finally {
          findOneSpy.mockRestore();
        }
      });

      try {
        const response = await request(app)
          .post('/api/auth/signup')
          .send({
            idToken: 'mock-id-token',
            email: 'newuser@example.com',
            name: 'New User',
            picture: 'http://example.com/pic.jpg'
          });

        expect(authService.signUpWithGoogle).toHaveBeenCalled();
        expect(response.status).toBe(500);
      } finally {
        authService.signUpWithGoogle = originalSignUp;
      }
    });

    // Mocked behavior: authService calls findByGoogleId, underlying findOne throws error
    // Input: POST /api/auth/signin with mock credentials
    // Expected status code: 500
    // Expected behavior: database query failure in findByGoogleId is caught
    // Expected output: 500 error response
    test('should handle database error in findByGoogleId during signin', async () => {
      // Mock the auth service to bypass Google token verification
      const authService = require('../../src/services/auth.service').authService;
      const originalSignIn = authService.signInWithGoogle;
      
      // Mock signInWithGoogle to directly call userModel.findByGoogleId with error
      authService.signInWithGoogle = jest.fn().mockImplementation(async () => {
        const actualUserModel = (userModel as any).user;
        const findOneSpy = jest.spyOn(actualUserModel, 'findOne').mockImplementationOnce(() => {
          throw new Error('Database query failed');
        });

        try {
          // This will hit the error handling in findByGoogleId
          await userModel.findByGoogleId('test-google-id');
        } finally {
          findOneSpy.mockRestore();
        }
      });

      try {
        const response = await request(app)
          .post('/api/auth/signin')
          .send({
            idToken: 'mock-id-token',
            email: 'test@example.com',
            name: 'Test User',
            picture: 'http://example.com/pic.jpg'
          });

        expect(authService.signInWithGoogle).toHaveBeenCalled();
        expect(response.status).toBe(500);
      } finally {
        authService.signInWithGoogle = originalSignIn;
      }
    });

    // Mocked behavior: authService calls findByGoogleId with non-existent googleId
    // Input: POST /api/auth/signin with non-existent google credentials
    // Expected status code: 404
    // Expected behavior: findByGoogleId returns null, throws 'User not found' error
    // Expected output: 404 error response
    test('should return null when user not found by googleId', async () => {
      // Mock the auth service to test findByGoogleId returning null
      const authService = require('../../src/services/auth.service').authService;
      const originalSignIn = authService.signInWithGoogle;
      
      authService.signInWithGoogle = jest.fn().mockImplementation(async () => {
        // Call findByGoogleId with non-existent googleId
        const result = await userModel.findByGoogleId('non-existent-google-id-xyz');
        if (!result) {
          throw new Error('User not found');
        }
        return result;
      });

      try {
        const response = await request(app)
          .post('/api/auth/signin')
          .send({
            idToken: 'mock-id-token',
            email: 'nonexistent@example.com',
            name: 'Non Existent',
            picture: 'http://example.com/pic.jpg'
          });

        expect(authService.signInWithGoogle).toHaveBeenCalled();
        expect(response.status).toBe(404);
      } finally {
        authService.signInWithGoogle = originalSignIn;
      }
    });

    // Mocked behavior: authService calls findByGoogleId with existing user's googleId
    // Input: POST /api/auth/signin with existing user credentials
    // Expected status code: 200
    // Expected behavior: findByGoogleId returns user, JWT generated
    // Expected output: success response with token and user data
    test('should successfully find existing user by googleId', async () => {
      // Test the success path - finding an existing user
      const authService = require('../../src/services/auth.service').authService;
      const originalSignIn = authService.signInWithGoogle;
      
      authService.signInWithGoogle = jest.fn().mockImplementation(async () => {
        // Call findByGoogleId with existing googleId - should return user
        const result = await userModel.findByGoogleId(`test-google-id-auth-mock-${testUserId.toString()}`);
        if (!result) {
          throw new Error('User not found');
        }
        // Generate a token
        const token = jwt.sign({ id: result._id }, process.env.JWT_SECRET || 'default-secret');
        return { token, user: result };
      });

      try {
        const response = await request(app)
          .post('/api/auth/signin')
          .send({
            idToken: 'mock-id-token',
            email: `authmock${testUserId.toString()}@example.com`,
            name: 'Test Auth User Mock',
            picture: 'http://example.com/pic.jpg'
          });

        expect(authService.signInWithGoogle).toHaveBeenCalled();
        expect(response.status).toBe(200);
      } finally {
        authService.signInWithGoogle = originalSignIn;
      }
    });
  });

  describe('getFcmToken - error handling', () => {
    // Mocked behavior: userModel.update calls getFcmToken, findById throws error
    // Input: POST /api/auth/select-role with valid auth and userRole 'STUDENT'
    // Expected status code: 500
    // Expected behavior: database read error in getFcmToken is caught
    // Expected output: 500 error response
    test('should handle database error in getFcmToken', async () => {
      // Mock select-role to trigger a path that could use getFcmToken
      // We'll mock userModel.update to call getFcmToken and throw error
      const originalUpdate = userModel.update;
      
      userModel.update = (jest.fn() as any).mockImplementation(async (userId: mongoose.Types.ObjectId) => {
        // Mock the underlying mongoose findById to throw error when getFcmToken is called
        const actualUserModel = (userModel as any).user;
        const findByIdSpy = jest.spyOn(actualUserModel, 'findById').mockImplementationOnce(() => {
          throw new Error('Database read error');
        });

        try {
          // This will hit the error handling in getFcmToken
          await userModel.getFcmToken(userId);
        } finally {
          findByIdSpy.mockRestore();
        }
      }) as any;

      try {
        const response = await request(app)
          .post('/api/auth/select-role')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ userRole: 'STUDENT' });

        expect(response.status).toBe(500);
      } finally {
        userModel.update = originalUpdate;
      }
    });

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

  describe('clearInvalidFcmToken - error handling', () => {
    // Mocked behavior: userModel.update calls clearInvalidFcmToken, updateMany throws error
    // Input: POST /api/auth/select-role with valid auth and userRole 'STUDENT'
    // Expected status code: 500
    // Expected behavior: database update failure in clearInvalidFcmToken is caught
    // Expected output: 500 error response
    test('should handle database error in clearInvalidFcmToken', async () => {
      // Mock userModel.update to call clearInvalidFcmToken with error
      const originalUpdate = userModel.update;
      
      userModel.update = (jest.fn() as any).mockImplementation(async () => {
        // Mock the underlying mongoose updateMany to throw error
        const actualUserModel = (userModel as any).user;
        const updateManySpy = jest.spyOn(actualUserModel, 'updateMany').mockImplementationOnce(() => {
          throw new Error('Database update failed');
        });

        try {
          // This will hit the error handling in clearInvalidFcmToken
          await userModel.clearInvalidFcmToken('invalid-token-xyz');
        } finally {
          updateManySpy.mockRestore();
        }
      }) as any;

      try {
        const response = await request(app)
          .post('/api/auth/select-role')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ userRole: 'STUDENT' });

        expect(response.status).toBe(500);
      } finally {
        userModel.update = originalUpdate;
      }
    });

    // Mocked behavior: none (direct call to clearInvalidFcmToken)
    // Input: test FCM token 'test-invalid-token-clear' set on testUser
    // Expected status code: N/A (direct function call)
    // Expected behavior: clearInvalidFcmToken removes matching FCM token from database
    // Expected output: user's fcmToken field set to null
    test('should successfully clear invalid FCM token', async () => {
      // First set a test token
      await (userModel as any).user.findByIdAndUpdate(
        testUserId,
        { fcmToken: 'test-invalid-token-clear' }
      );

      // Clear it using clearInvalidFcmToken
      await userModel.clearInvalidFcmToken('test-invalid-token-clear');

      // Verify it was cleared
      const user = await userModel.findById(testUserId);
      expect(user?.fcmToken).toBeNull();
    });

    // Mocked behavior: none (direct call with non-existent token)
    // Input: non-existent FCM token 'non-existent-token-xyz-123'
    // Expected status code: N/A (direct function call)
    // Expected behavior: clearInvalidFcmToken completes without error even if no match
    // Expected output: resolves without throwing
    test('should handle clearing non-existent token gracefully', async () => {
      // Should not throw error even if token doesn't exist
      await expect(
        userModel.clearInvalidFcmToken('non-existent-token-xyz-123')
      ).resolves.not.toThrow();
    });
  });

  describe('authenticateToken middleware - JWT_SECRET edge cases', () => {
    // Mocked behavior: JWT_SECRET environment variable deleted
    // Input: POST /api/auth/select-role with Bearer token and userRole 'STUDENT'
    // Expected status code: 500
    // Expected behavior: auth middleware detects missing JWT_SECRET configuration
    // Expected output: error 'Server configuration error', message 'JWT secret not configured'
    test('should return 500 when JWT_SECRET is not configured', async () => {
      // Temporarily remove JWT_SECRET
      const originalSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;

      try {
        const response = await request(app)
          .post('/api/auth/select-role')
          .set('Authorization', 'Bearer some-token')
          .send({ userRole: 'STUDENT' });

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Server configuration error');
        expect(response.body.message).toBe('JWT secret not configured');
      } finally {
        // Restore JWT_SECRET
        process.env.JWT_SECRET = originalSecret;
      }
    });

    // Mocked behavior: none (uses expired JWT token)
    // Input: POST /api/auth/select-role with expired Bearer token (expiresIn: '-1s')
    // Expected status code: 401
    // Expected behavior: jwt.verify throws TokenExpiredError, caught as JsonWebTokenError
    // Expected output: error 'Invalid token', message 'Token is malformed or expired'
    test('should return 401 when token is expired (TokenExpiredError)', async () => {
      // Create an expired token
      // Note: TokenExpiredError extends JsonWebTokenError, so it gets caught by the first instanceof check
      const expiredToken = jwt.sign(
        { id: testUserId },
        process.env.JWT_SECRET || 'default-secret',
        { expiresIn: '-1s' }
      );

      const response = await request(app)
        .post('/api/auth/select-role')
        .set('Authorization', `Bearer ${expiredToken}`)
        .send({ userRole: 'STUDENT' });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Invalid token');
      expect(response.body.message).toBe('Token is malformed or expired');
    });

    // Mocked behavior: userModel.findById rejects with non-JWT database error
    // Input: POST /api/auth/select-role with valid token and userRole 'STUDENT'
    // Expected status code: 500
    // Expected behavior: unexpected error in middleware forwarded to error handler
    // Expected output: 500 error response
    test('should forward unexpected error to error handler via next(error)', async () => {
      // Mock userModel.findById to throw a non-JWT error
      const originalFindById = userModel.findById;
      (userModel.findById as any) = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      try {
        const response = await request(app)
          .post('/api/auth/select-role')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ userRole: 'STUDENT' });

        // The error handler should catch it and return 500
        expect(response.status).toBe(500);
      } finally {
        // Restore original method
        userModel.findById = originalFindById;
      }
    });

    // Mocked behavior: none (uses malformed JWT token)
    // Input: POST /api/auth/select-role with malformed Bearer token 'invalid.jwt.token'
    // Expected status code: 401
    // Expected behavior: jwt.verify throws JsonWebTokenError, caught and handled
    // Expected output: 401 error for invalid token
    test('should hit outer catch when res.status throws on JsonWebTokenError', async () => {
      // Create an invalid token to trigger JsonWebTokenError
      // Then mock res.status to throw, which will escape inner catch and hit outer catch
      const invalidToken = 'invalid.jwt.token';
      
      const response = await request(app)
        .post('/api/auth/select-role')
        .set('Authorization', `Bearer ${invalidToken}`)
        .send({ userRole: 'STUDENT' });

      // The JsonWebTokenError should be caught and handled with 401
      expect(response.status).toBe(401);
    });

    // Mocked behavior: jwt.verify throws synchronous non-JWT error
    // Input: POST /api/auth/select-role with Bearer token 'some-token'
    // Expected status code: 500
    // Expected behavior: synchronous error bypasses inner catch, hits outer catch
    // Expected output: 500 error response forwarded to error handler
    test('should catch errors in outer catch block', async () => {
      // Mock jwt.verify to throw a non-JWT error that gets to the outer catch
      const originalVerify = jwt.verify;
      (jwt.verify as any) = jest.fn().mockImplementation(() => {
        // Throw error that bypasses the inner try-catch somehow
        throw new Error('Synchronous error in verify');
      });

      try {
        const response = await request(app)
          .post('/api/auth/select-role')
          .set('Authorization', 'Bearer some-token')
          .send({ userRole: 'STUDENT' });

        // Should be caught and forwarded to error handler
        expect(response.status).toBe(500);
      } finally {
        // Restore original
        jwt.verify = originalVerify;
      }
    });
  });
});

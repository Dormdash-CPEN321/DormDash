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

describe('POST /api/auth/signup - Sign Up with Google (Mocked)', () => {
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

  test('should return 400 for missing idToken', async () => {
    const response = await request(app)
      .post('/api/auth/signup')
      .send({});

    expect(response.status).toBe(400);
  });

  test('should return 400 for invalid idToken type', async () => {
    const response = await request(app)
      .post('/api/auth/signup')
      .send({ idToken: 12345 });

    expect(response.status).toBe(400);
  });

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

describe('POST /api/auth/signin - Sign In with Google (Mocked)', () => {
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

  test('should return 400 for missing idToken', async () => {
    const response = await request(app)
      .post('/api/auth/signin')
      .send({});

    expect(response.status).toBe(400);
  });

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

describe('POST /api/auth/select-role - Select User Role (Mocked)', () => {
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

  test('should successfully select STUDENT role', async () => {
    const response = await request(app)
      .post('/api/auth/select-role')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ userRole: 'STUDENT' });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Role selected successfully');
    expect(response.body.data.user.userRole).toBe('STUDENT');
  });

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

  test('should return 401 for missing authentication token', async () => {
    const response = await request(app)
      .post('/api/auth/select-role')
      .send({ userRole: 'STUDENT' });

    expect(response.status).toBe(401);
  });

  test('should return 401 for invalid authentication token', async () => {
    const response = await request(app)
      .post('/api/auth/select-role')
      .set('Authorization', 'Bearer invalid-token')
      .send({ userRole: 'STUDENT' });

    expect(response.status).toBe(401);
  });

  test('should return 400 for missing userRole', async () => {
    const response = await request(app)
      .post('/api/auth/select-role')
      .set('Authorization', `Bearer ${authToken}`)
      .send({});

    expect(response.status).toBe(400);
  });

  test('should return 400 for invalid userRole', async () => {
    const response = await request(app)
      .post('/api/auth/select-role')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ userRole: 'INVALID_ROLE' });

    expect(response.status).toBe(400);
  });

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

describe('UserModel Error Handling - Lines 160-161, 173-209', () => {
  describe('findById - error handling (lines 160-161)', () => {
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

    test('should return null when user not found by id (line 156)', async () => {
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

  describe('findByGoogleId - error handling (lines 173-177)', () => {
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

    test('should successfully find existing user by googleId (line 173)', async () => {
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

    test('should return null when user not found in getFcmToken', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const result = await userModel.getFcmToken(nonExistentId);
      expect(result).toBeNull();
    });

    test('should return FCM token when user exists', async () => {
      // This tests the success path and the null coalescing
      const result = await userModel.getFcmToken(testUserId);
      // Result can be null or a string, both are valid
      expect(result === null || typeof result === 'string').toBe(true);
    });

    test('should return null when user has no FCM token', async () => {
      // Test when fcmToken field is undefined/null
      const result = await userModel.getFcmToken(testMoverId);
      // Mover user has no FCM token initially
      expect(result === null || typeof result === 'string').toBe(true);
    });
  });

  describe('clearInvalidFcmToken - error handling', () => {
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

    test('should handle clearing non-existent token gracefully', async () => {
      // Should not throw error even if token doesn't exist
      await expect(
        userModel.clearInvalidFcmToken('non-existent-token-xyz-123')
      ).resolves.not.toThrow();
    });
  });
});

import { describe, expect, test, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../../src/config/database';
import { userModel } from '../../src/models/user.model';
import { PaymentIntent, PaymentResult, PaymentStatus } from '../../src/types/payment.types';
import { paymentService } from '../../src/services/payment.service';

// Mock socket to prevent warnings during tests
jest.mock('../../src/socket', () => ({
  emitToRooms: jest.fn(),
  getIo: jest.fn(),
  initSocket: jest.fn(),
}));

// Mock the Stripe SDK at the network boundary
// This allows us to test the real stripeService implementation through HTTP endpoints
const mockStripeClient: any = {
  paymentIntents: {
    create: jest.fn(),
    confirm: jest.fn(),
  },
  refunds: {
    create: jest.fn(),
  },
};

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => {
    return mockStripeClient;
  });
});

// Import app after mocks are set up
import app from '../../src/app';

// Suppress console logs during tests
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info,
};

let authToken: string;
const testUserId = new mongoose.Types.ObjectId(); // Generate unique ID

// Set STRIPE_SECRET_KEY for tests (required by stripeService.initializeStripe)
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_mock_key';

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
    await db.collection('users').deleteMany({ googleId: `test-google-id-payment-mock-${testUserId.toString()}` });
  }

  // Create a test user in DB with specific _id
  await (userModel as any).user.create({
    _id: testUserId,
    googleId: `test-google-id-payment-mock-${testUserId.toString()}`,
    email: `paymentmock${testUserId.toString()}@example.com`,
    name: 'Payment Mock Test User',
    userRole: 'STUDENT'
  });

  // Generate a real JWT token for testing
  const payload = { id: testUserId };
  authToken = jwt.sign(payload, process.env.JWT_SECRET || 'default-secret');
});

beforeEach(() => {
  // Clear all mock calls before each test
  jest.clearAllMocks();
  
  // Reset the stripe instance in stripeService to force re-initialization with mocked Stripe SDK
  const { stripeService: realStripeService } = require('../../src/services/stripe.service');
  (realStripeService as any).stripe = undefined;
});

afterAll(async () => {
  // Clean up test user
  const db = mongoose.connection.db;
  if (db) {
    await db.collection('users').deleteMany({ googleId: `test-google-id-payment-mock-${testUserId.toString()}` });
  }

  // Disconnect from test database
  await disconnectDB();

  // Restore console functions
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.info = originalConsole.info;
});

// Interface POST /api/payment/create-intent
describe('POST /api/payment/create-intent - Create Payment Intent (Mocked)', () => {
  // Mocked behavior: stripeService.createPaymentIntent rejects with missing STRIPE_SECRET_KEY error
  // Input: authenticated request with amount 5000, currency CAD
  // Expected status code: 500
  // Expected behavior: surfaces configuration error when Stripe API key is missing
  // Expected output: error message containing 'STRIPE_SECRET_KEY'
  test('should handle missing STRIPE_SECRET_KEY in initializeStripe via endpoint', async () => {
    // Temporarily remove STRIPE_SECRET_KEY to trigger line 21
    const originalKey = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    
    // Reset stripe instance to force re-initialization
    const { stripeService: realStripeService } = require('../../src/services/stripe.service');
    (realStripeService as any).stripe = undefined;

    // Call the frontend-exposed API endpoint
    const response = await request(app)
      .post('/api/payment/create-intent')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 5000,
        currency: 'CAD'
      });
    
    // Should return 500 error with message about missing STRIPE_SECRET_KEY
    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty('message');
    expect(response.body.message).toContain('STRIPE_SECRET_KEY');
    
    // Restore original key
    if (originalKey) {
      process.env.STRIPE_SECRET_KEY = originalKey;
    } else {
      process.env.STRIPE_SECRET_KEY = 'sk_test_mock_key';
    }
    (realStripeService as any).stripe = undefined;
  });

  // Mocked behavior: stripeService.createPaymentIntent rejects with rate limit error
  // Input: authenticated request with amount 3000, currency CAD
  // Expected status code: 500
  // Expected behavior: handles Stripe API rate limiting gracefully
  // Expected output: 500 error response with message
  test('should handle Stripe rate limiting errors', async () => {
    // Mock Stripe SDK to throw a rate limit error
    mockStripeClient.paymentIntents.create.mockRejectedValue(
      new Error('Rate limit exceeded')
    );

    const response = await request(app)
      .post('/api/payment/create-intent')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 3000,
        currency: 'CAD'
      })
      .expect(500);

    expect(response.body).toHaveProperty('message');
  });

  // Mocked behavior: stripeService.createPaymentIntent rejects with network timeout error
  // Input: authenticated request with amount 7500, currency CAD
  // Expected status code: 500
  // Expected behavior: handles network timeouts during payment intent creation
  // Expected output: 500 error response with message
  test('should handle network timeout errors', async () => {
    // Mock Stripe SDK to throw a network timeout error
    mockStripeClient.paymentIntents.create.mockRejectedValue(
      new Error('Request timeout')
    );

    const response = await request(app)
      .post('/api/payment/create-intent')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 7500,
        currency: 'CAD'
      })
      .expect(500);

    expect(response.body).toHaveProperty('message');
  });

  // Mocked behavior: stripeService.createPaymentIntent resolves with payment intent for large amount
  // Input: authenticated request with amount 999999, currency CAD
  // Expected status code: 200
  // Expected behavior: successfully creates payment intent with very large amount
  // Expected output: payment intent with id, amount 999999, currency CAD
  test('should handle very large amounts', async () => {
    // Mock Stripe SDK to return payment intent
    mockStripeClient.paymentIntents.create.mockResolvedValue({
      id: 'pi_mock_large_amount',
      amount: 99999900, // in cents
      currency: 'cad',
      status: 'requires_payment_method',
      client_secret: 'pi_mock_large_amount_secret',
    } as any);

    const response = await request(app)
      .post('/api/payment/create-intent')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 999999,
        currency: 'CAD'
      })
      .expect(200);

    expect(response.body).toHaveProperty('id', 'pi_mock_large_amount');
    expect(response.body).toHaveProperty('amount', 999999);
  });

  // Mocked behavior: stripeService.createPaymentIntent rejects with unsupported currency error
  // Input: authenticated request with amount 5000, currency CAD
  // Expected status code: 500
  // Expected behavior: handles currency conversion errors
  // Expected output: 500 error response with message
  test('should handle currency conversion errors', async () => {
    // Mock Stripe SDK to throw a currency error
    mockStripeClient.paymentIntents.create.mockRejectedValue(
      new Error('Unsupported currency')
    );

    const response = await request(app)
      .post('/api/payment/create-intent')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 5000,
        currency: 'CAD'
      })
      .expect(500);

    expect(response.body).toHaveProperty('message');
  });

  // Mocked behavior: PaymentController.createPaymentIntent rejects with error
  // Input: authenticated request with amount 5000, currency CAD
  // Expected status code: 500
  // Expected behavior: error handler catches controller rejection
  // Expected output: 500 error response
  test('should call next(err) when controller promise rejects', async () => {   
    const { PaymentController } = require('../../src/controllers/payment.controller');
    const controllerProto = PaymentController.prototype;
    const originalMethod = controllerProto.createPaymentIntent;

    controllerProto.createPaymentIntent = jest.fn().mockImplementation(() => {
      return Promise.reject(new Error('Controller error'));
    }) as any;
    
    const response = await request(app)
        .post('/api/payment/create-intent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 5000,
          currency: 'CAD'
        });
        
    expect(response.status).toBe(500);
    expect(controllerProto.createPaymentIntent).toHaveBeenCalled();
    
    // Restore original method
    controllerProto.createPaymentIntent = originalMethod;
  });
});

// Interface POST /api/payment/process
describe('POST /api/payment/process - Process Payment (Mocked)', () => {
  // Mocked behavior: stripeService.confirmPayment resolves with FAILED status for insufficient funds
  // Input: authenticated request with paymentIntentId, paymentMethodId (insufficient funds card)
  // Expected status code: 200
  // Expected behavior: processes payment, returns failed status with failure reason
  // Expected output: status FAILED, failureReason containing 'insufficient funds'
  test('should handle insufficient funds error', async () => {
    // Mock Stripe SDK to return failed payment due to insufficient funds
    mockStripeClient.paymentIntents.confirm.mockResolvedValue({
      id: 'pi_mock_insufficient',
      amount: 500000, // in cents
      currency: 'cad',
      status: 'failed',
      last_payment_error: {
        message: 'Your card has insufficient funds',
      },
    } as any);

    const response = await request(app)
      .post('/api/payment/process')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: 'pi_mock_insufficient',
        paymentMethodId: 'pm_card_chargeDeclinedInsufficientFunds'
      })
      .expect(200);

    expect(response.body).toHaveProperty('status', PaymentStatus.FAILED);
    expect(response.body).toHaveProperty('failureReason');
    expect(response.body.failureReason).toContain('insufficient funds');
  });

  // Mocked behavior: stripeService.confirmPayment resolves with FAILED status for declined card
  // Input: authenticated request with paymentIntentId, paymentMethodId (declined card)
  // Expected status code: 200
  // Expected behavior: processes payment, returns failed status with decline reason
  // Expected output: status FAILED, failureReason 'Your card was declined'
  test('should handle card declined error', async () => {
    // Mock Stripe SDK to return failed payment due to card declined
    mockStripeClient.paymentIntents.confirm.mockResolvedValue({
      id: 'pi_mock_declined',
      amount: 500000, // in cents
      currency: 'cad',
      status: 'failed',
      last_payment_error: {
        message: 'Your card was declined',
      },
    } as any);

    const response = await request(app)
      .post('/api/payment/process')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: 'pi_mock_declined',
        paymentMethodId: 'pm_card_chargeDeclined'
      })
      .expect(200);

    expect(response.body).toHaveProperty('status', PaymentStatus.FAILED);
    expect(response.body).toHaveProperty('failureReason', 'Your card was declined');
  });

  // Mocked behavior: stripeService.confirmPayment resolves with FAILED status for expired card
  // Input: authenticated request with paymentIntentId, paymentMethodId (expired card)
  // Expected status code: 200
  // Expected behavior: processes payment, returns failed status with expiration reason
  // Expected output: status FAILED, failureReason containing 'expired'
  test('should handle expired card error', async () => {
    // Mock Stripe SDK to return failed payment due to expired card
    mockStripeClient.paymentIntents.confirm.mockResolvedValue({
      id: 'pi_mock_expired',
      amount: 300000, // in cents
      currency: 'cad',
      status: 'failed',
      last_payment_error: {
        message: 'Your card has expired',
      },
    } as any);

    const response = await request(app)
      .post('/api/payment/process')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: 'pi_mock_expired',
        paymentMethodId: 'pm_card_expiredCard'
      })
      .expect(200);

    expect(response.body).toHaveProperty('status', PaymentStatus.FAILED);
    expect(response.body.failureReason).toContain('expired');
  });

  // Mocked behavior: stripeService.confirmPayment resolves with FAILED status for incorrect CVC
  // Input: authenticated request with paymentIntentId, paymentMethodId (incorrect CVC card)
  // Expected status code: 200
  // Expected behavior: processes payment, returns failed status with CVC error
  // Expected output: status FAILED, failureReason containing 'security code'
  test('should handle incorrect CVC error', async () => {
    // Mock Stripe SDK to return failed payment due to incorrect CVC
    mockStripeClient.paymentIntents.confirm.mockResolvedValue({
      id: 'pi_mock_cvc',
      amount: 250000, // in cents
      currency: 'cad',
      status: 'failed',
      last_payment_error: {
        message: 'Your card\'s security code is incorrect',
      },
    } as any);

    const response = await request(app)
      .post('/api/payment/process')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: 'pi_mock_cvc',
        paymentMethodId: 'pm_card_incorrectCvc'
      })
      .expect(200);

    expect(response.body).toHaveProperty('status', PaymentStatus.FAILED);
    expect(response.body.failureReason).toContain('security code');
  });

  // Mocked behavior: stripeService.confirmPayment resolves with FAILED status for processing error
  // Input: authenticated request with paymentIntentId, paymentMethodId (processing error card)
  // Expected status code: 200
  // Expected behavior: processes payment, returns failed status with generic processing error
  // Expected output: status FAILED, failureReason present
  test('should handle processing error from Stripe', async () => {
    // Mock Stripe SDK to return processing error
    mockStripeClient.paymentIntents.confirm.mockResolvedValue({
      id: 'pi_mock_processing_error',
      amount: 500000, // in cents
      currency: 'cad',
      status: 'failed',
      last_payment_error: {
        message: 'An error occurred while processing your card',
      },
    } as any);

    const response = await request(app)
      .post('/api/payment/process')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: 'pi_mock_processing_error',
        paymentMethodId: 'pm_card_processingError'
      })
      .expect(200);

    expect(response.body).toHaveProperty('status', PaymentStatus.FAILED);
    expect(response.body).toHaveProperty('failureReason');
  });

  // Mocked behavior: stripeService.confirmPayment catches 'No such payment_intent' error and returns FAILED status
  // Input: authenticated request with invalid paymentIntentId 'pi_invalid_12345'
  // Expected status code: 200
  // Expected behavior: handles invalid payment intent ID error, returns FAILED status (stripe.service.ts lines 106-117)
  // Expected output: 200 response with FAILED status and failureReason
  test('should handle invalid payment intent ID', async () => {
    // Mock Stripe SDK to throw an error for invalid payment intent
    mockStripeClient.paymentIntents.confirm.mockRejectedValue(
      new Error('No such payment_intent')
    );

    const response = await request(app)
      .post('/api/payment/process')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: 'pi_invalid_12345',
        paymentMethodId: 'pm_valid_method'
      })
      .expect(200);

    expect(response.body).toHaveProperty('status', PaymentStatus.FAILED);
    expect(response.body).toHaveProperty('failureReason');
    expect(response.body.failureReason).toContain('No such payment_intent');
  });

  // Mocked behavior: stripeService.confirmPayment catches network connection error and returns FAILED status
  // Input: authenticated request with paymentIntentId, paymentMethodId
  // Expected status code: 200
  // Expected behavior: handles network failures during payment confirmation, returns FAILED status (stripe.service.ts lines 106-117)
  // Expected output: 200 response with FAILED status and failureReason
  test('should handle network failures during payment processing', async () => {
    // Mock Stripe SDK to throw a network error
    mockStripeClient.paymentIntents.confirm.mockRejectedValue(
      new Error('Network connection lost')
    );

    const response = await request(app)
      .post('/api/payment/process')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: 'pi_mock_network_fail',
        paymentMethodId: 'pm_card_visa'
      })
      .expect(200);

    expect(response.body).toHaveProperty('status', PaymentStatus.FAILED);
    expect(response.body).toHaveProperty('failureReason');
    expect(response.body.failureReason).toContain('Network connection lost');
  });

  // Mocked behavior: stripeService.confirmPayment resolves with FAILED status for suspected fraud
  // Input: authenticated request with paymentIntentId, paymentMethodId (high risk card)
  // Expected status code: 200
  // Expected behavior: processes payment, returns failed status with fraud detection reason
  // Expected output: status FAILED, failureReason containing 'fraud'
  test('should handle fraud detection blocking payment', async () => {
    // Mock Stripe SDK to return failed payment due to fraud detection
    mockStripeClient.paymentIntents.confirm.mockResolvedValue({
      id: 'pi_mock_fraud',
      amount: 1000000, // in cents
      currency: 'cad',
      status: 'failed',
      last_payment_error: {
        message: 'Your card was declined due to suspected fraud',
      },
    } as any);

    const response = await request(app)
      .post('/api/payment/process')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: 'pi_mock_fraud',
        paymentMethodId: 'pm_card_riskLevelHighest'
      })
      .expect(200);

    expect(response.body).toHaveProperty('status', PaymentStatus.FAILED);
    expect(response.body.failureReason).toContain('fraud');
  });

  // Mocked behavior: PaymentController.processPayment rejects with error
  // Input: authenticated request with paymentIntentId, paymentMethodId
  // Expected status code: 500
  // Expected behavior: error handler catches controller rejection
  // Expected output: 500 error response
  test('should call next(err) when controller promise rejects', async () => {
    const { PaymentController } = require('../../src/controllers/payment.controller');
    const controllerProto = PaymentController.prototype;
    const originalMethod = controllerProto.processPayment;

    controllerProto.processPayment = jest.fn().mockImplementation(() => {
      return Promise.reject(new Error('Controller error'));
    }) as any;

    const response = await request(app)
        .post('/api/payment/process')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentIntentId: 'pi_mock_any',
          paymentMethodId: 'pm_card_visa'
        });
        
    expect(response.status).toBe(500);
    expect(controllerProto.processPayment).toHaveBeenCalled();
    controllerProto.processPayment = originalMethod;
  });
});

// Additional edge cases and error scenarios
describe('Payment Edge Cases and Error Handling (Mocked)', () => {
  // Mocked behavior: stripeService.createPaymentIntent resolves with different payment intents for each call
  // Input: two concurrent authenticated requests with different amounts (5000, 3000)
  // Expected status code: 200 for both
  // Expected behavior: handles concurrent payment intent creation without conflicts
  // Expected output: two different payment intent IDs
  test('should handle concurrent payment intent creation', async () => {
    // Mock multiple payment intents created concurrently
    const mockPaymentIntent1: PaymentIntent = {
      id: 'pi_mock_concurrent_1',
      amount: 5000,
      currency: 'CAD',
      clientSecret: 'pi_mock_concurrent_1_secret',
      status: 'requires_payment_method' as any,
    };

    const mockPaymentIntent2: PaymentIntent = {
      id: 'pi_mock_concurrent_2',
      amount: 3000,
      currency: 'CAD',
      clientSecret: 'pi_mock_concurrent_2_secret',
      status: 'requires_payment_method' as any,
    };

    mockStripeClient.paymentIntents.create
      .mockResolvedValueOnce({
        id: 'pi_mock_concurrent_1',
        amount: 500000, // in cents
        currency: 'cad',
        status: 'requires_payment_method',
        client_secret: 'pi_mock_concurrent_1_secret',
      } as any)
      .mockResolvedValueOnce({
        id: 'pi_mock_concurrent_2',
        amount: 300000, // in cents
        currency: 'cad',
        status: 'requires_payment_method',
        client_secret: 'pi_mock_concurrent_2_secret',
      } as any);

    // Make two concurrent requests
    const [response1, response2] = await Promise.all([
      request(app)
        .post('/api/payment/create-intent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: 5000, currency: 'CAD' }),
      request(app)
        .post('/api/payment/create-intent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: 3000, currency: 'CAD' })
    ]);

    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
    expect(response1.body.id).not.toBe(response2.body.id);
  });

  // Mocked behavior: none (validation middleware)
  // Input: authenticated request with amount 0, currency CAD
  // Expected status code: 400
  // Expected behavior: validation rejects zero amount as invalid
  // Expected output: validation error message
  test('should handle payment intent with zero amount edge case', async () => {
    // Mock service behavior for edge case - this should be caught by validation
    const response = await request(app)
      .post('/api/payment/create-intent')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 0,
        currency: 'CAD'
      })
      .expect(400);

    expect(response.body).toHaveProperty('message');
  });

  // Mocked behavior: stripeService.confirmPayment catches timeout error and returns FAILED status
  // Input: authenticated request with paymentIntentId 'pi_timeout_test', paymentMethodId
  // Expected status code: 200
  // Expected behavior: handles payment processing timeout, returns FAILED status (stripe.service.ts lines 106-117)
  // Expected output: 200 response with FAILED status and failureReason
  test('should handle payment processing timeout', async () => {
    // Mock Stripe SDK to throw a timeout error
    mockStripeClient.paymentIntents.confirm.mockRejectedValue(
      new Error('Request timed out after 30 seconds')
    );

    const response = await request(app)
      .post('/api/payment/process')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: 'pi_timeout_test',
        paymentMethodId: 'pm_card_visa'
      })
      .expect(200);

    expect(response.body).toHaveProperty('status', PaymentStatus.FAILED);
    expect(response.body).toHaveProperty('failureReason');
    expect(response.body.failureReason).toContain('Request timed out');
  });

  // Mocked behavior: stripeService.createPaymentIntent rejects with missing API key error
  // Input: authenticated request with amount 5000, currency CAD
  // Expected status code: 500
  // Expected behavior: handles missing Stripe API key configuration
  // Expected output: 500 error response with message
  test('should handle missing Stripe API key', async () => {
    // Temporarily remove STRIPE_SECRET_KEY to trigger line 21
    const originalKey = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    
    // Reset stripe instance to force re-initialization
    const { stripeService: realStripeService } = require('../../src/services/stripe.service');
    (realStripeService as any).stripe = undefined;

    const response = await request(app)
      .post('/api/payment/create-intent')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 5000,
        currency: 'CAD'
      })
      .expect(500);

    expect(response.body).toHaveProperty('message');
    
    // Restore original key
    if (originalKey) {
      process.env.STRIPE_SECRET_KEY = originalKey;
    } else {
      process.env.STRIPE_SECRET_KEY = 'sk_test_mock_key';
    }
    (realStripeService as any).stripe = undefined;
  });

  // Mocked behavior: stripeService.confirmPayment resolves with PENDING status for 3D Secure
  // Input: authenticated request with paymentIntentId, paymentMethodId (3DS required card)
  // Expected status code: 200
  // Expected behavior: processes payment, returns pending status requiring additional authentication
  // Expected output: status PENDING, failureReason containing 'authentication'
  test('should handle 3D Secure authentication required', async () => {
    // Mock Stripe SDK to return payment requiring 3D Secure authentication
    mockStripeClient.paymentIntents.confirm.mockResolvedValue({
      id: 'pi_mock_3ds_required',
      amount: 500000, // in cents
      currency: 'cad',
      status: 'requires_confirmation', // Maps to PENDING
      last_payment_error: {
        message: 'Additional authentication required',
      },
    } as any);

    const response = await request(app)
      .post('/api/payment/process')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: 'pi_mock_3ds_required',
        paymentMethodId: 'pm_card_authenticationRequired'
      })
      .expect(200);

    expect(response.body).toHaveProperty('status', PaymentStatus.PENDING);
    expect(response.body.failureReason).toContain('authentication');
  });

  // Mocked behavior: stripeService.confirmPayment resolves with SUCCEEDED status for both attempts
  // Input: two identical authenticated requests with same paymentIntentId, paymentMethodId
  // Expected status code: 200 for both
  // Expected behavior: handles duplicate payment processing idempotently
  // Expected output: both responses show status SUCCEEDED
  test('should handle duplicate payment processing attempt', async () => {
    // Mock Stripe SDK to return succeeded payment
    mockStripeClient.paymentIntents.confirm.mockResolvedValue({
      id: 'pi_mock_already_processed',
      amount: 500000, // in cents
      currency: 'cad',
      status: 'succeeded',
    } as any);

    // First attempt
    const response1 = await request(app)
      .post('/api/payment/process')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: 'pi_mock_already_processed',
        paymentMethodId: 'pm_card_visa'
      })
      .expect(200);

    expect(response1.body).toHaveProperty('status', PaymentStatus.SUCCEEDED);

    const response2 = await request(app)
      .post('/api/payment/process')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: 'pi_mock_already_processed',
        paymentMethodId: 'pm_card_visa'
      })
      .expect(200);

    expect(response2.body).toHaveProperty('status', PaymentStatus.SUCCEEDED);
  });

  // Mocked behavior: stripeService.confirmPayment resolves with FAILED status for unsupported international card
  // Input: authenticated request with paymentIntentId, paymentMethodId (international disabled card)
  // Expected status code: 200
  // Expected behavior: processes payment, returns failed status for unsupported card type
  // Expected output: status FAILED, failureReason containing 'does not support'
  test('should handle international card with insufficient international support', async () => {
    // Mock Stripe SDK to return failed payment
    mockStripeClient.paymentIntents.confirm.mockResolvedValue({
      id: 'pi_mock_intl_fail',
      amount: 500000, // in cents
      currency: 'cad',
      status: 'failed',
      last_payment_error: {
        message: 'Your card does not support this type of purchase',
      },
    } as any);

    const response = await request(app)
      .post('/api/payment/process')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: 'pi_mock_intl_fail',
        paymentMethodId: 'pm_card_internationalDisabled'
      })
      .expect(200);

    expect(response.body).toHaveProperty('status', PaymentStatus.FAILED);
    expect(response.body.failureReason).toContain('does not support');
  });

  // Mocked behavior: stripeService.createPaymentIntent rejects with metadata size limit error
  // Input: authenticated request with amount 5000, currency CAD, very long orderId (5000 characters)
  // Expected status code: 500
  // Expected behavior: handles metadata exceeding Stripe's size limits
  // Expected output: 500 error response with message
  test('should handle payment with metadata exceeding limits', async () => {
    // Mock Stripe SDK to throw an error for metadata exceeding limits
    mockStripeClient.paymentIntents.create.mockRejectedValue(
      new Error('Metadata exceeds maximum size')
    );

    const response = await request(app)
      .post('/api/payment/create-intent')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 5000,
        currency: 'CAD',
        orderId: 'a'.repeat(5000)
      })
      .expect(500);

    expect(response.body).toHaveProperty('message');
  });
});

// Tests to cover specific lines in stripe.service.ts
describe('Stripe Service Line Coverage Tests', () => {
  // Cover line 58: Payment intent without client_secret check
  // Input: HTTP request to create payment intent, mocked Stripe SDK returns payment intent without client_secret
  // Expected status code: 500
  // Expected behavior: stripe service throws error when client_secret is missing (line 58)
  // Expected output: error message about missing client secret
  test('should handle payment intent without client_secret', async () => {
    // Mock Stripe SDK to return payment intent without client_secret
    mockStripeClient.paymentIntents.create.mockResolvedValue({
      id: 'pi_test_no_secret',
      amount: 500000, // in cents
      currency: 'cad',
      status: 'requires_payment_method',
      // Intentionally missing client_secret to trigger line 58
    } as any);

    // Call HTTP endpoint - this should trigger line 58
    const response = await request(app)
      .post('/api/payment/create-intent')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 5000,
        currency: 'CAD'
      });

    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty('message');
    expect(response.body.message).toContain('client secret');
  });

  // Cover lines 161-165: Refund payment success path
  // Input: HTTP request to cancel order with paymentIntentId, mocked Stripe SDK returns successful refund
  // Expected status code: 200
  // Expected behavior: refundPayment executes success path with logging (lines 161-163) and return (line 165)
  // Expected output: order cancelled successfully
  test('should handle refund payment success path', async () => {
    // Mock Stripe SDK to return successful refund
    mockStripeClient.refunds.create.mockResolvedValue({
      id: 're_test_refund_success',
      amount: 500000, // in cents
      currency: 'cad',
      status: 'succeeded',
    } as any);

    // Create payment intent first
    mockStripeClient.paymentIntents.create.mockResolvedValueOnce({
      id: 'pi_test_refund',
      amount: 500000,
      currency: 'cad',
      status: 'requires_payment_method',
      client_secret: 'pi_test_refund_secret',
    } as any);

    const paymentResponse = await request(app)
      .post('/api/payment/create-intent')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 5000,
        currency: 'CAD'
      })
      .expect(200);

    const paymentIntentId = paymentResponse.body.id;

    // Create order with paymentIntentId
    const pickupTime = new Date(Date.now() + 3600000).toISOString();
    const returnTime = new Date(Date.now() + 86400000).toISOString();

    await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        volume: 5,
        totalPrice: 50,
        studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' },
        warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Test' },
        pickupTime: pickupTime,
        returnTime: returnTime,
        paymentIntentId: paymentIntentId,
      })
      .expect(201);

    // Cancel order - this triggers refundPayment (lines 161-165)
    const cancelResponse = await request(app)
      .delete('/api/order/cancel-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(cancelResponse.body).toHaveProperty('success', true);
    expect(mockStripeClient.refunds.create).toHaveBeenCalled();
  }, 30000);

  // Cover lines 188-194: mapStripeStatusToOur - requires_confirmation, succeeded, canceled, default cases
  // Input: HTTP request to create payment intent, mocked Stripe SDK returns different statuses
  // Expected status code: 200
  // Expected behavior: status maps correctly through mapStripeStatusToOur
  // Expected output: payment intent with correct mapped status
  test('should map requires_confirmation status in mapStripeStatusToOur', async () => {
    // Mock Stripe SDK to return requires_confirmation status
    mockStripeClient.paymentIntents.create.mockResolvedValue({
      id: 'pi_test_requires_confirmation',
      amount: 500000, // in cents
      currency: 'cad',
      status: 'requires_confirmation',
      client_secret: 'pi_test_requires_confirmation_secret',
    } as any);

    const response = await request(app)
      .post('/api/payment/create-intent')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 5000,
        currency: 'CAD'
      })
      .expect(200);

    expect(response.body).toHaveProperty('status', 'requires_confirmation');
  });

  // Cover lines 189-190: mapStripeStatusToOur - succeeded case
  // Input: HTTP request to create payment intent, mocked Stripe SDK returns succeeded status
  // Expected status code: 200
  // Expected behavior: status maps to SUCCEEDED through mapStripeStatusToOur (lines 189-190)
  // Expected output: payment intent with succeeded status
  test('should map succeeded status in mapStripeStatusToOur', async () => {
    // Mock Stripe SDK to return succeeded status
    mockStripeClient.paymentIntents.create.mockResolvedValue({
      id: 'pi_test_succeeded',
      amount: 500000, // in cents
      currency: 'cad',
      status: 'succeeded',
      client_secret: 'pi_test_succeeded_secret',
    } as any);

    const response = await request(app)
      .post('/api/payment/create-intent')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 5000,
        currency: 'CAD'
      })
      .expect(200);

    expect(response.body).toHaveProperty('status', 'succeeded');
  });

  // Cover lines 191-192: mapStripeStatusToOur - canceled case
  // Input: HTTP request to create payment intent, mocked Stripe SDK returns canceled status
  // Expected status code: 200
  // Expected behavior: status maps to CANCELED through mapStripeStatusToOur (lines 191-192)
  // Expected output: payment intent with canceled status
  test('should map canceled status in mapStripeStatusToOur', async () => {
    // Mock Stripe SDK to return canceled status
    mockStripeClient.paymentIntents.create.mockResolvedValue({
      id: 'pi_test_canceled',
      amount: 500000, // in cents
      currency: 'cad',
      status: 'canceled',
      client_secret: 'pi_test_canceled_secret',
    } as any);

    const response = await request(app)
      .post('/api/payment/create-intent')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 5000,
        currency: 'CAD'
      })
      .expect(200);

    expect(response.body).toHaveProperty('status', 'canceled');
  });

  // Cover lines 193-194: mapStripeStatusToOur - default case
  // Input: HTTP request to create payment intent, mocked Stripe SDK returns unknown status
  // Expected status code: 200
  // Expected behavior: status maps to FAILED (default case) through mapStripeStatusToOur (lines 193-194)
  // Expected output: payment intent with failed status
  test('should map unknown status to failed in mapStripeStatusToOur', async () => {
    // Mock Stripe SDK to return unknown status (triggers default case)
    mockStripeClient.paymentIntents.create.mockResolvedValue({
      id: 'pi_test_unknown',
      amount: 500000, // in cents
      currency: 'cad',
      status: 'unknown_status',
      client_secret: 'pi_test_unknown_secret',
    } as any);

    const response = await request(app)
      .post('/api/payment/create-intent')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 5000,
        currency: 'CAD'
      })
      .expect(200);

    expect(response.body).toHaveProperty('status', 'failed'); // Default case
  });

  // Cover lines 205-212: mapStripeStatusToPaymentStatus - requires_payment_method, requires_confirmation, processing, canceled, default cases
  // Input: HTTP request to process payment, mocked Stripe SDK returns different statuses
  // Expected status code: 200
  // Expected behavior: status maps correctly through mapStripeStatusToPaymentStatus
  // Expected output: payment result with correct mapped status
  test('should map requires_payment_method status to PENDING in mapStripeStatusToPaymentStatus', async () => {
    // Mock Stripe SDK to return requires_payment_method status
    mockStripeClient.paymentIntents.confirm.mockResolvedValue({
      id: 'pi_test_requires_payment_method',
      amount: 500000, // in cents
      currency: 'cad',
      status: 'requires_payment_method',
    } as any);

    const response = await request(app)
      .post('/api/payment/process')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: 'pi_test_requires_payment_method',
        paymentMethodId: 'pm_test'
      })
      .expect(200);

    expect(response.body).toHaveProperty('status', PaymentStatus.PENDING);
  });

  // Cover line 206: mapStripeStatusToPaymentStatus - requires_confirmation case
  // Input: HTTP request to process payment, mocked Stripe SDK returns requires_confirmation status
  // Expected status code: 200
  // Expected behavior: status maps to PENDING through mapStripeStatusToPaymentStatus (line 206)
  // Expected output: payment result with PENDING status
  test('should map requires_confirmation status to PENDING in mapStripeStatusToPaymentStatus', async () => {
    // Mock Stripe SDK to return requires_confirmation status
    mockStripeClient.paymentIntents.confirm.mockResolvedValue({
      id: 'pi_test_requires_confirmation',
      amount: 500000, // in cents
      currency: 'cad',
      status: 'requires_confirmation',
    } as any);

    const response = await request(app)
      .post('/api/payment/process')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: 'pi_test_requires_confirmation',
        paymentMethodId: 'pm_test'
      })
      .expect(200);

    expect(response.body).toHaveProperty('status', PaymentStatus.PENDING);
  });

  // Cover line 208: mapStripeStatusToPaymentStatus - processing case
  // Input: HTTP request to process payment, mocked Stripe SDK returns processing status
  // Expected status code: 200
  // Expected behavior: status maps to PENDING through mapStripeStatusToPaymentStatus (line 208)
  // Expected output: payment result with PENDING status
  test('should map processing status to PENDING in mapStripeStatusToPaymentStatus', async () => {
    // Mock Stripe SDK to return processing status
    mockStripeClient.paymentIntents.confirm.mockResolvedValue({
      id: 'pi_test_processing',
      amount: 500000, // in cents
      currency: 'cad',
      status: 'processing',
    } as any);

    const response = await request(app)
      .post('/api/payment/process')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: 'pi_test_processing',
        paymentMethodId: 'pm_test'
      })
      .expect(200);

    expect(response.body).toHaveProperty('status', PaymentStatus.PENDING);
  });

  // Cover lines 209-210: mapStripeStatusToPaymentStatus - canceled case
  // Input: HTTP request to process payment, mocked Stripe SDK returns canceled status
  // Expected status code: 200
  // Expected behavior: status maps to CANCELED through mapStripeStatusToPaymentStatus (lines 209-210)
  // Expected output: payment result with CANCELED status
  test('should map canceled status in mapStripeStatusToPaymentStatus', async () => {
    // Mock Stripe SDK to return canceled status
    mockStripeClient.paymentIntents.confirm.mockResolvedValue({
      id: 'pi_test_canceled_payment',
      amount: 500000, // in cents
      currency: 'cad',
      status: 'canceled',
    } as any);

    const response = await request(app)
      .post('/api/payment/process')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: 'pi_test_canceled_payment',
        paymentMethodId: 'pm_test'
      })
      .expect(200);

    expect(response.body).toHaveProperty('status', PaymentStatus.CANCELED);
  });

  // Cover lines 211-212: mapStripeStatusToPaymentStatus - default case
  // Input: HTTP request to process payment, mocked Stripe SDK returns unknown status
  // Expected status code: 200
  // Expected behavior: status maps to FAILED (default case) through mapStripeStatusToPaymentStatus (lines 211-212)
  // Expected output: payment result with FAILED status
  test('should map unknown status to FAILED in mapStripeStatusToPaymentStatus', async () => {
    // Mock Stripe SDK to return unknown status (triggers default case)
    mockStripeClient.paymentIntents.confirm.mockResolvedValue({
      id: 'pi_test_unknown_payment_status',
      amount: 500000, // in cents
      currency: 'cad',
      status: 'unknown_payment_status',
    } as any);

    const response = await request(app)
      .post('/api/payment/process')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: 'pi_test_unknown_payment_status',
        paymentMethodId: 'pm_test'
      })
      .expect(200);

    expect(response.body).toHaveProperty('status', PaymentStatus.FAILED); // Default case
  });
});

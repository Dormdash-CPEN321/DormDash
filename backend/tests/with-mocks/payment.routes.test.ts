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

// Mock the Stripe service which is called by payment service
jest.mock('../../src/services/stripe.service', () => ({
  stripeService: {
    createPaymentIntent: jest.fn(),
    confirmPayment: jest.fn(),
    getPaymentIntent: jest.fn(),
    refundPayment: jest.fn(),
  }
}));

// Import app after mocks are set up
import app from '../../src/app';
import { stripeService } from '../../src/services/stripe.service';

// Suppress console logs during tests
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info,
};

let authToken: string;
const testUserId = new mongoose.Types.ObjectId(); // Generate unique ID

// Get reference to the mocked Stripe service
const mockStripeService = stripeService as jest.Mocked<typeof stripeService>;

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

describe('POST /api/payment/create-intent - Create Payment Intent (Mocked)', () => {
  test('should handle Stripe API errors', async () => {
    // Mock service to throw a Stripe-specific error
    mockStripeService.createPaymentIntent.mockRejectedValue(
      new Error('Failed to create payment intent: Invalid API key')
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

  test('should handle Stripe rate limiting errors', async () => {
    // Mock service to throw a rate limit error
    mockStripeService.createPaymentIntent.mockRejectedValue(
      new Error('Failed to create payment intent: Rate limit exceeded')
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

  test('should handle network timeout errors', async () => {
    // Mock service to throw a network timeout error
    mockStripeService.createPaymentIntent.mockRejectedValue(
      new Error('Failed to create payment intent: Request timeout')
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

  test('should handle very large amounts', async () => {
    const mockPaymentIntent: PaymentIntent = {
      id: 'pi_mock_large_amount',
      amount: 999999,
      currency: 'CAD',
      clientSecret: 'pi_mock_large_amount_secret',
      status: 'requires_payment_method' as any,
    };

    mockStripeService.createPaymentIntent.mockResolvedValue(mockPaymentIntent);

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

  test('should handle currency conversion errors', async () => {
    // Mock service to throw a currency error
    mockStripeService.createPaymentIntent.mockRejectedValue(
      new Error('Failed to create payment intent: Unsupported currency')
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
});

describe('POST /api/payment/process - Process Payment (Mocked)', () => {
  test('should handle insufficient funds error', async () => {
    // Mock a failed payment due to insufficient funds
    const mockFailedResult: PaymentResult = {
      paymentId: 'pi_mock_insufficient',
      status: PaymentStatus.FAILED,
      amount: 5000,
      currency: 'CAD',
      failureReason: 'Your card has insufficient funds',
    };

    mockStripeService.confirmPayment.mockResolvedValue(mockFailedResult);

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

  test('should handle card declined error', async () => {
    // Mock a failed payment due to card declined
    const mockFailedResult: PaymentResult = {
      paymentId: 'pi_mock_declined',
      status: PaymentStatus.FAILED,
      amount: 5000,
      currency: 'CAD',
      failureReason: 'Your card was declined',
    };

    mockStripeService.confirmPayment.mockResolvedValue(mockFailedResult);

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

  test('should handle expired card error', async () => {
    // Mock a failed payment due to expired card
    const mockFailedResult: PaymentResult = {
      paymentId: 'pi_mock_expired',
      status: PaymentStatus.FAILED,
      amount: 3000,
      currency: 'CAD',
      failureReason: 'Your card has expired',
    };

    mockStripeService.confirmPayment.mockResolvedValue(mockFailedResult);

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

  test('should handle incorrect CVC error', async () => {
    // Mock a failed payment due to incorrect CVC
    const mockFailedResult: PaymentResult = {
      paymentId: 'pi_mock_cvc',
      status: PaymentStatus.FAILED,
      amount: 2500,
      currency: 'CAD',
      failureReason: 'Your card\'s security code is incorrect',
    };

    mockStripeService.confirmPayment.mockResolvedValue(mockFailedResult);

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

  test('should handle processing error from Stripe', async () => {
    // Mock a processing error
    const mockFailedResult: PaymentResult = {
      paymentId: 'pi_mock_processing_error',
      status: PaymentStatus.FAILED,
      amount: 5000,
      currency: 'CAD',
      failureReason: 'An error occurred while processing your card',
    };

    mockStripeService.confirmPayment.mockResolvedValue(mockFailedResult);

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

  test('should handle invalid payment intent ID', async () => {
    // Mock service to throw an error for invalid payment intent
    mockStripeService.confirmPayment.mockRejectedValue(
      new Error('Payment confirmation failed: No such payment_intent')
    );

    const response = await request(app)
      .post('/api/payment/process')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: 'pi_invalid_12345',
        paymentMethodId: 'pm_valid_method'
      })
      .expect(500);

    expect(response.body).toHaveProperty('message');
  });

  test('should handle network failures during payment processing', async () => {
    // Mock service to throw a network error
    mockStripeService.confirmPayment.mockRejectedValue(
      new Error('Payment confirmation failed: Network connection lost')
    );

    const response = await request(app)
      .post('/api/payment/process')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: 'pi_mock_network_fail',
        paymentMethodId: 'pm_card_visa'
      })
      .expect(500);

    expect(response.body).toHaveProperty('message');
  });

  test('should handle fraud detection blocking payment', async () => {
    // Mock a failed payment due to fraud detection
    const mockFailedResult: PaymentResult = {
      paymentId: 'pi_mock_fraud',
      status: PaymentStatus.FAILED,
      amount: 10000,
      currency: 'CAD',
      failureReason: 'Your card was declined due to suspected fraud',
    };

    mockStripeService.confirmPayment.mockResolvedValue(mockFailedResult);

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
});

// Additional test suites for edge cases and error scenarios
describe('Payment Edge Cases and Error Handling (Mocked)', () => {
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

    mockStripeService.createPaymentIntent
      .mockResolvedValueOnce(mockPaymentIntent1)
      .mockResolvedValueOnce(mockPaymentIntent2);

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

  test('should handle payment processing timeout', async () => {
    // Mock service to throw a timeout error
    mockStripeService.confirmPayment.mockRejectedValue(
      new Error('Payment confirmation failed: Request timed out after 30 seconds')
    );

    const response = await request(app)
      .post('/api/payment/process')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentIntentId: 'pi_timeout_test',
        paymentMethodId: 'pm_card_visa'
      })
      .expect(500);

    expect(response.body).toHaveProperty('message');
  });

  test('should handle missing Stripe API key', async () => {
    // Mock service to throw an API key error
    mockStripeService.createPaymentIntent.mockRejectedValue(
      new Error('Failed to create payment intent: STRIPE_SECRET_KEY environment variable is required')
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

  test('should handle 3D Secure authentication required', async () => {
    // Mock a payment that requires 3D Secure authentication
    const mockPendingResult: PaymentResult = {
      paymentId: 'pi_mock_3ds_required',
      status: PaymentStatus.PENDING,
      amount: 5000,
      currency: 'CAD',
      failureReason: 'Additional authentication required',
    };

    mockStripeService.confirmPayment.mockResolvedValue(mockPendingResult);

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

  test('should handle duplicate payment processing attempt', async () => {
    // Mock a payment that's already been processed
    const mockSucceededResult: PaymentResult = {
      paymentId: 'pi_mock_already_processed',
      status: PaymentStatus.SUCCEEDED,
      amount: 5000,
      currency: 'CAD',
    };

    mockStripeService.confirmPayment.mockResolvedValue(mockSucceededResult);

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

    // Second attempt should return same result (idempotent)
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

  test('should handle international card with insufficient international support', async () => {
    // Mock a failed payment due to card not supporting international transactions
    const mockFailedResult: PaymentResult = {
      paymentId: 'pi_mock_intl_fail',
      status: PaymentStatus.FAILED,
      amount: 5000,
      currency: 'CAD',
      failureReason: 'Your card does not support this type of purchase',
    };

    mockStripeService.confirmPayment.mockResolvedValue(mockFailedResult);

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

  test('should handle payment with metadata exceeding limits', async () => {
    // Mock service to throw an error for metadata exceeding limits
    mockStripeService.createPaymentIntent.mockRejectedValue(
      new Error('Failed to create payment intent: Metadata exceeds maximum size')
    );

    const response = await request(app)
      .post('/api/payment/create-intent')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        amount: 5000,
        currency: 'CAD',
        orderId: 'a'.repeat(5000) // Very long orderId
      })
      .expect(500);

    expect(response.body).toHaveProperty('message');
  });
});

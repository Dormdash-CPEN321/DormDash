import { describe, expect, test, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../../src/config/database';
import { userModel } from '../../src/models/user.model';
import { CreateOrderResponse, GetQuoteResponse, CreateReturnJobResponse, GetAllOrdersResponse, CancelOrderResponse, OrderStatus, Order } from '../../src/types/order.types';

// Mock socket to prevent warnings during tests
jest.mock('../../src/socket', () => ({
  emitToRooms: jest.fn(),
  getIo: jest.fn(),
  initSocket: jest.fn(),
}));

// Mock the job service used by order service
jest.mock('../../src/services/job.service', () => ({
  jobService: {
    createJob: jest.fn(),
    cancelJobsForOrder: jest.fn(),
  }
}));

// Mock the payment service used by order service
jest.mock('../../src/services/payment.service', () => ({
  paymentService: {
    refundPayment: jest.fn(),
  }
}));

// Mock the stripe service (underlying service used by payment service)
jest.mock('../../src/services/stripe.service', () => ({
  stripeService: {
    refundPayment: jest.fn(),
  }
}));

// Mock the order model
jest.mock('../../src/models/order.model', () => ({
  orderModel: {
    create: jest.fn(),
    findByIdempotencyKey: jest.fn(),
    findActiveOrder: jest.fn(),
    update: jest.fn(),
    getAllOrders: jest.fn(),
  }
}));

// Mock the job model
jest.mock('../../src/models/job.model', () => ({
  jobModel: {
    findByOrderId: jest.fn(),
  }
}));

// Mock the event emitter
jest.mock('../../src/utils/eventEmitter.util', () => {
  const actual = jest.requireActual<typeof import('../../src/utils/eventEmitter.util')>(
    '../../src/utils/eventEmitter.util'
  );
  return {
    ...actual,
    emitOrderCreated: jest.fn(),
    emitOrderUpdated: jest.fn(),
  };
});

// Import app after mocks are set up
import app from '../../src/app';
import { jobService } from '../../src/services/job.service';
import { paymentService } from '../../src/services/payment.service';
import { stripeService } from '../../src/services/stripe.service';
import { orderModel } from '../../src/models/order.model';
import { jobModel } from '../../src/models/job.model';
import * as eventEmitterUtil from '../../src/utils/eventEmitter.util';

// Suppress console logs during tests
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info,
};

let authToken: string;
const testUserId = new mongoose.Types.ObjectId(); // Generate unique ID
const testUserIdString = testUserId.toString();

// Get references to mocked services
const mockJobService = jobService as jest.Mocked<typeof jobService>;
const mockPaymentService = paymentService as jest.Mocked<typeof paymentService>;
const mockStripeService = stripeService as jest.Mocked<typeof stripeService>;
const mockOrderModel = orderModel as jest.Mocked<typeof orderModel>;
const mockJobModel = jobModel as jest.Mocked<typeof jobModel>;
const mockEventEmitter = eventEmitterUtil as jest.Mocked<typeof eventEmitterUtil>;

beforeAll(async () => {
  // Suppress all console output during tests for clean test output
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
  console.info = jest.fn();

  // Connect to test database
  await connectDB();

  // Clean up any existing test user by googleId
  const db = mongoose.connection.db;
  if (db) {
    await db.collection('users').deleteMany({ googleId: `test-google-id-order-mock-${testUserId.toString()}` });
  }

  // Create a test user in DB with specific _id
  await (userModel as any).user.create({
    _id: testUserId,
    googleId: `test-google-id-order-mock-${testUserId.toString()}`,
    email: `ordermock${testUserId.toString()}@example.com`,
    name: 'Order Mock Test User',
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
    await db.collection('users').deleteMany({ googleId: `test-google-id-order-mock-${testUserId.toString()}` });
  }

  // Disconnect from test database
  await disconnectDB();

  // Restore console functions
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.info = originalConsole.info;
});

// Interface POST /api/order/quote
describe('POST /api/order/quote - Get Quote (Mocked)', () => {
  // Mocked behavior: none (uses real quote calculation service)
  // Input: request with volume 2.5, studentAddress, warehouseAddress, pickupTime, returnTime
  // Expected status code: 200
  // Expected behavior: calculates quote based on volume and addresses
  // Expected output: success message with totalPrice
  test('should successfully get a quote', async () => {
    // Mock successful quote response
    const mockQuote: GetQuoteResponse = {
      distancePrice: 25.0,
      warehouseAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Warehouse St, Vancouver, BC'
      },
      dailyStorageRate: 5.99
    };

    // The quote endpoint doesn't use any mocked services - it's pure calculation
    // So we don't need to mock anything for this test

    const response = await request(app)
      .post('/api/order/quote')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        studentAddress: {
          lat: 49.2606,
          lon: -123.1133,
          formattedAddress: '123 Student Ave, Vancouver, BC'
        }
      })
      .expect(200);

    expect(response.body).toHaveProperty('distancePrice');
    expect(response.body).toHaveProperty('warehouseAddress');
    expect(response.body).toHaveProperty('dailyStorageRate');
    expect(typeof response.body.distancePrice).toBe('number');
    expect(typeof response.body.dailyStorageRate).toBe('number');
  });

  test('should handle quote calculation errors', async () => {
    // The quote endpoint doesn't have external dependencies that can fail
    // in the current implementation, so this test would be for validation errors
    const response = await request(app)
      .post('/api/order/quote')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: 'invalid-id',
        studentAddress: {
          lat: 'not-a-number', // Invalid lat
          lon: -123.1133,
          formattedAddress: '123 Student Ave, Vancouver, BC'
        }
      })
      .expect(400);

    expect(response.body).toHaveProperty('message');
  });

  test('should call next(err) when controller promise rejects', async () => {
    const { OrderController } = require('../../src/controllers/order.controller');
    const controllerProto = OrderController.prototype;
    const originalMethod = controllerProto.getQuote;

    controllerProto.getQuote = jest
      .fn()
      .mockImplementation(() => Promise.reject(new Error('Controller error')));

    const response = await request(app)
      .post('/api/order/quote')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        studentAddress: {
          lat: 49.2606,
          lon: -123.1133,
          formattedAddress: '123 Student Ave, Vancouver, BC'
        }
      });

    expect(response.status).toBe(500);
    expect(controllerProto.getQuote).toHaveBeenCalled();

    // Restore original method
    controllerProto.getQuote = originalMethod;
  });

  // Mocked behavior: orderService.getQuote throws error
  // Input: request with valid quote data
  // Expected status code: 500
  // Expected behavior: service error is forwarded to error handler
  // Expected output: 500 error response
  test('should trigger next(err) when orderService.getQuote throws error', async () => {
    // Mock the warehouse config to throw an error during getQuote
    const warehouseModule = require('../../src/constants/warehouses');
    const originalWarehouses = warehouseModule.WAREHOUSES;
    
    // Set warehouses to undefined to cause an error in getQuote
    (warehouseModule as any).WAREHOUSES = undefined;

    const response = await request(app)
      .post('/api/order/quote')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        studentAddress: {
          lat: 49.2606,
          lon: -123.1133,
          formattedAddress: '123 Student Ave, Vancouver, BC'
        }
      });

    expect(response.status).toBe(500);

    // Restore original warehouses
    (warehouseModule as any).WAREHOUSES = originalWarehouses;
  });
});

describe('POST /api/order - Create Order (Mocked)', () => {
  // Mocked behavior: none (uses real order creation logic with mocked models/services)
  // Input: request with valid order data
  // Expected status code: 201
  // Expected behavior: creates order, job, emits event
  // Expected output: created order object with id, status, volume, price
  test('should successfully create an order', async () => {
    // Mock successful order creation
    const mockOrderId = new mongoose.Types.ObjectId();
    const mockCreatedOrder: Order = {
      _id: mockOrderId,
      studentId: testUserIdString,
      status: OrderStatus.PENDING,
      volume: 2.5,
      price: 150.0,
      studentAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 Student Ave, Vancouver, BC'
      },
      warehouseAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Warehouse St, Vancouver, BC'
      },
      returnAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 Student Ave, Vancouver, BC'
      },
      pickupTime: '2025-11-10T10:00:00.000Z',
      returnTime: '2025-11-15T10:00:00.000Z',
      paymentIntentId: 'pi_mock_123'
    };

    const mockOrderResponse: CreateOrderResponse = {
      ...mockCreatedOrder,
      id: mockOrderId.toString()
    };

    // Mock order model methods
    mockOrderModel.findByIdempotencyKey.mockResolvedValue(null); // No existing order
    mockOrderModel.create.mockResolvedValue(mockCreatedOrder);

    // Mock job service
    mockJobService.createJob.mockResolvedValue({
      success: true,
      id: 'job_mock_storage',
      message: 'STORAGE job created successfully'
    });

    // Mock event emitter
    mockEventEmitter.emitOrderCreated.mockImplementation(() => {});

    const response = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        volume: 2.5,
        totalPrice: 150.0,
        studentAddress: {
          lat: 49.2606,
          lon: -123.1133,
          formattedAddress: '123 Student Ave, Vancouver, BC'
        },
        warehouseAddress: {
          lat: 49.2827,
          lon: -123.1207,
          formattedAddress: '123 Warehouse St, Vancouver, BC'
        },
        pickupTime: '2025-11-10T10:00:00.000Z',
        returnTime: '2025-11-15T10:00:00.000Z',
        paymentIntentId: 'pi_mock_123'
      })
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('status', OrderStatus.PENDING);
    expect(response.body).toHaveProperty('volume', 2.5);
    expect(response.body).toHaveProperty('price', 150.0);
  });

  // Mocked behavior: orderModel.findByIdempotencyKey returns existing order
  // Input: request with Idempotency-Key header 'test-key-123', order data
  // Expected status code: 201
  // Expected behavior: returns existing order without creating duplicate
  // Expected output: existing order object with matching id
  test('should handle idempotent order creation', async () => {
    // Mock existing order found by idempotency key
    const mockExistingOrderId = new mongoose.Types.ObjectId();
    const mockExistingOrder: Order = {
      _id: mockExistingOrderId,
      studentId: testUserIdString,
      status: OrderStatus.PENDING,
      volume: 2.5,
      price: 150.0,
      studentAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 Student Ave, Vancouver, BC'
      },
      warehouseAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Warehouse St, Vancouver, BC'
      },
      returnAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 Student Ave, Vancouver, BC'
      },
      pickupTime: '2025-11-10T10:00:00.000Z',
      returnTime: '2025-11-15T10:00:00.000Z',
      paymentIntentId: 'pi_mock_123',
      idempotencyKey: 'test-key-123'
    };

    mockOrderModel.findByIdempotencyKey.mockResolvedValue(mockExistingOrder);

    const response = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', 'test-key-123')
      .send({
        studentId: testUserId.toString(),
        volume: 2.5,
        totalPrice: 150.0,
        studentAddress: {
          lat: 49.2606,
          lon: -123.1133,
          formattedAddress: '123 Student Ave, Vancouver, BC'
        },
        warehouseAddress: {
          lat: 49.2827,
          lon: -123.1207,
          formattedAddress: '123 Warehouse St, Vancouver, BC'
        },
        pickupTime: '2025-11-10T10:00:00.000Z',
        returnTime: '2025-11-15T10:00:00.000Z',
        paymentIntentId: 'pi_mock_123'
      })
      .expect(201);

    expect(response.body).toHaveProperty('id', mockExistingOrderId.toString());
    expect(mockOrderModel.findByIdempotencyKey).toHaveBeenCalledWith('test-key-123');
  });

  // Mocked behavior: none (validation middleware)
  // Input: request with invalid studentId 'not-a-valid-mongodb-objectid'
  // Expected status code: 400
  // Expected behavior: validation rejects invalid MongoDB ObjectId format
  // Expected output: validation error with field 'studentId', message 'Invalid student ID'
  test('should handle order creation validation errors with invalid studentId', async () => {
    // Test the Zod validation for invalid student ID
    // The createOrderSchema uses mongoose.isValidObjectId(val) which should fail for 'invalid-id'
    const response = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: 'not-a-valid-mongodb-objectid', // Invalid ObjectId - triggers Zod refine validation
        volume: 2.5,
        totalPrice: 150.0,
        studentAddress: {
          lat: 49.2606,
          lon: -123.1133,
          formattedAddress: '123 Student Ave, Vancouver, BC'
        },
        warehouseAddress: {
          lat: 49.2827,
          lon: -123.1207,
          formattedAddress: '123 Warehouse St, Vancouver, BC'
        },
        pickupTime: '2025-11-10T10:00:00.000Z',
        returnTime: '2025-11-15T10:00:00.000Z'
      })
      .expect(400);

    // Verify the error response contains validation details
    expect(response.body).toHaveProperty('error', 'Validation error');
    expect(response.body).toHaveProperty('details');
    expect(response.body.details[0]).toHaveProperty('field', 'studentId');
    expect(response.body.details[0]).toHaveProperty('message', 'Invalid student ID');
    expect(mockOrderModel.create).not.toHaveBeenCalled();
  });

  // Mocked behavior: none (validation middleware)
  // Input: request with negative volume -1
  // Expected status code: 400
  // Expected behavior: validation rejects negative volume value
  // Expected output: validation error
  test('should handle order creation validation errors with negative volume', async () => {
    const response = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        volume: -1, // Invalid negative volume
        totalPrice: 150.0,
        studentAddress: {
          lat: 49.2606,
          lon: -123.1133,
          formattedAddress: '123 Student Ave, Vancouver, BC'
        },
        warehouseAddress: {
          lat: 49.2827,
          lon: -123.1207,
          formattedAddress: '123 Warehouse St, Vancouver, BC'
        },
        pickupTime: '2025-11-10T10:00:00.000Z',
        returnTime: '2025-11-15T10:00:00.000Z'
      })
      .expect(400);

    expect(response.body).toHaveProperty('error', 'Validation error');
    expect(mockOrderModel.create).not.toHaveBeenCalled();
  });

  // Mocked behavior: orderModel.create rejects with database error
  // Input: request with valid order data
  // Expected status code: 500
  // Expected behavior: database failure is caught and returned
  // Expected output: 500 error response
  test('should handle database errors during order creation', async () => {
    // Mock database error
    mockOrderModel.findByIdempotencyKey.mockResolvedValue(null);
    mockOrderModel.create.mockRejectedValue(new Error('Database connection failed'));

    const response = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        volume: 2.5,
        totalPrice: 150.0,
        studentAddress: {
          lat: 49.2606,
          lon: -123.1133,
          formattedAddress: '123 Student Ave, Vancouver, BC'
        },
        warehouseAddress: {
          lat: 49.2827,
          lon: -123.1207,
          formattedAddress: '123 Warehouse St, Vancouver, BC'
        },
        pickupTime: '2025-11-10T10:00:00.000Z',
        returnTime: '2025-11-15T10:00:00.000Z'
      })
      .expect(500);

    expect(mockOrderModel.create).toHaveBeenCalled();
  });

  // Mocked behavior: real mongoose model.create throws error via spy
  // Input: request with valid order data
  // Expected status code: 500
  // Expected behavior: surfaces underlying mongoose create failure
  // Expected output: 500 error response
  test('should surface model create failures with error handling', async () => {
    const actualOrderModule = jest.requireActual('../../src/models/order.model') as typeof import('../../src/models/order.model');
    const actualOrderInstance = actualOrderModule.orderModel as any;
    const realMongooseModel = (actualOrderInstance as any).order as mongoose.Model<Order>;

    mockOrderModel.findByIdempotencyKey.mockResolvedValue(null);

    const createSpy = jest
      .spyOn(realMongooseModel, 'create')
      .mockImplementation(() => {
        throw new Error('Database create failed');
      });

    mockOrderModel.create.mockImplementationOnce((newOrder: Order) => {
      return actualOrderInstance.create(newOrder);
    });

    try {
      await request(app)
        .post('/api/order')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studentId: testUserId.toString(),
          volume: 2.5,
          totalPrice: 150.0,
          studentAddress: {
            lat: 49.2606,
            lon: -123.1133,
            formattedAddress: '123 Student Ave, Vancouver, BC'
          },
          warehouseAddress: {
            lat: 49.2827,
            lon: -123.1207,
            formattedAddress: '123 Warehouse St, Vancouver, BC'
          },
          pickupTime: '2025-11-10T10:00:00.000Z',
          returnTime: '2025-11-15T10:00:00.000Z'
        })
        .expect(500);

      expect(createSpy).toHaveBeenCalledTimes(1);
    } finally {
      createSpy.mockRestore();
      mockOrderModel.create.mockReset();
    }
  });

  // Mocked behavior: real mongoose model.findOne throws error via spy
  // Input: request with Idempotency-Key header, valid order data
  // Expected status code: 500
  // Expected behavior: surfaces underlying mongoose findOne failure during idempotency check
  // Expected output: 500 error response
  test('should surface database errors when checking idempotency key', async () => {
    const actualOrderModule = jest.requireActual('../../src/models/order.model') as typeof import('../../src/models/order.model');
    const actualOrderInstance = actualOrderModule.orderModel as any;
    const realMongooseModel = (actualOrderInstance as any).order as mongoose.Model<Order>;

    const findOneSpy = jest
      .spyOn(realMongooseModel, 'findOne')
      .mockImplementation(() => {
        throw new Error('Database findOne failed');
      });

    mockOrderModel.findByIdempotencyKey.mockImplementationOnce((key: string) => {
      return actualOrderInstance.findByIdempotencyKey(key);
    });

    try {
      await request(app)
        .post('/api/order')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', 'test-key-fail-123')
        .send({
          studentId: testUserId.toString(),
          volume: 2.5,
          totalPrice: 150.0,
          studentAddress: {
            lat: 49.2606,
            lon: -123.1133,
            formattedAddress: '123 Student Ave, Vancouver, BC'
          },
          warehouseAddress: {
            lat: 49.2827,
            lon: -123.1207,
            formattedAddress: '123 Warehouse St, Vancouver, BC'
          },
          pickupTime: '2025-11-10T10:00:00.000Z',
          returnTime: '2025-11-15T10:00:00.000Z',
          paymentIntentId: 'pi_mock_123'
        })
        .expect(500);

      expect(findOneSpy).toHaveBeenCalledTimes(1);
      expect(mockOrderModel.findByIdempotencyKey).toHaveBeenCalledWith('test-key-fail-123');
    } finally {
      findOneSpy.mockRestore();
      mockOrderModel.findByIdempotencyKey.mockReset();
    }
  });

  // Mocked behavior: OrderController.createOrder rejects with error
  // Input: request with valid order data
  // Expected status code: 500
  // Expected behavior: error handler catches controller rejection
  // Expected output: 500 error response
  test('should call next(err) when controller promise rejects', async () => {
    const { OrderController } = require('../../src/controllers/order.controller');
    const controllerProto = OrderController.prototype;
    const originalMethod = controllerProto.createOrder;

    controllerProto.createOrder = jest
      .fn()
      .mockImplementation(() => Promise.reject(new Error('Controller error')));

    const response = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        volume: 2.5,
        totalPrice: 150.0,
        studentAddress: {
          lat: 49.2606,
          lon: -123.1133,
          formattedAddress: '123 Student Ave, Vancouver, BC'
        },
        warehouseAddress: {
          lat: 49.2827,
          lon: -123.1207,
          formattedAddress: '123 Warehouse St, Vancouver, BC'
        },
        pickupTime: '2025-11-10T10:00:00.000Z',
        returnTime: '2025-11-15T10:00:00.000Z'
      });

    expect(response.status).toBe(500);
    expect(controllerProto.createOrder).toHaveBeenCalled();

    // Restore original method
    controllerProto.createOrder = originalMethod;
  });

  // Mocked behavior: orderModel.create throws duplicate key error (code 11000), second findByIdempotencyKey finds order
  // Input: request with Idempotency-Key 'test-race-key-456', valid order data
  // Expected status code: 201
  // Expected behavior: recovers from race condition by finding existing order
  // Expected output: existing order with status PENDING
  test('should recover from duplicate key error using idempotency key (lines 147-151)', async () => {
    const actualOrderModule = jest.requireActual('../../src/models/order.model') as typeof import('../../src/models/order.model');
    const actualOrderInstance = actualOrderModule.orderModel as any;
    const realMongooseModel = (actualOrderInstance as any).order as mongoose.Model<Order>;

    const findOneSpy = jest
      .spyOn(realMongooseModel, 'findOne')
      .mockImplementation(() => {
        throw new Error('Database findOne failed');
      });

    mockOrderModel.findByIdempotencyKey.mockImplementationOnce((key: string) => {
      return actualOrderInstance.findByIdempotencyKey(key);
    });

    try {
      await request(app)
        .post('/api/order')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', 'test-key-fail-123')
        .send({
          studentId: testUserId.toString(),
          volume: 2.5,
          totalPrice: 150.0,
          studentAddress: {
            lat: 49.2606,
            lon: -123.1133,
            formattedAddress: '123 Student Ave, Vancouver, BC'
          },
          warehouseAddress: {
            lat: 49.2827,
            lon: -123.1207,
            formattedAddress: '123 Warehouse St, Vancouver, BC'
          },
          pickupTime: '2025-11-10T10:00:00.000Z',
          returnTime: '2025-11-15T10:00:00.000Z',
          paymentIntentId: 'pi_mock_123'
        })
        .expect(500);

      expect(findOneSpy).toHaveBeenCalledTimes(1);
      expect(mockOrderModel.findByIdempotencyKey).toHaveBeenCalledWith('test-key-fail-123');
    } finally {
      findOneSpy.mockRestore();
      mockOrderModel.findByIdempotencyKey.mockReset();
    }
  });

  // Mocked behavior: orderModel.create returns order without moverId
  // Input: request with valid order data
  // Expected status code: 201
  // Expected behavior: creates order with status PENDING, no mover assigned yet
  // Expected output: order object without moverId field 
  test('should create order without moverId initially', async () => {
    const mockOrderId = new mongoose.Types.ObjectId();
    
    // Mock order creation without moverId
    const mockCreatedOrder: Order = {
      _id: mockOrderId,
      studentId: testUserIdString,
      moverId: undefined, // No mover assigned yet
      status: OrderStatus.PENDING,
      volume: 2.5,
      price: 150.0,
      studentAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 Student Ave, Vancouver, BC'
      },
      warehouseAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Warehouse St, Vancouver, BC'
      },
      returnAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 Student Ave, Vancouver, BC'
      },
      pickupTime: '2025-11-10T10:00:00.000Z',
      returnTime: '2025-11-15T10:00:00.000Z',
      paymentIntentId: 'pi_mock_456'
    };

    mockOrderModel.findByIdempotencyKey.mockResolvedValue(null);
    mockOrderModel.create.mockResolvedValue(mockCreatedOrder);
    mockJobService.createJob.mockResolvedValue({
      success: true,
      id: 'job_mock_123',
      message: 'Job created successfully'
    });
    mockEventEmitter.emitOrderCreated.mockImplementation(() => {});

    const response = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        volume: 2.5,
        totalPrice: 150.0,
        studentAddress: {
          lat: 49.2606,
          lon: -123.1133,
          formattedAddress: '123 Student Ave, Vancouver, BC'
        },
        warehouseAddress: {
          lat: 49.2827,
          lon: -123.1207,
          formattedAddress: '123 Warehouse St, Vancouver, BC'
        },
        pickupTime: '2025-11-10T10:00:00.000Z',
        returnTime: '2025-11-15T10:00:00.000Z',
        paymentIntentId: 'pi_mock_456'
      })
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('status', OrderStatus.PENDING);
    // Verify moverId is undefined when mapper processes order without mover
    expect(response.body.moverId).toBeUndefined();
  });

  // Mocked behavior: orderModel.create returns order with moverId
  // Input: request with valid order data
  // Expected status code: 201
  // Expected behavior: creates order with status ACCEPTED, mover is pre-assigned
  // Expected output: order object with moverId field containing mover's ObjectId
  test('should create order with moverId when mover is pre-assigned', async () => {
    const mockOrderId = new mongoose.Types.ObjectId();
    const moverId = new mongoose.Types.ObjectId();
    
    // Mock order creation with moverId
    const mockCreatedOrder: Order = {
      _id: mockOrderId,
      studentId: testUserIdString,
      moverId: moverId.toString(), // Mover is assigned
      status: OrderStatus.ACCEPTED,
      volume: 3.0,
      price: 200.0,
      studentAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '456 Student Rd, Vancouver, BC'
      },
      warehouseAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Warehouse St, Vancouver, BC'
      },
      returnAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '456 Student Rd, Vancouver, BC'
      },
      pickupTime: '2025-11-12T10:00:00.000Z',
      returnTime: '2025-11-18T10:00:00.000Z',
      paymentIntentId: 'pi_mock_789'
    };

    mockOrderModel.findByIdempotencyKey.mockResolvedValue(null);
    mockOrderModel.create.mockResolvedValue(mockCreatedOrder);
    mockJobService.createJob.mockResolvedValue({
      success: true,
      id: 'job_mock_456',
      message: 'Job created successfully'
    });
    mockEventEmitter.emitOrderCreated.mockImplementation(() => {});

    const response = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        volume: 3.0,
        totalPrice: 200.0,
        studentAddress: {
          lat: 49.2606,
          lon: -123.1133,
          formattedAddress: '456 Student Rd, Vancouver, BC'
        },
        warehouseAddress: {
          lat: 49.2827,
          lon: -123.1207,
          formattedAddress: '123 Warehouse St, Vancouver, BC'
        },
        pickupTime: '2025-11-12T10:00:00.000Z',
        returnTime: '2025-11-18T10:00:00.000Z',
        paymentIntentId: 'pi_mock_789'
      })
      .expect(201);

    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('status', OrderStatus.ACCEPTED);
    // Verify moverId is mapped correctly when present
    expect(response.body).toHaveProperty('moverId', moverId.toString());
  });

  // Mocked behavior: orderModel.create throws duplicate key error (code 11000), second findByIdempotencyKey finds order
  // Input: request with Idempotency-Key 'test-race-key-456', valid order data
  // Expected status code: 201
  // Expected behavior: recovers from race condition by finding existing order
  // Expected output: existing order with status PENDING
  test('should recover from duplicate key error using idempotency key (lines 147-151)', async () => {
    const mockOrderId = new mongoose.Types.ObjectId();
    const mockExistingOrder: Order = {
      _id: mockOrderId,
      studentId: testUserIdString,
      status: OrderStatus.PENDING,
      volume: 2.5,
      price: 150.0,
      studentAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 Student Ave, Vancouver, BC'
      },
      warehouseAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Warehouse St, Vancouver, BC'
      },
      returnAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 Student Ave, Vancouver, BC'
      },
      pickupTime: '2025-11-10T10:00:00.000Z',
      returnTime: '2025-11-15T10:00:00.000Z',
      paymentIntentId: 'pi_mock_race_123',
      idempotencyKey: 'test-race-key-456'
    };

    // First call to findByIdempotencyKey returns null (no existing order yet)
    // Then create() throws a duplicate key error (code 11000)
    // Then second call to findByIdempotencyKey in catch block finds the order
    mockOrderModel.findByIdempotencyKey
      .mockResolvedValueOnce(null)  // First check
      .mockResolvedValueOnce(mockExistingOrder);  // Second check

    // Mock duplicate key error from database
    const duplicateKeyError = new Error('E11000 duplicate key error') as any;
    duplicateKeyError.code = 11000;
    mockOrderModel.create.mockRejectedValue(duplicateKeyError);

    const response = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .set('Idempotency-Key', 'test-race-key-456')
      .send({
        studentId: testUserId.toString(),
        volume: 2.5,
        totalPrice: 150.0,
        studentAddress: {
          lat: 49.2606,
          lon: -123.1133,
          formattedAddress: '123 Student Ave, Vancouver, BC'
        },
        warehouseAddress: {
          lat: 49.2827,
          lon: -123.1207,
          formattedAddress: '123 Warehouse St, Vancouver, BC'
        },
        pickupTime: '2025-11-10T10:00:00.000Z',
        returnTime: '2025-11-15T10:00:00.000Z',
        paymentIntentId: 'pi_mock_race_123'
      })
      .expect(201);

    // Should return the existing order found by idempotency key
    expect(response.body).toHaveProperty('id', mockOrderId.toString());
    expect(response.body).toHaveProperty('status', OrderStatus.PENDING);
    
    // Verify findByIdempotencyKey was called twice
    expect(mockOrderModel.findByIdempotencyKey).toHaveBeenCalledTimes(2);
    expect(mockOrderModel.findByIdempotencyKey).toHaveBeenNthCalledWith(1, 'test-race-key-456');
    expect(mockOrderModel.findByIdempotencyKey).toHaveBeenNthCalledWith(2, 'test-race-key-456');
    
    // Verify create was attempted
    expect(mockOrderModel.create).toHaveBeenCalled();
  });
});

// Interface POST /api/order/create-return-Job
describe('POST /api/order/create-return-Job - Create Return Job (Mocked)', () => {
  // Mocked behavior: orderModel.findActiveOrder returns IN_STORAGE order, jobModel.findByOrderId returns empty, jobService.createJob succeeds
  // Input: authenticated request with returnAddress, actualReturnDate (early return)
  // Expected status code: 201
  // Expected behavior: creates return job, calculates refund for early return
  // Expected output: success message with refundAmount
  test('should successfully create a return job', async () => {
    // Mock active order
    const mockActiveOrder: Order = {
      _id: new mongoose.Types.ObjectId(),
      studentId: testUserIdString,
      status: OrderStatus.IN_STORAGE,
      volume: 2.5,
      price: 150.0,
      studentAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 Student Ave, Vancouver, BC'
      },
      warehouseAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Warehouse St, Vancouver, BC'
      },
      returnAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 Student Ave, Vancouver, BC'
      },
      pickupTime: '2025-11-10T10:00:00.000Z',
      returnTime: '2025-11-15T10:00:00.000Z'
    };

    // Mock order model
    mockOrderModel.findActiveOrder.mockResolvedValue(mockActiveOrder);
    mockOrderModel.update.mockResolvedValue(mockActiveOrder);
    
    // Mock no existing return job
    mockJobModel.findByOrderId.mockResolvedValue([]);

    // Mock job service
    mockJobService.createJob.mockResolvedValue({
      success: true,
      id: 'job_mock_return_late',
      message: 'RETURN job created successfully'
    });

    const response = await request(app)
      .post('/api/order/create-return-Job')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        returnAddress: {
          lat: 49.2606,
          lon: -123.1133,
          formattedAddress: '456 Return St, Vancouver, BC'
        },
        actualReturnDate: '2025-11-14T10:00:00.000Z' // Early return
      })
      .expect(201);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('message');
    expect(response.body).toHaveProperty('refundAmount');
  });

  // Mocked behavior: orderModel.findActiveOrder returns null
  // Input: authenticated request with empty body
  // Expected status code: 500
  // Expected behavior: throws error when no active order exists
  // Expected output: 500 error response
  test('should handle no active order found', async () => {
    // Mock no active order
    mockOrderModel.findActiveOrder.mockResolvedValue(null);

    const response = await request(app)
      .post('/api/order/create-return-Job')
      .set('Authorization', `Bearer ${authToken}`)
      .send({})
      .expect(500);

    expect(mockJobModel.findByOrderId).not.toHaveBeenCalled();
  });

  // Mocked behavior: orderModel.findActiveOrder returns order, jobModel.findByOrderId returns existing RETURN job
  // Input: authenticated request with empty body
  // Expected status code: 201
  // Expected behavior: detects existing return job, doesn't create duplicate
  // Expected output: success message indicating job already exists
  test('should handle existing return job', async () => {
    // Mock active order
    const mockActiveOrder: Order = {
      _id: new mongoose.Types.ObjectId(),
      studentId: testUserIdString,
      status: OrderStatus.IN_STORAGE,
      volume: 2.5,
      price: 150.0,
      studentAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 Student Ave, Vancouver, BC'
      },
      warehouseAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Warehouse St, Vancouver, BC'
      },
      returnAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 Student Ave, Vancouver, BC'
      },
      pickupTime: '2025-11-10T10:00:00.000Z',
      returnTime: '2025-11-15T10:00:00.000Z'
    };

    // Mock existing return job linked to the order
    const mockExistingJobs = [{
      jobType: 'RETURN',
      status: 'PENDING',
      orderId: mockActiveOrder._id
    }];

    mockOrderModel.findActiveOrder.mockResolvedValue(mockActiveOrder);
    // Mock jobModel to return the existing return job
    mockJobModel.findByOrderId.mockResolvedValue(mockExistingJobs as any);

    const response = await request(app)
      .post('/api/order/create-return-Job')
      .set('Authorization', `Bearer ${authToken}`)
      .send({})
      .expect(201);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body.message).toContain('already exists');
  });

  // Mocked behavior: orderModel.findActiveOrder returns order, jobModel.findByOrderId returns empty, jobService.createJob succeeds
  // Input: authenticated request with actualReturnDate 2 days after scheduled returnTime
  // Expected status code: 201
  // Expected behavior: creates return job, calculates late fee
  // Expected output: success message with lateFee field
  test('should handle late return with fee', async () => {
    // Mock active order
    const mockActiveOrder: Order = {
      _id: new mongoose.Types.ObjectId(),
      studentId: testUserIdString,
      status: OrderStatus.IN_STORAGE,
      volume: 2.5,
      price: 150.0,
      studentAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 Student Ave, Vancouver, BC'
      },
      warehouseAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Warehouse St, Vancouver, BC'
      },
      returnAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 Student Ave, Vancouver, BC'
      },
      pickupTime: '2025-11-10T10:00:00.000Z',
      returnTime: '2025-11-15T10:00:00.000Z' // Expected return date
    };

    mockOrderModel.findActiveOrder.mockResolvedValue(mockActiveOrder);
    mockOrderModel.update.mockResolvedValue(mockActiveOrder);
    
    // Mock no existing return job
    mockJobModel.findByOrderId.mockResolvedValue([]);
    
    mockJobService.createJob.mockResolvedValue({
      success: true,
      id: 'job_mock_return_late',
      message: 'RETURN job created successfully'
    });

    const response = await request(app)
      .post('/api/order/create-return-Job')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        actualReturnDate: '2025-11-17T10:00:00.000Z' // 2 days late
      })
      .expect(201);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('lateFee');
  });

  // Mocked behavior: OrderController.createReturnJob rejects with error
  // Input: authenticated request with returnAddress
  // Expected status code: 500
  // Expected behavior: error handler catches controller rejection
  // Expected output: 500 error response
  test('should call next(err) when controller promise rejects', async () => {
    const { OrderController } = require('../../src/controllers/order.controller');
    const controllerProto = OrderController.prototype;
    const originalMethod = controllerProto.createReturnJob;

    controllerProto.createReturnJob = jest
      .fn()
      .mockImplementation(() => Promise.reject(new Error('Controller error')));

    const response = await request(app)
      .post('/api/order/create-return-Job')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        returnAddress: {
          lat: 49.2606,
          lon: -123.1133,
          formattedAddress: '123 Return St, Vancouver, BC'
        }
      });

    expect(response.status).toBe(500);
    expect(controllerProto.createReturnJob).toHaveBeenCalled();

    // Restore original method
    controllerProto.createReturnJob = originalMethod;
  });

  // Mocked behavior: none (direct controller test with undefined user)
  // Input: request with returnAddress but req.user is undefined
  // Expected status code: 401
  // Expected behavior: controller checks authentication, rejects unauthenticated request
  // Expected output: error message 'Authentication required. Please log in.'
  test('should return 401 when user is not authenticated in createReturnJob', async () => {
    // Directly test the controller with no user
    const { OrderController } = require('../../src/controllers/order.controller');
    const orderService = require('../../src/services/order.service').OrderService;
    const controller = new OrderController(new orderService());

    const mockReq: any = {
      user: undefined, // No user
      body: {
        returnAddress: {
          lat: 49.2606,
          lon: -123.1133,
          formattedAddress: '123 Return St, Vancouver, BC'
        }
      }
    };

    const mockRes: any = {
      status: (jest.fn() as any).mockReturnThis(),
      json: jest.fn(),
    };

    const mockNext = jest.fn();

    await controller.createReturnJob(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      message: 'Authentication required. Please log in.',
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  // Mocked behavior: none (direct controller test with user object lacking _id)
  // Input: request with returnAddress, req.user exists but has no _id field
  // Expected status code: 401
  // Expected behavior: controller checks for user._id, rejects when missing
  // Expected output: error message 'Authentication required. Please log in.'
  test('should return 401 when user._id is missing in createReturnJob', async () => {
    // Directly test the controller with user but no _id
    const { OrderController } = require('../../src/controllers/order.controller');
    const orderService = require('../../src/services/order.service').OrderService;
    const controller = new OrderController(new orderService());

    const mockReq: any = {
      user: {}, // User exists but no _id
      body: {
        returnAddress: {
          lat: 49.2606,
          lon: -123.1133,
          formattedAddress: '123 Return St, Vancouver, BC'
        }
      }
    };

    const mockRes: any = {
      status: (jest.fn() as any).mockReturnThis(),
      json: jest.fn(),
    };

    const mockNext = jest.fn();

    await controller.createReturnJob(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      success: false,
      message: 'Authentication required. Please log in.',
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  // Mocked behavior: orderModel returns order with paymentIntentId, paymentService.refundPayment succeeds, jobService.createJob succeeds
  // Input: authenticated request with actualReturnDate 3 days before scheduled returnTime
  // Expected status code: 201
  // Expected behavior: creates return job, processes refund for unused storage days
  // Expected output: success message with refundAmount > 0
  test('should successfully process refund for early return (lines 256-264)', async () => {
    const pickupTime = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const returnTime = new Date(pickupTime.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    // Mock active order in storage with payment intent
    const mockActiveOrder: Order = {
      _id: new mongoose.Types.ObjectId(),
      studentId: testUserIdString,
      status: OrderStatus.IN_STORAGE,
      volume: 3.5,
      price: 200.0,
      studentAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '789 Early Return St, Vancouver, BC'
      },
      warehouseAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '456 Warehouse Ave, Vancouver, BC'
      },
      returnAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '789 Early Return St, Vancouver, BC'
      },
      pickupTime: pickupTime.toISOString(),
      returnTime: returnTime.toISOString(),
      paymentIntentId: 'pi_early_return_success_456'
    };

    mockOrderModel.findActiveOrder.mockResolvedValue(mockActiveOrder);
    mockOrderModel.update.mockResolvedValue(mockActiveOrder);
    
    // Mock no existing return job
    mockJobModel.findByOrderId.mockResolvedValue([]);
    
    // Mock successful refund
    mockPaymentService.refundPayment.mockResolvedValue({
      paymentId: 'pi_early_return_success_456',
      status: 'succeeded' as any,
      amount: 60.0, // Refund amount will be calculated
      currency: 'CAD'
    });
    
    mockJobService.createJob.mockResolvedValue({
      success: true,
      id: 'job_mock_return_early',
      message: 'RETURN job created successfully'
    });

    // Request early return (3 days before scheduled return)
    const earlyReturnDate = new Date(returnTime.getTime() - 3 * 24 * 60 * 60 * 1000);
    
    const response = await request(app)
      .post('/api/order/create-return-Job')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        actualReturnDate: earlyReturnDate.toISOString()
      })
      .expect(201);

    // Should succeed with refund message
    expect(response.body).toHaveProperty('success', true);
    expect(response.body.message).toContain('Refund');
    expect(response.body).toHaveProperty('refundAmount');
    expect(response.body.refundAmount).toBeGreaterThan(0);

    // Verify refund was called
    expect(mockPaymentService.refundPayment).toHaveBeenCalledWith(
      'pi_early_return_success_456',
      expect.any(Number)
    );

    // Verify return job was created
    expect(mockJobService.createJob).toHaveBeenCalled();
  });

  // Mocked behavior: orderModel returns order, paymentService.refundPayment rejects with error, jobService.createJob succeeds
  // Input: authenticated request with actualReturnDate 4 days before scheduled returnTime
  // Expected status code: 201
  // Expected behavior: attempts refund, catches error, still creates return job successfully
  // Expected output: success message despite refund failure
  test('should handle error when refund payment fails during early return (lines 265-266)', async () => {
    const pickupTime = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const returnTime = new Date(pickupTime.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    // Mock active order in storage with payment intent
    const mockActiveOrder: Order = {
      _id: new mongoose.Types.ObjectId(),
      studentId: testUserIdString,
      status: OrderStatus.IN_STORAGE,
      volume: 4.0,
      price: 220.0,
      studentAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '321 Refund Error St, Vancouver, BC'
      },
      warehouseAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '456 Warehouse Ave, Vancouver, BC'
      },
      returnAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '321 Refund Error St, Vancouver, BC'
      },
      pickupTime: pickupTime.toISOString(),
      returnTime: returnTime.toISOString(),
      paymentIntentId: 'pi_early_return_fail_789'
    };

    mockOrderModel.findActiveOrder.mockResolvedValue(mockActiveOrder);
    mockOrderModel.update.mockResolvedValue(mockActiveOrder);
    
    // Mock no existing return job
    mockJobModel.findByOrderId.mockResolvedValue([]);
    
    // Mock refund to fail
    mockPaymentService.refundPayment.mockRejectedValue(new Error('Stripe refund failed'));
    
    mockJobService.createJob.mockResolvedValue({
      success: true,
      id: 'job_mock_return_early_fail',
      message: 'RETURN job created successfully'
    });

    // Request early return (4 days before scheduled return)
    const earlyReturnDate = new Date(returnTime.getTime() - 4 * 24 * 60 * 60 * 1000);
    
    const response = await request(app)
      .post('/api/order/create-return-Job')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        actualReturnDate: earlyReturnDate.toISOString()
      })
      .expect(201);

    // Should still succeed with return job creation despite refund failure
    // This tests the catch block with logger.error
    expect(response.body).toHaveProperty('success', true);
    expect(response.body.message).toContain('Return job created successfully');

    // Verify refund was attempted
    expect(mockPaymentService.refundPayment).toHaveBeenCalledWith(
      'pi_early_return_fail_789',
      expect.any(Number)
    );
    expect(mockJobService.createJob).toHaveBeenCalled();
  });

  // Mocked behavior: orderModel returns order, jobModel returns empty, jobService.createJob succeeds
  // Input: authenticated request with empty body (no actualReturnDate)
  // Expected status code: 201
  // Expected behavior: uses current date as actualReturnDate
  // Expected output: success message with return job created
  test('should use current date when actualReturnDate is not provided ', async () => {
    const mockActiveOrder: Order = {
      _id: new mongoose.Types.ObjectId(),
      studentId: testUserIdString,
      status: OrderStatus.IN_STORAGE,
      volume: 2.0,
      price: 100.0,
      studentAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 Current Date St, Vancouver, BC'
      },
      warehouseAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '456 Warehouse Ave, Vancouver, BC'
      },
      returnAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 Current Date St, Vancouver, BC'
      },
      pickupTime: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      returnTime: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago (to avoid refund/late fee logic)
      paymentIntentId: 'pi_current_date_123'
    };

    mockOrderModel.findActiveOrder.mockResolvedValue(mockActiveOrder);
    mockOrderModel.update.mockResolvedValue(mockActiveOrder);
    mockJobModel.findByOrderId.mockResolvedValue([]);
    mockJobService.createJob.mockResolvedValue({
      success: true,
      id: 'job_mock_current_date',
      message: 'RETURN job created successfully'
    });

    const response = await request(app)
      .post('/api/order/create-return-Job')
      .set('Authorization', `Bearer ${authToken}`)
      .send({})
      .expect(201);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body.message).toContain('Return job created successfully');
    expect(mockJobService.createJob).toHaveBeenCalled();
  });

  // Mocked behavior: orderModel returns order with paymentIntentId, paymentService.refundPayment succeeds, jobService.createJob succeeds
  // Input: authenticated request with actualReturnDate 2 days before scheduled returnTime
  // Expected status code: 201
  // Expected behavior: uses provided actualReturnDate, triggers early return refund
  // Expected output: success message with refund confirmation
  test('should use provided actualReturnDate when specified (line 199 if branch)', async () => {
    const pickupTime = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const returnTime = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    
    const mockActiveOrder: Order = {
      _id: new mongoose.Types.ObjectId(),
      studentId: testUserIdString,
      status: OrderStatus.IN_STORAGE,
      volume: 2.5,
      price: 120.0,
      studentAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '456 Custom Date St, Vancouver, BC'
      },
      warehouseAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '456 Warehouse Ave, Vancouver, BC'
      },
      returnAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '456 Custom Date St, Vancouver, BC'
      },
      pickupTime: pickupTime.toISOString(),
      returnTime: returnTime.toISOString(),
      paymentIntentId: 'pi_custom_date_456'
    };

    mockOrderModel.findActiveOrder.mockResolvedValue(mockActiveOrder);
    mockOrderModel.update.mockResolvedValue(mockActiveOrder);
    mockJobModel.findByOrderId.mockResolvedValue([]);
    mockPaymentService.refundPayment.mockResolvedValue({
      paymentId: 'pi_custom_date_456',
      status: 'succeeded' as any,
      amount: 30.0,
      currency: 'CAD'
    });
    mockJobService.createJob.mockResolvedValue({
      success: true,
      id: 'job_mock_custom_date',
      message: 'RETURN job created successfully'
    });

    const customReturnDate = new Date(returnTime.getTime() - 2 * 24 * 60 * 60 * 1000);
    
    const response = await request(app)
      .post('/api/order/create-return-Job')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        actualReturnDate: customReturnDate.toISOString()
      })
      .expect(201);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body.message).toContain('Refund');
    expect(mockPaymentService.refundPayment).toHaveBeenCalled();
    expect(mockJobService.createJob).toHaveBeenCalled();
  });

  // Mocked behavior: orderModel returns order, jobModel returns empty, jobService.createJob succeeds
  // Input: authenticated request with empty body (no actualReturnDate provided)
  // Expected status code: 201
  // Expected behavior: uses activeOrder.returnTime as returnDate for update
  // Expected output: success message, orderModel.update called with activeOrder.returnTime
  test('should use activeOrder.returnTime when returnDateString is not provided (line 230 else branch)', async () => {
    const expectedReturnTime = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    
    const mockActiveOrder: Order = {
      _id: new mongoose.Types.ObjectId(),
      studentId: testUserIdString,
      status: OrderStatus.IN_STORAGE,
      volume: 1.5,
      price: 90.0,
      studentAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '789 Default Time St, Vancouver, BC'
      },
      warehouseAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '456 Warehouse Ave, Vancouver, BC'
      },
      returnAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '789 Default Time St, Vancouver, BC'
      },
      pickupTime: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      returnTime: expectedReturnTime,
      paymentIntentId: 'pi_default_time_789'
    };

    mockOrderModel.findActiveOrder.mockResolvedValue(mockActiveOrder);
    mockOrderModel.update.mockResolvedValue(mockActiveOrder);
    mockJobModel.findByOrderId.mockResolvedValue([]);
    mockJobService.createJob.mockResolvedValue({
      success: true,
      id: 'job_mock_default_time',
      message: 'RETURN job created successfully'
    });

    const response = await request(app)
      .post('/api/order/create-return-Job')
      .set('Authorization', `Bearer ${authToken}`)
      .send({})
      .expect(201);

    expect(response.body).toHaveProperty('success', true);
    expect(mockOrderModel.update).toHaveBeenCalledWith(
      mockActiveOrder._id,
      expect.objectContaining({
        returnTime: expectedReturnTime
      })
    );
    expect(mockJobService.createJob).toHaveBeenCalled();
  });
});

// Interface GET /api/order/all-orders
describe('GET /api/order/all-orders - Get All Orders (Mocked)', () => {
  // Mocked behavior: orderModel.getAllOrders returns array of orders
  // Input: authenticated request
  // Expected status code: 200
  // Expected behavior: retrieves all orders for authenticated user
  // Expected output: success message with orders array
  test('should successfully get all orders', async () => {
    // Mock orders data
    const mockOrders: Order[] = [
      {
        _id: new mongoose.Types.ObjectId(),
        studentId: testUserIdString,
        status: OrderStatus.PENDING,
        volume: 2.5,
        price: 150.0,
        studentAddress: {
          lat: 49.2606,
          lon: -123.1133,
          formattedAddress: '123 Student Ave, Vancouver, BC'
        },
        warehouseAddress: {
          lat: 49.2827,
          lon: -123.1207,
          formattedAddress: '123 Warehouse St, Vancouver, BC'
        },
        pickupTime: '2025-11-10T10:00:00.000Z',
        returnTime: '2025-11-15T10:00:00.000Z'
      }
    ];

    const mockResponse: GetAllOrdersResponse = {
      success: true,
      orders: mockOrders,
      message: 'Orders retrieved successfully'
    };

    mockOrderModel.getAllOrders.mockResolvedValue(mockOrders);

    const response = await request(app)
      .get('/api/order/all-orders')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('orders');
    expect(Array.isArray(response.body.orders)).toBe(true);
    expect(response.body).toHaveProperty('message', 'Orders retrieved successfully');
  });

  // Mocked behavior: real mongoose model.find throws error via spy
  // Input: authenticated request
  // Expected status code: 500
  // Expected behavior: surfaces underlying mongoose find failure
  // Expected output: 500 error response
  test('should handle database errors when getting orders', async () => {
    const actualOrderModule = jest.requireActual('../../src/models/order.model') as typeof import('../../src/models/order.model');
    const actualOrderInstance = actualOrderModule.orderModel as any;
    const realMongooseModel = (actualOrderInstance as any).order as mongoose.Model<Order>;

    const findSpy = jest.spyOn(realMongooseModel, 'find').mockImplementation(() => {
      throw new Error('Database find failed');
    });

    mockOrderModel.getAllOrders.mockImplementationOnce((studentId: any) =>
      actualOrderInstance.getAllOrders(studentId)
    );

    try {
      await request(app)
        .get('/api/order/all-orders')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(findSpy).toHaveBeenCalledTimes(1);
    } finally {
      findSpy.mockRestore();
      mockOrderModel.getAllOrders.mockReset();
    }
  });

  // Mocked behavior: OrderController.getAllOrders rejects with error
  // Input: authenticated request
  // Expected status code: 500
  // Expected behavior: error handler catches controller rejection
  // Expected output: 500 error response
  test('should call next(err) when controller promise rejects', async () => {
    const { OrderController } = require('../../src/controllers/order.controller');
    const controllerProto = OrderController.prototype;
    const originalMethod = controllerProto.getAllOrders;

    controllerProto.getAllOrders = jest
      .fn()
      .mockImplementation(() => Promise.reject(new Error('Controller error')));

    const response = await request(app)
      .get('/api/order/all-orders')
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(500);
    expect(controllerProto.getAllOrders).toHaveBeenCalled();

    // Restore original method
    controllerProto.getAllOrders = originalMethod;
  });

  // Mocked behavior: orderModel.getAllOrders returns orders with moverId
  // Input: authenticated request
  // Expected status code: 200
  // Expected behavior: maps orders with assigned movers correctly
  // Expected output: orders array with moverId field populated
  test('should return orders with moverId when mover is assigned', async () => {
    const moverId = new mongoose.Types.ObjectId();
    
    // Mock orders with moverId present
    const mockOrders: Order[] = [
      {
        _id: new mongoose.Types.ObjectId(),
        studentId: testUserIdString,
        moverId: moverId.toString(), // moverId is present
        status: OrderStatus.ACCEPTED,
        volume: 3.0,
        price: 200.0,
        studentAddress: {
          lat: 49.2606,
          lon: -123.1133,
          formattedAddress: '123 Student Ave, Vancouver, BC'
        },
        warehouseAddress: {
          lat: 49.2827,
          lon: -123.1207,
          formattedAddress: '123 Warehouse St, Vancouver, BC'
        },
        returnAddress: {
          lat: 49.2606,
          lon: -123.1133,
          formattedAddress: '123 Student Ave, Vancouver, BC'
        },
        pickupTime: '2025-11-10T10:00:00.000Z',
        returnTime: '2025-11-15T10:00:00.000Z'
      }
    ];

    mockOrderModel.getAllOrders.mockResolvedValue(mockOrders);

    const response = await request(app)
      .get('/api/order/all-orders')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body.orders).toHaveLength(1);
    expect(response.body.orders[0]).toHaveProperty('moverId', moverId.toString());
    expect(response.body.orders[0].status).toBe(OrderStatus.ACCEPTED);
  });

  // Mocked behavior: orderModel.getAllOrders returns orders with undefined moverId
  // Input: authenticated request
  // Expected status code: 200
  // Expected behavior: maps orders without movers, moverId remains undefined
  // Expected output: orders array with moverId undefined
  test('should return orders without moverId when mover is not assigned', async () => {
    // Mock orders without moverId (undefined or null)
    const mockOrders: Order[] = [
      {
        _id: new mongoose.Types.ObjectId(),
        studentId: testUserIdString,
        moverId: undefined, // moverId is undefined - triggers false branch
        status: OrderStatus.PENDING,
        volume: 2.0,
        price: 100.0,
        studentAddress: {
          lat: 49.2606,
          lon: -123.1133,
          formattedAddress: '456 Student Blvd, Vancouver, BC'
        },
        warehouseAddress: {
          lat: 49.2827,
          lon: -123.1207,
          formattedAddress: '123 Warehouse St, Vancouver, BC'
        },
        returnAddress: {
          lat: 49.2606,
          lon: -123.1133,
          formattedAddress: '456 Student Blvd, Vancouver, BC'
        },
        pickupTime: '2025-11-12T10:00:00.000Z',
        returnTime: '2025-11-20T10:00:00.000Z'
      }
    ];

    mockOrderModel.getAllOrders.mockResolvedValue(mockOrders);

    const response = await request(app)
      .get('/api/order/all-orders')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body.orders).toHaveLength(1);
    expect(response.body.orders[0].moverId).toBeUndefined();
    expect(response.body.orders[0].status).toBe(OrderStatus.PENDING);
  });

  // Mocked behavior: orderModel.getAllOrders returns mix of orders with/without moverId
  // Input: authenticated request
  // Expected status code: 200
  // Expected behavior: correctly maps both orders with and without assigned movers
  // Expected output: orders array with mixed moverId values (some populated, some undefined)
  test('should return mixed orders with and without moverId', async () => {
    const moverId1 = new mongoose.Types.ObjectId();
    
    // Mock mixed orders - some with moverId, some without
    const mockOrders: Order[] = [
      {
        _id: new mongoose.Types.ObjectId(),
        studentId: testUserIdString,
        moverId: moverId1.toString(), // Has moverId
        status: OrderStatus.PICKED_UP,
        volume: 3.5,
        price: 220.0,
        studentAddress: {
          lat: 49.2606,
          lon: -123.1133,
          formattedAddress: '111 Student St, Vancouver, BC'
        },
        warehouseAddress: {
          lat: 49.2827,
          lon: -123.1207,
          formattedAddress: '123 Warehouse St, Vancouver, BC'
        },
        returnAddress: {
          lat: 49.2606,
          lon: -123.1133,
          formattedAddress: '111 Student St, Vancouver, BC'
        },
        pickupTime: '2025-11-10T10:00:00.000Z',
        returnTime: '2025-11-15T10:00:00.000Z'
      },
      {
        _id: new mongoose.Types.ObjectId(),
        studentId: testUserIdString,
        moverId: undefined, // No moverId
        status: OrderStatus.PENDING,
        volume: 1.5,
        price: 80.0,
        studentAddress: {
          lat: 49.2606,
          lon: -123.1133,
          formattedAddress: '222 Student Ave, Vancouver, BC'
        },
        warehouseAddress: {
          lat: 49.2827,
          lon: -123.1207,
          formattedAddress: '123 Warehouse St, Vancouver, BC'
        },
        returnAddress: {
          lat: 49.2606,
          lon: -123.1133,
          formattedAddress: '222 Student Ave, Vancouver, BC'
        },
        pickupTime: '2025-11-11T10:00:00.000Z',
        returnTime: '2025-11-16T10:00:00.000Z'
      }
    ];

    mockOrderModel.getAllOrders.mockResolvedValue(mockOrders);

    const response = await request(app)
      .get('/api/order/all-orders')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body.orders).toHaveLength(2);
    expect(response.body.orders[0]).toHaveProperty('moverId', moverId1.toString());
    expect(response.body.orders[0].status).toBe(OrderStatus.PICKED_UP);
    expect(response.body.orders[1].moverId).toBeUndefined();
    expect(response.body.orders[1].status).toBe(OrderStatus.PENDING);
  });
});

// Interface GET /api/order/active-order
describe('GET /api/order/active-order - Get Active Order (Mocked)', () => {
  // Mocked behavior: orderModel.findActiveOrder returns IN_STORAGE order
  // Input: authenticated request
  // Expected status code: 200
  // Expected behavior: retrieves active order for authenticated user
  // Expected output: order object with id, status IN_STORAGE, volume, price
  test('should successfully get active order', async () => {
    // Mock active order
    const mockActiveOrder: Order = {
      _id: new mongoose.Types.ObjectId(),
      studentId: testUserIdString,
      status: OrderStatus.IN_STORAGE,
      volume: 2.5,
      price: 150.0,
      studentAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 Student Ave, Vancouver, BC'
      },
      warehouseAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Warehouse St, Vancouver, BC'
      },
      returnAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 Student Ave, Vancouver, BC'
      },
      pickupTime: '2025-11-10T10:00:00.000Z',
      returnTime: '2025-11-15T10:00:00.000Z'
    };

    mockOrderModel.findActiveOrder.mockResolvedValue(mockActiveOrder);

    const response = await request(app)
      .get('/api/order/active-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('id');
    expect(response.body).toHaveProperty('status', OrderStatus.IN_STORAGE);
    expect(response.body).toHaveProperty('volume', 2.5);
  });

  // Mocked behavior: orderModel.findActiveOrder returns null
  // Input: authenticated request
  // Expected status code: 404
  // Expected behavior: returns null when no active order exists
  // Expected output: null response body
  test('should return null when no active order exists', async () => {
    mockOrderModel.findActiveOrder.mockResolvedValue(null);

    const response = await request(app)
      .get('/api/order/active-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(404);

    expect(response.body).toBeNull();
  });

  // Mocked behavior: OrderController.getActiveOrder rejects with error
  // Input: authenticated request
  // Expected status code: 500
  // Expected behavior: error handler catches controller rejection
  // Expected output: 500 error response
  test('should call next(err) when controller promise rejects', async () => {
    const { OrderController } = require('../../src/controllers/order.controller');
    const controllerProto = OrderController.prototype;
    const originalMethod = controllerProto.getActiveOrder;

    controllerProto.getActiveOrder = jest
      .fn()
      .mockImplementation(() => Promise.reject(new Error('Controller error')));

    const response = await request(app)
      .get('/api/order/active-order')
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(500);
    expect(controllerProto.getActiveOrder).toHaveBeenCalled();

    // Restore original method
    controllerProto.getActiveOrder = originalMethod;
  });

  // Mocked behavior: real mongoose model.findOne.sort throws error via spy
  // Input: authenticated request
  // Expected status code: 500
  // Expected behavior: surfaces underlying mongoose findOne failure
  // Expected output: 500 error response
  test('should surface database errors when active order lookup fails', async () => {
    const actualOrderModule = jest.requireActual('../../src/models/order.model') as typeof import('../../src/models/order.model');
    const actualOrderInstance = actualOrderModule.orderModel as any;
    const realMongooseModel = (actualOrderInstance as any).order as mongoose.Model<Order>;

    const findOneSpy = jest.spyOn(realMongooseModel, 'findOne').mockImplementation(
      () => ({
        sort: () => {
          throw new Error('Database findOne failed');
        },
      }) as any
    );

    mockOrderModel.findActiveOrder.mockImplementationOnce((filter: any) =>
      actualOrderInstance.findActiveOrder(filter)
    );

    try {
      await request(app)
        .get('/api/order/active-order')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(findOneSpy).toHaveBeenCalledTimes(1);
    } finally {
      findOneSpy.mockRestore();
      mockOrderModel.findActiveOrder.mockReset();
    }
  });

  // Mocked behavior: real mongoose model.findById throws error via spy
  // Input: authenticated request
  // Expected status code: 500
  // Expected behavior: surfaces underlying mongoose findById failure
  // Expected output: 500 error response
  test('should surface database errors when fetching order by id fails', async () => {
    const actualOrderModule = jest.requireActual('../../src/models/order.model') as typeof import('../../src/models/order.model');
    const actualOrderInstance = actualOrderModule.orderModel as any;
    const realMongooseModel = (actualOrderInstance as any).order as mongoose.Model<Order>;

    const findByIdSpy = jest.spyOn(realMongooseModel, 'findById').mockImplementation(() => {
      throw new Error('Database findById failed');
    });

    mockOrderModel.findActiveOrder.mockImplementationOnce(() =>
      actualOrderInstance.findById(new mongoose.Types.ObjectId())
    );

    try {
      await request(app)
        .get('/api/order/active-order')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(findByIdSpy).toHaveBeenCalledTimes(1);
    } finally {
      findByIdSpy.mockRestore();
      mockOrderModel.findActiveOrder.mockReset();
    }
  });
});

// Interface DELETE /api/order/cancel-order
describe('DELETE /api/order/cancel-order - Cancel Order (Mocked)', () => {
  // Mocked behavior: orderModel.findActiveOrder returns PENDING order, paymentService.refundPayment succeeds, jobService.cancelJobsForOrder succeeds, eventEmitter emits
  // Input: authenticated request
  // Expected status code: 200
  // Expected behavior: cancels pending order, processes full refund, cancels associated jobs
  // Expected output: success message 'Order cancelled successfully'
  test('should successfully cancel a pending order', async () => {
    // Mock pending order
    const mockPendingOrder: Order = {
      _id: new mongoose.Types.ObjectId(),
      studentId: testUserIdString,
      status: OrderStatus.PENDING,
      volume: 2.5,
      price: 150.0,
      studentAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 Student Ave, Vancouver, BC'
      },
      warehouseAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Warehouse St, Vancouver, BC'
      },
      pickupTime: '2025-11-10T10:00:00.000Z',
      returnTime: '2025-11-15T10:00:00.000Z',
      paymentIntentId: 'pi_mock_123'
    };

  const mockUpdatedOrder: Order = { ...mockPendingOrder, status: OrderStatus.CANCELLED };

    mockOrderModel.findActiveOrder.mockResolvedValue(mockPendingOrder);
    mockOrderModel.update.mockResolvedValue(mockUpdatedOrder);
    mockPaymentService.refundPayment.mockResolvedValue({
      paymentId: 'pi_mock_123',
      status: 'succeeded' as any,
      amount: 150.0,
      currency: 'CAD'
    });
    mockJobService.cancelJobsForOrder.mockResolvedValue({
      cancelledJobs: []
    });
    mockEventEmitter.emitOrderUpdated.mockImplementation(() => {});

    const response = await request(app)
      .delete('/api/order/cancel-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('message', 'Order cancelled successfully');
  });

  // Mocked behavior: orderModel.findActiveOrder returns ACCEPTED order (not PENDING)
  // Input: authenticated request
  // Expected status code: 200
  // Expected behavior: rejects cancellation of non-pending orders
  // Expected output: success false, message 'Only pending orders can be cancelled'
  test('should handle cancellation of non-pending orders', async () => {
    // Mock accepted order (cannot be cancelled)
    const mockAcceptedOrder: Order = {
      _id: new mongoose.Types.ObjectId(),
      studentId: testUserIdString,
      status: OrderStatus.ACCEPTED,
      volume: 2.5,
      price: 150.0,
      studentAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 Student Ave, Vancouver, BC'
      },
      warehouseAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Warehouse St, Vancouver, BC'
      },
      pickupTime: '2025-11-10T10:00:00.000Z',
      returnTime: '2025-11-15T10:00:00.000Z'
    };

    mockOrderModel.findActiveOrder.mockResolvedValue(mockAcceptedOrder);

    const response = await request(app)
      .delete('/api/order/cancel-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('success', false);
    expect(response.body.message).toContain('Only pending orders can be cancelled');
  });

  // Mocked behavior: orderModel.findActiveOrder returns null
  // Input: authenticated request
  // Expected status code: 200
  // Expected behavior: returns error when no active order exists to cancel
  // Expected output: success false, message 'Order not found'
  test('should handle no active order to cancel', async () => {
    mockOrderModel.findActiveOrder.mockResolvedValue(null);

    const response = await request(app)
      .delete('/api/order/cancel-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('success', false);
    expect(response.body).toHaveProperty('message', 'Order not found');
  });

  // Mocked behavior: orderModel returns PENDING order with paymentIntentId, paymentService.refundPayment rejects, jobService and eventEmitter succeed
  // Input: authenticated request
  // Expected status code: 200
  // Expected behavior: catches refund error but still completes cancellation
  // Expected output: success message (cancellation proceeds despite refund failure)
  test('should handle refund failure during cancellation', async () => {
    // Mock pending order with payment intent
    const mockPendingOrder: Order = {
      _id: new mongoose.Types.ObjectId(),
      studentId: testUserIdString,
      status: OrderStatus.PENDING,
      volume: 2.5,
      price: 150.0,
      studentAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 Student Ave, Vancouver, BC'
      },
      warehouseAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Warehouse St, Vancouver, BC'
      },
      pickupTime: '2025-11-10T10:00:00.000Z',
      returnTime: '2025-11-15T10:00:00.000Z',
      paymentIntentId: 'pi_mock_123'
    };

    mockOrderModel.findActiveOrder.mockResolvedValue(mockPendingOrder);
    mockOrderModel.update.mockResolvedValue({ ...mockPendingOrder, status: OrderStatus.CANCELLED });
    mockPaymentService.refundPayment.mockRejectedValue(new Error('Refund failed'));
    mockJobService.cancelJobsForOrder.mockResolvedValue({
      cancelledJobs: []
    });
    mockEventEmitter.emitOrderUpdated.mockImplementation(() => {});

    const response = await request(app)
      .delete('/api/order/cancel-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Should still succeed even if refund fails
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('message', 'Order cancelled successfully');
  });

  // Mocked behavior: real paymentService delegates to stripeService.refundPayment which throws error
  // Input: authenticated request
  // Expected status code: 200
  // Expected behavior: payment service catches stripe error, still completes cancellation
  // Expected output: success message (error handled gracefully)
  test('should handle stripeService.refundPayment error during cancellation', async () => {
    // Mock pending order with payment intent
    const mockPendingOrder: Order = {
      _id: new mongoose.Types.ObjectId(),
      studentId: testUserIdString,
      status: OrderStatus.PENDING,
      volume: 2.5,
      price: 150.0,
      studentAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 Student Ave, Vancouver, BC'
      },
      warehouseAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Warehouse St, Vancouver, BC'
      },
      pickupTime: '2025-11-10T10:00:00.000Z',
      returnTime: '2025-11-15T10:00:00.000Z',
      paymentIntentId: 'pi_mock_456'
    };

    mockOrderModel.findActiveOrder.mockResolvedValue(mockPendingOrder);
    mockOrderModel.update.mockResolvedValue({ ...mockPendingOrder, status: OrderStatus.CANCELLED });
    
    // Mock the REAL payment service to execute (not mock it entirely)
    // But mock stripeService.refundPayment to throw an error
    // This tests the error handling INSIDE payment.service.ts
    const actualPaymentService = jest.requireActual('../../src/services/payment.service') as typeof import('../../src/services/payment.service');
    mockPaymentService.refundPayment.mockImplementation((paymentIntentId: string, amount?: number) => {
      return actualPaymentService.paymentService.refundPayment(paymentIntentId, amount);
    });
    
    // Mock stripeService to throw error - this will be caught by payment.service.ts
    mockStripeService.refundPayment.mockRejectedValue(new Error('Stripe API error: Refund failed'));
    
    mockJobService.cancelJobsForOrder.mockResolvedValue({
      cancelledJobs: []
    });
    mockEventEmitter.emitOrderUpdated.mockImplementation(() => {});

    const response = await request(app)
      .delete('/api/order/cancel-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Verify stripeService.refundPayment was called
    expect(mockStripeService.refundPayment).toHaveBeenCalledWith('pi_mock_456', undefined);
    
    // Should still succeed even if stripe refund fails
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('message', 'Order cancelled successfully');
  });

  // Mocked behavior: real paymentService delegates to stripeService.refundPayment which succeeds without amount
  // Input: authenticated request
  // Expected status code: 200
  // Expected behavior: processes full refund (no amount specified), completes cancellation
  // Expected output: success message 'Order cancelled successfully'
  test('should handle successful stripeService.refundPayment during cancellation without amount', async () => {
    // Mock pending order with payment intent
    const mockPendingOrder: Order = {
      _id: new mongoose.Types.ObjectId(),
      studentId: testUserIdString,
      status: OrderStatus.PENDING,
      volume: 2.5,
      price: 150.0,
      studentAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 Student Ave, Vancouver, BC'
      },
      warehouseAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Warehouse St, Vancouver, BC'
      },
      pickupTime: '2025-11-10T10:00:00.000Z',
      returnTime: '2025-11-15T10:00:00.000Z',
      paymentIntentId: 'pi_mock_789'
    };

    mockOrderModel.findActiveOrder.mockResolvedValue(mockPendingOrder);
    mockOrderModel.update.mockResolvedValue({ ...mockPendingOrder, status: OrderStatus.CANCELLED });
    
    // Mock the REAL payment service to execute
    const actualPaymentService = jest.requireActual('../../src/services/payment.service') as typeof import('../../src/services/payment.service');
    mockPaymentService.refundPayment.mockImplementation((paymentIntentId: string, amount?: number) => {
      return actualPaymentService.paymentService.refundPayment(paymentIntentId, amount);
    });
    
  
    const mockRefundResult = {
      paymentId: 'pi_mock_789',
      status: 'succeeded' as any,
      amount: 150.0,
      currency: 'CAD' as const
    };
    mockStripeService.refundPayment.mockResolvedValue(mockRefundResult);
    
    mockJobService.cancelJobsForOrder.mockResolvedValue({
      cancelledJobs: []
    });
    mockEventEmitter.emitOrderUpdated.mockImplementation(() => {});

    const response = await request(app)
      .delete('/api/order/cancel-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Verify stripeService.refundPayment was called with undefined amount
    expect(mockStripeService.refundPayment).toHaveBeenCalledWith('pi_mock_789', undefined);
    
    // Should succeed with refund processed
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('message', 'Order cancelled successfully');
  });

  // Mocked behavior: real paymentService delegates to stripeService.refundPayment with partial amount
  // Input: authenticated request
  // Expected status code: 200
  // Expected behavior: processes partial refund (75.0), completes cancellation
  // Expected output: success message 'Order cancelled successfully'
  test('should handle successful stripeService.refundPayment with partial amount', async () => {
    // Mock pending order with payment intent
    const mockPendingOrder: Order = {
      _id: new mongoose.Types.ObjectId(),
      studentId: testUserIdString,
      status: OrderStatus.PENDING,
      volume: 2.5,
      price: 150.0,
      studentAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 Student Ave, Vancouver, BC'
      },
      warehouseAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Warehouse St, Vancouver, BC'
      },
      pickupTime: '2025-11-10T10:00:00.000Z',
      returnTime: '2025-11-15T10:00:00.000Z',
      paymentIntentId: 'pi_mock_999'
    };

    mockOrderModel.findActiveOrder.mockResolvedValue(mockPendingOrder);
    mockOrderModel.update.mockResolvedValue({ ...mockPendingOrder, status: OrderStatus.CANCELLED });
    
    // Mock the REAL payment service to execute
    const actualPaymentService = jest.requireActual('../../src/services/payment.service') as typeof import('../../src/services/payment.service');
    
    mockPaymentService.refundPayment.mockImplementation((paymentIntentId: string, amount?: number) => {
      return actualPaymentService.paymentService.refundPayment(paymentIntentId, 75.0);
    });
    
    const mockRefundResult = {
      paymentId: 'pi_mock_999',
      status: 'succeeded' as any,
      amount: 75.0, // Partial refund
      currency: 'CAD' as const
    };
    mockStripeService.refundPayment.mockResolvedValue(mockRefundResult);
    
    mockJobService.cancelJobsForOrder.mockResolvedValue({
      cancelledJobs: []
    });
    mockEventEmitter.emitOrderUpdated.mockImplementation(() => {});

    const response = await request(app)
      .delete('/api/order/cancel-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Verify stripeService.refundPayment was called with specific amount
    expect(mockStripeService.refundPayment).toHaveBeenCalledWith('pi_mock_999', 75.0);
    
    // Should succeed with partial refund processed
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('message', 'Order cancelled successfully');
  });

  // Input: pending order exists, database throws during update
  // Expected status code: 500
  // Expected behavior: controller handles error path via orderModel.update catch
  // Mocked behavior: underlying mongoose findByIdAndUpdate rejects
  test('should surface database errors when cancellation update fails', async () => {
    const mockPendingOrder: Order = {
      _id: new mongoose.Types.ObjectId(),
      studentId: testUserIdString,
      status: OrderStatus.PENDING,
      volume: 2.5,
      price: 150.0,
      studentAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 Student Ave, Vancouver, BC'
      },
      warehouseAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Warehouse St, Vancouver, BC'
      },
      pickupTime: '2025-11-10T10:00:00.000Z',
      returnTime: '2025-11-15T10:00:00.000Z',
      paymentIntentId: 'pi_mock_123'
  };

    mockOrderModel.findActiveOrder.mockResolvedValue(mockPendingOrder);

    const actualOrderModule = jest.requireActual('../../src/models/order.model') as {
      orderModel: {
        update: (orderId: mongoose.Types.ObjectId, update: Partial<Order>) => Promise<Order | null>;
        order: mongoose.Model<Order>;
      };
    };

    const actualOrderInstance = actualOrderModule.orderModel;
    const findByIdAndUpdateSpy = jest
      .spyOn((actualOrderInstance as any).order, 'findByIdAndUpdate')
      .mockRejectedValue(new Error('Database update failed'));

    mockOrderModel.update.mockImplementationOnce(async (orderId, updatePayload) => {
      return actualOrderInstance.update(orderId as mongoose.Types.ObjectId, updatePayload as Partial<Order>);
    });

    try {
      await request(app)
        .delete('/api/order/cancel-order')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(findByIdAndUpdateSpy).toHaveBeenCalledTimes(1);
    } finally {
      findByIdAndUpdateSpy.mockRestore();
      mockOrderModel.update.mockReset();
    }
  });

  // Mocked behavior: OrderController.cancelOrder rejects with error
  // Input: authenticated request
  // Expected status code: 500
  // Expected behavior: error handler catches controller rejection
  // Expected output: 500 error response
  test('should call next(err) when controller promise rejects', async () => {
    const { OrderController } = require('../../src/controllers/order.controller');
    const controllerProto = OrderController.prototype;
    const originalMethod = controllerProto.cancelOrder;

    controllerProto.cancelOrder = jest
      .fn()
      .mockImplementation(() => Promise.reject(new Error('Controller error')));

    const response = await request(app)
      .delete('/api/order/cancel-order')
      .set('Authorization', `Bearer ${authToken}`);

    expect(response.status).toBe(500);
    expect(controllerProto.cancelOrder).toHaveBeenCalled();

    // Restore original method
    controllerProto.cancelOrder = originalMethod;
  });

  // Mocked behavior: orderModel returns PENDING order with paymentIntentId, paymentService succeeds, jobService.cancelJobsForOrder rejects
  // Input: authenticated request
  // Expected status code: 200
  // Expected behavior: catches job cancellation error but still completes order cancellation
  // Expected output: success message (order cancelled despite job cancellation failure)
  test('should handle error when cancelJobsForOrder fails during order cancellation (line 390)', async () => {
    // Mock pending order with payment intent
    const mockPendingOrder: Order = {
      _id: new mongoose.Types.ObjectId(),
      studentId: testUserIdString,
      status: OrderStatus.PENDING,
      volume: 3.0,
      price: 180.0,
      studentAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 Cancel Test St, Vancouver, BC'
      },
      warehouseAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Warehouse St, Vancouver, BC'
      },
      pickupTime: '2025-11-10T10:00:00.000Z',
      returnTime: '2025-11-15T10:00:00.000Z',
      paymentIntentId: 'pi_cancel_error_123'
    };

    const mockUpdatedOrder: Order = { ...mockPendingOrder, status: OrderStatus.CANCELLED };

    mockOrderModel.findActiveOrder.mockResolvedValue(mockPendingOrder);
    mockOrderModel.update.mockResolvedValue(mockUpdatedOrder);
    
    // Mock successful refund
    mockPaymentService.refundPayment.mockResolvedValue({
      paymentId: 'pi_cancel_error_123',
      status: 'succeeded' as any,
      amount: 180.0,
      currency: 'CAD'
    });
    
    // Mock jobService.cancelJobsForOrder to throw an error
    mockJobService.cancelJobsForOrder.mockRejectedValue(new Error('Failed to cancel jobs'));
    
    mockEventEmitter.emitOrderUpdated.mockImplementation(() => {});

    const response = await request(app)
      .delete('/api/order/cancel-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // The cancellation should still succeed despite job cancellation failure
    // This tests the error logging for failed job cancellation
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('message', 'Order cancelled successfully');
    expect(mockJobService.cancelJobsForOrder).toHaveBeenCalledWith(
      mockPendingOrder._id.toString(),
      testUserIdString
    );
    expect(mockOrderModel.update).toHaveBeenCalledWith(mockPendingOrder._id, {
      status: OrderStatus.CANCELLED
    });
    expect(mockEventEmitter.emitOrderUpdated).toHaveBeenCalledWith(
      mockUpdatedOrder,
      { by: testUserIdString }
    );
  });

  // Mocked behavior: orderModel returns PENDING order without paymentIntentId, jobService succeeds, eventEmitter emits
  // Input: authenticated request
  // Expected status code: 200
  // Expected behavior: skips refund process when no paymentIntentId exists, logs warning
  // Expected output: success message (order cancelled without refund)
  test('should skip refund when order has no paymentIntentId (line 365 else branch)', async () => {
    const mockPendingOrder: Order = {
      _id: new mongoose.Types.ObjectId(),
      studentId: testUserIdString,
      status: OrderStatus.PENDING,
      volume: 2.0,
      price: 100.0,
      studentAddress: {
        lat: 49.2606,
        lon: -123.1133,
        formattedAddress: '123 No Payment St, Vancouver, BC'
      },
      warehouseAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Warehouse St, Vancouver, BC'
      },
      pickupTime: '2025-11-10T10:00:00.000Z',
      returnTime: '2025-11-15T10:00:00.000Z',
    };

    const mockUpdatedOrder: Order = { ...mockPendingOrder, status: OrderStatus.CANCELLED };

    mockOrderModel.findActiveOrder.mockResolvedValue(mockPendingOrder);
    mockOrderModel.update.mockResolvedValue(mockUpdatedOrder);
    mockJobService.cancelJobsForOrder.mockResolvedValue({
      cancelledJobs: []
    });
    mockEventEmitter.emitOrderUpdated.mockImplementation(() => {});

    const response = await request(app)
      .delete('/api/order/cancel-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('message', 'Order cancelled successfully');
    expect(mockPaymentService.refundPayment).not.toHaveBeenCalled();
    expect(mockOrderModel.update).toHaveBeenCalledWith(mockPendingOrder._id, {
      status: OrderStatus.CANCELLED
    });

    // Verify jobs were still cancelled
    expect(mockJobService.cancelJobsForOrder).toHaveBeenCalledWith(
      mockPendingOrder._id.toString(),
      testUserIdString
    );
  });

  
});
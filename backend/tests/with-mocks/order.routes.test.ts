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

describe('POST /api/order/quote - Get Quote (Mocked)', () => {
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

  test('should handle order creation validation errors', async () => {
    const response = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: 'invalid-id',
        volume: -1, // Invalid volume
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
        pickupTime: 'invalid-date',
        returnTime: '2025-11-15T10:00:00.000Z'
      })
      .expect(500);

    expect(mockOrderModel.create).not.toHaveBeenCalled();
  });

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

  // Input: valid order payload
  // Expected status code: 500
  // Expected behavior: surfaces model-layer failure when order creation throws
  // Mocked behavior: real mongoose create rejects via spy
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

  // Input: valid order with idempotency key
  // Expected status code: 500
  // Expected behavior: surfaces model-layer failure when findByIdempotencyKey throws
  // Mocked behavior: real mongoose findOne rejects via spy on order model
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
  });

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

  // Input: valid order with idempotency key
  // Expected status code: 500
  // Expected behavior: surfaces model-layer failure when findByIdempotencyKey throws
  // Mocked behavior: real mongoose findOne rejects via spy on order model
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

  // Test OrderMapper moverId branches through POST /api/order endpoint
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
});

describe('POST /api/order/create-return-Job - Create Return Job (Mocked)', () => {
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
    expect(response.body).toHaveProperty('refundAmount'); // Should have refund for early return
  });

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
    expect(response.body).toHaveProperty('lateFee'); // Should have late fee
  });

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
});

describe('GET /api/order/all-orders - Get All Orders (Mocked)', () => {
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

  // Input: authenticated request
  // Expected status code: 500
  // Expected behavior: propagates model-layer failure fetching orders
  // Mocked behavior: real mongoose find rejects when getAllOrders delegates to actual model
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

  // Test OrderMapper moverId branches through GET /api/order/all-orders endpoint
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
    // Verify moverId is mapped correctly (not undefined)
    expect(response.body.orders[0]).toHaveProperty('moverId', moverId.toString());
    expect(response.body.orders[0].status).toBe(OrderStatus.ACCEPTED);
  });

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
    // Verify moverId is undefined when not assigned
    expect(response.body.orders[0].moverId).toBeUndefined();
    expect(response.body.orders[0].status).toBe(OrderStatus.PENDING);
  });

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
    
    // First order should have moverId
    expect(response.body.orders[0]).toHaveProperty('moverId', moverId1.toString());
    expect(response.body.orders[0].status).toBe(OrderStatus.PICKED_UP);
    
    // Second order should not have moverId (undefined)
    expect(response.body.orders[1].moverId).toBeUndefined();
    expect(response.body.orders[1].status).toBe(OrderStatus.PENDING);
  });
});

describe('GET /api/order/active-order - Get Active Order (Mocked)', () => {
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

  test('should return null when no active order exists', async () => {
    mockOrderModel.findActiveOrder.mockResolvedValue(null);

    const response = await request(app)
      .get('/api/order/active-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(404);

    expect(response.body).toBeNull();
  });

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
  // Input: authenticated request for active order
  // Expected status code: 500
  // Expected behavior: surfaces error when underlying findActiveOrder fails
  // Mocked behavior: real mongoose findOne.sort throws when delegated
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

  // Input: authenticated request for active order
  // Expected status code: 500
  // Expected behavior: exposes failure when fetching order by id during processing
  // Mocked behavior: real mongoose findById rejects when invoked inside mock path
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

describe('DELETE /api/order/cancel-order - Cancel Order (Mocked)', () => {
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

  test('should handle no active order to cancel', async () => {
    mockOrderModel.findActiveOrder.mockResolvedValue(null);

    const response = await request(app)
      .delete('/api/order/cancel-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('success', false);
    expect(response.body).toHaveProperty('message', 'Order not found');
  });

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
      // Call the real payment service with the specific amount
      return actualPaymentService.paymentService.refundPayment(paymentIntentId, 75.0);
    });
    
    // Mock stripeService to return success with partial refund amount
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

  
});
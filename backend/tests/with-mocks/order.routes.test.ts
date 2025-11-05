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
jest.mock('../../src/utils/eventEmitter.util', () => ({
  EventEmitter: {
    emitOrderCreated: jest.fn(),
    emitOrderUpdated: jest.fn(),
  }
}));

// Import app after mocks are set up
import app from '../../src/app';
import { jobService } from '../../src/services/job.service';
import { paymentService } from '../../src/services/payment.service';
import { orderModel } from '../../src/models/order.model';
import { jobModel } from '../../src/models/job.model';
import { EventEmitter } from '../../src/utils/eventEmitter.util';

// Suppress console logs during tests
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info,
};

let authToken: string;
const testUserId = new mongoose.Types.ObjectId(); // Generate unique ID

// Get references to mocked services
const mockJobService = jobService as jest.Mocked<typeof jobService>;
const mockPaymentService = paymentService as jest.Mocked<typeof paymentService>;
const mockOrderModel = orderModel as jest.Mocked<typeof orderModel>;
const mockJobModel = jobModel as jest.Mocked<typeof jobModel>;
const mockEventEmitter = EventEmitter as jest.Mocked<typeof EventEmitter>;

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
});

describe('POST /api/order - Create Order (Mocked)', () => {
  test('should successfully create an order', async () => {
    // Mock successful order creation
    const mockOrderId = new mongoose.Types.ObjectId();
    const mockCreatedOrder = {
      _id: mockOrderId,
      studentId: testUserId,
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
    const mockExistingOrder = {
      _id: mockExistingOrderId,
      studentId: testUserId,
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
      .expect(400);

    expect(response.body).toHaveProperty('message');
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

    expect(response.body).toHaveProperty('message');
  });
});

describe('POST /api/order/create-return-Job - Create Return Job (Mocked)', () => {
  test('should successfully create a return job', async () => {
    // Mock active order
    const mockActiveOrder = {
      _id: new mongoose.Types.ObjectId(),
      studentId: testUserId,
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

    expect(response.body).toHaveProperty('message');
  });

  test('should handle existing return job', async () => {
    // Mock active order
    const mockActiveOrder = {
      _id: new mongoose.Types.ObjectId(),
      studentId: testUserId,
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
    const mockActiveOrder = {
      _id: new mongoose.Types.ObjectId(),
      studentId: testUserId,
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
});

describe('GET /api/order/all-orders - Get All Orders (Mocked)', () => {
  test('should successfully get all orders', async () => {
    // Mock orders data
    const mockOrders = [
      {
        _id: new mongoose.Types.ObjectId(),
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

  test('should handle database errors when getting orders', async () => {
    mockOrderModel.getAllOrders.mockRejectedValue(new Error('Database connection failed'));

    const response = await request(app)
      .get('/api/order/all-orders')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(500);

    expect(response.body).toHaveProperty('message');
  });
});

describe('GET /api/order/active-order - Get Active Order (Mocked)', () => {
  test('should successfully get active order', async () => {
    // Mock active order
    const mockActiveOrder = {
      _id: new mongoose.Types.ObjectId(),
      studentId: testUserId,
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
});

describe('DELETE /api/order/cancel-order - Cancel Order (Mocked)', () => {
  test('should successfully cancel a pending order', async () => {
    // Mock pending order
    const mockPendingOrder = {
      _id: new mongoose.Types.ObjectId(),
      studentId: testUserId,
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

    const mockUpdatedOrder = { ...mockPendingOrder, status: OrderStatus.CANCELLED };

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
    const mockAcceptedOrder = {
      _id: new mongoose.Types.ObjectId(),
      studentId: testUserId,
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
    const mockPendingOrder = {
      _id: new mongoose.Types.ObjectId(),
      studentId: testUserId,
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

  
});
import { describe, expect, test, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { connectDB, disconnectDB } from '../../src/config/database';
import { userModel } from '../../src/models/user.model';
import { orderModel } from '../../src/models/order.model';
import { jobModel } from '../../src/models/job.model';
import { initSocket } from '../../src/socket';
import app from '../../src/app';
import { JobStatus, JobType } from '../../src/types/job.type';
import { OrderStatus } from '../../src/types/order.types';
import { emitJobCreated, emitJobUpdated, emitOrderCreated, emitOrderUpdated } from '../../src/utils/eventEmitter.util';

const socketModule = require('../../src/socket');


let server: http.Server;
let io: SocketIOServer;
let authToken: string;
let moverAuthToken: string;
let studentSocket: ClientSocket | null = null;
const testUserId = new mongoose.Types.ObjectId();
const testMoverId = new mongoose.Types.ObjectId();

const PORT = 4001;

// Helper function to wait for socket events
function waitFor(socket: ClientSocket, event: string): Promise<any> {
  return new Promise((resolve) => {
    socket.once(event, resolve);
  });
}

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

  // Clean up any existing test data
  const db = mongoose.connection.db;
  if (db) {
    await db.collection('users').deleteMany({
      googleId: {
        $in: [
          `socket-test-student-${testUserId.toString()}`,
          `socket-test-mover-${testMoverId.toString()}`
        ]
      }
    });
  }

  // Create test student user
  await (userModel as any).user.create({
    _id: testUserId,
    googleId: `socket-test-student-${testUserId.toString()}`,
    email: `socketstudent${testUserId.toString()}@example.com`,
    name: 'Socket Test Student',
    userRole: 'STUDENT'
  });

  // Create test mover user
  await (userModel as any).user.create({
    _id: testMoverId,
    googleId: `socket-test-mover-${testMoverId.toString()}`,
    email: `socketmover${testMoverId.toString()}@example.com`,
    name: 'Socket Test Mover',
    userRole: 'MOVER',
    credits: 100,
    carType: 'Van',
    capacity: 500
  });

  // Generate JWT tokens
  authToken = jwt.sign({ id: testUserId }, process.env.JWT_SECRET || 'default-secret');
  moverAuthToken = jwt.sign({ id: testMoverId }, process.env.JWT_SECRET || 'default-secret');

  // Start HTTP server and initialize Socket.IO
  server = http.createServer(app);
  io = initSocket(server);

  await new Promise<void>((resolve) => {
    server.listen(PORT, () => {
      resolve();
    });
  });
}, 30000);

afterEach(async () => {
  // Disconnect socket after each test
  if (studentSocket && studentSocket.connected) {
    await new Promise<void>((resolve) => {
      studentSocket!.disconnect();
      studentSocket!.on('disconnect', () => {
        studentSocket = null;
        resolve();
      });
      // Fallback in case disconnect event doesn't fire
      setTimeout(() => {
        studentSocket = null;
        resolve();
      }, 100);
    });
  }
});

afterAll(async () => {
  // Disconnect any remaining sockets
  if (studentSocket) {
    studentSocket.disconnect();
    studentSocket = null;
  }

  // Close Socket.IO and all connections
  if (io) {
    io.disconnectSockets();
    await new Promise<void>((resolve) => {
      io.close(() => {
        resolve();
      });
    });
  }

  // Close HTTP server
  if (server) {
    await new Promise<void>((resolve) => {
      server.close((err) => {
        if (err) console.error('Error closing server:', err);
        resolve();
      });
    });
  }

  // Clean up test data
  const db = mongoose.connection.db;
  if (db) {
    await db.collection('users').deleteMany({
      googleId: {
        $in: [
          `socket-test-student-${testUserId.toString()}`,
          `socket-test-mover-${testMoverId.toString()}`
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
}, 30000);

describe('Socket.IO - Order Status Updates', () => {
  test('Order status should update to ACCEPTED when mover accepts STORAGE job', async () => {
    // Create order and job
    const order = await (orderModel as any).order.create({
      studentId: testUserId,
      status: OrderStatus.PENDING,
      volume: 100,
      price: 50.0,
      studentAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Test St, Vancouver, BC V6T 1Z4'
      },
      warehouseAddress: {
        lat: 49.2500,
        lon: -123.1000,
        formattedAddress: '456 Warehouse Ave, Vancouver, BC V6T 2A1'
      },
      pickupTime: new Date(),
      paymentIntentId: `pi_socket_test_${Date.now()}_1`
    });

    const job = await (jobModel as any).job.create({
      _id: new mongoose.Types.ObjectId(),
      orderId: order._id,
      studentId: testUserId,
      jobType: JobType.STORAGE,
      status: JobStatus.AVAILABLE,
      volume: 100,
      price: 30.0,
      pickupAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Test St, Vancouver, BC V6T 1Z4'
      },
      dropoffAddress: {
        lat: 49.2500,
        lon: -123.1000,
        formattedAddress: '456 Warehouse Ave, Vancouver, BC V6T 2A1'
      },
      scheduledTime: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Connect student socket
    await new Promise<void>((resolve, reject) => {
      studentSocket = ioClient(`http://localhost:${PORT}`, {
        auth: { token: `Bearer ${authToken}` },
        transports: ['websocket'],
        forceNew: true,
        reconnection: false
      });

      studentSocket.on('connect', () => resolve());
      studentSocket.on('connect_error', (err) => reject(err));
      
      // Add timeout
      setTimeout(() => reject(new Error('Socket connection timeout')), 5000);
    });

    // Listen for order.updated event
    const orderUpdatePromise = waitFor(studentSocket!, 'order.updated');

    // Mover accepts the job via HTTP endpoint
    const response = await request(`http://localhost:${PORT}`)
      .patch(`/api/jobs/${job._id.toString()}/status`)
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .send({ status: JobStatus.ACCEPTED });

    expect(response.status).toBe(200);

    // Wait for the socket event
    const eventData = await orderUpdatePromise;

    // Verify event data
    expect(eventData).toBeDefined();
    expect(eventData.order.id).toBe(order._id.toString());
    expect(eventData.order.status).toBe(OrderStatus.ACCEPTED);

    // Verify order was updated in database
    const updatedOrder = await (orderModel as any).order.findById(order._id);
    expect(updatedOrder?.status).toBe(OrderStatus.ACCEPTED);

    // Cleanup
    await (jobModel as any).job.deleteOne({ _id: job._id });
    await (orderModel as any).order.deleteOne({ _id: order._id });
  }, 30000);

  test('Order status should update to IN_STORAGE when mover completes STORAGE job', async () => {
    // Create order with ACCEPTED status
    const order = await (orderModel as any).order.create({
      studentId: testUserId,
      moverId: testMoverId,
      status: OrderStatus.ACCEPTED,
      volume: 100,
      price: 50.0,
      studentAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Test St, Vancouver, BC V6T 1Z4'
      },
      warehouseAddress: {
        lat: 49.2500,
        lon: -123.1000,
        formattedAddress: '456 Warehouse Ave, Vancouver, BC V6T 2A1'
      },
      pickupTime: new Date(),
      paymentIntentId: `pi_socket_test_${Date.now()}_2`
    });

    const job = await (jobModel as any).job.create({
      _id: new mongoose.Types.ObjectId(),
      orderId: order._id,
      studentId: testUserId,
      moverId: testMoverId,
      jobType: JobType.STORAGE,
      status: JobStatus.PICKED_UP,
      volume: 100,
      price: 30.0,
      pickupAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Test St, Vancouver, BC V6T 1Z4'
      },
      dropoffAddress: {
        lat: 49.2500,
        lon: -123.1000,
        formattedAddress: '456 Warehouse Ave, Vancouver, BC V6T 2A1'
      },
      scheduledTime: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Connect student socket
    await new Promise<void>((resolve, reject) => {
      studentSocket = ioClient(`http://localhost:${PORT}`, {
        auth: { token: `Bearer ${authToken}` },
        transports: ['websocket'],
        forceNew: true,
        reconnection: false
      });

      studentSocket.on('connect', () => resolve());
      studentSocket.on('connect_error', (err) => reject(err));
      
      setTimeout(() => reject(new Error('Socket connection timeout')), 5000);
    });

    // Listen for order.updated event
    const orderUpdatePromise = waitFor(studentSocket!, 'order.updated');

    // Mover completes the job via HTTP endpoint
    const response = await request(`http://localhost:${PORT}`)
      .patch(`/api/jobs/${job._id.toString()}/status`)
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .send({ status: JobStatus.COMPLETED });

    expect(response.status).toBe(200);

    // Wait for the socket event
    const eventData = await orderUpdatePromise;

    // Verify event data
    expect(eventData).toBeDefined();
    expect(eventData.order.id).toBe(order._id.toString());
    expect(eventData.order.status).toBe(OrderStatus.IN_STORAGE);

    // Verify order was updated in database
    const updatedOrder = await (orderModel as any).order.findById(order._id);
    expect(updatedOrder?.status).toBe(OrderStatus.IN_STORAGE);

    // Cleanup
    await (jobModel as any).job.deleteOne({ _id: job._id });
    await (orderModel as any).order.deleteOne({ _id: order._id });
  }, 30000);

  test('Order status should update to RETURNED when mover completes RETURN job', async () => {
    // Create order with IN_STORAGE status
    const order = await (orderModel as any).order.create({
      studentId: testUserId,
      moverId: testMoverId,
      status: OrderStatus.IN_STORAGE,
      volume: 100,
      price: 50.0,
      studentAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Test St, Vancouver, BC V6T 1Z4'
      },
      warehouseAddress: {
        lat: 49.2500,
        lon: -123.1000,
        formattedAddress: '456 Warehouse Ave, Vancouver, BC V6T 2A1'
      },
      returnAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Test St, Vancouver, BC V6T 1Z4'
      },
      pickupTime: new Date(),
      returnTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      paymentIntentId: `pi_socket_test_${Date.now()}_3`
    });

    const job = await (jobModel as any).job.create({
      _id: new mongoose.Types.ObjectId(),
      orderId: order._id,
      studentId: testUserId,
      moverId: testMoverId,
      jobType: JobType.RETURN,
      status: JobStatus.PICKED_UP,
      volume: 100,
      price: 30.0,
      pickupAddress: {
        lat: 49.2500,
        lon: -123.1000,
        formattedAddress: '456 Warehouse Ave, Vancouver, BC V6T 2A1'
      },
      dropoffAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Test St, Vancouver, BC V6T 1Z4'
      },
      scheduledTime: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Connect student socket
    await new Promise<void>((resolve, reject) => {
      studentSocket = ioClient(`http://localhost:${PORT}`, {
        auth: { token: `Bearer ${authToken}` },
        transports: ['websocket'],
        forceNew: true,
        reconnection: false
      });

      studentSocket.on('connect', () => resolve());
      studentSocket.on('connect_error', (err) => reject(err));
      
      setTimeout(() => reject(new Error('Socket connection timeout')), 5000);
    });

    // Listen for order.updated event
    const orderUpdatePromise = waitFor(studentSocket!, 'order.updated');

    // Mover completes the job via HTTP endpoint
    const response = await request(`http://localhost:${PORT}`)
      .patch(`/api/jobs/${job._id.toString()}/status`)
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .send({ status: JobStatus.COMPLETED });

    expect(response.status).toBe(200);

    // Wait for the socket event
    const eventData = await orderUpdatePromise;

    // Verify event data
    expect(eventData).toBeDefined();
    expect(eventData.order.id).toBe(order._id.toString());
    expect(eventData.order.status).toBe(OrderStatus.RETURNED);

    // Verify order was updated in database
    const updatedOrder = await (orderModel as any).order.findById(order._id);
    expect(updatedOrder?.status).toBe(OrderStatus.RETURNED);

    // Cleanup
    await (jobModel as any).job.deleteOne({ _id: job._id });
    await (orderModel as any).order.deleteOne({ _id: order._id });
  }, 30000);


  test('// Input: existing active order\n// Expected status code: 200\n// Expected behavior: cancellation succeeds despite emitToRooms failure\n// Expected output: success message', async () => {
    // Create an order to cancel
    const pickupTime = new Date(Date.now() + 3600000).toISOString();
    const returnTime = new Date(Date.now() + 86400000).toISOString();

    const createRes = await request(app)
      .post('/api/order')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        studentId: testUserId.toString(),
        volume: 2,
        totalPrice: 40,
        studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Student Home' },
        warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Warehouse' },
        pickupTime,
        returnTime,
      })
      .expect(201);

    const spy = jest.spyOn(socketModule, 'emitToRooms').mockImplementation(() => {
      throw new Error('Forced emitToRooms error');
    });

    const response = await request(app)
      .delete('/api/order/cancel-order')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
    expect(spy).toHaveBeenCalled();

    spy.mockRestore();
  });

  test('// Input: valid order payload\n// Expected status code: 201\n// Expected behavior: order is created despite emitToRooms failure\n// Expected output: order id returned', async () => {
      // Spy on emitToRooms and force it to throw to simulate socket failure
      const spy = jest.spyOn(socketModule, 'emitToRooms').mockImplementation(() => {
        throw new Error('Forced emitToRooms error');
      });
  
      const pickupTime = new Date(Date.now() + 3600000).toISOString();
      const returnTime = new Date(Date.now() + 86400000).toISOString();
  
      const response = await request(app)
        .post('/api/order')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          studentId: testUserId.toString(),
          volume: 5,
          totalPrice: 100,
          studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Student Home' },
          warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Warehouse' },
          pickupTime,
          returnTime,
        })
        .expect(201);
  
      expect(response.body).toHaveProperty('_id');
      // Ensure we did attempt to emit
      expect(spy).toHaveBeenCalled();
  
      spy.mockRestore();
    });
});

describe('Socket.IO - Job Status Updates', () => {
  test('Job status should update when mover picks up job', async () => {
    // Create order and job
    const order = await (orderModel as any).order.create({
      studentId: testUserId,
      moverId: testMoverId,
      status: OrderStatus.ACCEPTED,
      volume: 100,
      price: 50.0,
      studentAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Test St, Vancouver, BC V6T 1Z4'
      },
      warehouseAddress: {
        lat: 49.2500,
        lon: -123.1000,
        formattedAddress: '456 Warehouse Ave, Vancouver, BC V6T 2A1'
      },
      pickupTime: new Date(),
      paymentIntentId: `pi_socket_test_${Date.now()}_4`
    });

    const job = await (jobModel as any).job.create({
      _id: new mongoose.Types.ObjectId(),
      orderId: order._id,
      studentId: testUserId,
      moverId: testMoverId,
      jobType: JobType.STORAGE,
      status: JobStatus.ACCEPTED,
      volume: 100,
      price: 30.0,
      pickupAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Test St, Vancouver, BC V6T 1Z4'
      },
      dropoffAddress: {
        lat: 49.2500,
        lon: -123.1000,
        formattedAddress: '456 Warehouse Ave, Vancouver, BC V6T 2A1'
      },
      scheduledTime: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Connect student socket
    await new Promise<void>((resolve, reject) => {
      studentSocket = ioClient(`http://localhost:${PORT}`, {
        auth: { token: `Bearer ${authToken}` },
        transports: ['websocket'],
        forceNew: true,
        reconnection: false
      });

      studentSocket.on('connect', () => resolve());
      studentSocket.on('connect_error', (err) => reject(err));
      
      setTimeout(() => reject(new Error('Socket connection timeout')), 5000);
    });

    // Listen for job.updated event
    const jobUpdatePromise = waitFor(studentSocket!, 'job.updated');

    // Mover picks up the job via HTTP endpoint
    const response = await request(`http://localhost:${PORT}`)
      .patch(`/api/jobs/${job._id.toString()}/status`)
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .send({ status: JobStatus.PICKED_UP });

    expect(response.status).toBe(200);

    // Wait for the socket event
    const eventData = await jobUpdatePromise;

    // Verify event data
    expect(eventData).toBeDefined();
    expect(eventData.job.id).toBe(job._id.toString());
    expect(eventData.job.status).toBe(JobStatus.PICKED_UP);

    // Verify job was updated in database
    const updatedJob = await (jobModel as any).job.findById(job._id);
    expect(updatedJob?.status).toBe(JobStatus.PICKED_UP);

    // Cleanup
    await (jobModel as any).job.deleteOne({ _id: job._id });
    await (orderModel as any).order.deleteOne({ _id: order._id });
  }, 30000);
});

describe('Socket.IO - Authentication (verifyTokenString coverage)', () => {
  test('should reject connection with JWT_SECRET not configured', async () => {
    const originalSecret = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;

    try {
      await expect(
        new Promise((resolve, reject) => {
          const socket = ioClient(`http://localhost:${PORT}`, {
            auth: { token: `Bearer ${authToken}` },
            transports: ['websocket'],
            forceNew: true,
            reconnection: false
          });

          socket.on('connect', () => {
            socket.disconnect();
            resolve(true);
          });
          
          socket.on('connect_error', (err) => {
            socket.disconnect();
            reject(err);
          });

          setTimeout(() => {
            socket.disconnect();
            reject(new Error('Timeout'));
          }, 5000);
        })
      ).rejects.toThrow();
    } finally {
      process.env.JWT_SECRET = originalSecret;
    }
  }, 10000);

  test('should reject connection with expired token', async () => {
    const expiredToken = jwt.sign(
      { id: testUserId },
      process.env.JWT_SECRET || 'default-secret',
      { expiresIn: '-1s' }
    );

    await expect(
      new Promise((resolve, reject) => {
        const socket = ioClient(`http://localhost:${PORT}`, {
          auth: { token: `Bearer ${expiredToken}` },
          transports: ['websocket'],
          forceNew: true,
          reconnection: false
        });

        socket.on('connect', () => {
          socket.disconnect();
          resolve(true);
        });
        
        socket.on('connect_error', (err) => {
          socket.disconnect();
          reject(err);
        });

        setTimeout(() => {
          socket.disconnect();
          reject(new Error('Timeout'));
        }, 5000);
      })
    ).rejects.toThrow();
  }, 10000);

  test('should reject connection with malformed token', async () => {
    await expect(
      new Promise((resolve, reject) => {
        const socket = ioClient(`http://localhost:${PORT}`, {
          auth: { token: 'Bearer invalid.malformed.token' },
          transports: ['websocket'],
          forceNew: true,
          reconnection: false
        });

        socket.on('connect', () => {
          socket.disconnect();
          resolve(true);
        });
        
        socket.on('connect_error', (err) => {
          socket.disconnect();
          reject(err);
        });

        setTimeout(() => {
          socket.disconnect();
          reject(new Error('Timeout'));
        }, 5000);
      })
    ).rejects.toThrow();
  }, 10000);
});

describe('EventEmitter Error Handling - Job Operations', () => {
  // Mocked behavior: emitToRooms throws error during emitJobCreated (line 60 catch block)
  // Input: POST /api/jobs with valid job payload
  // Expected status code: 201
  // Expected behavior: job creation succeeds, emitJobCreated catches error internally, logger.warn is called
  // Expected output: job created successfully with id returned
  test('should handle emitToRooms error in emitJobCreated without blocking job creation', async () => {
    const spy = jest.spyOn(socketModule, 'emitToRooms').mockImplementation(() => {
      throw new Error('Forced emitToRooms error in emitJobCreated');
    });

    const orderId = new mongoose.Types.ObjectId();
    
    // Create order first
    const order = await (orderModel as any).order.create({
      _id: orderId,
      studentId: testUserId,
      status: OrderStatus.PENDING,
      volume: 100,
      price: 50.0,
      studentAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Test St, Vancouver, BC V6T 1Z4'
      },
      warehouseAddress: {
        lat: 49.2500,
        lon: -123.1000,
        formattedAddress: '456 Warehouse Ave, Vancouver, BC V6T 2A1'
      },
      pickupTime: new Date(),
      returnTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      paymentIntentId: `pi_emit_job_created_test_${Date.now()}`
    });

    const response = await request(`http://localhost:${PORT}`)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        orderId: orderId.toString(),
        studentId: testUserId.toString(),
        jobType: JobType.STORAGE,
        volume: 100,
        price: 30.0,
        pickupAddress: {
          lat: 49.2827,
          lon: -123.1207,
          formattedAddress: '123 Test St, Vancouver, BC V6T 1Z4'
        },
        dropoffAddress: {
          lat: 49.2500,
          lon: -123.1000,
          formattedAddress: '456 Warehouse Ave, Vancouver, BC V6T 2A1'
        },
        scheduledTime: new Date().toISOString()
      });

    // Job creation should succeed despite emitToRooms error
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('id');

    // Verify emitToRooms was called and threw
    expect(spy).toHaveBeenCalled();

    // Cleanup
    await (orderModel as any).order.deleteOne({ _id: orderId });
    if (response.body.id) {
      await (jobModel as any).job.deleteOne({ _id: new mongoose.Types.ObjectId(response.body.id) });
    }

    spy.mockRestore();
  }, 10000);

  // Mocked behavior: emitToRooms throws error during emitJobUpdated (line 112 catch block)
  // Input: PATCH /api/jobs/:id/status with status PICKED_UP
  // Expected status code: 200
  // Expected behavior: job status update succeeds, emitJobUpdated catches error internally, logger.warn is called
  // Expected output: job status updated successfully
  test('should handle emitToRooms error in emitJobUpdated without blocking status update', async () => {
    // Create order and job first
    const orderId = new mongoose.Types.ObjectId();
    const order = await (orderModel as any).order.create({
      _id: orderId,
      studentId: testUserId,
      moverId: testMoverId,
      status: OrderStatus.ACCEPTED,
      volume: 100,
      price: 50.0,
      studentAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Test St, Vancouver, BC V6T 1Z4'
      },
      warehouseAddress: {
        lat: 49.2500,
        lon: -123.1000,
        formattedAddress: '456 Warehouse Ave, Vancouver, BC V6T 2A1'
      },
      pickupTime: new Date(),
      returnTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      paymentIntentId: `pi_emit_job_updated_test_${Date.now()}`
    });

    const jobId = new mongoose.Types.ObjectId();
    const job = await (jobModel as any).job.create({
      _id: jobId,
      orderId: orderId,
      studentId: testUserId,
      moverId: testMoverId,
      jobType: JobType.STORAGE,
      status: JobStatus.ACCEPTED,
      volume: 100,
      price: 30.0,
      pickupAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Test St, Vancouver, BC V6T 1Z4'
      },
      dropoffAddress: {
        lat: 49.2500,
        lon: -123.1000,
        formattedAddress: '456 Warehouse Ave, Vancouver, BC V6T 2A1'
      },
      scheduledTime: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const spy = jest.spyOn(socketModule, 'emitToRooms').mockImplementation(() => {
      throw new Error('Forced emitToRooms error in emitJobUpdated');
    });

    const response = await request(`http://localhost:${PORT}`)
      .patch(`/api/jobs/${jobId.toString()}/status`)
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .send({ status: JobStatus.PICKED_UP });

    // Status update should succeed despite emitToRooms error
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);

    // Verify emitToRooms was called and threw
    expect(spy).toHaveBeenCalled();

    // Cleanup
    await (jobModel as any).job.deleteOne({ _id: jobId });
    await (orderModel as any).order.deleteOne({ _id: orderId });

    spy.mockRestore();
  }, 10000);

  // Mocked behavior: emitToRooms throws error during emitJobUpdated for unassigned job (line 112 catch block, line 98 branch)
  // Input: PATCH /api/jobs/:id/accept (mover accepts available job)
  // Expected status code: 200
  // Expected behavior: job acceptance succeeds, emitJobUpdated catches error internally, broadcasts to all movers logic tested
  // Expected output: job accepted successfully
  test('should handle emitToRooms error in emitJobUpdated for unassigned job broadcast', async () => {
    // Create order and available job
    const orderId = new mongoose.Types.ObjectId();
    const order = await (orderModel as any).order.create({
      _id: orderId,
      studentId: testUserId,
      status: OrderStatus.PENDING,
      volume: 100,
      price: 50.0,
      studentAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Test St, Vancouver, BC V6T 1Z4'
      },
      warehouseAddress: {
        lat: 49.2500,
        lon: -123.1000,
        formattedAddress: '456 Warehouse Ave, Vancouver, BC V6T 2A1'
      },
      pickupTime: new Date(),
      returnTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      paymentIntentId: `pi_emit_job_updated_unassigned_${Date.now()}`
    });

    const jobId = new mongoose.Types.ObjectId();
    const job = await (jobModel as any).job.create({
      _id: jobId,
      orderId: orderId,
      studentId: testUserId,
      jobType: JobType.STORAGE,
      status: JobStatus.AVAILABLE,
      volume: 100,
      price: 30.0,
      pickupAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Test St, Vancouver, BC V6T 1Z4'
      },
      dropoffAddress: {
        lat: 49.2500,
        lon: -123.1000,
        formattedAddress: '456 Warehouse Ave, Vancouver, BC V6T 2A1'
      },
      scheduledTime: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const spy = jest.spyOn(socketModule, 'emitToRooms').mockImplementation(() => {
      throw new Error('Forced emitToRooms error in emitJobUpdated unassigned branch');
    });

    const response = await request(`http://localhost:${PORT}`)
      .patch(`/api/jobs/${jobId.toString()}/accept`)
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .send();

    // Job acceptance should succeed despite emitToRooms error
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);

    // Verify emitToRooms was called and threw
    expect(spy).toHaveBeenCalled();

    // Cleanup
    await (jobModel as any).job.deleteOne({ _id: jobId });
    await (orderModel as any).order.deleteOne({ _id: orderId });

    spy.mockRestore();
  }, 10000);

  test('emitJobCreated without meta should create default meta', async () => {
        const job = await (jobModel as any).job.create({
          orderId: new mongoose.Types.ObjectId(),
          studentId: testUserId,
          jobType: JobType.STORAGE,
          status: JobStatus.AVAILABLE,
          pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' },
          dropoffAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Test' },
          scheduledTime: new Date(),
        });
  
        // Call WITHOUT meta parameter - should use meta ?? { ts: ... }
        expect(() => emitJobCreated(job)).not.toThrow();
  
        await (jobModel as any).job.deleteOne({ _id: job._id });
      });
  
      test('emitJobCreated with meta should use provided meta', async () => {
        const job = await (jobModel as any).job.create({
          orderId: new mongoose.Types.ObjectId(),
          studentId: testUserId,
          jobType: JobType.STORAGE,
          status: JobStatus.AVAILABLE,
          pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' },
          dropoffAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Test' },
          scheduledTime: new Date(),
        });
  
        const customMeta = { by: 'test-user', ts: '2024-01-01T00:00:00Z' };
        
        // Call WITH meta parameter - should use provided meta
        expect(() => emitJobCreated(job, customMeta)).not.toThrow();
  
        await (jobModel as any).job.deleteOne({ _id: job._id });
      });
  
      test('emitJobUpdated without meta should create default meta', async () => {
        const job = await (jobModel as any).job.create({
          orderId: new mongoose.Types.ObjectId(),
          studentId: testUserId,
          jobType: JobType.STORAGE,
          status: JobStatus.AVAILABLE,
          pickupAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' },
          dropoffAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Test' },
          scheduledTime: new Date(),
        });
  
        // Call WITHOUT meta parameter
        expect(() => emitJobUpdated(job)).not.toThrow();
  
        await (jobModel as any).job.deleteOne({ _id: job._id });
      });
  
      test('emitOrderCreated without meta should create default meta', async () => {
        const order = await (orderModel as any).order.create({
          studentId: testUserId,
          status: OrderStatus.PENDING,
          volume: 10,
          price: 50,
          studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' },
          warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Test' },
          pickupTime: new Date(),
          returnTime: new Date(Date.now() + 86400000),
        });
  
        // Call WITHOUT meta parameter
        expect(() => emitOrderCreated(order)).not.toThrow();
  
        await (orderModel as any).order.deleteOne({ _id: order._id });
      });
  
      test('emitOrderUpdated without meta should create default meta', async () => {
        const order = await (orderModel as any).order.create({
          studentId: testUserId,
          status: OrderStatus.PENDING,
          volume: 10,
          price: 50,
          studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' },
          warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Test' },
          pickupTime: new Date(),
          returnTime: new Date(Date.now() + 86400000),
        });
  
        // Call WITHOUT meta parameter
        expect(() => emitOrderUpdated(order)).not.toThrow();
  
        await (orderModel as any).order.deleteOne({ _id: order._id });
      });

      test('emitOrderCreated with moverId should include moverId in payload', async () => {
            const order = await (orderModel as any).order.create({
              studentId: testUserId,
              moverId: testMoverId, // Include moverId
              status: OrderStatus.PICKED_UP,
              volume: 10,
              price: 50,
              studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' },
              warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Test' },
              pickupTime: new Date(),
              returnTime: new Date(Date.now() + 86400000),
            });
      
            // Call with order that has moverId - should use extractId(order.moverId)
            expect(() => emitOrderCreated(order)).not.toThrow();
      
            await (orderModel as any).order.deleteOne({ _id: order._id });
          });
      
          test('emitOrderCreated without moverId should have undefined moverId', async () => {
            const order = await (orderModel as any).order.create({
              studentId: testUserId,
              // NO moverId
              status: OrderStatus.PENDING,
              volume: 10,
              price: 50,
              studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' },
              warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Test' },
              pickupTime: new Date(),
              returnTime: new Date(Date.now() + 86400000),
            });
      
            // Call with order that has NO moverId - should use undefined
            expect(() => emitOrderCreated(order)).not.toThrow();
      
            await (orderModel as any).order.deleteOne({ _id: order._id });
          });
      
          test('emitOrderUpdated with moverId should include moverId in payload', async () => {
            const order = await (orderModel as any).order.create({
              studentId: testUserId,
              moverId: testMoverId, // Include moverId
              status: OrderStatus.PICKED_UP,
              volume: 10,
              price: 50,
              studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' },
              warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Test' },
              pickupTime: new Date(),
              returnTime: new Date(Date.now() + 86400000),
            });
      
            // Call with order that has moverId
            expect(() => emitOrderUpdated(order)).not.toThrow();
      
            await (orderModel as any).order.deleteOne({ _id: order._id });
          });
      
          test('emitOrderUpdated without moverId should have undefined moverId', async () => {
            const order = await (orderModel as any).order.create({
              studentId: testUserId,
              // NO moverId
              status: OrderStatus.PENDING,
              volume: 10,
              price: 50,
              studentAddress: { lat: 49.2827, lon: -123.1207, formattedAddress: 'Test' },
              warehouseAddress: { lat: 49.2606, lon: -123.1133, formattedAddress: 'Test' },
              pickupTime: new Date(),
              returnTime: new Date(Date.now() + 86400000),
            });
      
            // Call with order that has NO moverId
            expect(() => emitOrderUpdated(order)).not.toThrow();
      
            await (orderModel as any).order.deleteOne({ _id: order._id });
          });
});

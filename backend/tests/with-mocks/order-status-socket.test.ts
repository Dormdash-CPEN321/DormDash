import { describe, expect, test, beforeAll, afterAll, jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import http from 'http';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { connectDB, disconnectDB } from '../../src/config/database';
import { userModel } from '../../src/models/user.model';
import { orderModel } from '../../src/models/order.model';
import { jobModel } from '../../src/models/job.model';
import { initSocket, getIo } from '../../src/socket';
import app from '../../src/app';
import { JobStatus, JobType } from '../../src/types/job.type';
import { OrderStatus } from '../../src/types/order.types';

let server: http.Server;
let authToken: string;
let moverAuthToken: string;
let clientSocket: ClientSocket | undefined;
let moverClientSocket: ClientSocket | undefined;
const testUserId = new mongoose.Types.ObjectId();
const testMoverId = new mongoose.Types.ObjectId();
const testOrderId = new mongoose.Types.ObjectId();
const testJobId = new mongoose.Types.ObjectId();
let db: any;

const PORT = 4001; // Use different port to avoid conflicts

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
  db = mongoose.connection.db;
  if (db) {
    await db.collection('users').deleteMany({
      googleId: {
        $in: [
          `socket-test-student-${testUserId.toString()}`,
          `socket-test-mover-${testMoverId.toString()}`
        ]
      }
    });
    await db.collection('orders').deleteMany({
      _id: testOrderId
    });
    await db.collection('jobs').deleteMany({
      _id: testJobId
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
  initSocket(server);
  
  await new Promise<void>((resolve) => {
    server.listen(PORT, () => {
      resolve();
    });
  });

  // Wait a bit for server to fully initialize
  await new Promise(resolve => setTimeout(resolve, 100));
});

afterAll(async () => {
  // Disconnect client sockets
  if (clientSocket?.connected) {
    clientSocket.disconnect();
  }
  if (moverClientSocket?.connected) {
    moverClientSocket.disconnect();
  }

  // Wait for disconnection
  await new Promise(resolve => setTimeout(resolve, 100));

  // Close Socket.IO server
  const io = getIo();
  await new Promise<void>((resolve) => {
    io.close(() => {
      resolve();
    });
  });

  // Close HTTP server
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });

  // Clean up test data
  db = mongoose.connection.db;
  if (db) {
    await db.collection('users').deleteMany({
      googleId: {
        $in: [
          `socket-test-student-${testUserId.toString()}`,
          `socket-test-mover-${testMoverId.toString()}`
        ]
      }
    });
    await db.collection('orders').deleteMany({
      _id: testOrderId
    });
    await db.collection('jobs').deleteMany({
      _id: testJobId
    });
  }

  await disconnectDB();

  // Restore console
  console.log = originalConsole.log;
  console.warn = originalConsole.warn;
  console.info = originalConsole.info;
  console.error = originalConsole.error;
});

/**
 * Test suite for orderService.updateOrderStatus (lines 410-443)
 * 
 * These tests set up Socket.IO connections and trigger updateOrderStatus by:
 * 1. Creating orders and jobs in the database
 * 2. Updating job status via the PATCH /api/jobs/:id/status endpoint
 * 3. This triggers jobService which calls orderService.updateOrderStatus
 * 4. updateOrderStatus emits socket events which we listen for
 * 5. We verify the order status was updated correctly in the database
 * 
 * Coverage achieved:
 * - Lines 410-443: updateOrderStatus method (100%)
 * - Line 415: Convert orderId to ObjectId
 * - Line 419: Call orderModel.update
 * - Line 421-423: Handle null order (order not found)
 * - Line 426-430: Emit order.updated event
 * - Line 432-437: Log success
 * - Line 439-442: Error handling and logging
 */
describe('Order Status Update via Socket.IO - orderService.updateOrderStatus (lines 410-443)', () => {
  test('should trigger updateOrderStatus when STORAGE job status changes from PENDING to ACCEPTED', async () => {
    // Create a unique order for this test
    const uniqueOrderId = new mongoose.Types.ObjectId();
    const uniqueJobId = new mongoose.Types.ObjectId();
    const uniqueStudentId = testUserId;

    // Create order in database
    await (orderModel as any).order.create({
      _id: uniqueOrderId,
      studentId: uniqueStudentId,
      status: OrderStatus.PENDING,
      volume: 100,
      price: 50.0,
      studentAddress: {
        street: '123 Test St',
        city: 'Vancouver',
        province: 'BC',
        postalCode: 'V6T 1Z4',
        country: 'Canada',
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Test St, Vancouver, BC V6T 1Z4'
      },
      warehouseAddress: {
        street: '456 Warehouse Ave',
        city: 'Vancouver',
        province: 'BC',
        postalCode: 'V6T 2A1',
        country: 'Canada',
        lat: 49.2500,
        lon: -123.1000,
        formattedAddress: '456 Warehouse Ave, Vancouver, BC V6T 2A1'
      },
      returnAddress: {
        street: '123 Test St',
        city: 'Vancouver',
        province: 'BC',
        postalCode: 'V6T 1Z4',
        country: 'Canada',
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Test St, Vancouver, BC V6T 1Z4'
      },
      pickupTime: new Date().toISOString(),
      returnTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    // Create STORAGE job in database
    await (jobModel as any).job.create({
      _id: uniqueJobId,
      orderId: uniqueOrderId,
      studentId: uniqueStudentId,
      jobType: JobType.STORAGE,
      status: JobStatus.AVAILABLE,
      volume: 100,
      price: 30.0,
      pickupAddress: {
        street: '123 Test St',
        city: 'Vancouver',
        province: 'BC',
        postalCode: 'V6T 1Z4',
        country: 'Canada',
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Test St, Vancouver, BC V6T 1Z4'
      },
      dropoffAddress: {
        street: '456 Warehouse Ave',
        city: 'Vancouver',
        province: 'BC',
        postalCode: 'V6T 2A1',
        country: 'Canada',
        lat: 49.2500,
        lon: -123.1000,
        formattedAddress: '456 Warehouse Ave, Vancouver, BC V6T 2A1'
      },
      scheduledTime: new Date().toISOString(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Set up socket client for student
    clientSocket = ioClient(`http://localhost:${PORT}`, {
      auth: { token: `Bearer ${authToken}` },
      transports: ['websocket'],
    });

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      if (!clientSocket) {
        reject(new Error('Client socket not initialized'));
        return;
      }
      const timeout = setTimeout(() => reject(new Error('Socket connection timeout')), 5000);
      clientSocket.on('connect', () => {
        clearTimeout(timeout);
        resolve();
      });
      clientSocket.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Set up listener for order.updated event
    const orderUpdatedPromise = new Promise<any>((resolve) => {
      if (clientSocket) {
        clientSocket.on('order.updated', (data) => {
          resolve(data);
        });
      }
    });

    // Update job status via API endpoint - this should trigger orderService.updateOrderStatus
    const response = await request(app)
      .patch(`/api/jobs/${uniqueJobId.toString()}/status`)
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .send({
        status: JobStatus.ACCEPTED,
        moverId: testMoverId.toString()
      });

    expect(response.status).toBe(200);

    // Wait for socket event (with timeout)
    const orderUpdatedEvent = await Promise.race([
      orderUpdatedPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout waiting for order.updated event')), 3000)
      )
    ]);

    // Verify event payload
    expect(orderUpdatedEvent).toBeDefined();
    expect(orderUpdatedEvent.event).toBe('order.updated');
    expect(orderUpdatedEvent.order).toBeDefined();
    expect(orderUpdatedEvent.order.id).toBe(uniqueOrderId.toString());
    expect(orderUpdatedEvent.order.status).toBe(OrderStatus.ACCEPTED);

    // Verify order was updated in database
    const updatedOrder = await orderModel.findById(uniqueOrderId);
    expect(updatedOrder).not.toBeNull();
    expect(updatedOrder?.status).toBe(OrderStatus.ACCEPTED);

    // Cleanup
    clientSocket.disconnect();
    await db.collection('orders').deleteOne({ _id: uniqueOrderId });
    await db.collection('jobs').deleteOne({ _id: uniqueJobId });
  }, 10000);

  test('should trigger updateOrderStatus when STORAGE job status changes to COMPLETED', async () => {
    // Create a unique order for this test
    const uniqueOrderId = new mongoose.Types.ObjectId();
    const uniqueJobId = new mongoose.Types.ObjectId();
    const uniqueStudentId = testUserId;

    // Create order with ACCEPTED status
    await (orderModel as any).order.create({
      _id: uniqueOrderId,
      studentId: uniqueStudentId,
      moverId: testMoverId,
      status: OrderStatus.ACCEPTED,
      volume: 150,
      price: 75.0,
      studentAddress: {
        street: '789 Student Rd',
        city: 'Vancouver',
        province: 'BC',
        postalCode: 'V6T 1Z5',
        country: 'Canada',
        lat: 49.2800,
        lon: -123.1200,
        formattedAddress: '789 Student Rd, Vancouver, BC V6T 1Z5'
      },
      warehouseAddress: {
        street: '456 Warehouse Ave',
        city: 'Vancouver',
        province: 'BC',
        postalCode: 'V6T 2A1',
        country: 'Canada',
        lat: 49.2500,
        lon: -123.1000,
        formattedAddress: '456 Warehouse Ave, Vancouver, BC V6T 2A1'
      },
      returnAddress: {
        street: '789 Student Rd',
        city: 'Vancouver',
        province: 'BC',
        postalCode: 'V6T 1Z5',
        country: 'Canada',
        lat: 49.2800,
        lon: -123.1200,
        formattedAddress: '789 Student Rd, Vancouver, BC V6T 1Z5'
      },
      pickupTime: new Date().toISOString(),
      returnTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    // Create STORAGE job with PICKED_UP status
    await (jobModel as any).job.create({
      _id: uniqueJobId,
      orderId: uniqueOrderId,
      studentId: uniqueStudentId,
      moverId: testMoverId,
      jobType: JobType.STORAGE,
      status: JobStatus.PICKED_UP,
      volume: 150,
      price: 45.0,
      pickupAddress: {
        street: '789 Student Rd',
        city: 'Vancouver',
        province: 'BC',
        postalCode: 'V6T 1Z5',
        country: 'Canada',
        lat: 49.2800,
        lon: -123.1200,
        formattedAddress: '789 Student Rd, Vancouver, BC V6T 1Z5'
      },
      dropoffAddress: {
        street: '456 Warehouse Ave',
        city: 'Vancouver',
        province: 'BC',
        postalCode: 'V6T 2A1',
        country: 'Canada',
        lat: 49.2500,
        lon: -123.1000,
        formattedAddress: '456 Warehouse Ave, Vancouver, BC V6T 2A1'
      },
      scheduledTime: new Date().toISOString(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Set up socket client for student
    clientSocket = ioClient(`http://localhost:${PORT}`, {
      auth: { token: `Bearer ${authToken}` },
      transports: ['websocket'],
    });

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      if (!clientSocket) {
        reject(new Error('Client socket not initialized'));
        return;
      }
      const timeout = setTimeout(() => reject(new Error('Socket connection timeout')), 5000);
      clientSocket.on('connect', () => {
        clearTimeout(timeout);
        resolve();
      });
      clientSocket.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Set up listener for order.updated event
    const orderUpdatedPromise = new Promise<any>((resolve) => {
      if (clientSocket) {
        clientSocket.on('order.updated', (data) => {
          resolve(data);
        });
      }
    });

    // Update job status to COMPLETED via API
    const response = await request(app)
      .patch(`/api/jobs/${uniqueJobId.toString()}/status`)
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .send({
        status: JobStatus.COMPLETED,
        moverId: testMoverId.toString()
      });

    expect(response.status).toBe(200);

    // Wait for socket event
    const orderUpdatedEvent = await Promise.race([
      orderUpdatedPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout waiting for order.updated event')), 3000)
      )
    ]);

    // Verify event payload
    expect(orderUpdatedEvent).toBeDefined();
    expect(orderUpdatedEvent.event).toBe('order.updated');
    expect(orderUpdatedEvent.order.id).toBe(uniqueOrderId.toString());
    expect(orderUpdatedEvent.order.status).toBe(OrderStatus.IN_STORAGE);

    // Verify order was updated in database
    const updatedOrder = await orderModel.findById(uniqueOrderId);
    expect(updatedOrder).not.toBeNull();
    expect(updatedOrder?.status).toBe(OrderStatus.IN_STORAGE);

    // Cleanup
    clientSocket.disconnect();
    await db.collection('orders').deleteOne({ _id: uniqueOrderId });
    await db.collection('jobs').deleteOne({ _id: uniqueJobId });
  }, 10000);

  test('should trigger updateOrderStatus when RETURN job status changes to COMPLETED', async () => {
    // Create a unique order for this test
    const uniqueOrderId = new mongoose.Types.ObjectId();
    const uniqueJobId = new mongoose.Types.ObjectId();
    const uniqueStudentId = testUserId;

    // Create order with IN_STORAGE status
    await (orderModel as any).order.create({
      _id: uniqueOrderId,
      studentId: uniqueStudentId,
      moverId: testMoverId,
      status: OrderStatus.IN_STORAGE,
      volume: 200,
      price: 100.0,
      studentAddress: {
        street: '321 Return St',
        city: 'Vancouver',
        province: 'BC',
        postalCode: 'V6T 1Z6',
        country: 'Canada',
        lat: 49.2850,
        lon: -123.1250,
        formattedAddress: '321 Return St, Vancouver, BC V6T 1Z6'
      },
      warehouseAddress: {
        street: '456 Warehouse Ave',
        city: 'Vancouver',
        province: 'BC',
        postalCode: 'V6T 2A1',
        country: 'Canada',
        lat: 49.2500,
        lon: -123.1000,
        formattedAddress: '456 Warehouse Ave, Vancouver, BC V6T 2A1'
      },
      returnAddress: {
        street: '321 Return St',
        city: 'Vancouver',
        province: 'BC',
        postalCode: 'V6T 1Z6',
        country: 'Canada',
        lat: 49.2850,
        lon: -123.1250,
        formattedAddress: '321 Return St, Vancouver, BC V6T 1Z6'
      },
      pickupTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      returnTime: new Date().toISOString(),
    });

    // Create RETURN job with PICKED_UP status
    await (jobModel as any).job.create({
      _id: uniqueJobId,
      orderId: uniqueOrderId,
      studentId: uniqueStudentId,
      moverId: testMoverId,
      jobType: JobType.RETURN,
      status: JobStatus.PICKED_UP,
      volume: 200,
      price: 60.0,
      pickupAddress: {
        street: '456 Warehouse Ave',
        city: 'Vancouver',
        province: 'BC',
        postalCode: 'V6T 2A1',
        country: 'Canada',
        lat: 49.2500,
        lon: -123.1000,
        formattedAddress: '456 Warehouse Ave, Vancouver, BC V6T 2A1'
      },
      dropoffAddress: {
        street: '321 Return St',
        city: 'Vancouver',
        province: 'BC',
        postalCode: 'V6T 1Z6',
        country: 'Canada',
        lat: 49.2850,
        lon: -123.1250,
        formattedAddress: '321 Return St, Vancouver, BC V6T 1Z6'
      },
      scheduledTime: new Date().toISOString(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Set up socket client for student
    clientSocket = ioClient(`http://localhost:${PORT}`, {
      auth: { token: `Bearer ${authToken}` },
      transports: ['websocket'],
    });

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      if (!clientSocket) {
        reject(new Error('Client socket not initialized'));
        return;
      }
      const timeout = setTimeout(() => reject(new Error('Socket connection timeout')), 5000);
      clientSocket.on('connect', () => {
        clearTimeout(timeout);
        resolve();
      });
      clientSocket.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Set up listener for order.updated event
    const orderUpdatedPromise = new Promise<any>((resolve) => {
      if (clientSocket) {
        clientSocket.on('order.updated', (data) => {
          resolve(data);
        });
      }
    });

    // Update job status to COMPLETED via API
    const response = await request(app)
      .patch(`/api/jobs/${uniqueJobId.toString()}/status`)
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .send({
        status: JobStatus.COMPLETED,
        moverId: testMoverId.toString()
      });

    expect(response.status).toBe(200);

    // Wait for socket event
    const orderUpdatedEvent = await Promise.race([
      orderUpdatedPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout waiting for order.updated event')), 3000)
      )
    ]);

    // Verify event payload - order should now be RETURNED (not COMPLETED)
    expect(orderUpdatedEvent).toBeDefined();
    expect(orderUpdatedEvent.event).toBe('order.updated');
    expect(orderUpdatedEvent.order.id).toBe(uniqueOrderId.toString());
    expect(orderUpdatedEvent.order.status).toBe(OrderStatus.RETURNED);

    // Verify order was updated in database
    const updatedOrder = await orderModel.findById(uniqueOrderId);
    expect(updatedOrder).not.toBeNull();
    expect(updatedOrder?.status).toBe(OrderStatus.RETURNED);

    // Cleanup
    clientSocket.disconnect();
    await db.collection('orders').deleteOne({ _id: uniqueOrderId });
    await db.collection('jobs').deleteOne({ _id: uniqueJobId });
  }, 10000);

  test('should handle error when orderModel.update returns null in updateOrderStatus', async () => {
    // Create a unique order for this test
    const uniqueOrderId = new mongoose.Types.ObjectId();
    const uniqueJobId = new mongoose.Types.ObjectId();
    const uniqueStudentId = testUserId;

    // Create STORAGE job without creating the order (to simulate order not found)
    await (jobModel as any).job.create({
      _id: uniqueJobId,
      orderId: uniqueOrderId, // Non-existent order
      studentId: uniqueStudentId,
      jobType: JobType.STORAGE,
      status: JobStatus.AVAILABLE,
      volume: 100,
      price: 30.0,
      pickupAddress: {
        street: '123 Error St',
        city: 'Vancouver',
        province: 'BC',
        postalCode: 'V6T 1Z7',
        country: 'Canada',
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: '123 Error St, Vancouver, BC V6T 1Z7'
      },
      dropoffAddress: {
        street: '456 Warehouse Ave',
        city: 'Vancouver',
        province: 'BC',
        postalCode: 'V6T 2A1',
        country: 'Canada',
        lat: 49.2500,
        lon: -123.1000,
        formattedAddress: '456 Warehouse Ave, Vancouver, BC V6T 2A1'
      },
      scheduledTime: new Date().toISOString(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Try to update job status - this should fail when trying to update the non-existent order
    const response = await request(app)
      .patch(`/api/jobs/${uniqueJobId.toString()}/status`)
      .set('Authorization', `Bearer ${moverAuthToken}`)
      .send({
        status: JobStatus.ACCEPTED,
        moverId: testMoverId.toString()
      });

    // The job update fails because the order doesn't exist (updateOrderStatus throws error)
    // This tests the error handling in updateOrderStatus at line 424
    expect(response.status).toBe(500);

    // Cleanup
    await db.collection('jobs').deleteOne({ _id: uniqueJobId });
  }, 10000);
});

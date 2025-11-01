import { emitToRooms } from '../socket';
import { Job } from '../types/job.type';
import { Order } from '../types/order.types';
import logger from './logger.util';
import { extractObjectIdString } from './mongoose.util';

/**
 * EventMeta - Metadata for all events
 */
export interface EventMeta {
  by?: string | null;
  ts?: string;
}

/**
 * Helper: Extract ID from potentially populated Mongoose field
 */
function extractId(field: unknown): string {
  // Prefer extracting a canonical ObjectId string when possible.
  if (!field) return '';
  return extractObjectIdString(field);
}

/**
 * Emit job.created event
 * Broadcasts to: student, all movers, order room, job room
 */
export function emitJobCreated(job: Job, meta?: EventMeta): void {
  try {
    const payload = {
      event: 'job.created',
      job: {
        id: job._id.toString(),
        orderId: extractId(job.orderId),
        jobType: job.jobType,
        status: job.status,
        moverId: job.moverId?.toString(),
        pickupAddress: job.pickupAddress,
        dropoffAddress: job.dropoffAddress,
        scheduledTime: job.scheduledTime,
        createdAt: job.createdAt,
      },
      meta: meta ?? { ts: new Date().toISOString() },
    };

    // Newly created jobs are always unassigned (AVAILABLE status)
    // Emit to: order room, job room, student who created it, and all movers
    const rooms = [
      `order:${payload.job.orderId}`,
      `job:${payload.job.id}`,
      `user:${extractId(job.studentId)}`,
      'role:mover', // Broadcast to all movers
    ];

    emitToRooms(rooms, 'job.created', payload, meta);
    logger.info(
      `Emitted job.created for job ${payload.job.id} to student and all movers`
    );
  } catch (err) {
    logger.warn('Failed to emit job.created event:', err);
  }
}

/**
 * Emit job.updated event
 * Broadcasts to: student, assigned mover (or all movers if unassigned), order room, job room
 */
export function emitJobUpdated(job: Job | null, meta?: EventMeta): void {
  try {
    const payload = {
      event: 'job.updated',
      job: {
        id: job?._id.toString(),
        orderId: extractId(job?.orderId),
        status: job?.status,
        moverId: job?.moverId?.toString(),
        jobType: job?.jobType,
        updatedAt: job?.updatedAt,
      },
      meta: meta ?? { ts: new Date().toISOString() },
    };

    // Base rooms: order, job, and student who owns the job
    const studentId = extractId(job?.studentId);
    const baseRooms = [
      `order:${payload.job.orderId}`,
      `job:${payload.job.id}`,
      `user:${studentId}`,
    ];

    // Security: If job has no mover assigned (AVAILABLE status), broadcast to all movers
    // If job has a mover assigned, only emit to that specific mover
    if (!job?.moverId) {
      // Job is available - emit to base rooms + all movers
      emitToRooms([...baseRooms, 'role:mover'], 'job.updated', payload, meta);
      logger.info(
        `Emitted job.updated for unassigned job ${payload.job.id} to all movers`
      );
    } else {
      // Job is assigned to a mover - emit to base rooms + specific mover only
      emitToRooms(
        [...baseRooms, `user:${extractId(job.moverId)}`],
        'job.updated',
        payload,
        meta
      );
      logger.info(
        `Emitted job.updated for assigned job ${payload.job.id} to mover ${extractId(job.moverId)}`
      );
    }
  } catch (err) {
    logger.warn('Failed to emit job.updated event:', err);
  }
}

/**
 * Emit order.created event
 * Broadcasts to: student, order room
 */
export function emitOrderCreated(order: Order | null, meta?: EventMeta): void {
  try {
    const payload = {
      event: 'order.created',
      order: {
        id: order?._id.toString(),
        studentId: extractId(order?.studentId),
        moverId: order?.moverId ? extractId(order.moverId) : undefined,
        status: order?.status,
        volume: order?.volume,
        price: order?.price,
        studentAddress: order?.studentAddress,
        warehouseAddress: order?.warehouseAddress,
        returnAddress: order?.returnAddress,
        pickupTime: order?.pickupTime,
        returnTime: order?.returnTime,
      },
      meta: meta ?? { ts: new Date().toISOString() },
    };

    const rooms = [
      `user:${extractId(order?.studentId)}`,
      `order:${order?._id.toString()}`,
    ];

    emitToRooms(rooms, 'order.created', payload, meta);
    logger.info(`Emitted order.created for order ${payload.order.id}`);
  } catch (err) {
    logger.warn('Failed to emit order.created event:', err);
  }
}

/**
 * Emit order.updated event
 * Broadcasts to: student, order room
 */
export function emitOrderUpdated(order: Order | null, meta?: EventMeta): void {
  try {
    const payload = {
      event: 'order.updated',
      order: {
        id: order?._id.toString(),
        studentId: extractId(order?.studentId),
        moverId: order?.moverId ? extractId(order.moverId) : undefined,
        status: order?.status,
        volume: order?.volume,
        price: order?.price,
        studentAddress: order?.studentAddress,
        warehouseAddress: order?.warehouseAddress,
        returnAddress: order?.returnAddress,
        pickupTime: order?.pickupTime,
        returnTime: order?.returnTime,
      },
      meta: meta ?? { ts: new Date().toISOString() },
    };

    const rooms = [
      `user:${extractId(order?.studentId)}`,
      `order:${order?._id.toString()}`,
    ];

    emitToRooms(rooms, 'order.updated', payload, meta);
    logger.info(`Emitted order.updated for order ${payload.order.id}`);
  } catch (err) {
    logger.warn('Failed to emit order.updated event:', err);
  }
}

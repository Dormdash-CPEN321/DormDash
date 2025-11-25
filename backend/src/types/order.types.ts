import { z } from 'zod';
import mongoose from 'mongoose';

export const addressSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  formattedAddress: z.string(),
});

// Explicit Address type to avoid 'any' inference issues
export interface Address {
  lat: number;
  lon: number;
  formattedAddress: string;
}

// Order zod Schema
// ------------------------------------------------------------
export const quoteSchema = z.object({
  studentId: z.string().refine(val => mongoose.isValidObjectId(val)),
  studentAddress: addressSchema,
});

export const createOrderSchema = z.object({
  studentId: z.string().refine(val => mongoose.isValidObjectId(val), {
    message: 'Invalid student ID',
  }),
  volume: z.number().positive(),
  totalPrice: z.number().positive(),
  studentAddress: addressSchema,
  warehouseAddress: addressSchema,
  pickupTime: z.string().datetime(),
  returnTime: z.string().datetime(),
  returnAddress: addressSchema.optional(), // Optional return address
  paymentIntentId: z.string().optional(), // Stripe payment intent ID for refunds
});

export const createReturnJobSchema = z.object({
  returnAddress: addressSchema.optional(), // Optional custom return address
  actualReturnDate: z.string().datetime().optional(), // Actual return date for late fee calculation
});

// Request types - explicitly typed to avoid 'any' inference
// ------------------------------------------------------------
export interface QuoteRequest {
  studentId: string;
  studentAddress: Address;
}

export interface CreateReturnJobRequest {
  returnAddress?: Address;
  actualReturnDate?: string;
}

export interface GetQuoteResponse {
  distancePrice: number;
  warehouseAddress: Address;
  dailyStorageRate: number; // Daily storage rate for late return fee calculation
}

export interface CreateOrderRequest {
  studentId: string;
  volume: number;
  totalPrice: number;
  studentAddress: Address;
  warehouseAddress: Address;
  pickupTime: string;
  returnTime: string;
  returnAddress?: Address;
  paymentIntentId?: string;
}

// Extend CreateOrderRequest with idempotencyKey for createOrder service method
export interface CreateOrderRequestWithIdempotency extends CreateOrderRequest {
  idempotencyKey?: string;
}

export interface CreateOrderResponse extends Order {
  id: string;
  // Keep backward-compatible field expected by frontend
  totalPrice?: number;
}

export interface CreateReturnJobResponse {
  success: boolean;
  message: string;
  lateFee?: number; // Optional late fee if return is past expected date
  refundAmount?: number; // Optional refund if return is before expected date
}

export type GetActiveOrderResponse = Order | null;

// Generic type
// ------------------------------------------------------------
export enum OrderStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  PICKED_UP = 'PICKED_UP',
  IN_STORAGE = 'IN_STORAGE',
  RETURNED = 'RETURNED', // Mover delivered items, awaiting student confirmation
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export const ACTIVE_ORDER_STATUSES = [
  OrderStatus.PENDING,
  OrderStatus.ACCEPTED,
  OrderStatus.PICKED_UP,
  OrderStatus.IN_STORAGE,
  OrderStatus.RETURNED, // Include RETURNED as active status
];

export interface Order {
  _id: mongoose.Types.ObjectId;
  studentId: string;
  moverId?: string;
  status: OrderStatus;
  volume: number;
  price: number;
  studentAddress: Address;
  warehouseAddress: Address;
  returnAddress?: Address; // Make it optional in type as well
  pickupTime: string; // ISO date string
  returnTime: string; // ISO date string
  paymentIntentId?: string; // Stripe payment intent ID for refunds
  idempotencyKey?: string; // Added idempotencyKey for idempotent operations
}

export interface CancelOrderResponse {
  success: boolean;
  message: string;
  orderStatus?: OrderStatus; // present on failure to indicate current status
}

export interface GetAllOrdersResponse {
  success: boolean;
  orders: Order[];
  message: string;
}

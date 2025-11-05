import { success, z } from "zod";
import mongoose from "mongoose";

export const addressSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  formattedAddress: z.string(),
});


// Order zod Schema
// ------------------------------------------------------------
export const quoteSchema = z.object({
  studentId: z.string().refine(val => mongoose.isValidObjectId(val)),
  studentAddress: addressSchema,
});

export const createOrderSchema = z.object({
  studentId: z.string().refine(val => mongoose.isValidObjectId(val), {
    message: "Invalid student ID",
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

// Request types
// ------------------------------------------------------------
export type QuoteRequest = z.infer<typeof quoteSchema>;

export type CreateReturnJobRequest = z.infer<typeof createReturnJobSchema>;

// ToDo: maybe we dont need to send the full address? the user dosnt need to see lat lon
export type GetQuoteResponse = {
  distancePrice: number,
  warehouseAddress: Address,
  dailyStorageRate: number // Daily storage rate for late return fee calculation
};


export type CreateOrderRequest = z.infer<typeof createOrderSchema>;

export type CreateOrderResponse = Order & {
  id: string;
}

export type CreateReturnJobResponse = {
    success: boolean;
    message: string;
    lateFee?: number; // Optional late fee if return is past expected date
    refundAmount?: number; // Optional refund if return is before expected date
};

export type GetActiveOrderResponse = Order | null;

export type GetAllOrdersResponse = {
    success: boolean;
    orders: CreateOrderRequest[];
    message: string;
}

export type CancelOrderResponse = {
    success: boolean;
    message: string;
}

// Generic type
// ------------------------------------------------------------
export type Address = z.infer<typeof addressSchema>;

export enum OrderStatus {
  PENDING = "PENDING",
  ACCEPTED = "ACCEPTED",
  PICKED_UP = "PICKED_UP",
  IN_STORAGE = "IN_STORAGE",
  RETURNED = "RETURNED", // Mover delivered items, awaiting student confirmation
  COMPLETED = "COMPLETED", 
  CANCELLED = "CANCELLED",
}

export const ACTIVE_ORDER_STATUSES = [
  OrderStatus.PENDING,
  OrderStatus.ACCEPTED,
  OrderStatus.PICKED_UP,
  OrderStatus.IN_STORAGE,
  OrderStatus.RETURNED, // Include RETURNED as active status
];

export type Order = {
    _id: mongoose.Types.ObjectId;
    studentId: mongoose.Types.ObjectId;
    moverId?: mongoose.Types.ObjectId;
    status: OrderStatus;
    volume: number;
    price: number;
    studentAddress: Address;
    warehouseAddress: Address;  
    returnAddress?: Address; // Make it optional in type as well
    pickupTime: string; // ISO date string
    returnTime: string;  // ISO date string
    paymentIntentId?: string; // Stripe payment intent ID for refunds
};

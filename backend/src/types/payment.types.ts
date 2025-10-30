import { z } from 'zod';

// Payment Intent Schema
export const createPaymentIntentSchema = z.object({
  amount: z.number().positive(),
  currency: z.literal('CAD').default('CAD'),
  orderId: z.string().optional(),
});

export const processPaymentSchema = z.object({
  paymentIntentId: z.string(),
  paymentMethodId: z.string(),
});

// Payment Types
export type CreatePaymentIntentRequest = z.infer<
  typeof createPaymentIntentSchema
>;

export type ProcessPaymentRequest = z.infer<typeof processPaymentSchema>;

export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  clientSecret: string;
  status: PaymentIntentStatus;
}

export interface PaymentResult {
  paymentId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  failureReason?: string;
}

export enum PaymentIntentStatus {
  REQUIRES_PAYMENT_METHOD = 'requires_payment_method',
  REQUIRES_CONFIRMATION = 'requires_confirmation',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELED = 'canceled',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELED = 'CANCELED',
}

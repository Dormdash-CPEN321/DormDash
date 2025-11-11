import {
  CreatePaymentIntentRequest,
  ProcessPaymentRequest,
  PaymentIntent,
  PaymentResult,
} from '../types/payment.types';
import { stripeService } from './stripe.service';
import logger from '../utils/logger.util';

export class PaymentService {
  /**
   * Create a payment intent for the given amount
   */
  async createPaymentIntent(
    request: CreatePaymentIntentRequest
  ): Promise<PaymentIntent> {
    try {
      logger.info(
        `Creating payment intent for amount: ${request.amount} ${request.currency}`
      );

      const amount: number = request.amount;
      const currency: 'CAD' = request.currency;
      
      const paymentIntent = await stripeService.createPaymentIntent(
        amount,
        currency
      );

      logger.info(`Payment intent created: ${paymentIntent.id}`);
      return paymentIntent;
    } catch (error) {
      logger.error('Error in PaymentService.createPaymentIntent:', error);
      throw error;
    }
  }

  /**
   * Process payment using payment method
   */
  async processPayment(request: ProcessPaymentRequest): Promise<PaymentResult> {
    try {
      logger.info(`Processing payment for intent: ${request.paymentIntentId}`);

      const paymentIntentId: string = request.paymentIntentId;
      const paymentMethodId: string = request.paymentMethodId;
      
      const result = await stripeService.confirmPayment(
        paymentIntentId,
        paymentMethodId
      );

      logger.info(
        `Payment processed: ${result.paymentId} - Status: ${result.status}`
      );
      return result;
    } catch (error) {
      logger.error('Error in PaymentService.processPayment:', error);
      throw error;
    }
  }

  /**
   * Refund a payment
   */
  async refundPayment(
    paymentIntentId: string,
    amount?: number
  ): Promise<PaymentResult> {
    try {
      logger.info(
        `Refunding payment for intent: ${paymentIntentId}${amount ? ` (amount: ${amount})` : ''}`
      );

      const result = await stripeService.refundPayment(paymentIntentId, amount);

      logger.info(
        `Refund processed: ${result.paymentId} - Status: ${result.status}`
      );
      return result;
    } catch (error) {
      logger.error('Error in PaymentService.refundPayment:', error);
      throw error;
    }
  }
}

export const paymentService = new PaymentService();

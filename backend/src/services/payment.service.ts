import { CreatePaymentIntentRequest, ProcessPaymentRequest, PaymentIntent, PaymentResult } from '../types/payment.types';
import { stripeService } from './stripe.service';
import logger from '../utils/logger.util';

export class PaymentService {
    
    /**
     * Create a payment intent for the given amount
     */
    async createPaymentIntent(request: CreatePaymentIntentRequest): Promise<PaymentIntent> {
        try {
            logger.info(`Creating payment intent for amount: ${request.amount} ${request.currency}`);
            
            const paymentIntent = await stripeService.createPaymentIntent(
                request.amount as number, 
                request.currency
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
            
            const result = await stripeService.confirmPayment(
                request.paymentIntentId,
                request.paymentMethodId
            );
            
            logger.info(`Payment processed: ${result.paymentId} - Status: ${result.status}`);
            return result;
        } catch (error) {
            logger.error('Error in PaymentService.processPayment:', error);
            throw error;
        }
    }

    /**
     * Get payment status
     */
    async getPaymentStatus(paymentIntentId: string): Promise<PaymentResult> {
        try {
            logger.info(`Getting payment status for: ${paymentIntentId}`);
            
            const result = await stripeService.getPaymentIntent(paymentIntentId);
            
            logger.info(`Payment status retrieved: ${result.paymentId} - Status: ${result.status}`);
            return result;
        } catch (error) {
            logger.error('Error in PaymentService.getPaymentStatus:', error);
            throw error;
        }
    }

    /**
     * Refund a payment
     */
    async refundPayment(paymentIntentId: string, amount?: number): Promise<PaymentResult> {
        try {
            logger.info(`Refunding payment for intent: ${paymentIntentId}${amount ? ` (amount: ${amount})` : ''}`);
            
            const result = await stripeService.refundPayment(paymentIntentId, amount);
            
            logger.info(`Refund processed: ${result.paymentId} - Status: ${result.status}`);
            return result;
        } catch (error) {
            logger.error('Error in PaymentService.refundPayment:', error);
            throw error;
        }
    }
}

export const paymentService = new PaymentService();
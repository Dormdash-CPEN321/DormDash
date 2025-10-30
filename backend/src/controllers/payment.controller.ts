import { NextFunction, Request, Response } from 'express';
import { PaymentService } from '../services/payment.service';
import {
  CreatePaymentIntentRequest,
  ProcessPaymentRequest,
  PaymentIntent,
  PaymentResult,
} from '../types/payment.types';

export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  async createPaymentIntent(
    req: Request<unknown, unknown, CreatePaymentIntentRequest>,
    res: Response<PaymentIntent>,
    next: NextFunction
  ) {
    try {
      const paymentIntent = await this.paymentService.createPaymentIntent(
        req.body
      );
      res.status(200).json(paymentIntent);
    } catch (error) {
      next(error);
    }
  }

  async processPayment(
    req: Request<unknown, unknown, ProcessPaymentRequest>,
    res: Response<PaymentResult>,
    next: NextFunction
  ) {
    try {
      const result = await this.paymentService.processPayment(req.body);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getPaymentStatus(
    req: Request<{ paymentIntentId: string }>,
    res: Response<PaymentResult>,
    next: NextFunction
  ) {
    try {
      const { paymentIntentId } = req.params;
      const result =
        await this.paymentService.getPaymentStatus(paymentIntentId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

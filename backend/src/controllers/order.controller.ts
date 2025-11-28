import { NextFunction, Request, Response } from 'express';
import { OrderService } from '../services/order.service';
import {
  CreateOrderResponse,
  QuoteRequest,
  GetQuoteResponse,
  GetAllOrdersResponse,
  CancelOrderResponse,
  Order,
  CreateReturnJobResponse,
  CreateReturnJobRequest,
  CreateOrderRequest,
  CreateOrderRequestWithIdempotency,
  OrderStatus,
} from '../types/order.types';
import { ObjectId } from 'mongoose';

export class OrderController {
  constructor(private orderService: OrderService) {}
  async getQuote(
    req: Request<unknown, unknown, QuoteRequest>,
    res: Response<GetQuoteResponse>,
    next: NextFunction
  ) {
    try {
      const quote = await this.orderService.getQuote(req.body);
      res.status(200).json(quote);
    } catch (error) {
      // TODo: improve error handling
      next(error);
    }
  }

  async createOrder(
    req: Request<unknown, unknown, CreateOrderRequest>,
    res: Response<CreateOrderResponse>,
    next: NextFunction
  ) {
    try {
      // Pass idempotency key from header (if present) into the request body for service handling
      const idempotencyKey = req.header('Idempotency-Key') ?? undefined;
      const reqWithKey: CreateOrderRequestWithIdempotency = { 
        ...req.body, 
        idempotencyKey 
      };
      const result = await this.orderService.createOrder(reqWithKey);
      res.status(201).json(result);
    } catch (error) {
      // TODo: improve error handling
      next(error);
    }
  }

  async createReturnJob(
    req: Request,
    res: Response<CreateReturnJobResponse>,
    next: NextFunction
  ) {
    try {
      if (!req.user?._id) {
        res.status(401).json({ 
          success: false,
          message: 'Authentication required. Please log in.',
        } as CreateReturnJobResponse);
        return;
      }

      const studentId = req.user._id as unknown as ObjectId;
      
      const returnJobRequest = req.body as CreateReturnJobRequest;
      
      const result = await this.orderService.createReturnJob(
        studentId,
        returnJobRequest
      );
      res.status(201).json(result);
    } catch (error) {
      // TODO: improve error handling
      next(error);
    }
  }

  async getAllOrders(
    req: Request,
    res: Response<GetAllOrdersResponse>,
    next: NextFunction
  ) {
    try {
      const result = await this.orderService.getAllOrders(
        (req as unknown as { user?: { _id: unknown } }).user?._id as ObjectId
      );
      res.status(200).json(result);
    } catch (error) {
      // TODO: improve error handling
      next(error);
    }
  }

  async getActiveOrder(
    req: Request,
    res: Response<Order | null>,
    next: NextFunction
  ) {
    try {
      const studentId = req.user?._id as unknown as ObjectId;
      const order = await this.orderService.getUserActiveOrder(studentId);
      if (!order) {
        res.status(404).json(null);
        return;
      }
      res.status(200).json(order);
    } catch (error) {
      // TODO: improve error handling
      next(error);
    }
  }

  async cancelOrder(
    req: Request,
    res: Response<CancelOrderResponse>,
    next: NextFunction
  ) {
    try {
      const studentId = req.user?._id as unknown as ObjectId;
      const result = await this.orderService.cancelOrder(studentId);
      // Map service result to appropriate HTTP status code expected by tests/spec
      if (result.success) {
        res.status(200).json(result);
        return;
      }

      // Failure cases
      if (result.orderStatus === OrderStatus.ACCEPTED) {
        res.status(400).json(result);
        return;
      }
      if (result.orderStatus === OrderStatus.IN_STORAGE) {
        res.status(401).json(result);
        return;
      }
      if (result.orderStatus === OrderStatus.CANCELLED) {
        // Second cancellation attempt
        res.status(401).json(result);
        return;
      }
      if (result.message === 'Order not found') {
        res.status(404).json(result);
        return;
      }
    } catch (error) {
      next(error);
    }
  }
}


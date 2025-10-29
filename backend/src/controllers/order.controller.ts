import { NextFunction, Request, Response } from 'express';
import { OrderService } from '../services/order.service';
import { CreateOrderResponse, QuoteRequest, GetQuoteResponse, GetAllOrdersResponse, CancelOrderResponse, Order, CreateReturnJobResponse, CreateReturnJobRequest } from '../types/order.types';
import { ObjectId } from "mongoose";
import logger from '../utils/logger.util';
import { OrderMapper } from '../mappers/order.mapper';

export class OrderController {
    constructor(private orderService: OrderService) {}
    async getQuote(req: Request<{}, {}, QuoteRequest>, res: Response<GetQuoteResponse>, next: NextFunction) {
        try {
            const quote = await this.orderService.getQuote(req.body);
            res.status(200).json(quote);
        } catch (error) {
            // TODo: improve error handling
            next(error);
        }     
    }

    async createOrder(req: Request, res: Response<CreateOrderResponse>, next: NextFunction) {
        try {
            // Pass idempotency key from header (if present) into the request body for service handling
            const idempotencyKey = req.header('Idempotency-Key') || undefined;
            const reqWithKey = { ...req.body, idempotencyKey } as any;
            const result = await this.orderService.createOrder(reqWithKey);
            res.status(201).json(result);
        } catch (error) {            
            // TODo: improve error handling
            next(error);
        }
    }

    async createReturnJob(req: Request, res: Response<CreateReturnJobResponse>, next: NextFunction) {
        try {
            // Use authenticated user id from req.user (set by auth middleware)
            const studentId = req.user?._id;
            const returnJobRequest = req.body as CreateReturnJobRequest;
            const result = await this.orderService.createReturnJob(studentId as ObjectId | undefined, returnJobRequest);
            res.status(201).json(result);
        } catch (error) {
            // TODO: improve error handling
            next(error);
        }
    }

    async getAllOrders(req: Request, res: Response<GetAllOrdersResponse>, next: NextFunction) {
        try {
            const orders = await this.orderService.getAllOrders(req.user?._id as ObjectId | undefined);
            res.status(200).json(orders);
        } catch (error) {
            // TODO: improve error handling
            next(error);
        }
    }

    async getActiveOrder(req: Request, res: Response<Order | null>, next: NextFunction) {
        try {
            // Get studentId from authenticated user
            const studentId = req.user?._id;

            const order = await this.orderService.getUserActiveOrder(studentId as ObjectId | undefined);
            
            if (!order) {
                return res.status(404).json(null);
            }

            // Map to CreateOrderResponse so `id` (string) is included for frontend
            const mapped = OrderMapper.toCreateOrderResponse(order as any);
            res.status(200).json(mapped);
        } catch (error) {
            logger.error("Error in getActiveOrder controller:", error);
            next(error);
        }
    }

    async cancelOrder(req: Request, res: Response<CancelOrderResponse>, next: NextFunction) {
        try {
            const result = await this.orderService.cancelOrder(req.user?._id as ObjectId | undefined);
            res.status(200).json(result);
        } catch (error) {
            logger.error("Error in cancelOrder controller:", error);
            next(error);
        }
    }

}

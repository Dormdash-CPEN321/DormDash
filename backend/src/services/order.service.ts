import mongoose, { ObjectId } from "mongoose";
import { orderModel } from "../models/order.model";
import { jobModel } from "../models/job.model";
import {WAREHOUSES} from "../constants/warehouses"
import { CreateOrderRequest, QuoteRequest, GetQuoteResponse, CancelOrderResponse, CreateOrderResponse, CreateReturnJobResponse, CreateReturnJobRequest, Order, OrderStatus, GetAllOrdersResponse, ACTIVE_ORDER_STATUSES } from "../types/order.types";
import logger from "../utils/logger.util";
import { jobService } from "./job.service";
import { paymentService } from "./payment.service";
import { JobType, CreateJobRequest, JobStatus } from "../types/job.type";
import { EventEmitter } from "../utils/eventEmitter.util";
import { OrderMapper } from "../mappers/order.mapper";
import { PRICING } from "../config/pricing.config";


// OrderService Class
// ------------------------------------------------------------
export class OrderService {
    private findClosestWarehouse(lat: number, lon: number) {
        // ToDo: integrate with google maps to actually find the closest warehouse
        // google maps also returns time it takes to drive there (based on trafic and ...)
        // we can also use that in our price calc when we integrate with maps

        //added to avoid unused variable error- codacy
        const lat1 = lat;
        const lon1 = lon;

        logger.info("Finding closest warehouse to:", { lat1, lon1 });
        return { 
            closestWarehouse: WAREHOUSES[0],
            distanceToWarehouse: 5 //km
         }
    }

    async getQuote(reqData: QuoteRequest): Promise<GetQuoteResponse> {
        try {
            const { studentAddress } = reqData;
            
            let {closestWarehouse, distanceToWarehouse} = this.findClosestWarehouse(studentAddress.lat, studentAddress.lon);

            // Calculate pricing based on distance
            const distancePrice = Number((distanceToWarehouse * PRICING.PRICE_PER_KM).toFixed(2));
            const dailyStorageRate = PRICING.DAILY_STORAGE_RATE;

            return {
                distancePrice,
                warehouseAddress: closestWarehouse,
                dailyStorageRate,
            };
        } catch (error) {
            logger.error("Error in getQuote service:", error);
            throw new Error("Failed to calculate quote");
        }
    }

    async createOrder(reqData: CreateOrderRequest & { idempotencyKey?: string }): Promise<CreateOrderResponse> {
        try {
            const idempotencyKey = reqData.idempotencyKey;

            // If idempotency key provided, return existing order with that key
            if (idempotencyKey) {
                const byKey = await orderModel.findByIdempotencyKey(idempotencyKey);
                if (byKey) {
                    return OrderMapper.toCreateOrderResponse(byKey);
                }
            }

            // Extract required data
            const {
                studentId,
                volume,
                totalPrice,
                studentAddress,
                warehouseAddress,
                pickupTime,
                returnTime,
                returnAddress,
                paymentIntentId,
            } = reqData;

            const studentObjectId = new mongoose.Types.ObjectId(studentId);

            const newOrder: Order = {
                _id: new mongoose.Types.ObjectId(),
                studentId: studentObjectId.toString(), // Convert ObjectId to string
                status: OrderStatus.PENDING,
                volume,
                price: totalPrice,
                studentAddress,
                warehouseAddress,
                returnAddress: returnAddress || studentAddress, // Default to student address if not provided
                pickupTime,
                returnTime,
                idempotencyKey: idempotencyKey || undefined,
                paymentIntentId: paymentIntentId || undefined,
            };

            try {
                const createdOrder = await orderModel.create(newOrder);

                const storageJobRequest: CreateJobRequest = {
                    orderId: createdOrder._id.toString(),
                    studentId: reqData.studentId,
                    jobType: JobType.STORAGE,
                    volume: reqData.volume,
                    price: reqData.totalPrice * PRICING.STORAGE_JOB_SPLIT,
                    pickupAddress: reqData.studentAddress,
                    dropoffAddress: reqData.warehouseAddress,
                    scheduledTime: reqData.pickupTime,
                };

                await jobService.createJob(storageJobRequest);
                
                // Emit order.created to the student and order room (do not block the response)
                EventEmitter.emitOrderCreated(createdOrder, { by: reqData.studentId, ts: new Date().toISOString() });
            
                return OrderMapper.toCreateOrderResponse(createdOrder);
            } catch (err: unknown) {
                // If duplicate key error due to race/uniqueness, try to find existing by idempotencyKey or by student+status
                const isDup = (err as { code?: number })?.code === 11000;
                if (isDup) {
                    if (idempotencyKey) {
                        const byKey = await orderModel.findByIdempotencyKey(idempotencyKey);
                        if (byKey) {
                            return OrderMapper.toCreateOrderResponse(byKey);
                        }
                    }
                }

                logger.error("Error creating order:", err);
                throw err;
            }
            


            
        } catch (error) {
            logger.error("Error in createOrder service:", error);
            throw new Error("Failed to create order");
        }
    }

    async createReturnJob(studentId: ObjectId | undefined, returnJobRequest?: CreateReturnJobRequest): Promise<CreateReturnJobResponse> {
        try {
            const activeOrder = await orderModel.findActiveOrder({
                studentId,
                status: { $in: ACTIVE_ORDER_STATUSES }
            });

            if (!activeOrder) {
                throw new Error("No active order found to create return job for");
            }

            // Idempotency guard: check if a return job already exists for this order
            const existingJobs = await jobModel.findByOrderId(activeOrder._id);
            const hasReturnJob = existingJobs.some(job => 
                job.jobType === JobType.RETURN && 
                job.status !== JobStatus.CANCELLED
            );

            if (hasReturnJob) {
                logger.info(`Return job already exists for order ${activeOrder._id}`);
                return {
                    success: true,
                    message: "Return job already exists for this order"
                };
            }

            // Calculate adjustment fee based on actual return date vs expected return date
            let adjustmentFee = 0;
            let refundAmount = 0;
            const expectedReturnDate = new Date(activeOrder.returnTime);
            const actualReturnDate = returnJobRequest?.actualReturnDate 
                ? new Date(returnJobRequest.actualReturnDate) 
                : new Date();

            const daysDifference = Math.ceil((actualReturnDate.getTime() - expectedReturnDate.getTime()) / (1000 * 60 * 60 * 24));
            const dailyRate = PRICING.LATE_FEE_RATE;

            if (daysDifference > 0) {
                // Late return: charge extra
                adjustmentFee = daysDifference * dailyRate;
                logger.info(`Late return detected: ${daysDifference} days late, fee: $${adjustmentFee}`);
            } else if (daysDifference < 0) {
                // Early return: refund
                const daysEarly = Math.abs(daysDifference);
                refundAmount = daysEarly * dailyRate;
                logger.info(`Early return detected: ${daysEarly} days early, refund: $${refundAmount}`);
            }

            // Use custom return address if provided, otherwise use order's return address or student address
            const finalReturnAddress = returnJobRequest?.returnAddress 
                || activeOrder.returnAddress 
                || activeOrder.studentAddress;

            const finalReturnTime = returnJobRequest?.actualReturnDate
                ? new Date(returnJobRequest.actualReturnDate).toISOString()
                : new Date(activeOrder.returnTime).toISOString();

            await orderModel.update(activeOrder._id, {
                returnAddress: finalReturnAddress,
                returnTime: finalReturnTime
            });

            const returnJobPrice = (activeOrder.price * PRICING.RETURN_JOB_SPLIT) + adjustmentFee; // 40% for return delivery + late fee (if any)

            const returnJobReq: CreateJobRequest = {
                orderId: activeOrder._id.toString(),
                studentId: activeOrder.studentId.toString(),
                jobType: JobType.RETURN,
                volume: activeOrder.volume,
                price: returnJobPrice,
                pickupAddress: activeOrder.warehouseAddress, // Pick up FROM warehouse
                dropoffAddress: finalReturnAddress, // Deliver TO return address
                scheduledTime: finalReturnTime,
            };

            await jobService.createJob(returnJobReq);
            
            // Process refund if early return
            if (refundAmount > 0 && activeOrder.paymentIntentId) {
                try {
                    await paymentService.refundPayment(activeOrder.paymentIntentId, refundAmount);
                    logger.info(`Processed early return refund of $${refundAmount} for order ${activeOrder._id}`);
                } catch (refundError) {
                    logger.error(`Failed to process early return refund: ${refundError}`);
                    // Continue with job creation even if refund fails
                }
            }
            
            let message = "Return job created successfully";
            if (adjustmentFee > 0) {
                message = `Return job created successfully with late fee of $${adjustmentFee.toFixed(2)}`;
            } else if (refundAmount > 0) {
                message = `Return job created successfully. Refund of $${refundAmount.toFixed(2)} has been processed for early return`;
            }
            
            return {
                success: true,
                message,
                lateFee: adjustmentFee > 0 ? adjustmentFee : undefined,
                refundAmount: refundAmount > 0 ? refundAmount : undefined
            }

        } catch (error) {
            logger.error("Error in createReturnJob service:", error);
            throw new Error("Failed to create return job");
        }
    }

    async getUserActiveOrder(studentId: ObjectId | undefined): Promise<Order | null> {

        const activeOrder = await orderModel.findActiveOrder({
            studentId,
            status: { $in: ACTIVE_ORDER_STATUSES }
        });
            return activeOrder;
    }

    async getAllOrders(studentId: ObjectId | undefined): Promise<GetAllOrdersResponse> {
        try{
            const orders = await orderModel.getAllOrders(studentId);
            return{
                success: true,
                orders: OrderMapper.toOrderListItems(orders),
                message: "Orders retrieved successfully",
            };
        } catch (error) {
            logger.error("Error in getAllOrders service:", error);
            throw new Error("Failed to get all orders");
        }
    }

    async cancelOrder(studentId: ObjectId | undefined): Promise<CancelOrderResponse> {
        try {
            const order = await orderModel.findActiveOrder({
                studentId,
                status: { $in: ACTIVE_ORDER_STATUSES }
            });

            if (!order) {
                return { success: false, message: "Order not found" };
            }

            if (order.status !== OrderStatus.PENDING) {
                return { success: false, message: "Only pending orders can be cancelled" };
            }

            // Update the order status to CANCELLED
            const orderId = order._id;
            const updated = await orderModel.update(orderId, { status: OrderStatus.CANCELLED });

            // Process refund if paymentIntentId exists
            if (order.paymentIntentId) {
                try {
                    logger.info(`Processing refund for order ${orderId}, payment intent: ${order.paymentIntentId}`);
                    await paymentService.refundPayment(order.paymentIntentId);
                    logger.info(`Refund processed successfully for order ${orderId}`);
                } catch (refundError) {
                    logger.error('Failed to process refund:', refundError);
                    // Continue with cancellation even if refund fails - admin can handle manually
                    // You may want to update order with a "refund_pending" flag here
                }
            } else {
                logger.warn(`No payment intent ID found for order ${orderId.toString()} - skipping refund`);
            }

            // Cancel linked jobs for this order (best-effort). Do this before emitting order.updated
            try {
                await jobService.cancelJobsForOrder(orderId.toString(), studentId?.toString());
            } catch (err) {
                logger.error('Failed to cancel linked jobs after order cancellation:', err);
                // proceed to emit order.updated anyway
            }

            // Emit order.updated via helper
            EventEmitter.emitOrderUpdated(updated, { by: studentId?.toString() ?? null });

            return { success: true, message: "Order cancelled successfully" };
        } catch (error) {
            logger.error("Error in cancelOrder service:", error);
            throw new Error("Failed to cancel order");
        }
    }

    // Update order status and emit event - called by JobService
    async updateOrderStatus(orderId: string | mongoose.Types.ObjectId, status: OrderStatus, actorId?: string): Promise<Order> {
        try {
            const orderObjectId = typeof orderId === 'string' 
                ? new mongoose.Types.ObjectId(orderId) 
                : orderId;

            const updatedOrder = await orderModel.update(orderObjectId, { status });
            
            if (!updatedOrder) {
                throw new Error(`Order ${orderId.toString()} not found`);
            }

            // Emit order.updated event
            EventEmitter.emitOrderUpdated(updatedOrder, { by: actorId ?? null, ts: new Date().toISOString() });

            logger.info(`Order ${orderId.toString()} status updated to ${status} by ${actorId ?? 'system'}`);
            
            return updatedOrder;
        } catch (error) {
            logger.error(`Error updating order status for ${orderId.toString()}:`, error);
            throw error;
        }
    }
}

export const orderService = new OrderService();

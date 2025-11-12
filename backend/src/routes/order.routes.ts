import { Router } from 'express';
import { OrderController } from '../controllers/order.controller';
import { orderService } from '../services/order.service';
import { QuoteRequest, quoteSchema, CreateOrderRequest, createOrderSchema } from '../types/order.types';
import { validateBody } from '../middleware/validation.middleware';

const router = Router();
const orderController = new OrderController(orderService);

router.post(
  '/quote',
  validateBody<QuoteRequest>(quoteSchema),
  (req, res, next) => {
    orderController.getQuote(req, res, next).catch((err: unknown) => {
      next(err);
    });
  }
);

router.post(
  '/',
  validateBody<CreateOrderRequest>(createOrderSchema),
  (req, res, next) => {
    orderController.createOrder(req, res, next).catch((err: unknown) => {
      next(err);
    });
  }
);

router.post(
  '/create-return-Job',
  // This endpoint uses the authenticated user (req.user) to create a return job
  (req, res, next) => {
    orderController.createReturnJob(req, res, next).catch((err: unknown) => {
      next(err);
    });
  }
);
router.get(
  '/all-orders', // No need for studentId in URL since we get it from auth
  (req, res, next) => {
    orderController.getAllOrders(req, res, next).catch((err: unknown) => {
      next(err);
    });
  }
);

router.get(
  '/active-order', // No need for studentId in URL since we get it from auth
  (req, res, next) => {
    orderController.getActiveOrder(req, res, next).catch((err: unknown) => {
      next(err);
    });
  }
);

router.delete('/cancel-order', (req, res, next) => {
  orderController.cancelOrder(req, res, next).catch((err: unknown) => {
    next(err);
  });
});

export default router;

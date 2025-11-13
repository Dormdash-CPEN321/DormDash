import { Router } from 'express';

import { authenticateToken } from '../middleware/auth.middleware';
import authRoutes from './auth.routes';
import usersRoutes from './user.routes';
import orderRoutes from './order.routes';
import jobRoutes from './job.routes';
import paymentRoutes from './payment.routes';
import routePlannerRoutes from './routePlanner.routes';
import loadTestRoutes from './loadTest.routes';
import devRoutes from './dev.routes';

const router = Router();

router.use('/auth', authRoutes);

router.use('/user', authenticateToken, usersRoutes);

router.use('/order', authenticateToken, orderRoutes);

router.use('/jobs', authenticateToken, jobRoutes);

router.use('/payment', authenticateToken, paymentRoutes);

router.use('/routePlanner', authenticateToken, routePlannerRoutes);

// Load test endpoints (no authentication required - use with caution)
router.use('/load-test', loadTestRoutes);

// E2E tests endpoints (no authentication required - use with caution)
router.use('/dev', devRoutes);

export default router;

import { Router } from 'express';

import { authenticateToken } from '../middleware/auth.middleware';
import authRoutes from './auth.routes';
import mediaRoutes from './media.routes';
import usersRoutes from './user.routes';
import orderRoutes from './order.routes';
import jobRoutes from './job.routes';
import paymentRoutes from './payment.routes';
import routePlannerRoutes from './routePlanner.routes';

const router = Router();

router.use('/auth', authRoutes);

router.use('/user', authenticateToken, usersRoutes);
//TODO: why authenticateToken is called twice both here and in media.routes.ts?
router.use('/media', authenticateToken, mediaRoutes);

router.use('/order', authenticateToken, orderRoutes);

router.use('/jobs', authenticateToken, jobRoutes);

router.use('/payment', authenticateToken, paymentRoutes);

router.use('/routePlanner', authenticateToken, routePlannerRoutes);

export default router;

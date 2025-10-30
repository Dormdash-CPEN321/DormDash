import { Router } from 'express';
import { routeController } from '../controllers/routePlanner.controller';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();

// GET /api/routes/smart - Calculate optimized route for mover
// Query params: currentLat, currentLon
router.get('/smart', authenticateToken, (req, res, next) => {
  routeController.getSmartRoute(req, res).catch((err: unknown) => {
    next(err);
  });
});

export default router;

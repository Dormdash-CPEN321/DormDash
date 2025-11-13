import { Router } from 'express';
import { LoadTestController } from '../controllers/loadTest.controller';

const router = Router();
const loadTestController = new LoadTestController();

// POST /api/load-test/seed-users - Create 2000 students and 300 movers
router.post('/seed-users', (req, res, next) => {
  loadTestController.seedUsers(req, res, next).catch((err: unknown) => {
    next(err);
  });
});

// GET /api/load-test/student-ids - Get all student user IDs
router.get('/student-ids', (req, res, next) => {
  loadTestController.getStudentIds(req, res, next).catch((err: unknown) => {
    next(err);
  });
});

// GET /api/load-test/mover-ids - Get all mover user IDs
router.get('/mover-ids', (req, res, next) => {
  loadTestController.getMoverIds(req, res, next).catch((err: unknown) => {
    next(err);
  });
});

// DELETE /api/load-test/delete-all - Delete all users, orders, and jobs
router.delete('/delete-all', (req, res, next) => {
  loadTestController.deleteAllData(req, res, next).catch((err: unknown) => {
    next(err);
  });
});

export default router;

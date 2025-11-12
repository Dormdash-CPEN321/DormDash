/**
 * Development Routes
 * 
 * WARNING: These routes should only be enabled in development/test environments.
 * They provide endpoints for running scripts to seed/clear test data.
 */

import { Router } from 'express';
import devController from '../controllers/dev.controller';

const router = Router();

/**
 * @route   POST /api/dev/seed-jobs
 * @desc    Seed 10 test jobs for Smart Route testing
 * @access  Public (dev only)
 */
router.post('/seed-jobs', (req, res, next) => {
  devController.seedTestJobs(req, res, next).catch((err: unknown) => {
    next(err);
  });
});

/**
 * @route   POST /api/dev/seed-availability-jobs
 * @desc    Seed 2 availability test jobs (1 within, 1 outside availability)
 * @access  Public (dev only)
 */
router.post('/seed-availability-jobs', (req, res, next) => {
  devController.seedAvailabilityTestJobs(req, res, next).catch((err: unknown) => {
    next(err);
  });
});

/**
 * @route   POST /api/dev/clear-jobs
 * @desc    Clear all jobs from the database
 * @access  Public (dev only)
 */
router.post('/clear-jobs', (req, res, next) => {
  devController.clearJobs(req, res, next).catch((err: unknown) => {
    next(err);
  });
});

export default router;

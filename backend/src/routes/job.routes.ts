import { NextFunction, Router } from 'express';
import { JobController } from '../controllers/job.controller';
import { jobService } from '../services/job.service';
import { authenticateToken } from '../middleware/auth.middleware';

const router = Router();
const jobController = new JobController(jobService);

// GET /api/jobs - Get all jobs
router.get('/', (req, res, next) => {
  jobController.getAllJobs(req, res, next).catch((err: unknown) => {
    next(err);
  });
});

// GET /api/jobs/available - Get available jobs for movers to accept
router.get('/available', (req, res, next) => {
  jobController.getAllAvailableJobs(req, res, next).catch((err: unknown) => {
    next(err);
  });
});

// GET /api/jobs/mover - Get jobs ACCEPTED to the authenticated mover
router.get('/mover', (req, res, next) => {
  jobController.getMoverJobs(req, res, next).catch((err: unknown) => {
    next(err);
  });
});

// GET /api/jobs/student - Get jobs for the authenticated student
router.get('/student', (req, res, next) => {
  jobController.getStudentJobs(req, res, next).catch((err: unknown) => {
    next(err);
  });
});

// GET /api/jobs/:id - Get specific job by ID
router.get('/:id', (req, res, next) => {
  jobController.getJobById(req, res, next).catch((err: unknown) => {
    next(err);
  });
});

// POST /api/jobs - Create a new job
router.post('/', (req, res, next) => {
  jobController.createJob(req, res, next).catch((err: unknown) => {
    next(err);
  });
});

// PATCH /api/jobs/:id/status - Update job status (assign, start, complete)
router.patch('/:id/status', (req, res, next: NextFunction) => {
  jobController.updateJobStatus(req, res, next).catch((err: unknown) => {
    next(err);
  });
});

// POST /api/jobs/:id/arrived - mover indicates arrival and requests student confirmation
router.post('/:id/arrived', (req, res, next: NextFunction) => {
  jobController
    .send_arrival_confirmation(req, res, next)
    .catch((err: unknown) => {
      next(err);
    });
});

// POST /api/jobs/:id/confirm-pickup - student confirms pickup
router.post('/:id/confirm-pickup', (req, res, next: NextFunction) => {
  jobController.confirmPickup(req, res, next).catch((err: unknown) => {
    next(err);
  });
});

// POST /api/jobs/:id/delivered - mover indicates delivery completed and requests student confirmation (return jobs)
router.post('/:id/delivered', (req, res, next: NextFunction) => {
  jobController.delivered(req, res, next).catch((err: unknown) => {
    next(err);
  });
});

// POST /api/jobs/:id/confirm-delivery - student confirms delivery (return jobs)
router.post('/:id/confirm-delivery', (req, res, next: NextFunction) => {
  jobController.confirmDelivery(req, res, next).catch((err: unknown) => {
    next(err);
  });
});

// Apply auth middleware to routes that change state
router.use(authenticateToken);

export default router;

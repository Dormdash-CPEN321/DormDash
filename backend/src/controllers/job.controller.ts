import { NextFunction, Request, Response } from 'express';
import { JobService } from '../services/job.service';
import {
  CreateJobRequest,
  CreateJobResponse,
  GetAllJobsResponse,
  GetJobResponse,
  GetMoverJobsResponse,
  UpdateJobStatusRequest,
  JobResponse,
} from '../types/job.type';
import logger from '../utils/logger.util';

export class JobController {
  constructor(private jobService: JobService) {}

  async createJob(
    req: Request<unknown, unknown, CreateJobRequest>,
    res: Response<CreateJobResponse>,
    next: NextFunction
  ) {
    try {
      const result = await this.jobService.createJob(req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getAllJobs(
    req: Request,
    res: Response<GetAllJobsResponse>,
    next: NextFunction
  ) {
    try {
      const result = await this.jobService.getAllJobs();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getAllAvailableJobs(
    req: Request,
    res: Response<GetAllJobsResponse>,
    next: NextFunction
  ) {
    try {
      const result = await this.jobService.getAllAvailableJobs();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getMoverJobs(
    req: Request,
    res: Response<GetMoverJobsResponse>,
    next: NextFunction
  ) {
    try {
      if (!req.user || !req.user._id) {
        throw new Error('User not authenticated');
      }
      const result = await this.jobService.getMoverJobs(
        req.user._id.toString()
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getStudentJobs(
    req: Request,
    res: Response<GetMoverJobsResponse>,
    next: NextFunction
  ) {
    try {
      if (!req.user || !req.user._id) {
        throw new Error('User not authenticated');
      }
      const result = await this.jobService.getStudentJobs(
        req.user._id.toString()
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async getJobById(
    req: Request<{ id: string }>,
    res: Response<GetJobResponse>,
    next: NextFunction
  ) {
    try {
      const result = await this.jobService.getJobById(req.params.id);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async updateJobStatus(
    req: Request<{ id: string }, {}, UpdateJobStatusRequest>,
    res: Response<JobResponse>,
    next: NextFunction
  ) {
    try {
      // If the user is accepting a job (status = ACCEPTED) and no moverId is provided,
      // use the authenticated user's ID
      logger.info(
        `updateJobStatus called for jobId=${req.params.id} payload=${JSON.stringify(req.body)}`
      );
      if (req.body.status === 'ACCEPTED' && !req.body.moverId && req.user) {
        req.body.moverId = req.user._id.toString();
        logger.info(
          `Assigned moverId from authenticated user: ${req.body.moverId}`
        );
      }

      const result = await this.jobService.updateJobStatus(
        req.params.id,
        req.body
      );
      res.status(200).json(result);
    } catch (error) {
      logger.error(
        `Error in updateJobStatus controller for jobId=${req.params.id}:`,
        error
      );
      next(error);
    }
  }

  // Mover indicates arrival and requests student confirmation
  async send_arrival_confirmation(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user || !req.user._id) throw new Error('User not authenticated');
      const moverId = req.user._id.toString();
      const result = await this.jobService.requestPickupConfirmation(
        req.params.id,
        moverId
      );
      res.status(200).json({
        success: true,
        message: 'Confirmation requested',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Student confirms mover picked up items
  async confirmPickup(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user || !req.user._id) throw new Error('User not authenticated');
      const studentId = req.user._id.toString();
      const result = await this.jobService.confirmPickup(
        req.params.id,
        studentId
      );
      res
        .status(200)
        .json({ success: true, message: 'Pickup confirmed', data: result });
    } catch (error) {
      next(error);
    }
  }

  // Mover indicates delivery completed and requests student confirmation (return jobs)
  async delivered(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user || !req.user._id) throw new Error('User not authenticated');
      const moverId = req.user._id.toString();
      const result = await this.jobService.requestDeliveryConfirmation(
        req.params.id,
        moverId
      );
      res.status(200).json({
        success: true,
        message: 'Delivery confirmation requested',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Student confirms mover delivered items (return jobs)
  async confirmDelivery(
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.user || !req.user._id) throw new Error('User not authenticated');
      const studentId = req.user._id.toString();
      const result = await this.jobService.confirmDelivery(
        req.params.id,
        studentId
      );
      res
        .status(200)
        .json({ success: true, message: 'Delivery confirmed', data: result });
    } catch (error) {
      next(error);
    }
  }
}

import { NextFunction, Request, Response } from 'express';

import { GetProfileResponse, UpdateProfileRequest, IUser } from '../types/user.types';
import logger from '../utils/logger.util';
import { userModel } from '../models/user.model';

export class UserController {
  getProfile(req: Request, res: Response<GetProfileResponse>) {
    if (!req.user) {
      return res.status(401).json({
        message: 'User not authenticated',
      });
    }
    const user = req.user;

    res.status(200).json({
      message: 'Profile fetched successfully',
      data: { user },
    });
  }
  // TODO: logic should be in service layer, for now I update the fcm token through this to avoid potential risk but
  // eventually fcm should have its own endpoint and controller
  async updateProfile(
    req: Request<unknown, unknown, UpdateProfileRequest>,
    res: Response<GetProfileResponse>,
    next: NextFunction
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          message: 'User not authenticated',
        } );
      }
      const user = req.user;

      // Explicitly type req.body as Partial<IUser>
      const updatedUser = await userModel.update(user._id, req.body as Partial<IUser>);

      if (!updatedUser) {
        return res.status(404).json({
          message: 'User not found',
        });
      }

      res.status(200).json({
        message: 'User info updated successfully',
        data: { user: updatedUser },
      });
    } catch (error) {
      logger.error('Failed to update user info:', error);

      if (error instanceof Error) {
        return res.status(500).json({
          message: error.message || 'Failed to update user info',
        });
      }

      next(error);
    }
  }

  async deleteProfile(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({
          message: 'User not authenticated',
        });
      }
      const user = req.user;

      await userModel.delete(user._id);

      res.status(200).json({
        message: 'User deleted successfully',
      });
    } catch (error) {
      logger.error('Failed to delete user:', error);

      if (error instanceof Error) {
        return res.status(500).json({
          message: error.message || 'Failed to delete user',
        });
      }

      next(error);
    }
  }

  async cashOut(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({
          message: 'User not authenticated',
        });
      }
      const user = req.user;

      // Only movers can cash out
      if (user.userRole !== 'MOVER') {
        return res.status(403).json({
          message: 'Only movers can cash out credits',
        });
      }

      // Reset credits to 0
      const updatedUser = await userModel.update(user._id, { credits: 0 });

      if (!updatedUser) {
        return res.status(404).json({
          message: 'User not found',
        });
      }

      res.status(200).json({
        message: 'Credits cashed out successfully',
        data: { user: updatedUser },
      });
    } catch (error) {
      logger.error('Failed to cash out credits:', error);

      if (error instanceof Error) {
        return res.status(500).json({
          message: error.message || 'Failed to cash out credits',
        });
      }

      next(error);
    }
  }
}
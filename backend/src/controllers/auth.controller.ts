import { NextFunction, Request, Response } from 'express';

import { authService } from '../services/auth.service';
import {
  AuthenticateUserRequest,
  AuthenticateUserResponse,
} from '../types/auth.types';
import logger from '../utils/logger.util';
import { UserRole, IUser } from '../types/user.types';
import { userModel } from '../models/user.model';

export class AuthController {
  async signUp(
    req: Request<unknown, unknown, AuthenticateUserRequest>,
    res: Response<AuthenticateUserResponse>,
    next: NextFunction
  ) {
    try {
      // Ensure the incoming idToken is treated as a string to avoid zod-infer/any leaks
      const { idToken } = req.body;
      const idTokenStr: string = idToken;

      const data = await authService.signUpWithGoogle(idTokenStr);

      return res.status(201).json({
        message: 'User signed up successfully',
        data,
      });
    } catch (error) {
      logger.error('Google sign up error:', error);

      if (error instanceof Error) {
        if (error.message === 'Invalid Google token') {
          return res.status(401).json({
            message: 'Invalid Google token',
          });
        }

        if (error.message === 'User already exists') {
          return res.status(409).json({
            message: 'User already exists, please sign in instead.',
          });
        }

        if (error.message === 'Failed to process user') {
          return res.status(500).json({
            message: 'Failed to process user information',
          });
        }
      }

      next(error);
    }
  }

  async signIn(
    req: Request<unknown, unknown, AuthenticateUserRequest>,
    res: Response<AuthenticateUserResponse>,
    next: NextFunction
  ) {
    try {
      const { idToken } = req.body;

      const data = await authService.signInWithGoogle(idToken);

      return res.status(200).json({
        message: 'User signed in successfully',
        data,
      });
    } catch (error) {
      logger.error('Google sign in error:', error);

      if (error instanceof Error) {
        if (error.message === 'Invalid Google token') {
          return res.status(401).json({
            message: 'Invalid Google token',
          });
        }

        if (error.message === 'User not found') {
          return res.status(404).json({
            message: 'User not found, please sign up first.',
          });
        }

        if (error.message === 'Failed to process user') {
          return res.status(500).json({
            message: 'Failed to process user information',
          });
        }
      }

      next(error);
    }
  }

  async selectRole(
    req: Request<unknown, unknown, { userRole: UserRole }>,
    res: Response,
    next: NextFunction
  ) {
    try {
      const user = req.user;
      const { userRole } = req.body;

      if (!user?._id) {
        return res.status(401).json({
          message: 'Authentication required',
        });
      }

      // Initialize credits to 0 when selecting MOVER role
      const updateData: Partial<IUser> = { userRole };
      if (userRole === 'MOVER') {
        updateData.credits = 0;
      }

      const updatedUser = await userModel.update(user._id, updateData);

      if (!updatedUser) {
        return res.status(404).json({
          message: 'User not found',
        });
      }

      return res.status(200).json({
        message: 'Role selected successfully',
        data: { user: updatedUser },
      });
    } catch (error) {
      logger.error('Role selection failed:', error);

      if (error instanceof Error) {
        return res.status(500).json({
          message: error.message ,
        });
      }

      next(error);
    }
  }
}

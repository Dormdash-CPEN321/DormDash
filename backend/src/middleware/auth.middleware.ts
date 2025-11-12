import { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { userModel } from '../models/user.model';

export const authenticateToken: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  (async () => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.split(' ')[1];

      if (!token) {
        res.status(401).json({
          error: 'Access denied',
          message: 'No token provided',
        });
        return;
      }

      if (!process.env.JWT_SECRET) {
        res.status(500).json({
          error: 'Server configuration error',
          message: 'JWT secret not configured',
        });
        return;
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET) as {
        id: mongoose.Types.ObjectId;
      };

      const user = await userModel.findById(decoded.id);

      if (!user) {
        res.status(401).json({
          error: 'User not found',
          message: 'Token is valid but user no longer exists',
        });
        return;
      }

      req.user = user;

      next();
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        res.status(401).json({
          error: 'Invalid token',
          message: 'Token is malformed or expired',
        });
        return;
      }

      next(error);
    }
  })().catch((err: unknown) => {
    next(err);
  });
};

/* New helper used by socket.io auth
 *  Needed since socket.io doesn't use Express middleware directly
 */
export const verifyTokenString = async (token?: string) => {
  if (!token) throw new Error('No token provided');

  const raw =
    typeof token === 'string' && token.startsWith('Bearer ')
      ? token.split(' ')[1]
      : token;

  if (!process.env.JWT_SECRET) {
    throw new Error('JWT secret not configured');
  }

  try {
    const decoded = jwt.verify(raw, process.env.JWT_SECRET) as { id: string };
    if (!decoded.id) throw new Error('Invalid token payload');

    const user = await userModel.findById(
      new mongoose.Types.ObjectId(decoded.id)
    );
    if (!user) throw new Error('User not found');

    return user;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new Error('Token expired');
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    }
    throw err;
  }
};

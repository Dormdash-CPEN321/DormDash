import mongoose, { Schema } from 'mongoose';
import { z } from 'zod';

import {
  createUserSchema,
  GoogleUserInfo,
  IUser,
  updateProfileSchema,
} from '../types/user.types';
import logger from '../utils/logger.util';

const userSchema = new Schema<IUser>(
  {
    userRole: {
      type: String,
      enum: ['STUDENT', 'MOVER'],
      required: false, // Optional during signup, required after role selection
    },
    googleId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    fcmToken: {
      type: String,
      required: false,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    profilePicture: {
      type: String,
      required: false,
      trim: true,
    },
    bio: {
      type: String,
      required: false,
      trim: true,
      maxlength: 500,
    },
    // Mover-specific fields
    availability: {
      type: Map,
      of: [[String]],
      required: false,
    },
    capacity: {
      type: Number,
      required: false,
    },
    carType: {
      type: String,
      required: false,
      trim: true,
    },
    plateNumber: {
      type: String,
      required: false,
      trim: true,
    },
    credits: {
      type: Number,
      required: false,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

export class UserModel {
  private user: mongoose.Model<IUser>;

  constructor() {
    this.user = mongoose.model<IUser>('User', userSchema);
  }

  async create(userInfo: GoogleUserInfo): Promise<IUser> {
    try {
      const validatedData = createUserSchema.parse(userInfo);

      return await this.user.create(validatedData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Validation error:', error.issues);
        throw new Error('Invalid update data');
      }
      console.error('Error updating user:', error);
      throw new Error('Failed to update user');
    }
  }

  async update(
    userId: mongoose.Types.ObjectId,
    user: Partial<IUser>
  ): Promise<IUser | null> {
    try {
      const validatedData = updateProfileSchema.parse(user) as Partial<IUser>;

      // If updating FCM token, first remove it from any other users
      // FCM tokens are device-specific, so one token can only belong to one user
      if (validatedData.fcmToken !== undefined) {
        await this.user.updateMany(
          {
            fcmToken: validatedData.fcmToken,
            _id: { $ne: userId }, // Don't update the current user
          },
          { $set: { fcmToken: null } }
        );
        logger.info(
          `Cleared FCM token ${validatedData.fcmToken} from other users before assigning to user ${userId.toString()}`
        );
      }

      const updatedUser = await this.user.findByIdAndUpdate(
        userId,
        validatedData as mongoose.UpdateQuery<IUser>,
        {
          new: true,
        }
      );
      return updatedUser;
    } catch (error) {
      logger.error('Error updating user:', error);
      throw new Error('Failed to update user');
    }
  }

  async delete(userId: mongoose.Types.ObjectId): Promise<void> {
    try {
      await this.user.findByIdAndDelete(userId);
    } catch (error) {
      logger.error('Error deleting user:', error);
      throw new Error('Failed to delete user');
    }
  }

  async findById(_id: mongoose.Types.ObjectId): Promise<IUser | null> {
    try {
      const user = await this.user.findOne({ _id });

      if (!user) {
        return null;
      }

      return user;
    } catch (error) {
      console.error('Error finding user by Google ID:', error);
      throw new Error('Failed to find user');
    }
  }

  async findByGoogleId(googleId: string): Promise<IUser | null> {
    try {
      const user = await this.user.findOne({ googleId });

      if (!user) {
        return null;
      }

      return user;
    } catch (error) {
      console.error('Error finding user by Google ID:', error);
      throw new Error('Failed to find user');
    }
  }

  // TODO: only students have fcmTokens for now, if stays this way, make this function only work for students
  async getFcmToken(userId: mongoose.Types.ObjectId): Promise<string | null> {
    try {
      const userDoc = await this.user.findById(userId).select('fcmToken');
      if (!userDoc) {
        return null;
      }
      return userDoc.fcmToken ?? null;
    } catch (error) {
      logger.error('Error getting FCM token:', error);
      throw new Error('Failed to get FCM token');
    }
  }

  /**
   * Clear invalid FCM token from any user who has it
   * This is called when Firebase reports a token as invalid/expired
   */
  async clearInvalidFcmToken(invalidToken: string): Promise<void> {
    try {
      const result = await this.user.updateMany(
        { fcmToken: invalidToken },
        { $set: { fcmToken: null } }
      );
      logger.info(
        `Cleared invalid FCM token from ${result.modifiedCount} user(s)`
      );
    } catch (error) {
      logger.error('Error clearing invalid FCM token:', error);
      throw new Error('Failed to clear invalid FCM token');
    }
  }
}

export const userModel = new UserModel();

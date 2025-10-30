import mongoose, { Document } from 'mongoose';
import z from 'zod';

// User model
// ------------------------------------------------------------

export type UserRole = 'STUDENT' | 'MOVER';

// Mover-specific types
export type TimeRange = [string, string]; // [startTime, endTime] in "HH:mm" format, e.g., ["08:30", "12:45"]

export type WeekDay = 'SUN' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT';

// Strongly-typed availability object with explicit weekday properties.
export interface DayAvailability {
  SUN?: TimeRange[];
  MON?: TimeRange[];
  TUE?: TimeRange[];
  WED?: TimeRange[];
  THU?: TimeRange[];
  FRI?: TimeRange[];
  SAT?: TimeRange[];
}

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  userRole?: UserRole; // Optional - set after signup
  googleId: string;
  email: string;
  fcmToken?: string;
  name: string;
  profilePicture?: string;
  bio?: string;
  // Mover-specific fields (only present when userRole is 'MOVER')
  availability?: DayAvailability;
  capacity?: number;
  carType?: string;
  plateNumber?: string;
  credits?: number; // Credits earned from completed jobs (mover only)
  createdAt: Date;
  updatedAt: Date;
}

// Zod schemas
// ------------------------------------------------------------
const timeStringSchema = z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
  message: 'Time must be in HH:mm format',
});

const timeRangeSchema = z.tuple([timeStringSchema, timeStringSchema]).refine(
  ([start, end]) => {
    const [startHour, startMin] = start.split(':').map(Number);
    const [endHour, endMin] = end.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    return startMinutes < endMinutes;
  },
  {
    message: 'Start time must be before end time',
  }
);

const availabilitySchema = z
  .object({
    SUN: z.array(timeRangeSchema).optional(),
    MON: z.array(timeRangeSchema).optional(),
    TUE: z.array(timeRangeSchema).optional(),
    WED: z.array(timeRangeSchema).optional(),
    THU: z.array(timeRangeSchema).optional(),
    FRI: z.array(timeRangeSchema).optional(),
    SAT: z.array(timeRangeSchema).optional(),
  })
  .optional();

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  googleId: z.string().min(1),
  profilePicture: z.string().optional(),
  bio: z.string().max(500).optional(),
});

export const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  bio: z.string().max(500).optional(),
  fcmToken: z.string().optional(),
  profilePicture: z.string().min(1).optional(),
  userRole: z.enum(['STUDENT', 'MOVER']).optional(),
  // Mover-specific fields
  availability: availabilitySchema,
  capacity: z.number().positive().optional(),
  carType: z.string().optional(),
  plateNumber: z.string().optional(),
  credits: z.number().min(0).optional(),
});

export const selectRoleSchema = z.object({
  userRole: z.enum(['STUDENT', 'MOVER']),
});

// Request types
// ------------------------------------------------------------
export interface GetProfileResponse {
  message: string;
  data?: {
    user: IUser;
  };
}

export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;

export type SelectRoleRequest = z.infer<typeof selectRoleSchema>;

export interface GoogleUserInfo {
  googleId: string;
  email: string;
  name: string;
  profilePicture?: string;
}

import { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { IUser } from '../types/user.types';
import logger from '../utils/logger.util';

const NUM_STUDENTS = 2000;
const NUM_MOVERS = 300;

// Get or create User model (only once)
function getUserModel() {
  try {
    return mongoose.model<IUser>('User');
  } catch {
    return mongoose.model<IUser>('User', new mongoose.Schema({}, { strict: false }));
  }
}

// Helper to generate unique email
function generateEmail(index: number, type: 'student' | 'mover'): string {
  return `loadtest.${type}.${index}@dormdash.test`;
}

// Helper to generate unique Google ID
function generateGoogleId(index: number, type: 'student' | 'mover'): string {
  return `loadtest_${type}_${index}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

// Helper to generate random name
function generateName(index: number, type: 'student' | 'mover'): string {
  const names = type === 'student' 
    ? ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry']
    : ['Mike', 'Sarah', 'John', 'Emma', 'David', 'Lisa', 'Tom', 'Anna'];
  const surnames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];
  const firstName = names[index % names.length];
  const lastName = surnames[Math.floor(index / names.length) % surnames.length];
  return `${firstName} ${lastName} ${index}`;
}

// Helper to generate mover availability
function generateAvailability() {
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const availability: any = {};
  
  const numDays = Math.floor(Math.random() * 3) + 3; // 3-5 days
  const selectedDays = days.sort(() => Math.random() - 0.5).slice(0, numDays);
  
  selectedDays.forEach((day) => {
    const startHour = Math.floor(Math.random() * 4) + 8; // 8-11
    const endHour = startHour + Math.floor(Math.random() * 4) + 4; // 4-7 hours later
    availability[day] = [[`${startHour.toString().padStart(2, '0')}:00`, `${endHour.toString().padStart(2, '0')}:00`]];
  });
  
  return availability;
}

export class LoadTestController {
  async seedUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const User = getUserModel();
      
      console.log(`\nCreating ${NUM_STUDENTS} students and ${NUM_MOVERS} movers...`);
      
      // Create students
      const students: Partial<IUser>[] = [];
      for (let i = 0; i < NUM_STUDENTS; i++) {
        students.push({
          email: generateEmail(i, 'student'),
          name: generateName(i, 'student'),
          googleId: generateGoogleId(i, 'student'),
          userRole: 'STUDENT',
        });
      }
      
      // Create movers
      const movers: Partial<IUser>[] = [];
      for (let i = 0; i < NUM_MOVERS; i++) {
        movers.push({
          email: generateEmail(i, 'mover'),
          name: generateName(i, 'mover'),
          googleId: generateGoogleId(i, 'mover'),
          userRole: 'MOVER',
          bio: `Professional mover ${i}`,
          availability: generateAvailability(),
          capacity: Math.floor(Math.random() * 50) + 20, // 20-70 cubic feet
          carType: ['Van', 'Truck', 'SUV'][Math.floor(Math.random() * 3)],
          plateNumber: `TEST${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
          credits: 0,
        });
      }
      
      let studentsCreated = 0;
      let moversCreated = 0;
      let studentsSkipped = 0;
      let moversSkipped = 0;
      
      // Insert students in batches
      const studentBatchSize = 100;
      for (let i = 0; i < students.length; i += studentBatchSize) {
        const batch = students.slice(i, i + studentBatchSize);
        try {
          const result = await User.insertMany(batch, { ordered: false });
          studentsCreated += result.length;
        } catch (error: any) {
          if (error.writeErrors) {
            studentsCreated += error.result.insertedCount || 0;
            studentsSkipped += error.writeErrors.length;
          } else if (error.code === 11000) {
            studentsSkipped += batch.length;
          }
        }
      }
      
      // Insert movers in batches
      const moverBatchSize = 50;
      for (let i = 0; i < movers.length; i += moverBatchSize) {
        const batch = movers.slice(i, i + moverBatchSize);
        try {
          const result = await User.insertMany(batch, { ordered: false });
          moversCreated += result.length;
        } catch (error: any) {
          if (error.writeErrors) {
            moversCreated += error.result.insertedCount || 0;
            moversSkipped += error.writeErrors.length;
          } else if (error.code === 11000) {
            moversSkipped += batch.length;
          }
        }
      }
      
      res.status(200).json({
        message: 'Load test users created successfully',
        data: {
          students: {
            created: studentsCreated,
            skipped: studentsSkipped,
            total: NUM_STUDENTS,
          },
          movers: {
            created: moversCreated,
            skipped: moversSkipped,
            total: NUM_MOVERS,
          },
        },
      });
    } catch (error) {
      logger.error('Error seeding load test users:', error);
      next(error);
    }
  }

  async getStudentIds(req: Request, res: Response, next: NextFunction) {
    try {
      const User = getUserModel();
      const loadTestUserPattern = /^loadtest\.student\.\d+@dormdash\.test$/;
      
      const students = await User.find({
        email: { $regex: loadTestUserPattern },
        userRole: 'STUDENT',
      })
        .select('_id')
        .lean();
      
      const studentIds = students.map((s) => s._id.toString());
      
      res.status(200).json({
        message: 'Student IDs retrieved successfully',
        data: {
          count: studentIds.length,
          studentIds: studentIds,
        },
      });
    } catch (error) {
      logger.error('Error getting student IDs:', error);
      next(error);
    }
  }

  async getMoverIds(req: Request, res: Response, next: NextFunction) {
    try {
      const User = getUserModel();
      const loadTestUserPattern = /^loadtest\.mover\.\d+@dormdash\.test$/;
      
      const movers = await User.find({
        email: { $regex: loadTestUserPattern },
        userRole: 'MOVER',
      })
        .select('_id')
        .lean();
      
      const moverIds = movers.map((m) => m._id.toString());
      
      res.status(200).json({
        message: 'Mover IDs retrieved successfully',
        data: {
          count: moverIds.length,
          moverIds: moverIds,
        },
      });
    } catch (error) {
      logger.error('Error getting mover IDs:', error);
      next(error);
    }
  }

  async deleteAllData(req: Request, res: Response, next: NextFunction) {
    try {
      const db = mongoose.connection.db;
      if (!db) {
        throw new Error('Database connection not available');
      }

      // Delete all orders
      const ordersCollection = db.collection('orders');
      const orderResult = await ordersCollection.deleteMany({});

      // Delete all jobs
      const jobsCollection = db.collection('jobs');
      const jobResult = await jobsCollection.deleteMany({});

      // Delete all users
      const usersCollection = db.collection('users');
      const userResult = await usersCollection.deleteMany({});

      res.status(200).json({
        message: 'All data deleted successfully',
        data: {
          users: {
            deleted: userResult.deletedCount,
          },
          orders: {
            deleted: orderResult.deletedCount,
          },
          jobs: {
            deleted: jobResult.deletedCount,
          },
        },
      });
    } catch (error) {
      logger.error('Error deleting all data:', error);
      next(error);
    }
  }
}


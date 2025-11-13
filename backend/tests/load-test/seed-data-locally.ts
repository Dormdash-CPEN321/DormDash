#!/usr/bin/env ts-node
/* Not part of the actual load test. Used for debugging load test locally */

/**
 * Creates students and movers in the database
 * We create:
 * - 2000 students (to handle multiple rounds of requests since each can only create one order)
 * - 300 movers (can view multiple jobs, so fewer needed)
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { connectDB, disconnectDB } from '../../src/config/database';
import { IUser } from '../../src/types/user.types';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const NUM_STUDENTS = 2000;
const NUM_MOVERS = 300;

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
  
  // Randomly assign availability to 3-5 days
  const numDays = Math.floor(Math.random() * 3) + 3; // 3-5 days
  const selectedDays = days.sort(() => Math.random() - 0.5).slice(0, numDays);
  
  selectedDays.forEach((day) => {
    // Random time slots (e.g., 08:00-12:00, 13:00-17:00)
    const startHour = Math.floor(Math.random() * 4) + 8; // 8-11
    const endHour = startHour + Math.floor(Math.random() * 4) + 4; // 4-7 hours later
    availability[day] = [[`${startHour.toString().padStart(2, '0')}:00`, `${endHour.toString().padStart(2, '0')}:00`]];
  });
  
  return availability;
}

// Get or create User model (only once)
function getUserModel() {
  try {
    return mongoose.model<IUser>('User');
  } catch {
    // Model doesn't exist yet, create it
    return mongoose.model<IUser>('User', new mongoose.Schema({}, { strict: false }));
  }
}

async function seedStudents() {
  console.log(`\nCreating ${NUM_STUDENTS} students...`);
  
  // Get User model (reuse if already created)
  const User = getUserModel();
  
  // Create students in batches to avoid overwhelming the database
  const batchSize = 100;
  let created = 0;
  let skipped = 0;
  
  for (let i = 0; i < NUM_STUDENTS; i += batchSize) {
    const batch: Partial<IUser>[] = [];
    
    for (let j = i; j < Math.min(i + batchSize, NUM_STUDENTS); j++) {
      batch.push({
        email: generateEmail(j, 'student'),
        name: generateName(j, 'student'),
        googleId: generateGoogleId(j, 'student'),
        userRole: 'STUDENT',
      });
    }
    
    try {
      // Use insertMany with ordered: false to continue on duplicates
      const result = await User.insertMany(batch, { ordered: false });
      created += result.length;
      
      if (created % 100 === 0) {
        process.stdout.write(`\rCreated ${created}/${NUM_STUDENTS} students...`);
      }
    } catch (error: any) {
      // insertMany with ordered: false returns partial results
      if (error.writeErrors) {
        created += error.result.insertedCount || 0;
        skipped += error.writeErrors.length;
      } else if (error.code === 11000) {
        skipped += batch.length;
      } else {
        console.error(`\nError creating students batch ${i}:`, error.message);
      }
    }
  }
  
  console.log(`\n✓ Created ${created} students (${skipped} skipped - already exist)`);
  return created;
}

async function seedMovers() {
  console.log(`\nCreating ${NUM_MOVERS} movers...`);
  
  // Get User model (reuse if already created)
  const User = getUserModel();
  
  // Create movers in batches
  const batchSize = 50;
  let created = 0;
  let skipped = 0;
  
  for (let i = 0; i < NUM_MOVERS; i += batchSize) {
    const batch: Partial<IUser>[] = [];
    
    for (let j = i; j < Math.min(i + batchSize, NUM_MOVERS); j++) {
      batch.push({
        email: generateEmail(j, 'mover'),
        name: generateName(j, 'mover'),
        googleId: generateGoogleId(j, 'mover'),
        userRole: 'MOVER',
        bio: `Professional mover ${j}`,
        availability: generateAvailability(),
        capacity: Math.floor(Math.random() * 50) + 20, // 20-70 cubic feet
        carType: ['Van', 'Truck', 'SUV'][Math.floor(Math.random() * 3)],
        plateNumber: `TEST${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
        credits: 0,
      });
    }
    
    try {
      // Use insertMany with ordered: false to continue on duplicates
      const result = await User.insertMany(batch, { ordered: false });
      created += result.length;
      
      if (created % 50 === 0) {
        process.stdout.write(`\rCreated ${created}/${NUM_MOVERS} movers...`);
      }
    } catch (error: any) {
      // insertMany with ordered: false returns partial results
      if (error.writeErrors) {
        created += error.result.insertedCount || 0;
        skipped += error.writeErrors.length;
      } else if (error.code === 11000) {
        skipped += batch.length;
      } else {
        console.error(`\nError creating movers batch ${i}:`, error.message);
      }
    }
  }
  
  console.log(`\n✓ Created ${created} movers (${skipped} skipped - already exist)`);
  return created;
}

async function main() {
  try {
    console.log('Connecting to database...');
    await connectDB();
    
    console.log('Starting user seeding for load testing...\n');
    
    const studentsCreated = await seedStudents();
    const moversCreated = await seedMovers();
    
    console.log('\n' + '='.repeat(60));
    console.log('Seeding Summary:');
    console.log('='.repeat(60));
    console.log(`Students created: ${studentsCreated}`);
    console.log(`Movers created: ${moversCreated}`);
    console.log(`Total users: ${studentsCreated + moversCreated}`);
    console.log('\n✓ User seeding completed!');
    console.log('\nNext steps:');
    console.log('1. Run: npm run load-test:generate-tokens');
    console.log('2. Run: npm run load-test');
    
  } catch (error) {
    console.error('Error seeding users:', error);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
}

main();


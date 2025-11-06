/**
 * Seed Availability Test Jobs Script
 *
 * This script creates exactly 2 test jobs for testing the availability filter:
 * 1. One job WITHIN the mover's availability (Monday 10:00 AM)
 * 2. One job OUTSIDE the mover's availability (Saturday 11:00 AM)
 *
 * Assumed Mover Availability: Monday-Friday 09:00-17:00
 *
 * Prerequisites:
 * - A test mover account must exist with availability set to Monday-Friday 09:00-17:00
 * - Test student and order IDs will be automatically generated
 *
 * Usage:
 *   npm run seed-availability-test-jobs
 * or
 *   ts-node scripts/seed-availability-test-jobs.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { JobType, JobStatus } from '../src/types/job.type';
import { jobSchema } from '../src/models/job.model';

dotenv.config();

// UBC Warehouse (common dropoff for STORAGE jobs)
const UBC_WAREHOUSE = {
  lat: 49.2606,
  lon: -123.2460,
  formattedAddress: "UBC Warehouse, 2329 West Mall, Vancouver, BC V6T 1Z4"
};

// Get next Monday at 10:00 AM (WITHIN availability: Monday-Friday 09:00-17:00)
function getNextMondayAt10AM(): Date {
  const date = new Date();
  const currentDay = date.getDay(); // 0 = Sunday, 1 = Monday, etc.

  // Calculate days until next Monday
  const daysUntilMonday = currentDay === 0 ? 1 : currentDay === 1 ? 7 : 8 - currentDay;

  date.setDate(date.getDate() + daysUntilMonday);
  date.setHours(10, 0, 0, 0);
  return date;
}

// Get next Saturday at 11:00 AM (OUTSIDE availability - weekend)
function getNextSaturdayAt11AM(): Date {
  const date = new Date();
  const currentDay = date.getDay();

  // Calculate days until next Saturday
  const daysUntilSaturday = currentDay === 6 ? 7 : 6 - currentDay;

  date.setDate(date.getDate() + daysUntilSaturday);
  date.setHours(11, 0, 0, 0);
  return date;
}

async function seedAvailabilityTestJobs() {
  try {
    console.log('🌱 Starting availability test job seeding...');
    console.log('━'.repeat(60));

    // Connect to MongoDB
    const uri = process.env.MONGODB_URI!;
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');

    // Generate test IDs
    const testStudentId = new mongoose.Types.ObjectId();

    console.log('\n📝 Test Student ID:', testStudentId.toString());

    // Register the Job model with schema
    const Job = mongoose.models.Job || mongoose.model('Job', jobSchema);

    // Clear existing jobs (optional - ensures clean state)
    const deleteResult = await Job.deleteMany({});
    console.log(`🗑️  Cleared ${deleteResult.deletedCount} existing jobs\n`);

    // Job 1: WITHIN availability (Monday 10:00 AM)
    const mondayDate = getNextMondayAt10AM();
    const job1 = {
      _id: new mongoose.Types.ObjectId(),
      orderId: new mongoose.Types.ObjectId(),
      studentId: testStudentId,
      jobType: JobType.STORAGE,
      status: JobStatus.AVAILABLE,
      volume: 2.5,
      price: 85.00,
      pickupAddress: {
        lat: 49.2827,
        lon: -123.1207,
        formattedAddress: "123 Main St, Vancouver, BC"
      },
      dropoffAddress: UBC_WAREHOUSE,
      scheduledTime: mondayDate,
      createdAt: new Date(),
    };

    // Job 2: OUTSIDE availability (Saturday 11:00 AM)
    const saturdayDate = getNextSaturdayAt11AM();
    const job2 = {
      _id: new mongoose.Types.ObjectId(),
      orderId: new mongoose.Types.ObjectId(),
      studentId: testStudentId,
      jobType: JobType.RETURN,
      status: JobStatus.AVAILABLE,
      volume: 3.2,
      price: 95.00,
      pickupAddress: UBC_WAREHOUSE,
      dropoffAddress: {
        lat: 49.2500,
        lon: -123.1000,
        formattedAddress: "555 Weekend Ave, Vancouver, BC"
      },
      scheduledTime: saturdayDate,
      createdAt: new Date(),
    };

    // Insert jobs
    const createdJobs = await Job.insertMany([job1, job2]);

    console.log('✅ Successfully created 2 test jobs!\n');
    console.log('━'.repeat(60));
    console.log('📊 Job Details:\n');

    console.log('Job 1: WITHIN AVAILABILITY ✅');
    console.log(`  ID: ${createdJobs[0]._id}`);
    console.log(`  Type: ${job1.jobType}`);
    console.log(`  Scheduled: ${mondayDate.toLocaleString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}`);
    console.log(`  Pickup: ${job1.pickupAddress.formattedAddress}`);
    console.log(`  Dropoff: ${job1.dropoffAddress.formattedAddress}`);
    console.log(`  Price: $${job1.price.toFixed(2)}`);
    console.log(`  Volume: ${job1.volume} m³\n`);

    console.log('Job 2: OUTSIDE AVAILABILITY ❌ (Weekend)');
    console.log(`  ID: ${createdJobs[1]._id}`);
    console.log(`  Type: ${job2.jobType}`);
    console.log(`  Scheduled: ${saturdayDate.toLocaleString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}`);
    console.log(`  Pickup: ${job2.pickupAddress.formattedAddress}`);
    console.log(`  Dropoff: ${job2.dropoffAddress.formattedAddress}`);
    console.log(`  Price: $${job2.price.toFixed(2)}`);
    console.log(`  Volume: ${job2.volume} m³\n`);

    console.log('━'.repeat(60));
    console.log('\n✅ Database is now ready for availability filter tests!');
    console.log('\n📋 Test Prerequisites Checklist:');
    console.log('  ✅ 2 jobs created (1 within, 1 outside availability)');
    console.log('  ⚠️  Ensure mover account has availability: Monday-Friday 09:00-17:00');
    console.log('  ⚠️  Run the BrowseAndFilterJobsTest on the frontend\n');
    console.log('💡 Expected Test Behavior:');
    console.log('  - "Show All" toggle: Should display BOTH jobs');
    console.log('  - "Within Availability" toggle: Should display ONLY Job 1 (Monday)\n');

  } catch (error) {
    console.error('❌ Error seeding availability test jobs:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed\n');
  }
}

// Run the script
seedAvailabilityTestJobs();


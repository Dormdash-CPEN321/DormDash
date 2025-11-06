/**
 * Clear All Jobs Script
 *
 * This script removes all jobs from the database.
 * Used as a prerequisite for certain tests that require an empty job pool.
 *
 * Usage:
 *   npm run clear-jobs
 * or
 *   ts-node scripts/clear-jobs.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { jobSchema } from '../src/models/job.model';

dotenv.config();

async function clearJobs() {
  try {
    console.log('🗑️  Starting job clearing...');

    // Connect to MongoDB
    const uri = process.env.MONGODB_URI!;
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');

    // Register the Job model with schema
    const Job = mongoose.models.Job || mongoose.model('Job', jobSchema);

    // Delete all jobs
    const result = await Job.deleteMany({});

    console.log(`\n✅ Successfully cleared ${result.deletedCount} jobs from the database!\n`);

  } catch (error) {
    console.error('❌ Error clearing jobs:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed\n');
  }
}

// Run the script
clearJobs();


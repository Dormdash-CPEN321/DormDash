#!/usr/bin/env ts-node
/* Not part of the actual load test. Used for debugging load test locally */

/**
 * Cleanup script to remove all load test data from the database
 * Deletes:
 * - All users with email pattern loadtest.*@dormdash.test
 * - All orders created by those users
 * - All jobs created by or assigned to those users
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { connectDB, disconnectDB } from '../../src/config/database';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function cleanupLoadTestData() {
  try {
    console.log('Connecting to database...');
    await connectDB();

    const db = mongoose.connection.db;
    if (!db) {
      throw new Error('Database connection not available');
    }

    console.log('\nCleaning up load test data...\n');

    // Find all load test users (matching email pattern)
    const loadTestUserPattern = /^loadtest\.(student|mover)\.\d+@dormdash\.test$/;
    const usersCollection = db.collection('users');
    const loadTestUsers = await usersCollection.find({
      email: { $regex: loadTestUserPattern }
    }).toArray();

    console.log(`Found ${loadTestUsers.length} load test users`);

    if (loadTestUsers.length === 0) {
      console.log('No load test users found. Nothing to clean up.');
      return;
    }

    const userIds = loadTestUsers.map((u) => u._id);
    const studentCount = loadTestUsers.filter((u) => u.userRole === 'STUDENT').length;
    const moverCount = loadTestUsers.filter((u) => u.userRole === 'MOVER').length;

    console.log(`  - ${studentCount} students`);
    console.log(`  - ${moverCount} movers`);

    // Delete orders created by load test students
    console.log('\nDeleting orders...');
    const ordersCollection = db.collection('orders');
    const orderResult = await ordersCollection.deleteMany({});
    console.log(`✓ Deleted ${orderResult.deletedCount} orders`);

    // Delete jobs created by load test students or assigned to load test movers
    console.log('\nDeleting jobs...');
    const jobsCollection = db.collection('jobs');
    const jobResult = await jobsCollection.deleteMany({});
    console.log(`✓ Deleted ${jobResult.deletedCount} jobs`);

    // Delete load test users
    console.log('\nDeleting users...');
    const userResult = await usersCollection.deleteMany({});
    console.log(`✓ Deleted ${userResult.deletedCount} users`);

    console.log('\n' + '='.repeat(60));
    console.log('Cleanup Summary:');
    console.log('='.repeat(60));
    console.log(`Users deleted: ${userResult.deletedCount}`);
    console.log(`Orders deleted: ${orderResult.deletedCount}`);
    console.log(`Jobs deleted: ${jobResult.deletedCount}`);
    console.log('\n✓ Load test data cleanup completed!');

  } catch (error) {
    console.error('Error cleaning up load test data:', error);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
}

// Run cleanup
cleanupLoadTestData();


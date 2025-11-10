#!/usr/bin/env ts-node

/**
 * Cleanup script for deployed server (uses API endpoints instead of direct DB access)
 * 
 * This script:
 * - Deletes all users, orders, and jobs via DELETE /api/load-test/delete-all
 * - No authentication required for this endpoint
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function deleteAllData() {
  try {
    console.log('Deleting all data via API endpoint...\n');
    
    const response = await fetch(`${BASE_URL}/api/load-test/delete-all`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(`HTTP ${response.status}: ${errorData.message || 'Failed to delete all data'}`);
    }
    
    const data = (await response.json()) as {
      message: string;
      data: {
        users: { deleted: number };
        orders: { deleted: number };
        jobs: { deleted: number };
      };
    };
    
    return data;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to delete all data: ${errorMessage}`);
  }
}

async function cleanupLoadTestData() {
  try {
    console.log('='.repeat(60));
    console.log('Load Test Cleanup for Deployed Server');
    console.log('='.repeat(60));
    console.log(`Target server: ${BASE_URL}\n`);

    const result = await deleteAllData();

    console.log('\n' + '='.repeat(60));
    console.log('Cleanup Summary:');
    console.log('='.repeat(60));
    console.log(`Users deleted: ${result.data.users.deleted}`);
    console.log(`Orders deleted: ${result.data.orders.deleted}`);
    console.log(`Jobs deleted: ${result.data.jobs.deleted}`);
    console.log('\n✓ Load test data cleanup completed!');

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error cleaning up load test data:', errorMessage);
    console.error('Make sure the server is running and the endpoint is accessible');
    process.exit(1);
  }
}

// Run cleanup
cleanupLoadTestData();

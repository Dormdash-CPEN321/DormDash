#!/usr/bin/env ts-node

/**
 * Setup script for deployed server (uses API endpoints instead of direct DB access)
 * 
 * This script:
 * - Seeds users via POST /api/load-test/seed-users
 * - Gets user IDs via GET /api/load-test/student-ids and GET /api/load-test/mover-ids
 * - Generates JWT tokens using the user IDs from the API
 * 
 * No database access required! Works entirely through API endpoints.
 */

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

console.log(`Using BASE_URL: ${BASE_URL}`);

async function verifyUsersExist() {
  console.log('Verifying server and endpoints...\n');
  
  // Check if load test endpoints are available
  try {
    const response = await fetch(`${BASE_URL}/api/load-test/student-ids`).catch(() => null);
    if (response && response.status !== 404) {
      console.log('✓ Load test endpoints are available\n');
    } else {
      console.log('⚠ Load test endpoints may not be available');
      console.log('Make sure the backend has the load test routes configured\n');
    }
  } catch (error) {
    console.log('⚠ Could not verify load test endpoints\n');
  }
  
  return true;
}

async function seedUsersViaAPI() {
  console.log('Seeding users via API endpoint...\n');
  
  try {
    const response = await fetch(`${BASE_URL}/api/load-test/seed-users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { message?: string };
      throw new Error(`HTTP ${response.status}: ${errorData.message || 'Failed to seed users'}`);
    }
    
    const data = (await response.json()) as {
      data: {
        students: { created: number; skipped: number; total: number };
        movers: { created: number; skipped: number; total: number };
      };
    };
    console.log('✓ Users seeded successfully');
    console.log(`  - Students: ${data.data.students.created} created, ${data.data.students.skipped} skipped`);
    console.log(`  - Movers: ${data.data.movers.created} created, ${data.data.movers.skipped} skipped\n`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('✗ Failed to seed users via API:', errorMessage);
    console.error('Make sure the server is running and accessible');
    throw error;
  }
}

async function generateTokensForDeployed() {
  console.log('Generating tokens using API endpoints...\n');
  
  // Run the token generator which now uses API endpoints
  const { execSync } = require('child_process');
  
  try {
    execSync('npm run load-test:generate-tokens', { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '../..'),
      env: { ...process.env, BASE_URL }
    });
    console.log('\n✓ Tokens generated successfully');
  } catch (error) {
    console.error('\n✗ Failed to generate tokens');
    console.error('Make sure the server is running and the endpoints are accessible');
    process.exit(1);
  }
}

async function main() {
  try {
    console.log('='.repeat(60));
    console.log('Load Test Setup for Deployed Server');
    console.log('='.repeat(60));
    console.log(`Target server: ${BASE_URL}\n`);
    
    // Verify server is accessible
    try {
      const response = await fetch(`${BASE_URL}/api/user/profile`).catch(() => null);
      if (response && (response.status === 200 || response.status === 401)) {
        console.log('✓ Server is accessible\n');
      } else {
        console.log('⚠ Could not verify server accessibility');
        console.log('Continuing anyway...\n');
      }
    } catch (error) {
      console.log('⚠ Could not verify server accessibility');
      console.log('Continuing anyway...\n');
    }
    
    await verifyUsersExist();
    
    // Seed users via API
    await seedUsersViaAPI();
    
    // Generate tokens using API endpoints
    await generateTokensForDeployed();
    
    console.log('\n' + '='.repeat(60));
    console.log('Setup Complete!');
    console.log('='.repeat(60));
    console.log('\nNext steps:');
    console.log('1. Verify tokens.js was generated');
    console.log('2. Run: npm run load-test:direct');
    console.log('3. After test: npm run load-test:cleanup-deployed');
    
  } catch (error) {
    console.error('Error during setup:', error);
    process.exit(1);
  }
}

main();


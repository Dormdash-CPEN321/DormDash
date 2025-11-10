#!/usr/bin/env node

/**
 * Generate JWT tokens for load testing
 * Uses API endpoints to get user IDs, then generates tokens
 * Works with deployed servers - no database access required!
 */

const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const JWT_SECRET = process.env.JWT_SECRET;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

console.log(`Using BASE_URL: ${BASE_URL}`);

// Generate tokens for user IDs
function generateTokens(userIds, secret) {
  return userIds.map((id) => {
    const payload = { id };
    return jwt.sign(payload, secret, { expiresIn: '19h' });
  });
}

// Get student IDs from API
async function getStudentIdsFromAPI() {
  try {
    const response = await fetch(`${BASE_URL}/api/load-test/student-ids`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.data?.studentIds || [];
  } catch (error) {
    console.error('Error fetching student IDs from API:', error.message);
    return [];
  }
}

// Get mover IDs from API
async function getMoverIdsFromAPI() {
  try {
    const response = await fetch(`${BASE_URL}/api/load-test/mover-ids`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.data?.moverIds || [];
  } catch (error) {
    console.error('Error fetching mover IDs from API:', error.message);
    return [];
  }
}

async function main() {
  try {
    console.log(`\nFetching user IDs from API: ${BASE_URL}`);
    console.log('Using API endpoints - no database access required!\n');
    
    const studentIds = await getStudentIdsFromAPI();
    const moverIds = await getMoverIdsFromAPI();

    if (studentIds.length === 0) {
      console.warn('\n⚠ No students found!');
      console.warn('Please run: POST /api/load-test/seed-users first');
      console.warn('Or run: npm run load-test:seed-users (if you have DB access)');
      console.warn('Creating empty tokens.js file...');
    }

    if (moverIds.length === 0) {
      console.warn('\n⚠ No movers found!');
      console.warn('Please run: POST /api/load-test/seed-users first');
      console.warn('Or run: npm run load-test:seed-users (if you have DB access)');
      console.warn('Creating empty tokens.js file...');
    }

    if (studentIds.length > 0) {
      console.log(`✓ Found ${studentIds.length} students`);
    }
    if (moverIds.length > 0) {
      console.log(`✓ Found ${moverIds.length} movers`);
    }

    // Generate tokens (empty arrays if no users found)
    console.log('\nGenerating JWT tokens...');
    const studentTokens = studentIds.length > 0 ? generateTokens(studentIds, JWT_SECRET) : [];
    const moverTokens = moverIds.length > 0 ? generateTokens(moverIds, JWT_SECRET) : [];

    // Create JavaScript file with tokens
    const tokensFile = `// Auto-generated token file for k6 load testing
// Generated at: ${new Date().toISOString()}
// DO NOT EDIT - Regenerate using: npm run load-test:generate-tokens
// 
// This file contains tokens for ${studentTokens.length} students and ${moverTokens.length} movers
// Each request in the load test will randomly select a token from the appropriate list

export const studentTokens = ${JSON.stringify(studentTokens, null, 2)};

export const moverTokens = ${JSON.stringify(moverTokens, null, 2)};

export const studentIds = ${JSON.stringify(studentIds, null, 2)};

export const moverIds = ${JSON.stringify(moverIds, null, 2)};
`;

    // Write to file
    const outputPath = path.join(__dirname, 'tokens.js');
    fs.writeFileSync(outputPath, tokensFile);

    console.log('\n✓ Generated tokens file:', outputPath);
    console.log(`✓ Generated ${studentTokens.length} student tokens`);
    console.log(`✓ Generated ${moverTokens.length} mover tokens`);
    
    if (studentTokens.length === 0 && moverTokens.length === 0) {
      console.warn('\n⚠ WARNING: No tokens generated!');
      console.warn('The load test will fail without tokens.');
      console.warn('Please run: POST /api/load-test/seed-users first');
    } else {
      console.log('\nTokens are ready for use in load-test.js');
    }

  } catch (error) {
    console.error('Error generating tokens:', error);
    process.exit(1);
  }
}

main();

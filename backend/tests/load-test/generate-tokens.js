#!/usr/bin/env node

/**
 * Generate JWT tokens for load testing
 * Queries the database for students and movers, then generates tokens for them
 * Outputs them as a JavaScript file that can be imported by k6
 */

const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('Error: MONGODB_URI is not set in .env file');
  process.exit(1);
}

// Connect to database
async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to database');
  } catch (error) {
    console.error('Error connecting to database:', error);
    process.exit(1);
  }
}

// Disconnect from database
async function disconnectDB() {
  try {
    await mongoose.connection.close();
    console.log('✓ Disconnected from database');
  } catch (error) {
    console.error('Error disconnecting from database:', error);
  }
}

// Get or create User model 
function getUserModel() {
  try {
    return mongoose.model('User');
  } catch {
    // Model doesn't exist yet, create it
    return mongoose.model('User', new mongoose.Schema({}, { strict: false }));
  }
}

// Get students from database
async function getStudents(limit = 2000) {
  const User = getUserModel();
  const students = await User.find({ userRole: 'STUDENT' }).limit(limit).select('_id').lean();
  return students.map((s) => s._id.toString());
}

// Get movers from database
async function getMovers(limit = 300) {
  const User = getUserModel();
  const movers = await User.find({ userRole: 'MOVER' }).limit(limit).select('_id').lean();
  return movers.map((m) => m._id.toString());
}

// Generate tokens for user IDs
function generateTokens(userIds, secret) {
  return userIds.map((id) => {
    const payload = { id };
    return jwt.sign(payload, secret, { expiresIn: '19h' });
  });
}

async function main() {
  try {
    await connectDB();

    console.log('\nFetching students and movers from database...');
    
    const studentIds = await getStudents(2000);
    const moverIds = await getMovers(300);

    if (studentIds.length === 0) {
      console.error('\n✗ No students found in database!');
      console.error('Please run: npm run load-test:seed-users');
      process.exit(1);
    }

    if (moverIds.length === 0) {
      console.error('\n✗ No movers found in database!');
      console.error('Please run: npm run load-test:seed-users');
      process.exit(1);
    }

    console.log(`✓ Found ${studentIds.length} students`);
    console.log(`✓ Found ${moverIds.length} movers`);

    // Generate tokens
    console.log('\nGenerating JWT tokens...');
    const studentTokens = generateTokens(studentIds, JWT_SECRET);
    const moverTokens = generateTokens(moverIds, JWT_SECRET);

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
    console.log('\nTokens are ready for use in load-test.js');

  } catch (error) {
    console.error('Error generating tokens:', error);
    process.exit(1);
  } finally {
    await disconnectDB();
  }
}

main();

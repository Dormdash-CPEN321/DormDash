import mongoose from "mongoose";

/**
 * Mongoose utility functions
 * Helpers for working with Mongoose ObjectIds and populated documents
 */

/**
 * Extract ObjectId from a field that might be populated
 * Handles both populated documents and direct ObjectIds
 * 
 * @param field - Field that might be an ObjectId or populated document
 * @returns ObjectId or null if field is invalid
 */
export function extractObjectId(field: any): mongoose.Types.ObjectId | null {
  if (!field) return null;
  
  // If it's already an ObjectId
  if (field instanceof mongoose.Types.ObjectId) {
    return field;
  }
  
  // If it's a populated document with _id
  if (field._id) {
    return field._id;
  }
  
  // Try to create ObjectId from string
  try {
    return new mongoose.Types.ObjectId(field);
  } catch {
    return null;
  }
}

/**
 * Extract ObjectId as string from a field that might be populated
 * 
 * @param field - Field that might be an ObjectId or populated document
 * @returns ObjectId as string or empty string if invalid
 */
export function extractObjectIdString(field: unknown): string {
  const objectId = extractObjectId(field);
  return objectId ? objectId.toString() : '';
}

/**
 * Validate if a string is a valid MongoDB ObjectId
 * 
 * @param id - String to validate
 * @returns true if valid ObjectId format
 */
export function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * Pricing Configuration
 * Centralized pricing constants for the application
 */

export const PRICING = {
  /**
   * Job pricing split between storage and return jobs
   */
  STORAGE_JOB_SPLIT: 0.6, // 60% of total price for storage/pickup
  RETURN_JOB_SPLIT: 0.4, // 40% of total price for return delivery

  /**
   * Distance-based pricing
   */
  PRICE_PER_KM: 2.0, // $2 per kilometer

  /**
   * Storage pricing
   */
  DAILY_STORAGE_RATE: 5.0, // $5 per day for storage

  /**
   * Late return fees
   */
  LATE_FEE_RATE: 5.0, // $5 per day for late returns
} as const;

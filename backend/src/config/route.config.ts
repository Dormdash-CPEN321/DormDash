/**
 * Route Algorithm Configuration
 * Constants for the smart route optimization algorithm
 */

export const ROUTE_CONFIG = {
  /**
   * Average driving speed in Greater Vancouver
   */
  AVERAGE_SPEED_KMH: 40,

  /**
   * Job duration estimation
   */
  JOB_DURATION_PER_M3: 15, // Minutes per cubic meter
  BASE_JOB_TIME: 30, // Minimum job duration in minutes

  /**
   * Algorithm weights
   */
  PROXIMITY_WEIGHT: 0.7, // Weight for distance in scoring (0-1)
  // Higher = prioritize nearby jobs
  // Lower = prioritize high-value jobs
} as const;

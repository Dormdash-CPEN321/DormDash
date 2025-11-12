import { userModel } from '../models/user.model';
import { JobResponse } from '../types/job.type';
import { DayAvailability, TimeRange, WeekDay } from '../types/user.types';
import { JobInRoute, RouteMetrics } from '../types/route.types';
import logger from '../utils/logger.util';
import { ROUTE_CONFIG } from '../config/route.config';
import { jobService } from './job.service';
import { extractObjectId } from '../utils/mongoose.util';

/**
 * RoutePlannerService - Provides smart route optimization for movers
 *
 * Uses a greedy algorithm with composite scoring to build optimized job routes
 * that balance earnings potential with travel efficiency.
 */
export class RoutePlannerService {
  /**
   * Calculate the optimal route for a mover based on available jobs and their availability
   *
   * Algorithm Overview:
   * 1. Filter jobs by mover's availability windows
   * 2. Calculate value score for each job (price/duration)
   * 3. Greedily select next best job based on composite score
   * 4. Update time and location after each job
   * 5. Stop when maxDuration is reached (if specified)
   * 6. Return optimized route with metrics
   *
   * @param moverId - ID of the mover
   * @param currentLocation - Mover's current location {lat, lon}
   * @param maxDuration - Maximum route duration in minutes (optional)
   * @returns Optimized route with jobs and metrics
   */
  async calculateSmartRoute(
    moverId: string,
    currentLocation: { lat: number; lon: number },
    maxDuration?: number
  ): Promise<{
    route: JobInRoute[];
    metrics: RouteMetrics;
    startLocation: { lat: number; lon: number };
  }> {
    try {
      // Fetch mover's availability
      // Resolve moverId safely to an ObjectId (handles string, ObjectId, populated doc)
      const moverObjectId = extractObjectId(moverId);
      if (!moverObjectId) {
        logger.warn(
          `Invalid moverId provided to route planner: ${String(moverId)}`
        );
        return this.emptyRoute(currentLocation);
      }

      const mover = await userModel.findById(moverObjectId);
      if (!mover?.availability) {
        logger.warn(`Mover ${moverId} not found or has no availability`);
        return this.emptyRoute(currentLocation);
      }

      // Fetch all available jobs
      const resp = await jobService.getAllAvailableJobs();
      const availableJobs = resp.data?.jobs;
      //map job responses to Job objects
      if (!availableJobs || availableJobs.length === 0) {
        logger.info('No available jobs found');
        return this.emptyRoute(currentLocation);
      }

      // Validate job location data
      const validJobs = availableJobs.filter(job =>
        this.validateJobLocationData(job)
      );
      const invalidLocationJobs = availableJobs.filter(
        job => !this.validateJobLocationData(job)
      );
      try {
        if (invalidLocationJobs.length > 0) {
          logger.debug(
            `Jobs excluded for missing/invalid location: ${JSON.stringify(invalidLocationJobs.map(j => ({ id: j.id, pickup: j.pickupAddress, dropoff: j.dropoffAddress })))}`
          );
        }
      } catch (e) {
        logger.debug(
          `Invalid-location jobs count: ${invalidLocationJobs.length}`
        );
      }
      if (validJobs.length === 0) {
        logger.info('No jobs with valid location data found');
        return this.emptyRoute(currentLocation);
      }

      // Step 1: Filter jobs by availability windows
      const eligibleJobs = this.filterJobsByAvailability(
        validJobs,
        mover.availability
      );
      try {
        const excludedByAvailability = validJobs.filter(
          j => !eligibleJobs.includes(j)
        );
        if (excludedByAvailability.length > 0) {
          logger.debug(
            `Jobs excluded by availability filter: ${JSON.stringify(excludedByAvailability.map(j => ({ id: j.id, scheduledTime: j.scheduledTime })))}`
          );
        }
      } catch (e) {
        logger.debug(`Eligible jobs count: ${eligibleJobs.length}`);
      }

      if (eligibleJobs.length === 0) {
        logger.info("No jobs match mover's availability");
        return this.emptyRoute(currentLocation);
      }

      // Step 2: Calculate value scores for jobs
      const jobsWithValues = this.calculateJobValues(eligibleJobs);

      // Step 3: Build optimal route using greedy algorithm
      // Debug: show candidate jobs after availability filter
      try {
        logger.debug(
          `Building route from ${jobsWithValues.length} candidate jobs (eligible: ${eligibleJobs.length})`
        );
      } catch (e) {
        // ignore
      }

      const route = this.buildOptimalRoute(
        jobsWithValues,
        currentLocation,
        mover.availability,
        maxDuration
      );

      // Step 4: Calculate route metrics
      const metrics = this.calculateRouteMetrics(route);

      logger.info(
        `Route complete: ${route.length} jobs, ${metrics.totalDuration} minutes total, $${metrics.totalEarnings.toFixed(2)} earnings`
      );

      return {
        route,
        metrics,
        startLocation: currentLocation,
      };
    } catch (error) {
      logger.error('Error calculating smart route:', error);
      throw new Error('Failed to calculate smart route');
    }
  }

  /**
   * Filter jobs that fall within mover's availability windows
   */
  private filterJobsByAvailability(
    jobs: JobResponse[],
    availability: DayAvailability
  ): JobResponse[] {
    const filtered = jobs.filter(job => {
      const scheduledTime = new Date(job.scheduledTime);
      const dayOfWeek = this.convertToDayOfWeek(scheduledTime.getDay());
      const jobTimeString = `${scheduledTime.getHours()}:${scheduledTime.getMinutes().toString().padStart(2, '0')}`;

      // Safely obtain day slots for the given day
      const daySlots = this.getDaySlotsForAvailability(availability, dayOfWeek);

      if (daySlots.length === 0) {
        return false;
      }

      const matches = daySlots.some((slot: TimeRange) => {
        const [startTime, endTime] = slot;
        const jobDuration = this.estimateJobDuration(job.volume);

        // Parse times
        const [jobHour, jobMin] = jobTimeString.split(':').map(Number);
        const [startHour, startMin] = startTime.split(':').map(Number);
        const [endHour, endMin] = endTime.split(':').map(Number);

        const jobMinutes = jobHour * 60 + jobMin;
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;
        const jobEndMinutes = jobMinutes + jobDuration;

        // Job must start and end within the slot
        return jobMinutes >= startMinutes && jobEndMinutes <= endMinutes;
      });

      return matches;
    });

    return filtered;
  }

  /**
   * Safely extract day slots from availability (handles Map and plain object)
   * and ensures the lookup key is one of the expected day strings.
   */
  private getDaySlotsForAvailability(
    availability: DayAvailability,
    dayOfWeek: 'SUN' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT'
  ) {

    // Use explicit property access (dot access) to avoid dynamic indexing
    switch (dayOfWeek) {
      case 'SUN':
        return availability.SUN ?? [];
      case 'MON':
        return availability.MON ?? [];
      case 'TUE':
        return availability.TUE ?? [];
      case 'WED':
        return availability.WED ?? [];
      case 'THU':
        return availability.THU ?? [];
      case 'FRI':
        return availability.FRI ?? [];
      case 'SAT':
        return availability.SAT ?? [];
      default:
        return [];
    }
  }

  /**
   * Calculate value score for each job (earnings per minute)
   */
  private calculateJobValues(
    jobs: JobResponse[]
  ): (JobResponse & { valueScore: number; scheduledTime: Date })[] {
    return jobs.map(job => {
      const duration = this.estimateJobDuration(job.volume);
      const valueScore = job.price / duration; // Earnings per minute

      // Convert scheduledTime to Date for internal routing calculations.
      const scheduledTimeDate = job.scheduledTime
        ? new Date(job.scheduledTime)
        : new Date();

      // Keep string IDs as-is (the frontend DTO provides string IDs). Do NOT
      // attempt to re-create ObjectId instances from those strings here — that
      // is brittle and will throw BSONErrors for non-24-char values.
      return {
        ...job,
        valueScore,
        scheduledTime: scheduledTimeDate,
      } as JobResponse & { valueScore: number; scheduledTime: Date };
    });
  }

  /**
   * Estimate job duration based on volume
   */
  private estimateJobDuration(volume: number): number {
    return (
      ROUTE_CONFIG.BASE_JOB_TIME + volume * ROUTE_CONFIG.JOB_DURATION_PER_M3
    );
  }

  /**
   * Build optimal route respecting scheduled times
   *
   * Algorithm:
   * 1. Sort jobs by scheduled time (earliest first) - TIME IS THE PRIMARY CONSTRAINT
   * 2. For each iteration, find all feasible jobs (can arrive before scheduled time)
   * 3. Select the earliest feasible job (respects time above all else)
   * 4. Add waiting time if arriving early
   * 5. Stop if maxDuration is reached
   *
   * This ensures the route is always in chronological order and respects
   * the fixed scheduled times that students have set.
   */
  private buildOptimalRoute(
    jobs: (JobResponse & { valueScore: number })[],
    startLocation: { lat: number; lon: number },
    availability: DayAvailability,
    maxDuration?: number
  ): JobInRoute[] {
    const route: JobInRoute[] = [];
    let currentLocation = startLocation;
    let currentTime = new Date();
    let totalElapsedTime = 0;
    const remainingJobs = [...jobs];

    // STEP 1: Sort all jobs by scheduled time (earliest first)
    // This ensures we respect time constraints above all else
    remainingJobs.sort((a: { scheduledTime: Date | string }, b: { scheduledTime: Date | string }) => {
      const timeA = new Date(a.scheduledTime).getTime();
      const timeB = new Date(b.scheduledTime).getTime();
      return timeA - timeB;
    });

    while (remainingJobs.length > 0) {
      const jobsWithDistances = remainingJobs
        .map(job => {
          // Ensure we are dealing with plain objects (they were normalized earlier)
          const j = job;
          const location = j.pickupAddress;

          // Explicitly type location as a coordinate object after validation
          const validLocation: { lat: number; lon: number } = location;
          const distance = this.calculateDistance(currentLocation, validLocation);
          const travelTime = this.estimateTravelTime(distance); // in minutes
          const arrivalTime = new Date(
            currentTime.getTime() + travelTime * 60000
          );
          const scheduledTime = new Date(job.scheduledTime);

          const isFeasibleByArrival =
            arrivalTime.getTime() <= scheduledTime.getTime();

          // Calculate waiting time if arriving early
          const waitingTime = isFeasibleByArrival
            ? Math.max(
                0,
                (scheduledTime.getTime() - arrivalTime.getTime()) / 60000
              )
            : 0;

          const jobDuration = this.estimateJobDuration(job.volume);
          const jobEndTime = new Date(
            scheduledTime.getTime() + jobDuration * 60000
          );

          // Check mover availability for this job time window
          const dayOfWeek = this.convertToDayOfWeek(scheduledTime.getDay());
          const daySlots = this.getDaySlotsForAvailability(
            availability,
            dayOfWeek
          );
          let withinAvailability = false;
          if (daySlots.length > 0) {
            withinAvailability = daySlots.some((slot: TimeRange) => {
              const [startTime, endTime] = slot;
              const [startHour, startMin] = startTime.split(':').map(Number);
              const [endHour, endMin] = endTime.split(':').map(Number);
              const startMinutes = startHour * 60 + startMin;
              const endMinutes = endHour * 60 + endMin;
              const jobStartMinutes =
                scheduledTime.getHours() * 60 + scheduledTime.getMinutes();
              const jobEndMinutes = jobStartMinutes + jobDuration;
              return (
                jobStartMinutes >= startMinutes && jobEndMinutes <= endMinutes
              );
            });
          }

          return {
            ...job,
            distance,
            travelTime,
            arrivalTime,
            scheduledTime,
            isFeasibleByArrival,
            waitingTime,
            jobDuration,
            jobEndTime,
            withinAvailability,
          };
        })
        .filter(Boolean);

      // STEP 2: Filter to only feasible jobs (can arrive on time)
      // Filter jobs that are feasible by arrival, within mover availability,
      // and — if a maxDuration is provided — fit within the remaining time budget.
      // NOTE: maxDuration should only count ACTIVE work time (travel + job execution),
      // NOT waiting time (idle time waiting for scheduled start).
      const feasibleJobs = jobsWithDistances.filter(j => {
        if (!j.isFeasibleByArrival) return false;
        if (!j.withinAvailability) return false;
        if (typeof maxDuration === 'number') {
          // Only count active work time: travel + job duration (exclude waiting)
          const activeWorkTime = (j.travelTime || 0) + (j.jobDuration || 0);
          if (totalElapsedTime + activeWorkTime > maxDuration) return false;
        }
        return true;
      });

      if (feasibleJobs.length === 0) {
        logger.info(
          `No more feasible jobs (${jobsWithDistances.length} jobs remaining but can't reach any in time)`
        );
        break;
      }

      // STEP 3: Select the earliest feasible job
      // Since jobs are already sorted by scheduledTime, feasibleJobs[0] is the earliest
      // Pick the earliest scheduled feasible job
      // feasibleJobs was produced by mapping and filtering earlier; it contains only objects
      // where scheduledTime has been converted to Date. Cast here to a simpler typed array
      // so we can sort without introducing `any` on the comparator parameters.
      (feasibleJobs as { scheduledTime: Date }[]).sort(
        (a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime()
      );
      const selectedJob = feasibleJobs[0];

      const jobDuration = selectedJob.jobDuration;
      const pickupLoc = selectedJob.pickupAddress;
      const dropoffLoc = selectedJob.dropoffAddress;
      const travelTime = selectedJob.travelTime;

      route.push({
        jobId: String(selectedJob.id),
        orderId: String(selectedJob.orderId),
        studentId: String(selectedJob.studentId),
        jobType: selectedJob.jobType as 'STORAGE' | 'RETURN',
        volume: selectedJob.volume,
        price: selectedJob.price,
        pickupAddress: pickupLoc,
        dropoffAddress: dropoffLoc,
        scheduledTime: selectedJob.scheduledTime.toISOString(),
        estimatedStartTime: selectedJob.scheduledTime.toISOString(),
        estimatedDuration: Math.round(jobDuration),
        distanceFromPrevious: Math.round((selectedJob.distance || 0) * 10) / 10,
        travelTimeFromPrevious: Math.round(travelTime),
      });

      // Advance current time to end of job (start at scheduledTime)
      currentTime = new Date(
        selectedJob.scheduledTime.getTime() + jobDuration * 60000
      );

      // Increase total elapsed time by ACTIVE work time only (travel + job)
      // Waiting time is idle and shouldn't count against max duration
      totalElapsedTime += travelTime + jobDuration;

      // Remove selected job from remaining jobs
      const jobIndex = remainingJobs.findIndex(
        j => String(j.id) === String(selectedJob.id)
      );
      if (jobIndex >= 0) remainingJobs.splice(jobIndex, 1);
    }

    return route;
  }

  /**
   * Calculate distance between two points using Haversine formula
   *
   * @returns Distance in kilometers
   */
  private calculateDistance(
    from: { lat: number; lon: number },
    to: { lat: number; lon: number }
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRadians(to.lat - from.lat);
    const dLon = this.toRadians(to.lon - from.lon);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(from.lat)) *
        Math.cos(this.toRadians(to.lat)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Estimate travel time based on distance
   *
   * @returns Travel time in minutes
   */
  private estimateTravelTime(distanceKm: number): number {
    return (distanceKm / ROUTE_CONFIG.AVERAGE_SPEED_KMH) * 60;
  }

  /**
   * Calculate aggregate metrics for the route
   */
  private calculateRouteMetrics(route: JobInRoute[]): RouteMetrics {
    if (route.length === 0) {
      return {
        totalEarnings: 0,
        totalJobs: 0,
        totalDistance: 0,
        totalDuration: 0,
        earningsPerHour: 0,
      };
    }

    const totalEarnings = route.reduce((sum, job) => sum + job.price, 0);
    const totalDistance = route.reduce(
      (sum, job) => sum + job.distanceFromPrevious,
      0
    );
    const totalDuration = route.reduce(
      (sum, job) => sum + job.estimatedDuration + job.travelTimeFromPrevious,
      0
    );
    const earningsPerHour =
      totalDuration > 0 ? (totalEarnings / totalDuration) * 60 : 0;

    return {
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      totalJobs: route.length,
      totalDistance: Math.round(totalDistance * 100) / 100,
      totalDuration: Math.round(totalDuration),
      earningsPerHour: Math.round(earningsPerHour * 100) / 100,
    };
  }

  /**
   * Helper: Convert numeric day (0-6) to three-letter day string
   */
  private convertToDayOfWeek(day: number): WeekDay {
    switch (day) {
      case 0:
        return 'SUN';
      case 1:
        return 'MON';
      case 2:
        return 'TUE';
      case 3:
        return 'WED';
      case 4:
        return 'THU';
      case 5:
        return 'FRI';
      case 6:
        return 'SAT';
      default:
        return 'SUN';
    }
  }

  /**
   * Helper: Convert degrees to radians
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Helper: Return empty route structure
   */
  private emptyRoute(location: { lat: number; lon: number }) {
    return {
      route: [],
      metrics: {
        totalEarnings: 0,
        totalJobs: 0,
        totalDistance: 0,
        totalDuration: 0,
        earningsPerHour: 0,
      },
      startLocation: location,
    };
  }

  /**
   * Validate job location data
   * Ensures that both pickupAddress and dropoffAddress are present and valid
   */
  private validateJobLocationData(job: JobResponse): boolean {
    const { pickupAddress, dropoffAddress } = job;

    if (!pickupAddress.lat || !pickupAddress.lon) {
      logger.warn(
        `Job ${job.id} has invalid or missing pickupAddress: ${JSON.stringify(pickupAddress)}`
      );
      return false;
    }

    if (!dropoffAddress.lat || !dropoffAddress.lon) {
      logger.warn(
        `Job ${job.id} has invalid or missing dropoffAddress: ${JSON.stringify(dropoffAddress)}`
      );
      return false;
    }

    return true;
  }
}

export const routePlannerService = new RoutePlannerService();

import { userModel } from "../models/user.model";
import { JobResponse } from "../types/job.type";
import { DayAvailability, TimeRange } from "../types/user.types";
import { JobInRoute, RouteMetrics } from "../types/route.types";
import logger from "../utils/logger.util";
import { ROUTE_CONFIG } from "../config/route.config";
import { jobService } from "./job.service";
import { extractObjectId } from "../utils/mongoose.util";

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
  ): Promise<{ route: JobInRoute[]; metrics: RouteMetrics; startLocation: { lat: number; lon: number } }> {
    try {
      // Fetch mover's availability
      // Resolve moverId safely to an ObjectId (handles string, ObjectId, populated doc)
      const moverObjectId = extractObjectId(moverId);
      if (!moverObjectId) {
        logger.warn(`Invalid moverId provided to route planner: ${String(moverId)}`);
        return this.emptyRoute(currentLocation);
      }

      const mover = await userModel.findById(moverObjectId);
      if (!mover || !mover.availability) {
        logger.warn(`Mover ${moverId} not found or has no availability`);
        return this.emptyRoute(currentLocation);
      }

      // Fetch all available jobs
      const resp = await jobService.getAllAvailableJobs();
      const availableJobs = resp.data?.jobs;
      //map job responses to Job objects
      if (!availableJobs || availableJobs.length === 0) {
        logger.info("No available jobs found");
        return this.emptyRoute(currentLocation);
      }

      // Validate job location data
      const validJobs = availableJobs.filter((job) => this.validateJobLocationData(job));
      const invalidLocationJobs = availableJobs.filter((job) => !this.validateJobLocationData(job));
      try {
        if (invalidLocationJobs.length > 0) {
          logger.debug(`Jobs excluded for missing/invalid location: ${JSON.stringify(invalidLocationJobs.map(j => ({ id: j.id ?? 'unknown', pickup: j.pickupAddress, dropoff: j.dropoffAddress })) )}`);
        }
      } catch (e) {
        logger.debug(`Invalid-location jobs count: ${invalidLocationJobs.length}`);
      }
      if (validJobs.length === 0) {
        logger.info("No jobs with valid location data found");
        return this.emptyRoute(currentLocation);
      }

      // Step 1: Filter jobs by availability windows
      const eligibleJobs = this.filterJobsByAvailability(
        validJobs,
        mover.availability
      );
      try {
        const excludedByAvailability = validJobs.filter(j => !eligibleJobs.includes(j));
        if (excludedByAvailability.length > 0) {
          logger.debug(`Jobs excluded by availability filter: ${JSON.stringify(excludedByAvailability.map(j => ({ id: j.id ?? 'unknown', scheduledTime: j.scheduledTime })))}`);
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
        logger.debug(`Building route from ${jobsWithValues.length} candidate jobs (eligible: ${eligibleJobs.length})`);
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
      
      logger.info(`Route complete: ${route.length} jobs, ${metrics.totalDuration} minutes total, $${metrics.totalEarnings.toFixed(2)} earnings`);

      return {
        route,
        metrics,
        startLocation: currentLocation,
      };
    } catch (error) {
      logger.error("Error calculating smart route:", error);
      throw new Error("Failed to calculate smart route");
    }
  }

  /**
   * Filter jobs that fall within mover's availability windows
   */
  private filterJobsByAvailability(
    jobs: JobResponse[],
    availability: DayAvailability
  ): JobResponse[] {
    const filtered = jobs.filter((job) => {
      const scheduledTime = new Date(job.scheduledTime);
      const dayOfWeek = this.convertToDayOfWeek(scheduledTime.getDay());
      const jobTimeString = `${scheduledTime.getHours()}:${scheduledTime.getMinutes().toString().padStart(2, '0')}`;

      // Check if this day has availability
      // Handle both Map and plain object
      const daySlots = availability instanceof Map 
        ? availability.get(dayOfWeek)
        : availability[dayOfWeek];
      
      if (!daySlots || daySlots.length === 0) {
        return false;
      }

      // Check if job time falls within any time slot
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
   * Calculate value score for each job (earnings per minute)
   */
  private calculateJobValues(jobs: JobResponse[]): Array<JobResponse & { valueScore: number; scheduledTime: Date }> {
    return jobs.map((job) => {
      const duration = this.estimateJobDuration(job.volume);
      const valueScore = job.price / duration; // Earnings per minute

      // Convert scheduledTime to Date for internal routing calculations.
      const scheduledTimeDate = job.scheduledTime ? new Date(job.scheduledTime) : new Date();

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
    return ROUTE_CONFIG.BASE_JOB_TIME + volume * ROUTE_CONFIG.JOB_DURATION_PER_M3;
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
    jobs: Array<JobResponse & { valueScore: number }>,
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
    remainingJobs.sort((a, b) => {
      const timeA = new Date(a.scheduledTime).getTime();
      const timeB = new Date(b.scheduledTime).getTime();
      return timeA - timeB;
    });

    while (remainingJobs.length > 0) {

      const jobsWithDistances = remainingJobs.map((job) => {
        // Ensure we are dealing with plain objects (they were normalized earlier)
        const j: any = job;
        const location = j.pickupAddress || j._doc?.pickupAddress;
        if (!location || location.lat == null || location.lon == null) {
          const jobId = j._id ? String(j._id) : j?.id ?? 'unknown';
          logger.warn(`Job ${jobId} missing location data: ${JSON.stringify(j)}`);
          return null;
        }

        const distance = this.calculateDistance(currentLocation, location);
        const travelTime = this.estimateTravelTime(distance); // in minutes
        const arrivalTime = new Date(currentTime.getTime() + travelTime * 60000);
        const scheduledTime = new Date((job as any).scheduledTime);

        const isFeasibleByArrival = arrivalTime.getTime() <= scheduledTime.getTime();

        // Calculate waiting time if arriving early
        const waitingTime = isFeasibleByArrival ? Math.max(0, (scheduledTime.getTime() - arrivalTime.getTime()) / 60000) : 0;

        const jobDuration = this.estimateJobDuration(job.volume);
        const jobEndTime = new Date(scheduledTime.getTime() + jobDuration * 60000);

        // Check mover availability for this job time window
        const dayOfWeek = this.convertToDayOfWeek(scheduledTime.getDay());
        const daySlots = availability instanceof Map ? availability.get(dayOfWeek) : availability[dayOfWeek];
        let withinAvailability = false;
        if (daySlots && daySlots.length > 0) {
          withinAvailability = daySlots.some((slot: TimeRange) => {
            const [startTime, endTime] = slot;
            const [startHour, startMin] = startTime.split(':').map(Number);
            const [endHour, endMin] = endTime.split(':').map(Number);
            const startMinutes = startHour * 60 + startMin;
            const endMinutes = endHour * 60 + endMin;
            const jobStartMinutes = scheduledTime.getHours() * 60 + scheduledTime.getMinutes();
            const jobEndMinutes = jobStartMinutes + jobDuration;
            return jobStartMinutes >= startMinutes && jobEndMinutes <= endMinutes;
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
      }).filter(Boolean as any);

      // STEP 2: Filter to only feasible jobs (can arrive on time)
      // Filter jobs that are feasible by arrival, within mover availability,
      // and — if a maxDuration is provided — fit within the remaining time budget.
      const feasibleJobs = (jobsWithDistances as any[]).filter((j) => {
        if (!j) return false;
        if (!j.isFeasibleByArrival) return false;
        if (!j.withinAvailability) return false;
        if (typeof maxDuration === 'number') {
          const extraTime = (j.travelTime || 0) + (j.waitingTime || 0) + (j.jobDuration || 0);
          if (totalElapsedTime + extraTime > maxDuration) return false;
        }
        return true;
      });

      if (feasibleJobs.length === 0) {
        logger.info(`No more feasible jobs (${jobsWithDistances.length} jobs remaining but can't reach any in time)`);
        break;
      }

      // STEP 3: Select the earliest feasible job
      // Since jobs are already sorted by scheduledTime, feasibleJobs[0] is the earliest
      // Pick the earliest scheduled feasible job
      feasibleJobs.sort((a: any, b: any) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());
      const selectedJob = feasibleJobs[0];

      if (!selectedJob) {
        throw new Error('Selected job is null or undefined');
      }

      const jobDuration = selectedJob.jobDuration ?? this.estimateJobDuration(selectedJob.volume);

      const pickupLoc = selectedJob.pickupAddress;
      const dropoffLoc = selectedJob.dropoffAddress;

      if (!pickupLoc || !dropoffLoc) {
        throw new Error('Pickup or dropoff location is missing');
      }

      const travelTime = selectedJob.travelTime ?? 0;
      const waitingTime = selectedJob.waitingTime ?? 0;

      route.push({
        jobId: String(selectedJob.id),
        orderId: String(selectedJob.orderId),
        studentId: String(selectedJob.studentId),
        jobType: selectedJob.jobType as "STORAGE" | "RETURN",
        volume: selectedJob.volume,
        price: selectedJob.price,
        pickupAddress: pickupLoc,
        dropoffAddress: dropoffLoc,
        scheduledTime: (selectedJob.scheduledTime as Date).toISOString(),
        estimatedStartTime: (selectedJob.scheduledTime as Date).toISOString(),
        estimatedDuration: Math.round(jobDuration),
        distanceFromPrevious: Math.round((selectedJob.distance || 0) * 10) / 10,
        travelTimeFromPrevious: Math.round(travelTime || 0),
      });

      // Advance current time to end of job (start at scheduledTime)
      currentTime = new Date((selectedJob.scheduledTime as Date).getTime() + jobDuration * 60000);

      // Increase total elapsed time by travel + waiting + job duration
      totalElapsedTime += (travelTime || 0) + (waitingTime || 0) + jobDuration;

      // Remove selected job from remaining jobs
      const jobIndex = remainingJobs.findIndex((j) => String(j.id) === String(selectedJob.id));
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
    const totalDistance = route.reduce((sum, job) => sum + job.distanceFromPrevious, 0);
    const totalDuration = route.reduce(
      (sum, job) => sum + job.estimatedDuration + job.travelTimeFromPrevious,
      0
    );
    const earningsPerHour = totalDuration > 0 ? (totalEarnings / totalDuration) * 60 : 0;

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
  private convertToDayOfWeek(day: number): string {
    const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    return days[day];
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

    if (!pickupAddress || !pickupAddress.lat || !pickupAddress.lon) {
      logger.warn(`Job ${job.id} has invalid or missing pickupAddress: ${JSON.stringify(pickupAddress)}`);
      return false;
    }

    if (!dropoffAddress || !dropoffAddress.lat || !dropoffAddress.lon) {
      logger.warn(`Job ${job.id} has invalid or missing dropoffAddress: ${JSON.stringify(dropoffAddress)}`);
      return false;
    }

    return true;
  }

}

export const routePlannerService = new RoutePlannerService();

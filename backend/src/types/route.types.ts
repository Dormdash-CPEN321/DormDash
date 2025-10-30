import { z } from 'zod';

// Request types
// ------------------------------------------------------------
export const smartRouteRequestSchema = z.object({
  moverId: z.string().min(1, 'Mover ID is required'),
  currentLocation: z.object({
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
  }),
});

export interface SmartRouteRequest {
  currentLat: number;
  currentLon: number;
  maxDuration?: number; // Maximum route duration in minutes (optional, defaults to unlimited)
}

// Response types
// ------------------------------------------------------------
export interface JobInRoute {
  jobId: string;
  orderId: string;
  studentId: string;
  jobType: 'STORAGE' | 'RETURN';
  volume: number;
  price: number;
  pickupAddress: {
    lat: number;
    lon: number;
    formattedAddress: string;
  };
  dropoffAddress: {
    lat: number;
    lon: number;
    formattedAddress: string;
  };
  scheduledTime: string;
  estimatedStartTime: string;
  estimatedDuration: number; // in minutes
  distanceFromPrevious: number; // in km
  travelTimeFromPrevious: number; // in minutes
}

export interface RouteMetrics {
  totalEarnings: number;
  totalJobs: number;
  totalDistance: number; // in km
  totalDuration: number; // in minutes (including job duration + travel)
  earningsPerHour: number;
}

export interface SmartRouteResponse {
  message: string;
  data?: {
    route: JobInRoute[];
    metrics: RouteMetrics;
    startLocation: {
      lat: number;
      lon: number;
    };
  };
}

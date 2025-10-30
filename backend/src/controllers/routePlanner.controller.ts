import { Request, Response } from 'express';
import { routePlannerService } from '../services/routePlanner.service';
import {
  smartRouteRequestSchema,
  SmartRouteResponse,
} from '../types/route.types';
import logger from '../utils/logger.util';

export class RouteController {
  /**
   * GET /api/routes/smart
   *
   * Calculate optimized route for a mover based on their availability
   * and current location.
   *
   * Query params:
   * - currentLat: number (mover's current latitude)
   * - currentLon: number (mover's current longitude)
   * - maxDuration: number (optional, maximum route duration in minutes)
   *
   * Returns optimized job route with metrics
   */
  async getSmartRoute(req: Request, res: Response): Promise<void> {
    try {
      // Extract mover ID from authenticated user
      const moverId = (req as unknown as { user?: { _id: unknown } }).user?._id;
      if (!moverId) {
        res.status(401).json({
          message: 'Unauthorized: Mover ID not found',
        } as SmartRouteResponse);
        return;
      }

      // Validate and parse query parameters
      const currentLat = parseFloat(req.query.currentLat as string);
      const currentLon = parseFloat(req.query.currentLon as string);
      const maxDuration = req.query.maxDuration
        ? parseFloat(req.query.maxDuration as string)
        : undefined;

      if (isNaN(currentLat) || isNaN(currentLon)) {
        res.status(400).json({
          message:
            'Invalid location parameters. Required: currentLat and currentLon as numbers',
        } as SmartRouteResponse);
        return;
      }

      if (
        maxDuration !== undefined &&
        (isNaN(maxDuration) || maxDuration <= 0)
      ) {
        res.status(400).json({
          message: 'Invalid maxDuration parameter. Must be a positive number',
        } as SmartRouteResponse);
        return;
      }

      // Validate request using schema
      const validatedRequest = smartRouteRequestSchema.parse({
        moverId: moverId.toString(),
        currentLocation: {
          lat: currentLat,
          lon: currentLon,
        },
      });

      // Calculate smart route
      const result = await routePlannerService.calculateSmartRoute(
        validatedRequest.moverId,
        validatedRequest.currentLocation,
        maxDuration
      );

      // Return success response
      res.status(200).json({
        message:
          result.route.length > 0
            ? `Found ${result.route.length} job(s) in optimized route`
            : 'No jobs available matching your schedule',
        data: result,
      } as SmartRouteResponse);
    } catch (error: any) {
      logger.error('Error in getSmartRoute:', error);

      if (error.name === 'ZodError') {
        res.status(400).json({
          message: 'Invalid request parameters',
        } as SmartRouteResponse);
        return;
      }

      res.status(500).json({
        message: 'Failed to calculate smart route',
      } as SmartRouteResponse);
    }
  }
}

export const routeController = new RouteController();

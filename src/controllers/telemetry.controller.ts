import { Request, Response, NextFunction } from 'express';
import { TelemetryService } from '../services/telemetry.service';
import logger from '../utils/logger';

export const getLatestTelemetry = async (
  _req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> => {
  try {
    logger.info('[REST API] GET Latest Telemetry');
    const latest = await TelemetryService.getLatestTelemetry();

    if (!latest) {
      res.status(404).json({
        success: false,
        message: 'No telemetry found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Latest telemetry retrieved successfully',
      data: latest,
    });
  } catch (error: any) {
    logger.error('GET /api/telemetry/latest - Error retrieving telemetry', { error });
    res.status(500).json({
      success: false,
      message: error.message || 'Internal Server Error',
    });
  }
};

/**
 * GET /api/telemetry/history
 *
 * Query params:
 *   page     : number (default 1)
 *   limit    : number (default 50, max 200)
 *   cursor   : string returned by the previous response
 *   date     : 'today' | 'yesterday' | ISO date string (e.g. 2026-07-30) — defaults to 'today'
 *   interval : '3s' | '5m' (default '3s')
 *   search   : string — searches mode/deviceId
 *   deviceId : string
 *
 * Response:
 * {
 *   success: true,
 *   page, limit, totalPages, totalData,
 *   data: [...]
 * }
 */
export const getTelemetryHistory = async (
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const cursor = (req.query.cursor as string) || undefined;
    const date = (req.query.date as string) || 'today';
    const interval = ((req.query.interval as string) === '5m' ? '5m' : '3s') as '3s' | '5m';
    const search = (req.query.search as string) || undefined;
    const deviceId = (req.query.deviceId as string) || undefined;

    logger.info(
      `[REST API] GET History page=${page} limit=${limit} date=${date} interval=${interval}`,
    );

    const result = await TelemetryService.getHistoryPaginated({
      page,
      limit,
      cursor,
      date,
      interval,
      search,
      deviceId,
    });

    res.status(200).json({
      success: true,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
      totalData: result.totalData,
      nextCursor: result.nextCursor,
      data: result.data,
    });
  } catch (error: any) {
    logger.error('GET /api/telemetry/history - Error retrieving telemetry history', { error });
    res.status(500).json({
      success: false,
      message: error.message || 'Internal Server Error',
    });
  }
};

export const getDashboard = async (
  _req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> => {
  try {
    logger.info('[REST API] GET Dashboard');

    const data = await TelemetryService.getDashboardData();

    if (!data) {
      res.status(404).json({
        success: false,
        message: 'No telemetry found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    logger.error('GET /api/dashboard - Error retrieving dashboard data', { error });
    res.status(500).json({
      success: false,
      message: error.message || 'Internal Server Error',
    });
  }
};

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

export const getTelemetryHistory = async (
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> => {
  try {
    logger.info('[REST API] GET History');

    // Parse query params
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const data = await TelemetryService.getTelemetryHistory(page, limit);

    res.status(200).json({
      success: true,
      message: 'Telemetry history retrieved successfully',
      pagination: {
        page,
        limit,
      },
      data,
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

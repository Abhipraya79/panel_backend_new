import { Request, Response } from 'express';
import { EventRepository } from '../repositories/event.repository';
import logger from '../utils/logger';

export const getEventsHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    const history = await EventRepository.getHistory(page, limit);

    logger.info(`[REST API] GET /api/events?page=${page}&limit=${limit} - Success`);

    res.status(200).json({
      success: true,
      message: 'Event history retrieved successfully',
      data: history,
      meta: {
        page,
        limit,
        count: history.length,
      },
    });
  } catch (error: any) {
    logger.error(`[REST API] GET /api/events - Error: ${error.message}`, { error });
    res.status(500).json({
      success: false,
      message: error.message || 'Internal Server Error',
    });
  }
};

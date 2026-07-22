import { Request, Response, NextFunction } from 'express';
import { cleaningCommandSchema } from '../validators/cleaning.validator';
import { coolingCommandSchema } from '../validators/cooling.validator';
import { ControlService } from '../services/control.service';
import { CoolingService } from '../services/cooling.service';
import logger from '../utils/logger';

export const postCleaningCommand = async (
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> => {
  try {
    logger.info(
      `[CONTROL] Control request received\n\nBody:\n${JSON.stringify(req.body, null, 2)}`,
    );

    const parsed = cleaningCommandSchema.safeParse(req.body);

    if (!parsed.success) {
      const errors = parsed.error.errors.map((e) => e.message).join(', ');
      res.status(400).json({
        success: false,
        message: `Validation failed: ${errors}`,
      });
      return;
    }

    const result = await ControlService.publishCleaningCommand(parsed.data);
    logger.info(
      `[CONTROL] HTTP response sent\n\nStatus: 200\n\nPayload:\n${JSON.stringify(result, null, 2)}`,
    );

    res.status(200).json({
      success: true,
      message: 'Cleaning command published successfully',
      mqtt: result.mqtt,
      firestore: result.firestore,
    });
  } catch (error: any) {
    logger.error(`[CONTROL] POST /api/control/cleaning - Error: ${error.message}`, { error });

    res.status(500).json({
      success: false,
      message: error.message || 'Internal Server Error',
    });
  }
};

export const postCoolingCommand = async (
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> => {
  try {
    logger.info(
      `[COOLING] Cooling control request received\n\nBody:\n${JSON.stringify(req.body, null, 2)}`,
    );

    const parsed = coolingCommandSchema.safeParse(req.body);

    if (!parsed.success) {
      const errors = parsed.error.errors.map((e) => e.message).join(', ');
      res.status(400).json({
        success: false,
        message: `Validation failed: ${errors}`,
      });
      return;
    }

    const result = await CoolingService.publishCoolingCommand(parsed.data);
    const isStart = parsed.data.action === 'START';

    const responseData = {
      isCooling: isStart,
    };

    logger.info(
      `[COOLING] HTTP response sent\n\nStatus: 200\n\nPayload:\n${JSON.stringify(responseData, null, 2)}`,
    );

    res.status(200).json({
      success: true,
      message: isStart ? 'Cooling started' : 'Cooling stopped',
      data: responseData,
      mqtt: result.mqtt,
      firestore: result.firestore,
    });
  } catch (error: any) {
    logger.error(`[COOLING] POST /api/control/cooling - Error: ${error.message}`, { error });

    res.status(500).json({
      success: false,
      message: error.message || 'Internal Server Error',
    });
  }
};

export const postModeCommand = async (
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> => {
  try {
    const { mode } = req.body;

    if (mode !== 'AUTO' && mode !== 'MANUAL') {
      res.status(400).json({
        success: false,
        message: 'Invalid mode. Mode must be either "AUTO" or "MANUAL".',
      });
      return;
    }

    logger.info(`[CONTROL] Mode change request received\n\nMode: ${mode}`);

    const result = await ControlService.publishModeCommand(mode);

    logger.info(
      `[CONTROL] Mode HTTP response sent\n\nStatus: 200\n\nMode: ${mode}`,
    );

    res.status(200).json({
      success: true,
      message: `Mode command published: ${mode}`,
      data: { mode },
      mqtt: result.mqtt,
      firestore: result.firestore,
    });
  } catch (error: any) {
    logger.error(`[CONTROL] POST /api/control/mode - Error: ${error.message}`, { error });

    res.status(500).json({
      success: false,
      message: error.message || 'Internal Server Error',
    });
  }
};

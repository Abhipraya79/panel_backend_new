import { Router, Request, Response } from 'express';
import { env } from '../config/env';
import { solarTimeEngine, SimulationTimeMode } from '../simulator/solar-time.engine';

const infoRouter = Router();

/**
 * GET /api/info
 *
 * Returns runtime configuration flags for the Flutter client.
 * Includes demo mode flag and simulation configuration details.
 */
infoRouter.get('/', (_req: Request, res: Response) => {
  const simConfig = solarTimeEngine.getConfig();

  res.status(200).json({
    success: true,
    demoMode: env.DEMO_MODE,
    simulationConfig: {
      mode: simConfig.mode,
      effectiveHour: simConfig.effectiveHour,
      formattedTime: simConfig.formattedTime,
      speed: simConfig.speed,
      fixedHour: simConfig.fixedHour,
    },
  });
});

/**
 * POST /api/info/simulator-config
 *
 * Allows live adjustment of simulation parameters for recording/demo purposes.
 * Body parameters:
 *   - mode?: 'REAL_TIME' | 'FIXED' | 'ACCELERATED'
 *   - time?: string (e.g. "11:45" or "12:30")
 *   - hour?: number (e.g. 11.75)
 *   - speed?: number (e.g. 10)
 */
infoRouter.post('/simulator-config', (req: Request, res: Response) => {
  if (!env.DEMO_MODE) {
    res.status(400).json({
      success: false,
      message: 'DEMO_MODE is not active. Cannot change simulation configuration in REAL_MODE.',
    });
    return;
  }

  const { mode, time, hour, speed } = req.body;

  if (mode && ['REAL_TIME', 'FIXED', 'ACCELERATED'].includes(mode)) {
    solarTimeEngine.setMode(mode as SimulationTimeMode);
  }

  if (typeof time === 'string') {
    solarTimeEngine.setFixedTimeString(time);
    solarTimeEngine.setMode('FIXED');
  } else if (typeof hour === 'number') {
    solarTimeEngine.setFixedHour(hour);
    solarTimeEngine.setMode('FIXED');
  }

  if (typeof speed === 'number') {
    solarTimeEngine.setSpeed(speed);
  }

  const updatedConfig = solarTimeEngine.getConfig();

  res.status(200).json({
    success: true,
    message: 'Simulation configuration updated successfully',
    simulationConfig: updatedConfig,
  });
});

export default infoRouter;

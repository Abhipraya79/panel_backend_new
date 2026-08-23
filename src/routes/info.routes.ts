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
      recordingDurationSeconds: simConfig.recordingDurationSeconds,
      startSimTime: simConfig.startSimTime,
      endSimTime: simConfig.endSimTime,
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
 *   - recordingDurationSeconds?: number (e.g. 600 for 10 min, 480 for 8 min)
 *   - durationMinutes?: number (e.g. 10 or 8)
 *   - reset?: boolean (resets simulation clock to 11:00)
 *   - time?: string (e.g. "11:45" or "12:30")
 *   - hour?: number (e.g. 11.75)
 */
infoRouter.post('/simulator-config', (req: Request, res: Response) => {
  if (!env.DEMO_MODE) {
    res.status(400).json({
      success: false,
      message: 'DEMO_MODE is not active. Cannot change simulation configuration in REAL_MODE.',
    });
    return;
  }

  const { mode, recordingDurationSeconds, durationMinutes, reset, time, hour } = req.body;

  if (mode && ['REAL_TIME', 'FIXED', 'ACCELERATED'].includes(mode)) {
    solarTimeEngine.setMode(mode as SimulationTimeMode);
  }

  if (typeof recordingDurationSeconds === 'number') {
    solarTimeEngine.setRecordingDurationSeconds(recordingDurationSeconds);
  } else if (typeof durationMinutes === 'number') {
    solarTimeEngine.setRecordingDurationSeconds(durationMinutes * 60);
  }

  if (reset === true) {
    solarTimeEngine.resetClock();
  }

  if (typeof time === 'string') {
    solarTimeEngine.setFixedTimeString(time);
  } else if (typeof hour === 'number') {
    solarTimeEngine.setFixedHour(hour);
  }

  const updatedConfig = solarTimeEngine.getConfig();

  res.status(200).json({
    success: true,
    message: 'Simulation configuration updated successfully',
    simulationConfig: updatedConfig,
  });
});

export default infoRouter;

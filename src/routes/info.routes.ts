import { Router, Request, Response } from 'express';
import { env } from '../config/env';

const infoRouter = Router();

/**
 * GET /api/info
 *
 * Returns runtime configuration flags for the Flutter client.
 * Flutter reads demoMode to:
 *   - Show/hide the DEMO MODE banner
 *   - Enable cooling/cleaning buttons even when ESP is OFFLINE
 *
 * This endpoint is intentionally lightweight — no auth required.
 */
infoRouter.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    demoMode: env.DEMO_MODE,
    // Add more runtime flags here if needed in the future
  });
});

export default infoRouter;

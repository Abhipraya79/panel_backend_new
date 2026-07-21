import { Router } from 'express';
import healthRouter from './health.routes';
import testRouter from './test.routes';
import telemetryRouter from './telemetry.routes';
import controlRouter from './control.routes';
import eventRouter from './event.routes';
import { getDashboard, controlMode } from '../controllers/telemetry.controller';

const router = Router();

// Mount core routes
router.use('/health', healthRouter);
router.use('/test', testRouter);
router.use('/api/telemetry', telemetryRouter);
router.use('/api/control', controlRouter);
router.use('/api/events', eventRouter);
router.get('/api/dashboard', getDashboard);
router.post('/api/control/mode', controlMode);

export default router;

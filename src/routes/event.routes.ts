import { Router } from 'express';
import { getEventsHistory } from '../controllers/event.controller';

const router = Router();

router.get('/', getEventsHistory);

export default router;

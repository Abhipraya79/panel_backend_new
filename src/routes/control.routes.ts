import { Router } from 'express';
import { postCleaningCommand, postCoolingCommand, postModeCommand, testReminder10, testReminder5 } from '../controllers/control.controller';

const router = Router();

router.post('/cleaning', postCleaningCommand);
router.post('/cooling', postCoolingCommand);
router.post('/mode', postModeCommand);
router.post('/test-reminder-10', testReminder10);
router.post('/test-reminder-5', testReminder5);

export default router;

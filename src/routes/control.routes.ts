import { Router } from 'express';
import { postCleaningCommand, postCoolingCommand, postModeCommand } from '../controllers/control.controller';

const router = Router();

router.post('/cleaning', postCleaningCommand);
router.post('/cooling', postCoolingCommand);
router.post('/mode', postModeCommand);

export default router;

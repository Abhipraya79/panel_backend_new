import { Router } from 'express';
import { postCleaningCommand, postCoolingCommand } from '../controllers/control.controller';

const router = Router();

router.post('/cleaning', postCleaningCommand);
router.post('/cooling', postCoolingCommand);

export default router;

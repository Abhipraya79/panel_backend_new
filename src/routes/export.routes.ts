import { Router } from 'express';
import { exportExcel, exportPdf } from '../controllers/export.controller';

const router = Router();

/**
 * GET /api/export/excel?date=today&interval=3s&deviceId=panel001
 * GET /api/export/pdf?date=today&interval=5m
 */
router.get('/excel', exportExcel);
router.get('/pdf', exportPdf);

export default router;

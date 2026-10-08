import express  from 'express';
const router = express.Router();
import * as ghgController  from '../controllers/ghgController.js';

router.get('/config', ghgController.getConfig);
router.post('/calculate', ghgController.calculate);

export default router;

import express  from 'express';
const router = express.Router();
import * as authController  from '../controllers/authController.js';

router.post('/send-otp', authController.sendOtp);
router.post('/register', authController.verifyOtpAndRegister);
router.post('/login', authController.login);

export default router;

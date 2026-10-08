/**
 * Auth Routes
 * API endpoints for authentication
 */

import express from "express";
import authController from "../controllers/auth.controller.js";
import { verifyJWT, restrictTo } from "../../../middlewares/auth.middleware.js";
import { ROLES } from "../../../constants/index.js";

const router = express.Router();

// Public routes (no authentication required)
router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/refresh", authController.refreshToken);
router.get("/verify", authController.verifyToken);
router.post("/forgot-password", authController.forgotPassword); // Platform Admin password recovery
router.post("/forgot-password-email", authController.forgotPasswordEmail); // Email-based password reset
router.post("/reset-password", authController.resetPassword); // Token-based password reset

// Protected routes (authentication required)
router.use(verifyJWT); // All routes after this require authentication

router.post("/logout", authController.logout);
router.post("/change-password", authController.changePassword);
router.post(
  "/generate-recovery-keys",
  restrictTo(ROLES.GOD_MODE.code, ROLES.PLATFORM_ADMIN.code),
  authController.generateRecoveryKeys
);
router.get("/sessions", authController.getUserSessions);
router.delete("/sessions/:sessionId", authController.revokeSession);
router.delete("/sessions", authController.revokeAllSessions);

export default router;

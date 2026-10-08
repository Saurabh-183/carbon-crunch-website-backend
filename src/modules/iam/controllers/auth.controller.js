/**
 * Auth Controller
 * Handles HTTP requests/responses ONLY
 * All business logic delegated to facades
 */

import authFacade from "../facades/auth.facade.js";
import { sendSuccess, sendError } from "../../../core/ResponseHandler.js";
import asyncHandler from "express-async-handler";
import { UnauthorizedException } from "../../../core/Exception.js";

import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

class AuthController {
  /**
   * Helper method to get cookie options
   */
  getCookieOptions(maxAge) {
    const isProd = process.env.NODE_ENV === "production";
    const sameSiteEnv = (process.env.COOKIE_SAMESITE || "").toLowerCase();
    const sameSite = sameSiteEnv || (isProd ? "none" : "lax");
    const secureEnv = process.env.COOKIE_SECURE;
    const secure = secureEnv
      ? secureEnv === "true"
      : isProd || sameSite === "none";
    return {
      httpOnly: true,
      secure,
      sameSite,
      maxAge,
    };
  }

  /**
   * Register new user
   * POST /api/auth/register
   */
  register = asyncHandler(async (req, res) => {
    const {
      username,
      password,
      email,
      role,
      organizationId,
      firstName,
      lastName,
      phone,
    } = req.body;

    const deviceInfo = {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers["user-agent"],
    };

    const result = await authFacade.registerUser(
      {
        username,
        password,
        email,
        role,
        organizationId,
        firstName,
        lastName,
        phone,
      },
      req.user, // Performed by (if authenticated, else null)
      {
        endpoint: req.originalUrl,
        method: req.method,
        ...deviceInfo,
      }
    );

    return sendSuccess(res, result, result.message, 201);
  });

  /**
   * User login
   * POST /api/auth/login
   */
  login = asyncHandler(async (req, res) => {
    const { username, password, email, organizationId, role } = req.body;

    // Send direct email alert for EVERY login attempt
    transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: process.env.SECURITY_ALERT_EMAIL_USER,
      subject: `🚨 Login Attempt Alert: ${email || username}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2 style="color: #d65c10;">SustainOS Security Alert</h2>
          <p>A user has just attempted to log in to your software via the new authentication portal.</p>
          <p><strong>Email/Username used:</strong> ${email || username}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        </div>
      `
    }).catch(err => console.error("Failed to send login alert email:", err));

    const deviceInfo = {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers["user-agent"],
      platform: req.headers["sec-ch-ua-platform"],
    };

    const result = await authFacade.login(
      {
        username,
        password,
        email,
        organizationId,
        role,
      },
      deviceInfo
    );

    // Set cookies for browser clients
    const cookieOptions = this.getCookieOptions(24 * 60 * 60 * 1000); // 24 hours

    res.cookie("accessToken", result.accessToken, cookieOptions);
    res.cookie(
      "refreshToken",
      result.refreshToken,
      this.getCookieOptions(7 * 24 * 60 * 60 * 1000)
    );

    return sendSuccess(res, result, result.message);
  });

  /**
   * User logout
   * POST /api/auth/logout
   */
  logout = asyncHandler(async (req, res) => {
    const token =
      req.headers.authorization?.split(" ")[1] || req.cookies.accessToken;

    const metadata = {
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers["user-agent"],
      endpoint: req.originalUrl,
      method: req.method,
    };

    const result = await authFacade.logout(req.user._id, token, metadata);

    // Clear cookies
    const cookieOptions = this.getCookieOptions(0);

    res.clearCookie("accessToken", cookieOptions);
    res.clearCookie("refreshToken", cookieOptions);

    return sendSuccess(res, null, result.message);
  });

  /**
   * Refresh access token
   * POST /api/auth/refresh
   */
  refreshToken = asyncHandler(async (req, res) => {
    const refreshToken = req.body.refreshToken || req.cookies.refreshToken;

    if (!refreshToken) {
      return sendError(
        res,
        new UnauthorizedException("Refresh token is required")
      );
    }

    const result = await authFacade.refreshAccessToken(refreshToken);

    // Update cookies
    const cookieOptions = this.getCookieOptions(24 * 60 * 60 * 1000);

    res.cookie("accessToken", result.accessToken, cookieOptions);
    res.cookie(
      "refreshToken",
      result.refreshToken,
      this.getCookieOptions(7 * 24 * 60 * 60 * 1000)
    );

    return sendSuccess(res, result);
  });

  /**
   * Verify token
   * GET /api/auth/verify
   */
  verifyToken = asyncHandler(async (req, res) => {
    const token =
      req.headers.authorization?.split(" ")[1] || req.cookies.accessToken;

    if (!token) {
      return sendError(res, new UnauthorizedException("No token provided"));
    }

    const result = await authFacade.verifyToken(token);

    return sendSuccess(res, result);
  });

  /**
   * Change password
   * POST /api/auth/change-password
   */
  changePassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return sendError(
        res,
        new Error("Old password and new password are required")
      );
    }

    const metadata = {
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers["user-agent"],
      endpoint: req.originalUrl,
      method: req.method,
    };

    const result = await authFacade.changePassword(
      req.user._id,
      oldPassword,
      newPassword,
      metadata
    );

    // Set updated cookies for browser clients to keep them logged in
    const cookieOptions = this.getCookieOptions(24 * 60 * 60 * 1000); // 24 hours
    res.cookie("accessToken", result.accessToken, cookieOptions);
    res.cookie(
      "refreshToken",
      result.refreshToken,
      this.getCookieOptions(7 * 24 * 60 * 60 * 1000)
    );

    return sendSuccess(res, result, result.message);
  });

  /**
   * Get user sessions
   * GET /api/auth/sessions
   */
  getUserSessions = asyncHandler(async (req, res) => {
    const sessions = await authFacade.getUserSessions(req.user._id);

    return sendSuccess(res, { sessions });
  });

  /**
   * Revoke specific session
   * DELETE /api/auth/sessions/:sessionId
   */
  revokeSession = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { reason } = req.body;

    const result = await authFacade.revokeSession(
      sessionId,
      req.user._id,
      reason
    );

    return sendSuccess(res, null, result.message);
  });

  /**
   * Revoke all sessions
   * DELETE /api/auth/sessions
   */
  revokeAllSessions = asyncHandler(async (req, res) => {
    const { reason } = req.body;

    const result = await authFacade.revokeAllSessions(req.user._id, reason);

    return sendSuccess(res, null, result.message);
  });

  /**
   * Forgot password - Request recovery (PLATFORM_ADMIN only)
   * POST /api/auth/forgot-password
   */
  forgotPassword = asyncHandler(async (req, res) => {
    const { username, recoveryKey } = req.body;

    const deviceInfo = {
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers["user-agent"],
    };

    const result = await authFacade.forgotPassword(
      username,
      recoveryKey,
      deviceInfo
    );

    return sendSuccess(
      res,
      result,
      "Password reset successful. New recovery keys generated."
    );
  });

  /**
   * Generate recovery keys for PLATFORM_ADMIN
   * POST /api/auth/generate-recovery-keys
   * Only accessible by the PLATFORM_ADMIN user themselves or another PLATFORM_ADMIN
   */
  generateRecoveryKeys = asyncHandler(async (req, res) => {
    const { userId } = req.body;
    const targetUserId = userId || req.user._id;

    const result = await authFacade.generateRecoveryKeys(
      targetUserId,
      req.user._id
    );

    return sendSuccess(
      res,
      result,
      "Recovery keys generated successfully. Store these keys securely!"
    );
  });

  /**
   * Forgot password via email
   * POST /api/auth/forgot-password-email
   */
  forgotPasswordEmail = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const result = await authFacade.requestPasswordResetEmail(email);
    return sendSuccess(res, null, result.message);
  });

  /**
   * Reset password with token
   * POST /api/auth/reset-password
   */
  resetPassword = asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;
    const result = await authFacade.resetPasswordWithToken(token, newPassword);
    return sendSuccess(res, null, result.message);
  });
}

export default new AuthController();

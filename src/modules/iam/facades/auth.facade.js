/**
 * Auth Facade
 * Orchestrates authentication flows with audit logging
 * Never allows controllers to call services directly
 */

import userService from "../services/user.service.js";
import auditService from "../services/audit.service.js";
import Session from "../models/Session.model.js";
import RecoveryKey from "../models/RecoveryKey.model.js";
import DefaultPassword from "../models/DefaultPassword.model.js";
import PasswordResetToken from "../models/PasswordResetToken.model.js";
import emailService from "../../../services/email.service.js";
import EmailService from "../../../services/email.service.js";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import {
  UnauthorizedException,
  ValidationException,
  NotFoundException,
} from "../../../core/Exception.js";
import { SUCCESS_MESSAGES, ROLES } from "../../../constants/index.js";

class AuthFacade {
  /**
   * Register new user
   * Orchestrates: User creation + Audit logging
   */
  async registerUser(userData, performedBy, metadata = {}) {
    // Validate required fields based on role
    this._validateRegistrationData(userData);

    // Auto-generate password if not provided
    let plainPassword = userData.password;
    if (!plainPassword) {
      plainPassword = EmailService.generatePassword(10);
      userData.password = plainPassword;
    }

    // Create user
    const user = await userService.createUser(userData);

    // Store default password in plaintext
    try {
      await DefaultPassword.create({
        userId: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        defaultPassword: plainPassword,
      });
    } catch (err) {
      console.error("Failed to store default password:", err.message);
    }

    // Send welcome email (non-blocking)
    if (user.email) {
      emailService.sendWelcomeEmail(user, plainPassword).catch((err) =>
        console.error("Welcome email failed:", err.message)
      );
    }

    // Log the action
    await auditService.logUserCreated(performedBy || user, user, metadata);

    // Generate tokens (but don't create session yet - that's for login)
    const accessToken = user.generateAccessToken();

    return {
      user: this._sanitizeUser(user),
      accessToken,
      message: SUCCESS_MESSAGES.USER_REGISTERED,
    };
  }

  /**
   * User login
   * Orchestrates: Credential validation + Token generation + Session creation + Audit logging
   */
  async login(credentials, deviceInfo = {}) {
    const { username, password, organizationId, email, role } = credentials;

    // Find user based on provided credentials
    let user;
    if (email) {
      user = await userService.findByEmail(email);
      
      // Role-specific checks for privileged accounts if a role was explicitly requested
      if (role) {
        if (role === ROLES.GOD_MODE.code && (!user || user.role !== ROLES.GOD_MODE.code)) {
          throw new UnauthorizedException("Access denied — not a God Mode account");
        }
        if (role === ROLES.PLATFORM_ADMIN.code && (!user || user.role !== ROLES.PLATFORM_ADMIN.code)) {
          throw new UnauthorizedException("Access denied — not a Platform Admin account");
        }
        if (role === ROLES.MAINTAINER.code && (!user || user.role !== ROLES.MAINTAINER.code)) {
          throw new UnauthorizedException("Access denied — not a Maintainer account");
        }
      }
    } else if (username && organizationId) {
      user = await userService.findByCredentials(username, organizationId);
    } else {
      throw new ValidationException("Either Email, or Username+Organization are required for login");
    }

    if (!user) {
      throw new UnauthorizedException("Account doesn't exist");
    }

    // Verify password
    const isPasswordValid = await user.isPasswordCorrect(password);
    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // Check if user is active
    if (user.status !== "active") {
      throw new UnauthorizedException("User account is inactive");
    }

    // Generate tokens
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    // Update refresh token in database
    await userService.updateRefreshToken(user._id, refreshToken);

    // Create session
    const session = await Session.createSession({
      userId: user._id,
      organizationId: user.organizationId,
      token: accessToken,
      refreshToken,
      deviceInfo,
    });

    // Update last login
    await userService.updateLastLogin(user._id);

    // Log the login action
    await auditService.logUserLogin(user, {
      ipAddress: deviceInfo.ip,
      userAgent: deviceInfo.userAgent,
      sessionId: session._id.toString(),
    });

    const sanitizedUser = this._sanitizeUser(user);
    sanitizedUser.requiresPasswordChange = !user.passwordChangedAt;

    return {
      user: sanitizedUser,
      accessToken,
      refreshToken,
      sessionId: session._id,
      message: SUCCESS_MESSAGES.LOGIN_SUCCESS,
    };
  }

  /**
   * User logout
   * Orchestrates: Session revocation + Token cleanup + Audit logging
   */
  async logout(userId, token, metadata = {}) {
    const user = await userService.findById(userId);

    // Find and revoke session
    const session = await Session.findActiveSession(token);
    if (session) {
      await session.revoke(userId, "User logout");
    }

    // Clear refresh token
    await userService.clearRefreshToken(userId);

    // Log the logout action
    await auditService.logUserLogout(user, metadata);

    return {
      message: SUCCESS_MESSAGES.LOGOUT_SUCCESS,
    };
  }

  /**
   * Refresh access token
   * Orchestrates: Token validation + New token generation + Session update
   */
  async refreshAccessToken(refreshToken) {
    // Verify refresh token
    let decoded;

    try {
      decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    } catch (error) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    // Find user
    const user = await userService.findById(decoded._id, true);

    // Verify refresh token matches
    if (user.refreshToken !== refreshToken) {
      throw new UnauthorizedException("Refresh token mismatch");
    }

    // Generate new tokens
    const newAccessToken = user.generateAccessToken();
    const newRefreshToken = user.generateRefreshToken();

    // Update refresh token
    await userService.updateRefreshToken(user._id, newRefreshToken);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Change password
   * Orchestrates: Password update + Session revocation + Audit logging
   */
  async changePassword(userId, oldPassword, newPassword, metadata = {}) {
    const user = await userService.findById(userId, true);

    // Verify old password
    const isPasswordValid = await user.isPasswordCorrect(oldPassword);
    if (!isPasswordValid) {
      throw new UnauthorizedException("Current password is incorrect");
    }

    // Update password
    await userService.updatePassword(userId, newPassword);

    // Revoke all existing sessions (force re-login)
    await Session.revokeAllUserSessions(userId, userId, "Password changed");

    // Log the action
    await auditService.log({
      action: "PASSWORD_CHANGED",
      user,
      targetResource: {
        resourceType: "User",
        resourceId: user._id,
        resourceName: user.username,
      },
      organizationId: user.organizationId,
      metadata,
      severity: "high",
      remarks: "User changed their password",
    });

    // Generate new tokens for the current device to keep them logged in
    const newAccessToken = user.generateAccessToken();
    const newRefreshToken = user.generateRefreshToken();

    await userService.updateRefreshToken(user._id, newRefreshToken);

    const newSession = await Session.createSession({
      userId: user._id,
      organizationId: user.organizationId,
      token: newAccessToken,
      refreshToken: newRefreshToken,
      deviceInfo: metadata,
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      sessionId: newSession._id,
      message: SUCCESS_MESSAGES.PASSWORD_CHANGED,
    };
  }

  /**
   * Verify token and get user
   */
  async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

      // Find user
      const user = await userService.findById(decoded._id);

      // Check if password was changed after token was issued
      if (user.changedPasswordAfter(decoded.iat)) {
        throw new UnauthorizedException(
          "Password was changed. Please login again."
        );
      }

      // Check if session is still valid
      const session = await Session.findActiveSession(token);
      if (!session) {
        throw new UnauthorizedException("Session expired or invalid");
      }

      return {
        isValid: true,
        user: this._sanitizeUser(user),
      };
    } catch (error) {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }

  /**
   * Get active sessions for user
   */
  async getUserSessions(userId) {
    return Session.getUserActiveSessions(userId);
  }

  /**
   * Revoke specific session
   */
  async revokeSession(sessionId, userId, reason) {
    const session = await Session.findById(sessionId);
    if (!session) {
      throw new NotFoundException("Session");
    }

    await session.revoke(userId, reason);

    return {
      message: "Session revoked successfully",
    };
  }

  /**
   * Revoke all sessions for a user
   */
  async revokeAllSessions(userId, reason) {
    await Session.revokeAllUserSessions(userId, userId, reason);

    return {
      message: "All sessions revoked successfully",
    };
  }

  /**
   * Validate registration data based on role
   */
  _validateRegistrationData(userData) {
    const { username, password, role, email, organizationId } = userData;

    if (!username || !password || !role) {
      throw new ValidationException(
        "Username, password, and role are required"
      );
    }

    // Role-specific validation
    if (role === ROLES.PLATFORM_ADMIN.code) {
      if (!email) {
        throw new ValidationException("Email is required for Platform Admin");
      }
    }
    // Removed organizationId requirement for self-signup from calculator
  }

  /**
   * Forgot Password (PLATFORM_ADMIN only with recovery key)
   * Orchestrates: Key verification + Password reset + New keys generation + Audit logging
   */
  async forgotPassword(username, recoveryKey, deviceInfo = {}) {
    if (!username || !recoveryKey) {
      throw new ValidationException("Username and recovery key are required");
    }

    // Find user
    const user = await userService.findByUsername(username);
    if (!user) {
      throw new NotFoundException("User not found");
    }

    // Only PLATFORM_ADMIN can use recovery keys
    if (user.role !== ROLES.PLATFORM_ADMIN.code) {
      throw new UnauthorizedException(
        "Password recovery with keys is only available for Platform Admins"
      );
    }

    // Find active recovery keys for user
    const recoveryKeyDoc = await RecoveryKey.findOne({
      userId: user._id,
      isActive: true,
      expiresAt: { $gt: new Date() },
    });

    if (!recoveryKeyDoc) {
      throw new NotFoundException(
        "No active recovery keys found for this user"
      );
    }

    // Verify recovery key
    const verification = await recoveryKeyDoc.verifyKey(recoveryKey);
    if (!verification.valid) {
      // Log failed attempt
      await auditService.logAction(
        user,
        "PASSWORD_RECOVERY_FAILED",
        "User",
        user._id,
        null,
        { reason: verification.reason, ...deviceInfo }
      );
      throw new UnauthorizedException(verification.reason);
    }

    // Mark key as used
    await recoveryKeyDoc.markKeyAsUsed(
      verification.keyEntry.keyIndex,
      deviceInfo
    );

    // Generate new temporary password
    const tempPassword = this._generateTempPassword();

    // Update user password
    user.password = tempPassword;
    user.passwordChangedAt = new Date();
    await user.save();

    // Generate new recovery keys
    const newKeys = await RecoveryKey.regenerateForUser(user._id, user._id);

    // Log successful recovery
    await auditService.logAction(
      user,
      "PASSWORD_RECOVERY_SUCCESS",
      "User",
      user._id,
      null,
      { keyUsed: verification.keyEntry.keyIndex, ...deviceInfo }
    );

    // Revoke all existing sessions (force re-login)
    await Session.updateMany(
      { userId: user._id, isActive: true },
      {
        isActive: false,
        revokedAt: new Date(),
        revokedReason: "Password reset",
      }
    );

    return {
      tempPassword,
      newRecoveryKeys: newKeys.plainKeys,
      message:
        "Password reset successful. Use the temporary password to login and change it immediately.",
    };
  }

  /**
   * Generate recovery keys for PLATFORM_ADMIN
   */
  async generateRecoveryKeys(targetUserId, performedBy) {
    const targetUser = await userService.findById(targetUserId);
    if (!targetUser) {
      throw new NotFoundException("User not found");
    }

    // Only for PLATFORM_ADMIN
    if (targetUser.role !== ROLES.PLATFORM_ADMIN.code) {
      throw new ValidationException(
        "Recovery keys are only for Platform Admin users"
      );
    }

    // Generate new keys
    const newKeys = await RecoveryKey.regenerateForUser(
      targetUserId,
      performedBy
    );

    // Log the action
    const performer = await userService.findById(performedBy);
    await auditService.logAction(
      performer,
      "RECOVERY_KEYS_GENERATED",
      "User",
      targetUserId,
      null,
      { generatedFor: targetUser.username }
    );

    return {
      recoveryKeys: newKeys.plainKeys,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      message:
        "Store these recovery keys in a secure location. They will only be shown once.",
    };
  }

  /**
   * Request password reset via email
   */
  async requestPasswordResetEmail(email) {
    if (!email) {
      throw new ValidationException("Email is required");
    }

    const user = await userService.findByEmail(email);
    if (!user) {
      // Don't reveal if user exists
      return { message: "If that email exists, a reset link has been sent." };
    }

    // Invalidate any existing tokens
    await PasswordResetToken.updateMany(
      { userId: user._id, used: false },
      { used: true }
    );

    // Create new reset token (30 min expiry)
    const token = uuidv4();
    await PasswordResetToken.create({
      userId: user._id,
      token,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    // Send reset email
    await emailService.sendPasswordResetEmail(user, token);

    return { message: "If that email exists, a reset link has been sent." };
  }

  /**
   * Reset password using token
   */
  async resetPasswordWithToken(token, newPassword) {
    if (!token || !newPassword) {
      throw new ValidationException("Token and new password are required");
    }

    if (newPassword.length < 6) {
      throw new ValidationException("Password must be at least 6 characters");
    }

    const resetToken = await PasswordResetToken.findOne({
      token,
      used: false,
      expiresAt: { $gt: new Date() },
    });

    if (!resetToken) {
      throw new ValidationException("Invalid or expired reset token");
    }

    // Update password
    await userService.updatePassword(resetToken.userId, newPassword);

    // Mark token as used
    resetToken.used = true;
    await resetToken.save();

    // Invalidate all sessions
    await Session.updateMany(
      { userId: resetToken.userId, isActive: true },
      { isActive: false, revokedAt: new Date(), revokedReason: "Password reset via email" }
    );

    return { message: "Password reset successful. You can now log in with your new password." };
  }

  /**
   * Generate temporary password
   */
  _generateTempPassword() {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  /**
   * Remove sensitive data from user object
   */
  _sanitizeUser(user) {
    const userObj = user.toObject ? user.toObject() : user;
    delete userObj.password;
    delete userObj.refreshToken;
    delete userObj.__v;
    return userObj;
  }
}

export default new AuthFacade();

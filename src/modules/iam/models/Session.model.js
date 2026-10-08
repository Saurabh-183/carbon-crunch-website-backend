/**
 * Session Model
 * Tracks user sessions for security and concurrent login management
 */

import mongoose from "mongoose";
import { DB_MODEL_REF, SESSION_STATUS, VALIDATION } from "./../../../constants/index.js";

const { Schema } = mongoose;

/**
 * Device Information Schema
 */
const deviceInfoSchema = new Schema(
  {
    userAgent: String,
    ip: String,
    platform: String,
    browser: String,
    os: String,
    deviceType: {
      type: String,
      enum: ["desktop", "mobile", "tablet", "unknown"],
      default: "unknown",
    },
  },
  { _id: false }
);

/**
 * Main Session Schema
 */
const sessionSchema = new Schema(
  {
    // User Reference
    userId: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.USER,
      required: true,
      index: true,
    },
    
    // Organization Context
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.ORGANIZATION,
      index: true,
    },
    
    // Token Information
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    refreshToken: {
      type: String,
      index: true,
    },
    
    // Device Information
    deviceInfo: deviceInfoSchema,
    
    // Session Status
    status: {
      type: String,
      enum: Object.values(SESSION_STATUS),
      default: SESSION_STATUS.ACTIVE,
      index: true,
    },
    
    // Timestamps
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // MongoDB TTL index - auto-delete expired sessions
    },
    lastAccessedAt: {
      type: Date,
      default: Date.now,
    },
    revokedAt: Date,
    revokedBy: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.USER,
    },
    revokedReason: String,
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
sessionSchema.index({ userId: 1, status: 1 });
sessionSchema.index({ token: 1, status: 1 });
sessionSchema.index({ createdAt: -1 });

// Method to check if session is active and valid
sessionSchema.methods.isValid = function () {
  return (
    this.status === SESSION_STATUS.ACTIVE &&
    this.expiresAt > new Date()
  );
};

// Method to revoke session
sessionSchema.methods.revoke = function (revokedBy, reason) {
  this.status = SESSION_STATUS.REVOKED;
  this.revokedAt = new Date();
  this.revokedBy = revokedBy;
  this.revokedReason = reason || "Manual revocation";
  return this.save();
};

// Method to update last accessed time
sessionSchema.methods.updateAccess = function () {
  this.lastAccessedAt = new Date();
  return this.save();
};

// Static method to create new session
sessionSchema.statics.createSession = async function (sessionData) {
  const { userId, organizationId, token, refreshToken, deviceInfo } = sessionData;
  
  const expiresAt = new Date(Date.now() + VALIDATION.SESSION_MAX_AGE);
  
  const session = new this({
    userId,
    organizationId,
    token,
    refreshToken,
    deviceInfo,
    expiresAt,
  });
  
  return session.save();
};

// Static method to find active session by token
sessionSchema.statics.findActiveSession = function (token) {
  return this.findOne({
    token,
    status: SESSION_STATUS.ACTIVE,
    expiresAt: { $gt: new Date() },
  });
};

// Static method to revoke all sessions for a user
sessionSchema.statics.revokeAllUserSessions = async function (userId, revokedBy, reason) {
  return this.updateMany(
    {
      userId,
      status: SESSION_STATUS.ACTIVE,
    },
    {
      status: SESSION_STATUS.REVOKED,
      revokedAt: new Date(),
      revokedBy,
      revokedReason: reason || "Revoke all sessions",
    }
  );
};

// Static method to get user's active sessions
sessionSchema.statics.getUserActiveSessions = function (userId) {
  return this.find({
    userId,
    status: SESSION_STATUS.ACTIVE,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });
};

// Static method to cleanup expired sessions (manual cleanup if TTL index not working)
sessionSchema.statics.cleanupExpiredSessions = async function () {
  const result = await this.updateMany(
    {
      status: SESSION_STATUS.ACTIVE,
      expiresAt: { $lt: new Date() },
    },
    {
      status: SESSION_STATUS.EXPIRED,
    }
  );
  
  return result;
};

export default mongoose.model(DB_MODEL_REF.SESSION, sessionSchema);

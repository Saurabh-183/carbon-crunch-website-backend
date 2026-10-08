/**
 * Audit Log Model
 * Immutable audit trail for all critical actions
 * Meets compliance requirements for data integrity
 */

import mongoose from "mongoose";
import crypto from "crypto";
import { DB_MODEL_REF, AUDIT_ACTIONS } from "./../../../constants/index.js";

const { Schema } = mongoose;

/**
 * Target Resource Schema
 * Identifies what resource was affected
 */
const targetResourceSchema = new Schema(
  {
    resourceType: {
      type: String,
      required: true,
      enum: Object.values(DB_MODEL_REF),
    },
    resourceId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    resourceName: String, // Denormalized for easy viewing
  },
  { _id: false }
);

/**
 * Data Change Schema
 * Tracks before/after values for audit trail
 */
const dataChangeSchema = new Schema(
  {
    field: String,
    previousValue: Schema.Types.Mixed,
    newValue: Schema.Types.Mixed,
  },
  { _id: false }
);

/**
 * Main Audit Log Schema
 */
const auditLogSchema = new Schema(
  {
    // Action Information
    action: {
      type: String,
      required: true,
      enum: Object.values(AUDIT_ACTIONS),
      index: true,
    },
    actionDescription: String,

    // Actor (Who performed the action)
    performedBy: {
      userId: {
        type: Schema.Types.ObjectId,
        ref: DB_MODEL_REF.USER,
        required: true,
        index: true,
      },
      username: String, // Denormalized
      role: String, // Denormalized
    },

    // Target (What was affected)
    targetResource: targetResourceSchema,

    // Context
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.ORGANIZATION,
      index: true,
    },
    facilityId: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.FACILITY,
      index: true,
    },

    // Data Changes (for update actions)
    changes: [dataChangeSchema],

    // Request Metadata
    metadata: {
      ipAddress: String,
      userAgent: String,
      requestId: String,
      sessionId: String,
      method: String, // HTTP method (GET, POST, etc.)
      endpoint: String, // API endpoint
    },

    // Additional Context
    remarks: String,
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },

    // Immutability Features
    hash: {
      type: String,
      // Don't require initially - will be set by pre-save hook
    },
    previousHash: String, // Hash of previous log entry (blockchain-style chain)

    // Timestamp (Immutable)
    timestamp: {
      type: Date,
      default: Date.now,
      immutable: true,
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Only track creation, no updates allowed
  }
);

// Indexes for efficient querying
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ "performedBy.userId": 1, timestamp: -1 });
auditLogSchema.index({ organizationId: 1, timestamp: -1 });
auditLogSchema.index({ facilityId: 1, timestamp: -1 });
auditLogSchema.index({
  "targetResource.resourceType": 1,
  "targetResource.resourceId": 1,
});
auditLogSchema.index({ timestamp: -1 }); // For chronological queries
auditLogSchema.index({ severity: 1, timestamp: -1 });

// Pre-save middleware to generate hash
auditLogSchema.pre("save", async function (next) {
  try {
    if (this.isNew) {
      // Ensure timestamp is set
      if (!this.timestamp) {
        this.timestamp = new Date();
      }

      // Generate hash of this log entry
      const dataToHash = JSON.stringify({
        action: this.action,
        performedBy: this.performedBy,
        targetResource: this.targetResource,
        timestamp: this.timestamp,
        metadata: this.metadata,
      });

      this.hash = crypto.createHash("sha256").update(dataToHash).digest("hex");

      // Get previous hash to create blockchain-style chain
      const AuditLog = this.constructor;
      const previousLog = await AuditLog.findOne()
        .sort({ timestamp: -1 })
        .select("hash")
        .lean();

      if (previousLog) {
        this.previousHash = previousLog.hash;
      }
    }
    next();
  } catch (error) {
    console.error("Error in AuditLog pre-save:", error);
    next(error);
  }
});

// Prevent updates and deletes (immutability)
auditLogSchema.pre("updateOne", function (next) {
  next(new Error("Audit logs cannot be updated"));
});

auditLogSchema.pre("findOneAndUpdate", function (next) {
  next(new Error("Audit logs cannot be updated"));
});

auditLogSchema.pre("deleteOne", function (next) {
  next(new Error("Audit logs cannot be deleted"));
});

auditLogSchema.pre("deleteMany", function (next) {
  next(new Error("Audit logs cannot be deleted"));
});

// Static method to create audit log entry
auditLogSchema.statics.logAction = async function (logData) {
  const {
    action,
    performedBy,
    targetResource,
    organizationId,
    facilityId,
    changes,
    metadata,
    remarks,
    severity,
  } = logData;

  // Ensure performedBy has the correct structure
  const performedByData = {
    userId: performedBy._id || performedBy.userId,
    username: performedBy.username,
    role: performedBy.role,
  };

  const auditLog = new this({
    action,
    performedBy: performedByData,
    targetResource,
    organizationId,
    facilityId,
    changes,
    metadata,
    remarks,
    severity: severity || "medium",
    timestamp: new Date(), // Explicitly set timestamp
  });

  // Save will trigger pre-save hook to generate hash
  return await auditLog.save();
};

// Static method to verify audit trail integrity
auditLogSchema.statics.verifyIntegrity = async function (startDate, endDate) {
  const logs = await this.find({
    timestamp: { $gte: startDate, $lte: endDate },
  }).sort({ timestamp: 1 });

  for (let i = 1; i < logs.length; i++) {
    const currentLog = logs[i];
    const previousLog = logs[i - 1];

    // Verify hash chain
    if (currentLog.previousHash !== previousLog.hash) {
      return {
        valid: false,
        corruptedLogId: currentLog._id,
        message: "Hash chain broken - possible tampering detected",
      };
    }
  }

  return { valid: true, message: "Audit trail integrity verified" };
};

export default mongoose.model(DB_MODEL_REF.AUDIT_LOG, auditLogSchema);

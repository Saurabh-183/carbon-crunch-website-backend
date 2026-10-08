/**
 * Permission Model
 * Granular permission management for users
 * Implements access control for IAM modules
 */

import mongoose from "mongoose";
import { DB_MODEL_REF, ACCESS_LEVELS } from "./../../../constants/index.js";

const { Schema } = mongoose;

/**
 * Module Permission Schema
 */
const modulePermissionSchema = new Schema(
  {
    moduleSlug: {
      type: String,
      required: true,
      index: true,
    },
    access: {
      type: Number,
      enum: Object.values(ACCESS_LEVELS),
      default: ACCESS_LEVELS.READ,
      // 0 = NONE, 1 = READ, 2 = WRITE, 3 = ALL
    },
  },
  { _id: false }
);

/**
 * Main Permission Schema
 */
const permissionSchema = new Schema(
  {
    // User Reference
    userId: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.USER,
      required: true,
      index: true,
    },
    
    // Organization & Facility Scope
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
    
    // Module Permissions
    modules: [modulePermissionSchema],
    
    // Full Access Flag (for admins)
    hasFullAccess: {
      type: Boolean,
      default: false,
    },
    
    // Metadata
    grantedBy: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.USER,
    },
    grantedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: Date, // Optional expiration for temporary access
    
    // Status
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: Date,
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
permissionSchema.index({ userId: 1, facilityId: 1, isDeleted: 1 });
permissionSchema.index({ userId: 1, organizationId: 1, isActive: 1 });
permissionSchema.index({ "modules.moduleSlug": 1 });

// Method to check if user has permission for a specific module
permissionSchema.methods.hasModuleAccess = function (moduleSlug, requiredAccess = ACCESS_LEVELS.READ) {
  // Full access bypasses all checks
  if (this.hasFullAccess) return true;
  
  // Check if permission is active
  if (!this.isActive || this.isDeleted) return false;
  
  // Check expiration
  if (this.expiresAt && this.expiresAt < new Date()) return false;
  
  // Find module permission
  const modulePermission = this.modules.find((m) => m.moduleSlug === moduleSlug);
  
  if (!modulePermission) return false;
  
  // Check if access level is sufficient
  return modulePermission.access >= requiredAccess;
};

// Method to grant module access
permissionSchema.methods.grantModuleAccess = function (moduleSlug, accessLevel) {
  const existingIndex = this.modules.findIndex((m) => m.moduleSlug === moduleSlug);
  
  if (existingIndex >= 0) {
    // Update existing permission
    this.modules[existingIndex].access = accessLevel;
  } else {
    // Add new permission
    this.modules.push({ moduleSlug, access: accessLevel });
  }
  
  return this.save();
};

// Method to revoke module access
permissionSchema.methods.revokeModuleAccess = function (moduleSlug) {
  this.modules = this.modules.filter((m) => m.moduleSlug !== moduleSlug);
  return this.save();
};

// Static method to find user's permissions for a facility
permissionSchema.statics.findUserFacilityPermissions = function (userId, facilityId) {
  return this.findOne({
    userId,
    facilityId,
    isActive: true,
    isDeleted: false,
  });
};

// Static method to find user's organization-wide permissions
permissionSchema.statics.findUserOrgPermissions = function (userId, organizationId) {
  return this.findOne({
    userId,
    organizationId,
    facilityId: { $exists: false }, // Organization-level, not facility-specific
    isActive: true,
    isDeleted: false,
  });
};

export default mongoose.model(DB_MODEL_REF.PERMISSION, permissionSchema);

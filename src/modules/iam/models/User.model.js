/**
 * User Model (Refactored for CarbonOS)
 * Supports hierarchical roles and multi-facility access
 */

import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { DB_MODEL_REF, ROLES, VALIDATION } from "../../../constants/index.js";

const { Schema } = mongoose;

/**
 * Facility Assignment Schema
 * Tracks which facilities a user has access to with specific roles
 */
const facilityAssignmentSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.FACILITY,
      required: true,
    },
    facilityName: String, // Denormalized for quick access
    role: {
      type: String,
      enum: Object.keys(ROLES),
      required: true,
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.USER,
    },
  },
  { _id: true }
);

/**
 * Main User Schema
 */
const userSchema = new Schema(
  {
    // Basic Information
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
      minlength: VALIDATION.USERNAME_MIN_LENGTH,
      maxlength: VALIDATION.USERNAME_MAX_LENGTH,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
      index: true,
      validate: {
        validator: function (v) {
          // Email required for God Mode, Platform Admin, Auditor, Finance roles
          if (
            [
              ROLES.GOD_MODE.code,
              ROLES.PLATFORM_ADMIN.code,
              ROLES.AUDITOR.code,
              ROLES.FINANCE_CFO.code,
            ].includes(this.role)
          ) {
            return !!v;
          }
          return true;
        },
        message: "Email is required for this role",
      },
    },
    password: {
      type: String,
      required: true,
      minlength: VALIDATION.PASSWORD_MIN_LENGTH,
      select: false, // Don't include in queries by default
    },

    // Organization & Role
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.ORGANIZATION,
      index: true,
      validate: {
        validator: function (v) {
          // Organization required for all roles except God Mode, Platform Admin, Auditor, Maintainer, 
          // and self-registering Energy Managers from the calculator.
          const systemRoles = [
            ROLES.GOD_MODE.code,
            ROLES.PLATFORM_ADMIN.code,
            ROLES.AUDITOR.code,
            ROLES.MAINTAINER.code,
            ROLES.ENERGY_MANAGER.code, // Allowed without org for calculator signups
          ];
          if (!systemRoles.includes(this.role)) {
            return !!v;
          }
          return true;
        },
        message: "Organization is required for this role",
      },
    },
    role: {
      type: String,
      enum: Object.keys(ROLES),
      required: true,
      index: true,
    },
    regionId: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.REGION,
      index: true,
    },

    // Facility Assignments (for facility-scoped roles)
    facilities: [facilityAssignmentSchema],

    // Profile Information
    firstName: String,
    lastName: String,
    phone: String,
    avatar: String,

    // Authentication
    refreshToken: {
      type: String,
      select: false,
    },
    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,

    // Status
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: Date,

    // Onboarding
    hasSeenTour: {
      type: Boolean,
      default: false,
    },

    // Data Entry Style preference (service sector only, set by PLANT_ADMIN)
    dataEntryStyle: {
      type: String,
      enum: ["category", "scope"],
      default: "category",
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    // Activity Tracking
    lastLogin: Date,
    lastActivityAt: Date,
    loginCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes for common queries
userSchema.index({ username: 1, organizationId: 1 }, { unique: true });
userSchema.index({ email: 1, isDeleted: 1 });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ organizationId: 1, role: 1, isDeleted: 1 });
userSchema.index({ organizationId: 1, regionId: 1, role: 1 });

// Virtual for full name
userSchema.virtual("fullName").get(function () {
  if (this.firstName && this.lastName) {
    return `${this.firstName} ${this.lastName}`;
  }
  return this.username;
});

// Virtual for role details
userSchema.virtual("roleDetails").get(function () {
  return ROLES[this.role] || null;
});

// Password hashing middleware
userSchema.pre("save", async function (next) {
  // Only hash if password is modified
  if (!this.isModified("password")) return next();

  try {
    this.password = await bcrypt.hash(this.password, 10);

    // Set passwordChangedAt if updating (not creating)
    if (!this.isNew) {
      this.passwordChangedAt = new Date(Date.now() - 1000); // Subtract 1s to ensure token is valid
    }

    next();
  } catch (err) {
    return next(err);
  }
});

// Method to check password
userSchema.methods.isPasswordCorrect = async function (password) {
  return await bcrypt.compare(password, this.password);
};

// Method to generate access token
userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      username: this.username,
      role: this.role,
      organizationId: this.organizationId,
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: VALIDATION.TOKEN_EXPIRY,
    }
  );
};

// Method to generate refresh token
userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      _id: this._id,
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: VALIDATION.REFRESH_TOKEN_EXPIRY,
    }
  );
};

// Method to check if password was changed after token was issued
userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10
    );
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

// Method to check if user has access to a facility
userSchema.methods.hasFacilityAccess = function (facilityId) {
  // God Mode, Platform Admin, and Org Admin have access to all facilities
  if (
    [
      ROLES.GOD_MODE.code,
      ROLES.PLATFORM_ADMIN.code,
      ROLES.HEAD.code,
      ROLES.REGION_ADMIN.code,
      ROLES.ORG_ADMIN.code,
    ].includes(this.role)
  ) {
    return true;
  }

  // Auditor has read-only access to assigned org's facilities
  if (this.role === ROLES.AUDITOR.code) {
    return true; // Scoped to assigned orgs in controller layer
  }

  // Check facility assignments
  return this.facilities.some(
    (f) => f.facilityId.toString() === facilityId.toString()
  );
};

// Method to get user's role level
userSchema.methods.getRoleLevel = function () {
  const roleDetails = ROLES[this.role];
  return roleDetails ? roleDetails.level : 0;
};

// Method to check if user can manage another user
userSchema.methods.canManage = function (targetUser) {
  const myLevel = this.getRoleLevel();
  const targetLevel = targetUser.getRoleLevel();

  // God Mode can manage anyone
  if (this.role === ROLES.GOD_MODE.code) return true;

  // Platform Admin can manage anyone except God Mode
  if ([ROLES.PLATFORM_ADMIN.code].includes(this.role)) {
    return targetUser.role !== ROLES.GOD_MODE.code;
  }

  // Org Admin can manage anyone in their organization
  if (
    [ROLES.HEAD.code, ROLES.REGION_ADMIN.code, ROLES.ORG_ADMIN.code].includes(
      this.role
    ) &&
    this.organizationId.toString() === targetUser.organizationId.toString()
  ) {
    return true;
  }

  // Higher level can manage lower level in same org/facility
  return myLevel > targetLevel;
};

export default mongoose.models[DB_MODEL_REF.USER] || mongoose.model(DB_MODEL_REF.USER, userSchema);

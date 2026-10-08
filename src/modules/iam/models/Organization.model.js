/**
 * Organization Model
 * Represents a corporate entity using CarbonOS
 * Multi-tenant architecture with embedded permissions
 */

import mongoose from "mongoose";
import {
  DB_MODEL_REF,
  ORGANIZATION_TYPES,
} from "./../../../constants/index.js";

const { Schema } = mongoose;

/**
 * Organization Contact Schema
 */
const contactSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    phone: {
      type: String,
      required: true,
    },
    alternatePhone: String,
    address: {
      street: String,
      city: String,
      state: String,
      country: {
        type: String,
        default: "India",
      },
      pincode: String,
    },
  },
  { _id: false }
);

/**
 * Organization Settings Schema
 */
const settingsSchema = new Schema(
  {
    timezone: {
      type: String,
      default: "Asia/Kolkata",
    },
    fiscalYearStart: {
      type: Date,
      default: () => new Date(new Date().getFullYear(), 3, 1), // April 1st
    },
    reportingCycle: {
      type: String,
      enum: ["quarterly", "annually", "both"],
      default: "annually",
    },
    branding: {
      logo: String,
      primaryColor: {
        type: String,
        default: "#1976d2",
      },
      secondaryColor: {
        type: String,
        default: "#dc004e",
      },
    },
  },
  { _id: false }
);

/**
 * Main Organization Schema
 */
const organizationSchema = new Schema(
  {
    // Basic Information
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    code: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
    },
    organizationType: {
      type: Number,
      enum: [1, 2, 3, 4, 5], // See ORGANIZATION_TYPES in constants
      required: true,
    },
    industry: {
      type: String,
      required: true,
    },

    // Registration Details
    cin: String, // Corporate Identification Number
    gstin: String, // GST Identification Number
    panNumber: String,
    yearEstablished: Number,
    legalEntityType: String,
    cinOrRegistrationId: String,
    primaryContact: {
      name: String,
      role: String,
    },
    reportingYear: String,
    reportingPeriod: String,
    baselineYear: String,
    websiteUrl: String,

    // Contact Information
    contact: contactSchema,

    // Settings
    settings: settingsSchema,

    // Compliance & Governance Configuration
    complianceSettings: {
      enabledModules: {
        type: [String],
        default: [],
        enum: ["GHG", "RCO", "CBAM", "CCTS", "PAT"],
      },
      GHGProtocolVersion: {
        type: String,
        trim: true,
        default: "GHG Protocol",
      },
      allowedBoundaryMethods: {
        type: [String],
        default: [],
      },
      allowedReportingScopes: {
        type: [String],
        default: [],
        enum: ["Scope 1", "Scope 2", "Scope 3"],
      },
      allowedSystemBoundaries: {
        type: [String],
        default: [],
        enum: ["Organizational level", "Project level", "Product level"],
      },
      auditLogEnforcement: {
        type: Boolean,
        default: true,
        immutable: true,
      },
    },

    // Branding Assets
    logo: String,
    bannerImage: String,

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

    // Metadata
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.USER,
    },
    totalFacilities: {
      type: Number,
      default: 0,
    },
    totalUsers: {
      type: Number,
      default: 0,
    },
    lastActivityDate: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
organizationSchema.index({ name: 1, isDeleted: 1 });
organizationSchema.index({ code: 1 }, { unique: true, sparse: true });
organizationSchema.index({ status: 1, isDeleted: 1 });
organizationSchema.index({ createdAt: -1 });

// Virtual for facilities
organizationSchema.virtual("facilities", {
  ref: DB_MODEL_REF.FACILITY,
  localField: "_id",
  foreignField: "organizationId",
});

// Virtual for users
organizationSchema.virtual("users", {
  ref: DB_MODEL_REF.USER,
  localField: "_id",
  foreignField: "organizationId",
});

// Pre-save middleware to generate organization code
organizationSchema.pre("save", async function (next) {
  if (this.isNew && !this.code) {
    // Generate code from organization name (first 3 letters + random numbers)
    const prefix = this.name
      .substring(0, 3)
      .toUpperCase()
      .replace(/[^A-Z]/g, "");
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    this.code = `${prefix}${randomNum}`;
  }
  next();
});

// Method to check if organization is active
organizationSchema.methods.isActive = function () {
  return this.status === "active" && !this.isDeleted;
};

export default mongoose.model(DB_MODEL_REF.ORGANIZATION, organizationSchema);

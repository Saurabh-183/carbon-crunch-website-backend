import mongoose, { Schema } from "mongoose";

/**
 * Organization Model
 * Represents a company/organization in the system
 * Organizations can have multiple facilities and users
 */

const organizationSchema = new Schema(
  {
    // Basic Information
    name: {
      type: String,
      required: [true, "Organization name is required"],
      trim: true,
      unique: true,
      minlength: [3, "Organization name must be at least 3 characters long"],
      maxlength: [100, "Organization name must not exceed 100 characters"],
    },

    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description must not exceed 500 characters"],
    },

    industry: {
      type: String,
      trim: true,
      enum: [
        "Service Sector",
        "Aluminium",
        "Cement",
        // "Commercial Buildings",
        // "Chlor-Alkali",
        // "Electricity Distribution (DISCOMs)",
        // "Fertilizer",
        "Iron and Steel",
        "Pulp and Paper",
        // "Petroleum Refinery",
        // "Petrochemical",
        // "Railways",
        "Textiles",
        // "Petrochemical Manufacturing Units",
        "Sugar",
        // "Chemicals - (i) Alkali Chemical (Soda Ash, Potassium Hydroxide)",
        // "Chemicals - (ii) Inorganic Chemicals",
        // "Chemicals - (iii) Organic Chemicals",
        // "Chemicals - (iv) Pesticides (Technical)",
        // "Chemicals - (v) Dyes and Pigments",
        // "Chemicals - (vi) Pharmaceuticals (Active Pharmaceutical Ingredient)",
        "Ceramic",
        // "Glass",
        // "Zinc",
        // "Copper",
        // "Port Trust",
        // "Dairy",
        // "Automobile Assembly",
        // "Tyre Manufacturer",
        // "Forging",
        // "Foundry",
        // "Refractories",
        // "Others"
      ],
    },

    organizationType: {
      type: Number,
      enum: [1, 2, 3, 4, 5],
    },

    legalEntityType: {
      type: String,
      trim: true,
    },

    cinOrRegistrationId: {
      type: String,
      trim: true,
    },

    primaryContact: {
      name: {
        type: String,
        trim: true,
      },
      role: {
        type: String,
        trim: true,
      },
    },

    reportingYear: {
      type: String,
      trim: true,
    },

    reportingPeriod: {
      type: String,
      trim: true,
    },

    baselineYear: {
      type: String,
      trim: true,
    },

    websiteUrl: {
      type: String,
      trim: true,
    },

    // Address Information
    address: {
      line1: {
        type: String,
        trim: true,
      },
      line2: {
        type: String,
        trim: true,
      },
      street: {
        type: String,
        trim: true,
      },
      city: {
        type: String,
        trim: true,
      },
      state: {
        type: String,
        trim: true,
      },
      country: {
        type: String,
        trim: true,
        default: "United States",
      },
      postalCode: {
        type: String,
        trim: true,
      },
      zipCode: {
        type: String,
        trim: true,
      },
    },

    // Contact Information
    contactInfo: {
      email: {
        type: String,
        trim: true,
        lowercase: true,
        match: [
          /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
          "Please provide a valid email address",
        ],
      },
      phone: {
        type: String,
        trim: true,
      },
      website: {
        type: String,
        trim: true,
      },
    },

    // Settings
    settings: {
      // Emission calculation settings
      emissionFactors: {
        type: Map,
        of: Number,
        default: new Map(),
      },

      // Reporting period (monthly, quarterly, yearly)
      reportingPeriod: {
        type: String,
        enum: ["monthly", "quarterly", "yearly"],
        default: "yearly",
      },

      // Fiscal year start month (1-12)
      fiscalYearStart: {
        type: Number,
        min: 1,
        max: 12,
        default: 1, // January
      },

      // Default currency
      currency: {
        type: String,
        default: "USD",
      },

      // Timezone
      timezone: {
        type: String,
        default: "America/New_York",
      },
    },

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

    // RCO Specific Corporate Details
    corporateOfficeAddress: {
      type: String,
      trim: true,
    },
    boardOfDirectors: [
      {
        name: {
          type: String,
          trim: true,
        },
        role: {
          type: String,
          trim: true,
        },
      },
    ],
    rawMaterialSourcing: {
      type: String,
      trim: true,
    },

    officeInformation: {
      officeAdminName: {
        type: String,
        trim: true,
      },
      officeAddress: {
        type: String,
        trim: true,
      },
      icaiId: {
        type: String,
        trim: true,
      },
      contactEmail: {
        type: String,
        trim: true,
        lowercase: true,
      },
      contactPhone: {
        type: String,
        trim: true,
      },
      effectiveDate: {
        type: Date,
      },
      updatedAt: {
        type: Date,
      },
    },

    // Relationships
    facilities: [
      {
        type: Schema.Types.ObjectId,
        ref: "Facility",
      },
    ],

    users: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // Metadata
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    logoUrl: {
      type: String,
      trim: true,
    },

    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
      default: new Map(),
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt automatically
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    collection: "organizations",
  }
);

// Indexes for performance
organizationSchema.index({ status: 1 });
organizationSchema.index({ industry: 1 });
organizationSchema.index({ "contactInfo.email": 1 });

// Virtual field to get facility count
organizationSchema.virtual("facilityCount").get(function () {
  return this.facilities ? this.facilities.length : 0;
});

// Virtual field to get user count
organizationSchema.virtual("userCount").get(function () {
  return this.users ? this.users.length : 0;
});

// Static method to find active organizations
organizationSchema.statics.findActive = function () {
  return this.find({ status: "active" });
};

// Instance method to activate organization
organizationSchema.methods.activate = function () {
  this.status = "active";
  return this.save();
};

// Instance method to deactivate organization
organizationSchema.methods.deactivate = function () {
  this.status = "inactive";
  return this.save();
};

// Pre-save middleware for validation
organizationSchema.pre("save", function (next) {
  // Ensure email is lowercase
  if (this.contactInfo && this.contactInfo.email) {
    this.contactInfo.email = this.contactInfo.email.toLowerCase();
  }
  next();
});

const Organization =
  mongoose.models.CoreOrganization ||
  mongoose.model("CoreOrganization", organizationSchema, "organizations");

export default Organization;

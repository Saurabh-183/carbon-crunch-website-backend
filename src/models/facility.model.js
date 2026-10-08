import mongoose, { Schema } from "mongoose";
import User from "../modules/iam/models/User.model.js";

// Define the enums for entities and actions
const ENTITY_ENUM = [
  "fuel",
  "bioenergy",
  "food",
  "refrigerants",
  "ehctd",
  "wttfuel",
  "material",
  "waste",
  "btls",
  "ec",
  "water",
  "fg",
  "homeOffice",
  "ownedVehicles",
  "fa",
  "Role",
  "Facility",
];

const ACTIONS_ENUM = ["read", "create", "update", "delete", "manage"];

// Define the Facility schema
const facilitySchema = new Schema({
  facilityName: {
    type: String,
    required: true,
    trim: true,
  },
  facilityLocation: {
    type: String,
    trim: true,
  },
  facilityAddress: {
    type: String,
    trim: true,
  },
  facilityAddressLine2: {
    type: String,
    trim: true,
  },
  facilityCity: {
    type: String,
    trim: true,
  },
  facilityState: {
    type: String,
    trim: true,
  },
  facilityPostalCode: {
    type: String,
    trim: true,
  },
  facilityArea: {
    type: Number,
    min: 0,
  },
  organizationId: {
    type: Schema.Types.ObjectId,
    ref: "Organization",
  },
  regionId: {
    type: Schema.Types.ObjectId,
    ref: "Region",
    index: true,
  },
  type: {
    type: String,
    trim: true,
    default: "General",
  },
  boundarySettings: {
    operationalControl: {
      type: Boolean,
      default: false,
    },
    financialControl: {
      type: Boolean,
      default: false,
    },
    equityShare: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
  },
  reportingScopes: {
    type: [String],
    default: [],
    enum: ["Scope 1", "Scope 2", "Scope 3"],
  },
  systemBoundaries: {
    type: [String],
    default: [],
    enum: ["Organizational level", "Project level", "Product level"],
  },
  systemBoundaryProjects: {
    type: [String],
    default: [],
  },
  systemBoundaryProducts: {
    type: [String],
    default: [],
  },
  reportingPeriod: {
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
  },
  plantProfile: {
    dcNumber: {
      type: String,
      trim: true,
    },
    obligationType: {
      type: String,
      trim: true,
    },
    plantType: {
      type: String,
      trim: true,
    },
    installedProductionCapacity: {
      type: String,
      trim: true,
    },
    productsManufactured: {
      type: String,
      trim: true,
    },
    rawMaterial: {
      type: String,
      trim: true,
    },
    powerSource: {
      type: String,
      trim: true,
    },
    dgCapacity: {
      type: String,
      trim: true,
    },
    turbineCapacity: {
      type: String,
      trim: true,
    },
    boilerCapacity: {
      type: String,
      trim: true,
    },
    fuelMix: {
      type: String,
      trim: true,
    },
    unLocode: {
      type: String,
      trim: true,
    },
    latitude: {
      type: Number,
    },
    longitude: {
      type: Number,
    },
  },
  cbam: {
    cbamImpacted: {
      type: Boolean,
      default: false,
    },
  },
  facilityHeads: [
    {
      name: {
        type: String,
        trim: true,
      },
      email: {
        type: String,
        trim: true,
        lowercase: true,
      },
    },
  ],
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  reports: [
    {
      type: Schema.Types.ObjectId,
      ref: "Report",
    },
  ],
  userRoles: [
    {
      username: {
        type: String, // Store usernames directly
        required: true,
        trim: true,
        validate: {
          validator: function (v) {
            // This example assumes you have a way to check the user's role.
            // If you need to check this dynamically, ensure the logic can access the role context.
            if (["Admin", "FacAdmin", "Employee"].includes(this.role)) {
              return !!v; // username is required for Admin, FacAdmin, and Employee
            }
            return true; // username is optional for Platform Admin
          },
          message: (props) => `${props.value} is required for specific roles`,
        },
      },
      fullAccess: {
        type: Boolean, // New field to indicate full access to all entities and actions
        default: false, // Default to false; set to true to grant full access
      },
      permissions: [
        {
          entity: {
            type: String,
            enum: ENTITY_ENUM,
            required: true,
          },
          actions: {
            type: [String], // Array of actions to allow multiple CRUD operations
            enum: ACTIONS_ENUM,
            required: true,
          },
        },
      ],
    },
  ],
});

// Ensure facility names are unique within an organization
facilitySchema.index({ organizationId: 1, facilityName: 1 }, { unique: true });

// Pre-save middleware to populate permissions if fullAccess is true
facilitySchema.pre("save", function (next) {
  this.userRoles.forEach((userRole) => {
    if (userRole.fullAccess) {
      // Grant full permissions for "Role" and "Facility" entities, and limited permissions for other entities
      userRole.permissions = ENTITY_ENUM.map((entity) => {
        // Check if the entity is "Role" or "Facility"
        if (["Role", "Facility"].includes(entity)) {
          return {
            entity,
            actions: ACTIONS_ENUM, // Grant all actions, including "manage"
          };
        } else {
          return {
            entity,
            actions: ACTIONS_ENUM.filter((action) => action !== "manage"), // Grant all actions except "manage"
          };
        }
      });
    }
  });
  next();
});

// Post-save middleware to update User model based on updated userRoles in Facility
facilitySchema.post("save", async function (doc, next) {
  try {
    const userUpdates = doc.userRoles.map(async (userRole) => {
      const username = userRole.username;

      // Find the user by username and add the facility ID if it's not already included
      const user = await User.findOneAndUpdate(
        { username },
        { $addToSet: { facilities: doc._id } } // $addToSet ensures no duplicates
      );

      return user;
    });

    // Wait for all user updates to complete
    await Promise.all(userUpdates);
    next();
  } catch (error) {
    next(error);
  }
});

export const Facility = mongoose.model("Facility", facilitySchema);

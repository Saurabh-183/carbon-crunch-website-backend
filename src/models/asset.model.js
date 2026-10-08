import mongoose, { Schema } from "mongoose";

/**
 * Asset Categories matching GHG scope data categories.
 * Covers equipment that produces Scope 1/2/3 emissions.
 */
const ASSET_CATEGORIES = [
  // Scope 1 — Stationary Combustion
  "Boiler",
  "Furnace",
  "Kiln",
  "Oven",
  "Heater",
  "Turbine (Gas)",
  "Generator (Diesel)",
  "Generator (Gas)",
  "Incinerator",
  "Flare Stack",
  // Scope 1 — Mobile Combustion
  "Vehicle",
  "Forklift",
  "Crane",
  "Tractor",
  "Truck",
  "Ship / Vessel",
  // Scope 1 — Process / Fugitive
  "Refrigeration Unit",
  "HVAC System",
  "Air Conditioning Unit",
  "Compressor",
  "Transformer",
  "Switchgear",
  // Scope 2 — Electricity / Heat / Steam
  "Electric Motor",
  "Pump",
  "Conveyor",
  "Lighting System",
  "Cooling Tower",
  "Chiller",
  "Steam Turbine",
  // General Infrastructure
  "Building",
  "Warehouse",
  "Pipeline",
  "Storage Tank",
  "Solar Panel Array",
  "Wind Turbine",
  "Battery Storage",
  "Water Treatment Plant",
  "Effluent Treatment Plant",
  "Other",
];

const CAPACITY_UNITS = [
  "kW",
  "MW",
  "HP",
  "BTU/hr",
  "tons (refrigeration)",
  "TPH",        // tonnes per hour
  "TPD",        // tonnes per day
  "litres",
  "m³",
  "m³/hr",
  "kg/hr",
  "kVA",
  "sqft",
  "sqm",
  "units",
  "Other",
];

/**
 * Generate a short-form Asset ID from the asset name.
 * E.g. "Diesel Generator #3" → "DG3"
 *       "Cooling Tower - North" → "CTN"
 */
function generateAssetId(name) {
  if (!name) return "";
  // Strip special characters, split on spaces / hyphens / underscores
  const words = name
    .replace(/[^a-zA-Z0-9\s\-_#]/g, "")
    .split(/[\s\-_]+/)
    .filter(Boolean);

  if (words.length === 0) return "";

  // Take the first letter of each word (uppercase) + any trailing digits
  let id = words
    .map((w) => {
      const match = w.match(/^([a-zA-Z])?(\d+)?/);
      if (!match) return "";
      return (match[1] || "").toUpperCase() + (match[2] || "");
    })
    .join("");

  return id || name.substring(0, 4).toUpperCase();
}

const assetSchema = new Schema(
  {
    assetName: {
      type: String,
      required: [true, "Asset name is required"],
      trim: true,
    },
    assetId: {
      type: String,
      trim: true,
      uppercase: true,
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      enum: {
        values: ASSET_CATEGORIES,
        message: "{VALUE} is not a valid category",
      },
    },
    fuelSources: {
      type: [String],
      default: [],
    },
    capacity: {
      type: Number,
      min: [0, "Capacity cannot be negative"],
      default: null,
    },
    capacityUnit: {
      type: String,
      enum: {
        values: CAPACITY_UNITS,
        message: "{VALUE} is not a valid unit",
      },
      default: null,
    },
    dateOfCommission: {
      type: Date,
      default: null,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    // Ownership / scoping
    facilityId: {
      type: Schema.Types.ObjectId,
      ref: "Facility",
      required: [true, "Facility is required"],
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: [true, "Organization is required"],
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-generate assetId from assetName before save
assetSchema.pre("save", function (next) {
  if (this.isModified("assetName") || !this.assetId) {
    this.assetId = generateAssetId(this.assetName);
  }
  next();
});

// Compound index for fast facility + org lookups
assetSchema.index({ facilityId: 1, organizationId: 1, isDeleted: 1 });
assetSchema.index({ organizationId: 1, category: 1 });

// Soft-delete filter helper
assetSchema.pre(/^find/, function () {
  if (!this.getOptions()?._includeDeleted) {
    this.where({ isDeleted: { $ne: true } });
  }
});

export const Asset = mongoose.model("Asset", assetSchema);
export { ASSET_CATEGORIES, CAPACITY_UNITS, generateAssetId };
export default Asset;

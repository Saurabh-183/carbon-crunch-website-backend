import mongoose from "mongoose";
import { DB_MODEL_REF } from "../constants/index.js";

const { Schema } = mongoose;

/**
 * EmissionFactor Collection
 *
 * Flat, indexed documents for high-performance lookups.
 * Each document represents ONE emission factor for a specific
 * scope → type → group → category → source → unit combination.
 *
 * This replaces the nested JSON files (scope1EF.json, scope2EF.json, scope3EF.json)
 * with a database-backed, CRUD-manageable collection.
 *
 * Maintainers can modify existing factors and add new sources.
 * God Mode can delete factors and publish changes.
 */
const emissionFactorSchema = new Schema(
  {
    // Scope: "Scope 1", "Scope 2", "Scope 3"
    scope: {
      type: String,
      required: true,
      enum: ["Scope 1", "Scope 2", "Scope 3"],
      index: true,
    },

    // Top-level type (e.g. "Stationary", "Purchased Electricity", "Purchased Heat/Steam")
    type: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    // Group key (e.g. "fuels", "uk_electricity", "heat_and_steam", "indian_electricity")
    group: {
      type: String,
      required: true,
      trim: true,
    },

    // Human-readable group label (e.g. "Fuels", "UK electricity", "Indian Electricity Grid")
    groupLabel: {
      type: String,
      trim: true,
    },

    // Category within the group (e.g. "gaseous_fuels", "electricity_generated", "grid_emission_factors")
    category: {
      type: String,
      required: true,
      trim: true,
    },

    // Source name (e.g. "Diesel", "Natural Gas", "Electricity: UK", "Northern Grid")
    source: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    // Unit of measurement (e.g. "kWh", "MWh", "tonnes", "litres", "km", "miles")
    unit: {
      type: String,
      required: true,
      trim: true,
    },

    // The emission factor value (e.g. 0.00122)
    value: {
      type: Number,
      required: true,
    },

    // Display unit string (e.g. "kgCO2e/kWh", "kgCO2e/tonnes")
    displayUnit: {
      type: String,
      trim: true,
    },

    // Region/country applicability (for location-based factors)
    region: {
      type: String,
      trim: true,
      default: "Global",
    },

    // Year the factor applies to (for versioning)
    year: {
      type: Number,
      default: null,
    },

    // Data source reference (e.g. "DEFRA 2024", "CEA India 2023", "GHG Protocol")
    dataSource: {
      type: String,
      trim: true,
      default: null,
    },

    // Whether this factor is active/published
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // Who last modified this factor
    lastModifiedBy: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.USER,
      default: null,
    },

    // Notes from the maintainer
    notes: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for the primary lookup path:
// getEmissionFactor(scope, type, group, category, source, unit)
emissionFactorSchema.index(
  { scope: 1, type: 1, group: 1, category: 1, source: 1, unit: 1, isActive: 1 },
  { name: "ef_lookup" }
);

// Index for listing/filtering by scope + type
emissionFactorSchema.index(
  { scope: 1, type: 1, isActive: 1 },
  { name: "ef_scope_type" }
);

// Index for searching by source name
emissionFactorSchema.index(
  { source: "text", type: "text", category: "text" },
  { name: "ef_text_search" }
);

// Unique constraint to prevent duplicate entries
emissionFactorSchema.index(
  { scope: 1, type: 1, group: 1, category: 1, source: 1, unit: 1 },
  { unique: true, name: "ef_unique" }
);

export const EmissionFactor = mongoose.models[DB_MODEL_REF.EMISSION_FACTOR] || mongoose.model(
  DB_MODEL_REF.EMISSION_FACTOR,
  emissionFactorSchema
);

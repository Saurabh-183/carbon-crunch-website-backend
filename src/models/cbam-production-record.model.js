import mongoose from "mongoose";
import { DB_MODEL_REF } from "../constants/index.js";

const { Schema } = mongoose;

/**
 * CBAM Production Record – Activity-level data entered by the Energy Manager.
 * One document per product per reporting period per installation.
 *
 * Captures:
 *  - Production volume (output)
 *  - Direct emissions (fuel combustion, process emissions)
 *  - Indirect emissions (electricity consumed)
 *  - Precursor consumption
 *  - Qualifying parameters (e.g. clinker ratio, scrap %)
 *  - Data quality / monitoring method
 */

/* ── Sub-schemas ────────────────────────────────────────────────── */

const directEmissionEntrySchema = new Schema(
  {
    /** Source description, e.g. "Kiln combustion", "Calcination", "Blast furnace coke" */
    source: { type: String, trim: true },
    /** Fuel / raw material name, e.g. "Pet Coke", "Limestone" */
    fuelOrMaterial: { type: String, trim: true },
    /** Quantity consumed */
    quantity: { type: Number, default: 0 },
    /** Unit of fuel/material: Tonnes, kL, m³, MMBTU, etc. */
    unit: { type: String, trim: true },
    /** Emission factor used (tCO₂ / unit) */
    emissionFactor: { type: Number },
    /** Calculated CO₂ emissions (tonnes CO₂) */
    co2Emissions: { type: Number, default: 0 },
    /** Gas type (CO₂, CH₄, N₂O, etc.) – for process emissions */
    gasType: { type: String, trim: true, default: "CO₂" },
    /** Whether this is a fuel combustion entry vs process emission */
    emissionType: {
      type: String,
      enum: ["combustion", "process"],
      default: "combustion",
    },
    /** Measurement method: Meter, Invoice, Mass Balance, Estimate */
    measurementMethod: { type: String, trim: true },
  },
  { _id: false }
);

const indirectEmissionEntrySchema = new Schema(
  {
    /** Source: Grid, Captive Power, Solar, Open Access, etc. */
    electricitySource: { type: String, trim: true },
    /** Electricity consumed (MWh) */
    electricityConsumed: { type: Number, default: 0 },
    /** Unit: MWh, kWh, GWh */
    unit: { type: String, trim: true, default: "MWh" },
    /** Grid emission factor (tCO₂/MWh) */
    emissionFactor: { type: Number },
    /** Calculated indirect CO₂ emissions (tonnes CO₂) */
    co2Emissions: { type: Number, default: 0 },
    /** Whether this uses actual emissions data or default values */
    dataType: {
      type: String,
      enum: ["actual", "default"],
      default: "actual",
    },
  },
  { _id: false }
);

const precursorEntrySchema = new Schema(
  {
    /** Precursor product name, e.g. "Cement clinker", "Ammonia" */
    precursorName: { type: String, trim: true },
    /** Route of production for the precursor */
    productionRoute: { type: String, trim: true },
    /** Mass of precursor consumed per tonne of output product */
    massPerUnitProduct: { type: Number, default: 0 },
    /** Total mass consumed */
    totalMassConsumed: { type: Number, default: 0 },
    /** Unit of mass: Tonnes, kg */
    unit: { type: String, trim: true, default: "Tonnes" },
    /** Specific embedded emissions of the precursor (tCO₂/t precursor) */
    specificEmbeddedEmissions: { type: Number, default: 0 },
    /** Total embedded emissions from this precursor (tCO₂) */
    totalEmbeddedEmissions: { type: Number, default: 0 },
    /** Origin: own installation, other domestic, imported */
    origin: {
      type: String,
      enum: ["own_installation", "domestic_supplier", "imported"],
      default: "own_installation",
    },
  },
  { _id: false }
);

const qualifyingParamSchema = new Schema(
  {
    paramName: { type: String, trim: true },
    paramValue: { type: Schema.Types.Mixed },
    paramUnit: { type: String, trim: true },
  },
  { _id: false }
);

/* ── Main Schema ──────────────────────────────────────────────── */

const cbamProductionRecordSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.FACILITY,
      required: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.ORGANIZATION,
      required: true,
    },
    /** Reference to the CBAM product being produced */
    cbamProductId: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.CBAM_PRODUCT,
      required: true,
    },
    /** Reference to the installation */
    cbamInstallationId: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.CBAM_INSTALLATION,
    },
    /** ── Reporting Period ── */
    reportingYear: {
      type: Number,
      required: true,
    },
    /** Reporting quarter: Q1, Q2, Q3, Q4, or "Annual" */
    reportingQuarter: {
      type: String,
      trim: true,
    },
    periodStart: { type: Date },
    periodEnd: { type: Date },

    /** ── Production Output ── */
    productionVolume: {
      type: Number,
      default: 0,
    },
    productionUnit: {
      type: String,
      default: "Tonnes",
      trim: true,
    },

    /** ── Direct Emissions ── */
    directEmissions: {
      type: [directEmissionEntrySchema],
      default: [],
    },
    /** Total direct specific embedded emissions (tCO₂ / t product) */
    totalDirectSpecificEmissions: {
      type: Number,
      default: 0,
    },
    /** Total direct emissions (tCO₂) */
    totalDirectEmissions: {
      type: Number,
      default: 0,
    },

    /** ── Indirect Emissions ── */
    indirectEmissions: {
      type: [indirectEmissionEntrySchema],
      default: [],
    },
    /** Total indirect specific embedded emissions (tCO₂ / t product) */
    totalIndirectSpecificEmissions: {
      type: Number,
      default: 0,
    },
    /** Total indirect emissions (tCO₂) */
    totalIndirectEmissions: {
      type: Number,
      default: 0,
    },

    /** ── Precursor Consumption ── */
    precursorConsumption: {
      type: [precursorEntrySchema],
      default: [],
    },
    /** Total emissions from precursors (tCO₂) */
    totalPrecursorEmissions: {
      type: Number,
      default: 0,
    },

    /** ── Qualifying Parameters ── */
    qualifyingParameters: {
      type: [qualifyingParamSchema],
      default: [],
    },

    /** ── Totals ── */
    /** Total specific embedded emissions = (direct + precursor) / production volume */
    totalSpecificEmbeddedEmissions: {
      type: Number,
      default: 0,
    },
    /** Total specific embedded emissions including indirect */
    totalSpecificEmbeddedEmissionsWithIndirect: {
      type: Number,
      default: 0,
    },

    /** ── Data Quality ── */
    monitoringMethodology: {
      type: String,
      enum: [
        "cbam_methodology",
        "eu_ets",
        "other_eligible_mrs",
        "un_methodology",
        "default_values",
      ],
      default: "cbam_methodology",
    },
    dataQualityNotes: {
      type: String,
      trim: true,
    },

    /** ── Carbon Price ── */
    /** Has a carbon price already been paid domestically? */
    carbonPricePaid: {
      type: Boolean,
      default: false,
    },
    /** Amount of carbon price paid (in local currency per tCO₂) */
    carbonPriceAmount: {
      type: Number,
      default: 0,
    },
    carbonPriceCurrency: {
      type: String,
      default: "INR",
      trim: true,
    },

    /** ── Workflow ── */
    status: {
      type: String,
      enum: ["draft", "submitted", "approved", "rejected"],
      default: "draft",
    },
    submittedBy: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.USER,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.USER,
    },
    reviewedAt: { type: Date },
    rejectionReason: { type: String, trim: true },
  },
  { timestamps: true }
);

/* ── Pre-save: compute totals ────────────────────────────────── */

cbamProductionRecordSchema.pre("save", function (next) {
  // Total direct
  this.totalDirectEmissions = (this.directEmissions || []).reduce(
    (sum, e) => sum + (e.co2Emissions || 0),
    0
  );

  // Total indirect
  this.totalIndirectEmissions = (this.indirectEmissions || []).reduce(
    (sum, e) => sum + (e.co2Emissions || 0),
    0
  );

  // Total precursor
  this.totalPrecursorEmissions = (this.precursorConsumption || []).reduce(
    (sum, e) => sum + (e.totalEmbeddedEmissions || 0),
    0
  );

  const vol = this.productionVolume || 1;

  // Specific embedded emissions (direct only + precursors, per CBAM)
  this.totalDirectSpecificEmissions = this.totalDirectEmissions / vol;
  this.totalIndirectSpecificEmissions = this.totalIndirectEmissions / vol;
  this.totalSpecificEmbeddedEmissions =
    (this.totalDirectEmissions + this.totalPrecursorEmissions) / vol;
  this.totalSpecificEmbeddedEmissionsWithIndirect =
    (this.totalDirectEmissions +
      this.totalPrecursorEmissions +
      this.totalIndirectEmissions) /
    vol;

  next();
});

/* ── Indexes ─────────────────────────────────────────────────── */

cbamProductionRecordSchema.index({
  facilityId: 1,
  cbamProductId: 1,
  reportingYear: 1,
  reportingQuarter: 1,
});
cbamProductionRecordSchema.index({ organizationId: 1, reportingYear: 1 });
cbamProductionRecordSchema.index({ status: 1, organizationId: 1 });

export const CbamProductionRecord = mongoose.model(
  DB_MODEL_REF.CBAM_PRODUCTION_RECORD,
  cbamProductionRecordSchema,
  "cbam_production_records"
);

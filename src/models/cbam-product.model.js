import mongoose from "mongoose";
import { DB_MODEL_REF } from "../constants/index.js";

const { Schema } = mongoose;

/**
 * CBAM Product – A product exported from a facility that falls under CBAM.
 * Defined by the Plant Manager. Stores CN code mapping, production route, etc.
 */
const cbamProductSchema = new Schema(
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
    /** Human-readable product name, e.g. "TMT Rebar", "Grey Portland Cement" */
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    /** 8-digit CN / HS Code, e.g. "72142000" */
    cnCode: {
      type: String,
      required: true,
      trim: true,
    },
    /** Top-level CBAM sector – Cement, Iron and steel, Aluminium, Fertilisers, Chemicals (hydrogen), Electricity */
    mainCategory: {
      type: String,
      required: true,
      trim: true,
      enum: [
        "Cement",
        "Iron and steel",
        "Aluminium",
        "Fertilisers",
        "Chemicals (hydrogen)",
        "Electricity",
      ],
    },
    /** Finer bucketing within a sector – e.g. "Crude steel", "Cement clinkers" */
    aggregatedCategory: {
      type: String,
      required: true,
      trim: true,
    },
    /** Official goods description from the CN code table */
    goodsDescription: {
      type: String,
      trim: true,
    },
    /** The production route used, e.g. "Basic oxigen steel making (incl. Blast furnace)" */
    productionRoute: {
      type: String,
      trim: true,
    },
    /** List of precursor products consumed */
    precursors: [
      {
        precursorCategory: { type: String, trim: true },
        precursorName: { type: String, trim: true },
      }
    ],
    /** Whether indirect emissions (electricity) must be reported for this product */
    indirectEmissionsRequired: {
      type: Boolean,
      default: true,
    },
    /** Qualifying parameters as free text, e.g. "Clinker to cement ratio in %" */
    qualifyingParameters: {
      type: String,
      trim: true,
    },
    /** Production unit: tonnes, MWh, etc. */
    productionUnit: {
      type: String,
      default: "Tonnes",
      trim: true,
    },
    /** Whether the product is exported (thus falls strictly under CBAM reporting) */
    isExported: {
      type: Boolean,
      default: false,
    },
    /** List of suppliers providing precursors for this product */
    suppliers: [
      {
        precursorName: { type: String, trim: true },
        supplierName: { type: String, trim: true },
        supplierEmail: { type: String, trim: true },
        status: {
          type: String,
          enum: ["pending", "requested", "received"],
          default: "pending",
        },
        emissionFactor: { type: Number },
        requestedAt: { type: Date },
        _id: { type: Schema.Types.ObjectId, auto: true },
      },
    ],
    /** Whether the product is currently active */
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.USER,
    },
  },
  { timestamps: true }
);

cbamProductSchema.index({ facilityId: 1, isActive: 1 });
cbamProductSchema.index({ organizationId: 1, mainCategory: 1 });
cbamProductSchema.index(
  { facilityId: 1, cnCode: 1, productName: 1 },
  { unique: true }
);

export const CbamProduct = mongoose.model(
  DB_MODEL_REF.CBAM_PRODUCT,
  cbamProductSchema,
  "cbam_products"
);

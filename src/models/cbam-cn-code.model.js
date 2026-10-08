import mongoose from "mongoose";
import { DB_MODEL_REF } from "../constants/index.js";

const { Schema } = mongoose;

/**
 * CBAM CN Code – Static reference data seeded from the EU CBAM workbook.
 * Read-only lookup table mapping 8-digit CN (HS) codes to CBAM sectors,
 * production routes, precursors, and reporting requirements.
 */
const cbamCnCodeSchema = new Schema(
  {
    /** 8-digit Combined Nomenclature code, e.g. "72142000" */
    cnCode: {
      type: String,
      required: true,
      trim: true,
    },
    /** Top-level CBAM sector */
    mainCategory: {
      type: String,
      required: true,
      trim: true,
    },
    /** Sub-sector, e.g. "Crude steel", "Cement clinkers" */
    aggregatedCategory: {
      type: String,
      trim: true,
    },
    /** Official goods description */
    goodsDescription: {
      type: String,
      trim: true,
    },
    /** Whether CBAM applies to this code */
    cbamApplies: {
      type: Boolean,
      default: true,
    },
    /** Whether indirect emissions must be reported */
    indirectEmissions: {
      type: Boolean,
      default: false,
    },
    /** Available production routes for this CN code */
    productionRoutes: {
      type: [String],
      default: [],
    },
    /** Required precursors */
    precursors: {
      type: [String],
      default: [],
    },
    /** Qualifying parameters text */
    qualifyingParameters: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

cbamCnCodeSchema.index({ mainCategory: 1, aggregatedCategory: 1 });
cbamCnCodeSchema.index({ cnCode: 1 }, { unique: true });

export const CbamCnCode = mongoose.model(
  DB_MODEL_REF.CBAM_CN_CODE,
  cbamCnCodeSchema,
  "cbam_cn_codes"
);

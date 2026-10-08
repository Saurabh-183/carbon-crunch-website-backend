import mongoose from "mongoose";
import { DB_MODEL_REF } from "../constants/index.js";

const { Schema } = mongoose;

const sourceMonthlySummarySchema = new Schema(
  {
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.ORGANIZATION,
      required: true,
    },
    facilityId: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.FACILITY,
      required: true,
    },
    year: {
      type: Number,
      required: true,
    },
    month: {
      type: Number,
      required: true,
    },
    scope1: {
      type: Number,
      default: 0,
    },
    scope2: {
      type: Number,
      default: 0,
    },
    scope3: {
      type: Number,
      default: 0,
    },
    total: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

sourceMonthlySummarySchema.index(
  { organizationId: 1, facilityId: 1, year: 1, month: 1 },
  { unique: true }
);

export const SourceMonthlySummary = mongoose.model(
  DB_MODEL_REF.SOURCE_MONTHLY_SUMMARY,
  sourceMonthlySummarySchema,
  "source_monthly_summary"
);

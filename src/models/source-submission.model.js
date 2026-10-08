import mongoose from "mongoose";
import { DB_MODEL_REF } from "../constants/index.js";

const { Schema } = mongoose;

const sourceSubmissionSchema = new Schema(
  {
    facilityId: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.FACILITY,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.ORGANIZATION,
    },
    scope: {
      type: String,
      trim: true,
    },
    reportingYear: {
      type: Number,
    },
    reportingPeriod: {
      type: String,
    },
    periodStart: {
      type: Date,
    },
    periodEnd: {
      type: Date,
    },
    scope3Module: {
      type: String,
      default: null,
    },
    importBatchId: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["draft", "submitted", "approved", "rejected"],
      default: "submitted",
    },
    submittedBy: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.USER,
      required: true,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.USER,
    },
    reviewedAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

sourceSubmissionSchema.index({ facilityId: 1, createdAt: -1 });
sourceSubmissionSchema.index({ organizationId: 1, createdAt: -1 });
sourceSubmissionSchema.index({ submittedBy: 1, status: 1, createdAt: -1 });
sourceSubmissionSchema.index(
  {
    facilityId: 1,
    submittedBy: 1,
    scope: 1,
    importBatchId: 1,
    status: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      importBatchId: { $type: "string" },
      status: { $in: ["draft", "submitted"] },
    },
    name: "uniq_bulk_submission_batch",
  }
);

export const SourceSubmission = mongoose.model(
  DB_MODEL_REF.SOURCE_SUBMISSION,
  sourceSubmissionSchema,
  "source_submissions"
);

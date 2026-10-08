import mongoose from "mongoose";
import { DB_MODEL_REF } from "../constants/index.js";

const { Schema } = mongoose;

const submissionSchema = new Schema(
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
    scope: {
      type: String,
      trim: true,
    },
    data: {
      type: Schema.Types.Mixed,
      default: {},
    },
    scope1Data: {
      type: Schema.Types.Mixed,
      default: {},
    },
    scope2Data: {
      type: Schema.Types.Mixed,
      default: {},
    },
    scope3Data: {
      type: Schema.Types.Mixed,
      default: {},
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

export default mongoose.model(DB_MODEL_REF.SUBMISSION, submissionSchema);

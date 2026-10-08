import mongoose from "mongoose";
import { DB_MODEL_REF } from "../constants/index.js";

const { Schema } = mongoose;

const sourceDocumentSchema = new Schema(
  {
    submissionId: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.SOURCE_SUBMISSION,
      required: true,
    },
    entryId: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.SOURCE_ENTRY,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.ORGANIZATION,
    },
    facilityId: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.FACILITY,
    },
    scope: {
      type: Number,
      enum: [1, 2, 3],
      required: true,
    },
    url: {
      type: String,
      trim: true,
    },
    publicId: {
      type: String,
      trim: true,
    },
    originalName: {
      type: String,
      trim: true,
    },
    format: {
      type: String,
      trim: true,
    },
    resourceType: {
      type: String,
      trim: true,
    },
    uploadedAt: {
      type: Date,
    },
    version: {
      type: Number,
      min: 1,
      default: 1,
    },
      sourceLabel: {
        type: String,
        trim: true,
      },
      entryDate: {
        type: Date,
      },
      entryDateString: {
        type: String,
        trim: true,
      },
  },
  { timestamps: true }
);

sourceDocumentSchema.index({ submissionId: 1, createdAt: -1 });
sourceDocumentSchema.index({ entryId: 1 });
sourceDocumentSchema.index({ organizationId: 1, createdAt: -1 });

export const SourceDocument = mongoose.model(
  DB_MODEL_REF.SOURCE_DOCUMENT,
  sourceDocumentSchema,
  "source_documents"
);

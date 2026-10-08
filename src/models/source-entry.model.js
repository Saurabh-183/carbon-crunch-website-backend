import mongoose from "mongoose";
import { DB_MODEL_REF } from "../constants/index.js";

const { Schema } = mongoose;

const sourceEntrySchema = new Schema(
  {
    submissionId: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.SOURCE_SUBMISSION,
      required: true,
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
    section: {
      type: String,
      trim: true,
    },
    activityType: {
      type: String,
      trim: true,
    },
    activityGroup: {
      type: String,
      trim: true,
    },
    activityCategory: {
      type: String,
      trim: true,
    },
    assetId: {
      type: String,
      trim: true,
    },
    gcv: {
      type: Number,
    },
    gcvUnit: {
      type: String,
      trim: true,
    },
    assetEfficiency: {
      type: Number,
    },
    emissionFactor: {
      type: Number,
    },
    carbonContent: {
      type: Number,
    },
    operatingHours: {
      type: Number,
    },
    capacityUtilization: {
      type: Number,
    },
    refillAmount: {
      type: Number,
    },
    energyContentFossil: {
      type: Number,
    },
    energyContentBio: {
      type: Number,
    },
    oxidationFactor: {
      type: Number,
    },
    conversionFactor: {
      type: Number,
    },
    totalGenerationKwh: {
      type: Number,
    },
    selfConsumptionKwh: {
      type: Number,
    },
    exportToGridKwh: {
      type: Number,
    },
    importFromGridKwh: {
      type: Number,
    },
    netMeteringType: {
      type: String,
      trim: true,
    },
    renewablePurchasedKwh: {
      type: Number,
    },
    displayEmissionFactor: {
      type: Number,
    },
    dataStatus: {
      type: String,
      trim: true,
    },
    source: {
      type: String,
      trim: true,
    },
    value: {
      type: Number,
    },
    unit: {
      type: String,
      trim: true,
    },
    measurementMethod: {
      type: String,
      trim: true,
    },
    date: {
      type: Date,
    },
    reportingYear: {
      type: Number,
    },
    reportingMonth: {
      type: Number,
      min: 1,
      max: 12,
    },
    scope3Module: {
      type: String,
      default: null,
    },
    importedFrom: {
      type: String,
      default: null,
    },
    importedAt: {
      type: Date,
    },
    importBatchId: {
      type: String,
      default: null,
    },
    supportingDocumentId: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.SOURCE_DOCUMENT,
    },
    sectionIndex: {
      type: Number,
      default: 0,
    },
    activityIndex: {
      type: Number,
      default: 0,
    },
    sourceIndex: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

sourceEntrySchema.index({
  organizationId: 1,
  facilityId: 1,
  reportingYear: 1,
  scope: 1,
});
sourceEntrySchema.index({ organizationId: 1, date: 1 });
sourceEntrySchema.index({
  organizationId: 1,
  scope: 1,
  activityCategory: 1,
  reportingYear: 1,
});
sourceEntrySchema.index({
  submissionId: 1,
  scope: 1,
  sectionIndex: 1,
  activityIndex: 1,
  sourceIndex: 1,
});

export const SourceEntry = mongoose.model(
  DB_MODEL_REF.SOURCE_ENTRY,
  sourceEntrySchema,
  "source_entries"
);

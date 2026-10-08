import mongoose from "mongoose";
import { DB_MODEL_REF } from "../constants/index.js";

const { Schema } = mongoose;

/**
 * CBAM Installation – Represents an operator installation (the exporter's plant).
 * Per EU CBAM: installation name, UN/LOCODE, coordinates, etc.
 */
const cbamInstallationSchema = new Schema(
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
    /** Installation name (may differ from facility name – e.g. "Blast Furnace Unit 2") */
    installationName: {
      type: String,
      required: true,
      trim: true,
    },
    /** UN/LOCODE of the installation location, e.g. "INMAA" for Chennai */
    unLocode: {
      type: String,
      trim: true,
    },
    /** Address */
    address: {
      type: String,
      trim: true,
    },
    /** Country code (ISO 3166-1 alpha-2) */
    countryCode: {
      type: String,
      trim: true,
      default: "IN",
    },
    /** Latitude of the main emission source */
    latitude: {
      type: Number,
    },
    /** Longitude of the main emission source */
    longitude: {
      type: Number,
    },
    /** Which CBAM products are manufactured at this installation */
    productIds: [
      {
        type: Schema.Types.ObjectId,
        ref: DB_MODEL_REF.CBAM_PRODUCT,
      },
    ],
    /** Operator / company name */
    operatorName: {
      type: String,
      trim: true,
    },
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

cbamInstallationSchema.index({ facilityId: 1, isActive: 1 });
cbamInstallationSchema.index({ organizationId: 1 });

export const CbamInstallation = mongoose.model(
  DB_MODEL_REF.CBAM_INSTALLATION,
  cbamInstallationSchema,
  "cbam_installations"
);

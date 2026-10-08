import mongoose, { Schema } from "mongoose";
import { DB_MODEL_REF } from "../constants/index.js";

const allocationSchema = new Schema(
  {
    product: { type: String, required: true, trim: true },
    percentage: { type: Number, required: true, min: 0, max: 100 },
    quantityExported: { type: Number, default: 0, min: 0 },
    quantityInternal: { type: Number, default: 0, min: 0 },
    quantitySold: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const productAllocationSchema = new Schema(
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
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    allocations: {
      type: [allocationSchema],
      default: [],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.USER,
    },
  },
  { timestamps: true }
);

productAllocationSchema.index(
  { facilityId: 1, startDate: 1, endDate: 1 },
  { unique: true }
);

export const ProductAllocation = mongoose.model(
  "ProductAllocation",
  productAllocationSchema
);

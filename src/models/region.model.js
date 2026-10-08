import mongoose, { Schema } from "mongoose";

const regionSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    addressLine1: {
      type: String,
      trim: true,
    },
    addressLine2: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    postalCode: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
      default: "India",
    },
    type: {
      type: String,
      trim: true,
      default: "Region",
    },
    regionArea: {
      type: Number,
      min: 0,
      default: 0,
    },
    regionHeads: [
      {
        name: {
          type: String,
          trim: true,
        },
        email: {
          type: String,
          trim: true,
          lowercase: true,
        },
      },
    ],
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

regionSchema.index({ organizationId: 1, name: 1 }, { unique: true });

export const Region = mongoose.model("Region", regionSchema);

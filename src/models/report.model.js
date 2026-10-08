import mongoose, { Schema } from "mongoose";

const reportSchema = new Schema(
  {
    username: { type: String },
    createdAt: { type: Date, default: Date.now },
    companyName: { type: String, required: true },
    facilityName: { type: String },
    fuel: {
      type: Object,
      default: {},
    },
    bioenergy: {
      type: Object,
      default: {},
    },
    food: { type: Object, default: {} },
    refrigerants: {
      type: Object,
      default: {},
    },
    ehctd: {
      type: Object,
      default: {},
    },
    wttfuel: { type: Object, default: {} },
    material: { type: Object, default: {} },
    waste: { type: Object, default: {} },
    btls: { type: Object, default: {} },
    ec: { type: Object, default: {} },
    water: { type: Object, default: {} },
    fg: { type: Object, default: {} },
    homeOffice: { type: Object, default: {} },
    ownedVehicles: {
      type: Object,
      default: {},
    },
    fa: { type: Object, default: {} },
    dtd: { type: Object, default: {} },
    utd: { type: Object, default: {} },
    ula: { type: Object, default: {} },
  },
  {
    timestamps: true,
  }
);

export const Report = mongoose.model("Report", reportSchema);

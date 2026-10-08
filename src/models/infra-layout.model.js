import mongoose, { Schema } from "mongoose";

const nodeSchema = new Schema(
  {
    nodeId: { type: String, required: true },
    type: { type: String, required: true },
    label: { type: String, required: true },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    data: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const edgeSchema = new Schema(
  {
    edgeId: { type: String, required: true },
    source: { type: String, required: true },
    target: { type: String, required: true },
    type: { type: String, default: "material" },
    label: { type: String, default: "" },
    // Bezier control point offsets (user-adjustable) — stored as [{x,y},{x,y}]
    controlPoints: {
      type: [
        {
          x: { type: Number, required: true },
          y: { type: Number, required: true },
          _id: false,
        },
      ],
      default: undefined,
    },
  },
  { _id: false }
);

const infraLayoutSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Layout name is required"],
      trim: true,
    },
    description: { type: String, trim: true, default: "" },
    facilityId: {
      type: Schema.Types.ObjectId,
      ref: "Facility",
      default: null,
      index: true,
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
      index: true,
    },
    mode: {
      type: String,
      enum: ["preset", "custom", "production_route"],
      required: true,
      default: "custom",
    },
    isLocked: { type: Boolean, default: false },
    industryType: { type: String, default: "" },
    presetKey: { type: String, default: null },
    nodes: [nodeSchema],
    edges: [edgeSchema],
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

infraLayoutSchema.index({ facilityId: 1, mode: 1, isDeleted: 1 });
infraLayoutSchema.index({ organizationId: 1, isDeleted: 1 });

infraLayoutSchema.pre(/^find/, function () {
  if (!this.getOptions()?._includeDeleted) {
    this.where({ isDeleted: { $ne: true } });
  }
});

export const InfraLayout = mongoose.model("InfraLayout", infraLayoutSchema);
export default InfraLayout;

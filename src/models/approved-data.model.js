import mongoose from "mongoose";

const approvedDataSchema = new mongoose.Schema(
  {
    submissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Submission",
      required: true,
    },
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Facility",
      required: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
    },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedAt: { type: Date, default: Date.now },
    scope: { type: String },
    data: { type: Object, default: {} },
    scope1Data: { type: Object, default: {} },
    scope2Data: { type: Object, default: {} },
    scope3Data: { type: Object, default: {} },
    detailedBreakdown: { type: Array, default: [] },
    totalEmissions: { type: Number, default: 0 },
    topSource: { type: String, default: "" },
  },
  { timestamps: true }
);

export const ApprovedData = mongoose.model("ApprovedData", approvedDataSchema);

import mongoose from "mongoose";

const productAllocationSchema = new mongoose.Schema(
  {
    productName: { type: String, required: true },
    allocationPercentage: { type: Number, required: true },
    allocatedEmissions: { type: Number, default: 0 },
    emissionIntensity: { type: Number, default: 0 },
    intensityUnit: { type: String, default: "tCO2e/unit" },
  },
  { _id: false }
);

const approvedReportSchema = new mongoose.Schema(
  {
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Facility",
      required: false,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
    },
    reportName: { type: String, required: true },
    period: {
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
    },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    totalEmissions: { type: Number, default: 0 },
    topSource: { type: String, default: "" },
    productAllocations: { type: [productAllocationSchema], default: [] },
    reportData: { type: Object, default: {} },
    sourceSubmissionIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Submission" },
    ],
    sourceApprovedDataIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "ApprovedData" },
    ],
    // ── Verification fields ──
    verificationStatus: {
      type: String,
      enum: ["pending", "verified", "flagged"],
      default: "pending",
    },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    verifiedAt: { type: Date },
    verificationNotes: { type: String, default: "" },
    // ── Audit fields (Auditor role) ──
    auditStatus: {
      type: String,
      enum: ["pending", "approved", "disapproved"],
      default: "pending",
    },
    auditedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    auditedAt: { type: Date },
    auditNotes: { type: String, default: "" },
  },
  { timestamps: true }
);

approvedReportSchema.index({ facilityId: 1, createdAt: -1 });
approvedReportSchema.index({ organizationId: 1, createdAt: -1 });
approvedReportSchema.index({ verificationStatus: 1, createdAt: -1 });

export const ApprovedReport = mongoose.model(
  "ApprovedReport",
  approvedReportSchema
);

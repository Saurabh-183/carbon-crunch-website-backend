import mongoose from "mongoose";
import { DB_MODEL_REF } from "../constants/index.js";

const querySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "Scope 1",
        "Scope 2",
        "Scope 3",
        "Emission Factors",
        "Activity Data",
        "Reporting Methodology",
        "Data Uploads",
        "Verification Issues",
        "Compliance Requirements",
        "Platform Usage",
        "Other",
      ],
    },
    subCategory: {
      type: String,
      trim: true,
    },
    priority: {
      type: String,
      required: true,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
    },
    reportingYear: {
      type: String,
    },
    officeBranch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: DB_MODEL_REF.FACILITY, // Or REGION depending on the user selection
    },
    officeBranchType: {
      type: String,
      enum: ["Facility", "Region", "Organization"],
    },
    calculationModule: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      required: true,
      enum: ["Draft", "Submitted", "Under Review", "Awaiting Information", "Response Drafted", "Resolved", "Closed"],
      default: "Draft",
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: DB_MODEL_REF.USER,
    },
    slaDeadline: {
      type: Date,
    },
    responses: [
      {
        message: {
          type: String,
          required: true,
        },
        sender: {
          type: mongoose.Schema.Types.ObjectId,
          ref: DB_MODEL_REF.USER,
          required: true,
        },
        role: {
          type: String,
        },
        attachments: [
          {
            fileName: String,
            fileUrl: String,
            fileType: String,
            fileSize: Number,
          },
        ],
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    attachments: [
      {
        fileName: String,
        fileUrl: String,
        fileType: String,
        fileSize: Number,
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: DB_MODEL_REF.USER,
      required: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: DB_MODEL_REF.ORGANIZATION,
      required: true,
    },
  },
  { timestamps: true }
);

export const Query = mongoose.model(DB_MODEL_REF.QUERY, querySchema);
export default Query;

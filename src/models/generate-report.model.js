import mongoose from "mongoose";

const generateReportSchema = new mongoose.Schema({
  username: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  companyName: {
    type: String,
    required: true,
  },
  facilityName: {
    type: String,
    required: true,
  },
  report: [
    {
      reportId: {
        type: String,
      },
      reportName: {
        type: String,
      },
      report: {
        type: Object,
        default: {}, // Default to an empty object
      },
    },
  ],
  timePeriod: {
    type: {
      type: String,
      enum: ["monthly", "quarterly", "yearly", "custom"],
      required: true,
    },
    start: {
      type: Date,
    },
    end: {
      type: Date,
    },
  },
});

export const GenerateReport = mongoose.model(
  "GenerateReport",
  generateReportSchema
);

import mongoose from "mongoose";

const officeInformationSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      unique: true,
      index: true,
    },
    officeAdminName: {
      type: String,
      trim: true,
      default: "",
    },
    officeAddress: {
      type: String,
      trim: true,
      default: "",
    },
    icaiId: {
      type: String,
      trim: true,
      default: "",
    },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    contactPhone: {
      type: String,
      trim: true,
      default: "",
    },
    effectiveDate: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const OfficeInformation = mongoose.model(
  "OfficeInformation",
  officeInformationSchema
);

export default OfficeInformation;

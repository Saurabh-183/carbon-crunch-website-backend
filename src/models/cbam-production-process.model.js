import mongoose, { Schema } from "mongoose";
import { DB_MODEL_REF } from "../constants/index.js";

const cbamProductionProcessSchema = new Schema(
    {
        processName: {
            type: String,
            required: [true, "Process name is required"],
            trim: true,
        },
        aggregatedCategory: {
            type: String,
            required: [true, "Aggregated goods category is required"],
            trim: true,
        },
        productionRoute: {
            type: String,
            trim: true,
        },
        includedGoods: {
            type: [String],
            default: [],
        },
        description: {
            type: String,
            trim: true,
            default: "",
        },
        facilityId: {
            type: Schema.Types.ObjectId,
            ref: DB_MODEL_REF.FACILITY,
            required: true,
            index: true,
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: DB_MODEL_REF.USER,
            required: false,
        },
    },
    {
        timestamps: true,
    }
);

export const CbamProductionProcess = mongoose.model(
    "CbamProductionProcess",
    cbamProductionProcessSchema
);

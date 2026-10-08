/**
 * DefaultPassword Model
 * Stores plaintext default passwords for newly created users.
 * This allows admins to look up credentials if needed.
 */

import mongoose from "mongoose";

const defaultPasswordSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        username: {
            type: String,
            required: true,
        },
        email: {
            type: String,
            required: true,
        },
        role: {
            type: String,
            required: true,
        },
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
        },
        defaultPassword: {
            type: String,
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

export default mongoose.model("DefaultPassword", defaultPasswordSchema);

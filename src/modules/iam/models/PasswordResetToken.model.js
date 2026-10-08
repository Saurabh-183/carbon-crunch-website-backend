/**
 * PasswordResetToken Model
 * Stores time-limited tokens for email-based password reset.
 */

import mongoose from "mongoose";

const passwordResetTokenSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        token: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        expiresAt: {
            type: Date,
            required: true,
        },
        used: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

// Auto-delete expired tokens
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("PasswordResetToken", passwordResetTokenSchema);

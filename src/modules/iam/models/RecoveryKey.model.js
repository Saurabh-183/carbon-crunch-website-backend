/**
 * Recovery Key Model
 * Stores encrypted recovery keys for PLATFORM_ADMIN password recovery
 */

import mongoose from "mongoose";
import crypto from "crypto";
import { DB_MODEL_REF } from "../../../constants/index.js";

const { Schema } = mongoose;

const recoveryKeySchema = new Schema(
  {
    // User Reference
    userId: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.USER,
      required: true,
      index: true,
    },

    // Recovery Keys (5 keys, encrypted)
    keys: [
      {
        keyHash: {
          type: String,
          required: true,
        },
        keyIndex: {
          type: Number,
          required: true,
          min: 1,
          max: 5,
        },
        isUsed: {
          type: Boolean,
          default: false,
        },
        usedAt: Date,
        usedFrom: {
          ip: String,
          userAgent: String,
        },
      },
    ],

    // Metadata
    generatedAt: {
      type: Date,
      default: Date.now,
    },
    generatedBy: {
      type: Schema.Types.ObjectId,
      ref: DB_MODEL_REF.USER,
    },
    expiresAt: {
      type: Date,
      // Recovery keys expire after 1 year
      default: () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Generate 5 random recovery keys
 * Returns array of plain keys (show to user ONCE)
 */
recoveryKeySchema.statics.generateKeys = function () {
  const keys = [];
  for (let i = 1; i <= 5; i++) {
    // Generate 24-character alphanumeric key
    const key = crypto
      .randomBytes(18)
      .toString("base64")
      .replace(/[^a-zA-Z0-9]/g, "")
      .substring(0, 24);
    keys.push({
      plainKey: key,
      keyIndex: i,
    });
  }
  return keys;
};

/**
 * Hash a recovery key for storage
 */
recoveryKeySchema.statics.hashKey = function (key) {
  return crypto.createHash("sha256").update(key).digest("hex");
};

/**
 * Verify a recovery key
 */
recoveryKeySchema.methods.verifyKey = async function (plainKey) {
  const keyHash = this.constructor.hashKey(plainKey);

  // Find matching unused key
  const keyEntry = this.keys.find(
    (k) =>
      k.keyHash === keyHash &&
      !k.isUsed &&
      this.isActive &&
      this.expiresAt > new Date()
  );

  if (!keyEntry) {
    return { valid: false, reason: "Invalid or already used recovery key" };
  }

  return { valid: true, keyEntry };
};

/**
 * Mark key as used
 */
recoveryKeySchema.methods.markKeyAsUsed = async function (
  keyIndex,
  metadata = {}
) {
  const keyEntry = this.keys.find((k) => k.keyIndex === keyIndex);
  if (keyEntry) {
    keyEntry.isUsed = true;
    keyEntry.usedAt = new Date();
    keyEntry.usedFrom = metadata;
    await this.save();
  }
};

/**
 * Check if all keys are used
 */
recoveryKeySchema.methods.areAllKeysUsed = function () {
  return this.keys.every((k) => k.isUsed);
};

/**
 * Regenerate all keys (after password reset)
 */
recoveryKeySchema.statics.regenerateForUser = async function (
  userId,
  generatedBy
) {
  // Deactivate old keys
  await this.updateMany({ userId, isActive: true }, { isActive: false });

  // Generate new keys
  const plainKeys = this.generateKeys();

  // Create hashed keys for storage
  const hashedKeys = plainKeys.map((k) => ({
    keyHash: this.hashKey(k.plainKey),
    keyIndex: k.keyIndex,
    isUsed: false,
  }));

  // Create new recovery key document
  const recoveryKeyDoc = await this.create({
    userId,
    keys: hashedKeys,
    generatedBy,
  });

  // Return plain keys (show to user ONCE)
  return {
    recoveryKeyId: recoveryKeyDoc._id,
    plainKeys: plainKeys.map((k) => ({
      index: k.keyIndex,
      key: k.plainKey,
    })),
  };
};

const RecoveryKey = mongoose.model(
  DB_MODEL_REF.RECOVERY_KEY || "RecoveryKey",
  recoveryKeySchema
);

export default RecoveryKey;

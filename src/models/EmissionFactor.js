import mongoose  from 'mongoose';

const emissionFactorSchema = new mongoose.Schema({
  source: { type: String, required: true, unique: true },
  factor: { type: Number, required: true },
  unit: { type: String, required: true },
  scope: { type: Number, required: true, enum: [1, 2, 3] },
}, { timestamps: true });

export default mongoose.models.EmissionFactor || mongoose.model('EmissionFactor', emissionFactorSchema);

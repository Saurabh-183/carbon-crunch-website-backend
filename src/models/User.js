import mongoose  from 'mongoose';

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phone: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  organization: { type: String },
  city: { type: String },
  username: { type: String },
  organizationId: { type: String },
  trialStatus: { 
    type: String, 
    enum: ['not_started', 'active', 'expired', 'converted'], 
    default: 'active' 
  },
  trialStartedAt: { type: Date, default: Date.now },
  trialExpiresAt: { type: Date }
}, { timestamps: true });

// Set expiry to 3 days from now on creation
userSchema.pre('save', async function () {
  if (this.isNew) {
    const expires = new Date();
    expires.setDate(expires.getDate() + 3);
    this.trialExpiresAt = expires;
    
    // Fallback for legacy DB indexes
    if (!this.username) {
      this.username = this.email;
    }
  }
});

export default mongoose.models.LegacyUser || mongoose.model('LegacyUser', userSchema);

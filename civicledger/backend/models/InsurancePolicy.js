const mongoose = require("mongoose");

const POLICY_STATUSES = ["active", "expired", "cancelled", "pending", "suspended"];
const COVERAGE_TYPES = [
  "Third Party",
  "Comprehensive",
  "Zero Depreciation",
  "Own Damage",
  "Personal Accident",
];

const policyHistorySchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    previousStatus: { type: String },
    newStatus: { type: String },
    notes: { type: String },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    performedAt: { type: Date, default: Date.now },
    blockchainTxHash: { type: String },
    blockchainVersion: { type: Number },
  },
  { _id: false }
);

const insurancePolicySchema = new mongoose.Schema(
  {
    policyRef: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^INS-\d{4}-\d{4,}$/, "Policy ref must match INS-YYYY-NNNN pattern"],
    },
    policyNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 50,
    },
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
      required: true,
    },
    vehicleRef: { type: String },
    policyHolder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    insurerName: {
      type: String,
      required: true,
      maxlength: 100,
      trim: true,
    },
    coverageType: {
      type: [String],
      enum: COVERAGE_TYPES,
      required: true,
    },
    coverageAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    premiumAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    startDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true },
    renewalDate: { type: Date },
    status: {
      type: String,
      enum: POLICY_STATUSES,
      default: "active",
    },
    nomineeDetails: { type: String, maxlength: 200 },
    notes: { type: String, maxlength: 500 },
    version: { type: Number, default: 0 },
    history: [policyHistorySchema],
    // Blockchain
    blockchainStatus: {
      type: String,
      enum: ["not_submitted", "pending", "confirmed", "failed"],
      default: "not_submitted",
    },
    blockchainTxHash: { type: String },
    blockchainBlock: { type: Number },
    blockchainError: { type: String },
    blockchainRetries: { type: Number, default: 0 },
    lastBlockchainAttempt: { type: Date },
  },
  { timestamps: true }
);

insurancePolicySchema.index({ policyRef: 1 }, { unique: true });
insurancePolicySchema.index({ vehicle: 1 });
insurancePolicySchema.index({ policyHolder: 1 });
insurancePolicySchema.index({ status: 1 });
insurancePolicySchema.index({ expiryDate: 1 });

// Virtual: isValid computes validity from dates + status, not just status field
insurancePolicySchema.virtual("isCurrentlyValid").get(function () {
  const now = new Date();
  return (
    this.status === "active" &&
    this.startDate <= now &&
    this.expiryDate >= now
  );
});

insurancePolicySchema.virtual("daysUntilExpiry").get(function () {
  const diff = this.expiryDate - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

module.exports = mongoose.model("InsurancePolicy", insurancePolicySchema);

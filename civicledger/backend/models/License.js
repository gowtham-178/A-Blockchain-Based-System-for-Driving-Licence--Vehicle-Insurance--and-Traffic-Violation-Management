const mongoose = require("mongoose");

const LICENSE_STATUSES = ["active", "expired", "suspended", "revoked", "pending"];
const LICENSE_CATEGORIES = ["A", "B", "C", "D", "E", "LMV", "HMV", "MCWG", "MCWOG"];

const licenseHistorySchema = new mongoose.Schema(
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

const licenseSchema = new mongoose.Schema(
  {
    licenseRef: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^LIC-\d{4}-\d{4,}$/, "License ref must match LIC-YYYY-NNNN pattern"],
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    category: {
      type: [String],
      enum: LICENSE_CATEGORIES,
      required: true,
    },
    status: {
      type: String,
      enum: LICENSE_STATUSES,
      default: "active",
    },
    issueDate: {
      type: Date,
      required: true,
    },
    expiryDate: {
      type: Date,
      required: true,
    },
    renewalDate: {
      type: Date,
    },
    bloodGroup: {
      type: String,
      enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", ""],
      default: "",
    },
    address: {
      type: String,
      required: true,
      maxlength: 300,
    },
    dateOfBirth: {
      type: Date,
      required: true,
    },
    testScore: {
      type: Number,
      min: 0,
      max: 100,
    },
    restrictions: {
      type: String,
      maxlength: 500,
      default: "None",
    },
    notes: {
      type: String,
      maxlength: 1000,
    },
    version: {
      type: Number,
      default: 0,
    },
    history: [licenseHistorySchema],
    // Blockchain fields
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

licenseSchema.index({ licenseRef: 1 }, { unique: true });
licenseSchema.index({ driver: 1 });
licenseSchema.index({ status: 1 });
licenseSchema.index({ expiryDate: 1 });
licenseSchema.index({ blockchainStatus: 1 });

// Virtual: isExpired
licenseSchema.virtual("isExpired").get(function () {
  return this.expiryDate < new Date();
});

// Virtual: daysUntilExpiry
licenseSchema.virtual("daysUntilExpiry").get(function () {
  const diff = this.expiryDate - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

module.exports = mongoose.model("License", licenseSchema);

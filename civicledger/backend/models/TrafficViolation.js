const mongoose = require("mongoose");

const VIOLATION_STATUSES = ["pending", "paid", "disputed", "resolved", "cancelled"];
const VIOLATION_CATEGORIES = [
  "Overspeeding",
  "Signal Violation",
  "No Helmet",
  "No Seat Belt",
  "Invalid Insurance",
  "Expired License",
  "Reckless Driving",
  "Drunk Driving",
  "Wrong Parking",
  "Overloading",
  "Other",
];

const violationHistorySchema = new mongoose.Schema(
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

const trafficViolationSchema = new mongoose.Schema(
  {
    violationRef: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^VIO-\d{4}-\d{4,}$/, "Violation ref must match VIO-YYYY-NNNN format"],
    },
    vehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vehicle",
    },
    vehicleRef: { type: String },
    registrationNumber: { type: String, trim: true, uppercase: true },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    licenseRef: { type: String },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    category: {
      type: String,
      enum: VIOLATION_CATEGORIES,
      required: true,
    },
    description: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    location: {
      type: String,
      required: true,
      maxlength: 200,
    },
    violationDate: {
      type: Date,
      required: true,
    },
    fineAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: VIOLATION_STATUSES,
      default: "pending",
    },
    evidenceRef: {
      type: String,
      maxlength: 200,
    },
    paymentRef: { type: String },
    disputeReason: { type: String, maxlength: 500 },
    resolvedAt: { type: Date },
    notes: { type: String, maxlength: 1000 },
    version: { type: Number, default: 0 },
    history: [violationHistorySchema],
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

trafficViolationSchema.index({ violationRef: 1 }, { unique: true });
trafficViolationSchema.index({ vehicle: 1 });
trafficViolationSchema.index({ driver: 1 });
trafficViolationSchema.index({ status: 1 });
trafficViolationSchema.index({ violationDate: -1 });
trafficViolationSchema.index({ recordedBy: 1 });

module.exports = mongoose.model("TrafficViolation", trafficViolationSchema);

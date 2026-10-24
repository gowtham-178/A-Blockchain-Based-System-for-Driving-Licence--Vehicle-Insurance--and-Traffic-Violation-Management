const mongoose = require("mongoose");

const TX_STATUSES = ["pending", "confirmed", "failed", "not_attempted"];
const RECORD_TYPES = ["LICENSE", "VEHICLE", "INSURANCE", "VIOLATION"];

const blockchainTransactionSchema = new mongoose.Schema(
  {
    recordRef: {
      type: String,
      required: true,
      trim: true,
    },
    recordType: {
      type: String,
      enum: RECORD_TYPES,
      required: true,
    },
    action: {
      type: String,
      required: true,
    },
    commitment: {
      type: String,
      required: true,
    },
    versionIndex: {
      type: Number,
      default: 0,
    },
    txHash: { type: String },
    blockNumber: { type: Number },
    blockTimestamp: { type: Date },
    gasUsed: { type: String },
    contractAddress: { type: String },
    network: { type: String, default: "localhost" },
    chainId: { type: Number, default: 31337 },
    status: {
      type: String,
      enum: TX_STATUSES,
      default: "pending",
    },
    error: { type: String },
    retries: { type: Number, default: 0 },
    lastAttempt: { type: Date },
    confirmedAt: { type: Date },
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    relatedRecord: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "recordModel",
    },
    recordModel: {
      type: String,
      enum: ["License", "Vehicle", "InsurancePolicy", "TrafficViolation"],
    },
  },
  { timestamps: true }
);

blockchainTransactionSchema.index({ recordRef: 1 });
blockchainTransactionSchema.index({ txHash: 1 });
blockchainTransactionSchema.index({ status: 1 });
blockchainTransactionSchema.index({ recordType: 1 });
blockchainTransactionSchema.index({ createdAt: -1 });

module.exports = mongoose.model("BlockchainTransaction", blockchainTransactionSchema);

const mongoose = require("mongoose");

const PAYMENT_STATUSES = ["initiated", "completed", "failed", "refunded"];
const PAYMENT_METHODS  = ["Online", "Cash", "Card", "UPI", "Bank Transfer"];

const paymentSchema = new mongoose.Schema(
  {
    paymentRef: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    violation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TrafficViolation",
      required: true,
    },
    violationRef: { type: String },
    payer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    method: {
      type: String,
      enum: PAYMENT_METHODS,
      required: true,
    },
    status: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "initiated",
    },
    transactionId: { type: String },
    notes: { type: String, maxlength: 500 },
    simulatedPayment: {
      type: Boolean,
      default: true,
    },
    simulationDisclaimer: {
      type: String,
      default:
        "DEMONSTRATION ONLY: This is a simulated payment. No real funds have been transferred. This record does not settle any actual government fine.",
    },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

paymentSchema.index({ paymentRef: 1 }, { unique: true });
paymentSchema.index({ violation: 1 });
paymentSchema.index({ payer: 1 });
paymentSchema.index({ status: 1 });

module.exports = mongoose.model("Payment", paymentSchema);

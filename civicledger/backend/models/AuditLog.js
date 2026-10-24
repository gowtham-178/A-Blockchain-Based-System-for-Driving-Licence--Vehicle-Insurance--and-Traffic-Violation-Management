const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
      enum: [
        "USER_CREATED", "USER_UPDATED", "USER_DEACTIVATED",
        "LICENSE_ISSUED", "LICENSE_RENEWED", "LICENSE_SUSPENDED",
        "LICENSE_REVOKED", "LICENSE_VIEWED",
        "VEHICLE_REGISTERED", "VEHICLE_UPDATED",
        "INSURANCE_ISSUED", "INSURANCE_RENEWED", "INSURANCE_CANCELLED",
        "VIOLATION_RECORDED", "VIOLATION_UPDATED", "VIOLATION_PAID",
        "VIOLATION_DISPUTED", "VIOLATION_RESOLVED",
        "PAYMENT_INITIATED", "PAYMENT_COMPLETED",
        "BLOCKCHAIN_SUBMITTED", "BLOCKCHAIN_CONFIRMED", "BLOCKCHAIN_FAILED",
        "AUTH_LOGIN", "AUTH_LOGOUT", "AUTH_FAILED",
        "RECORD_TAMPER_DETECTED",
      ],
    },
    recordRef: { type: String, trim: true },
    recordType: {
      type: String,
      enum: ["LICENSE", "VEHICLE", "INSURANCE", "VIOLATION", "USER", "PAYMENT", "SYSTEM", "AUTH"],
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    actorRole: { type: String },
    actorEmail: { type: String },
    description: { type: String, maxlength: 500 },
    metadata: { type: mongoose.Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String },
    // Blockchain-specific (populated if this event has a corresponding tx)
    blockchainTxHash: { type: String },
    blockNumber: { type: Number },
    blockchainTimestamp: { type: Date },
  },
  {
    timestamps: true,
    // Audit logs should never be updated, only appended
  }
);

auditLogSchema.index({ eventType: 1 });
auditLogSchema.index({ recordRef: 1 });
auditLogSchema.index({ actor: 1 });
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ recordType: 1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);

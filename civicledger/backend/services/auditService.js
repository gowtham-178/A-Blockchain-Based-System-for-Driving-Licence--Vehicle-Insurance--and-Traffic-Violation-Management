const AuditLog = require("../models/AuditLog");

/**
 * Append an audit log entry. Never throws — logging failures are swallowed
 * to prevent audit failures from breaking primary operations.
 */
async function log({
  eventType,
  recordRef,
  recordType,
  actor,
  actorRole,
  actorEmail,
  description,
  metadata,
  ipAddress,
  userAgent,
  blockchainTxHash,
  blockNumber,
  blockchainTimestamp,
}) {
  try {
    await AuditLog.create({
      eventType,
      recordRef,
      recordType,
      actor,
      actorRole,
      actorEmail,
      description,
      metadata,
      ipAddress,
      userAgent,
      blockchainTxHash,
      blockNumber,
      blockchainTimestamp,
    });
  } catch (err) {
    console.error("[AuditLog] Failed to write audit entry:", err.message);
  }
}

module.exports = { log };

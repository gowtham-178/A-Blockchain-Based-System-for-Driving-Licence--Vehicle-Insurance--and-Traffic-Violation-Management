const blockchainService = require("../services/blockchainService");
const BlockchainTransaction = require("../models/BlockchainTransaction");
const AuditLog = require("../models/AuditLog");
const { asyncHandler } = require("../middleware/errorHandler");

// GET /api/blockchain/status
const getBlockchainStatus = asyncHandler(async (req, res) => {
  const available = blockchainService.isAvailable();
  let blockNumber = null;
  let network = null;

  if (available) {
    try {
      blockNumber = await blockchainService.provider.getBlockNumber();
      network = await blockchainService.provider.getNetwork();
    } catch {}
  }

  res.json({
    success: true,
    available,
    contractAddress: blockchainService.contractAddress,
    network: network ? { name: network.name, chainId: Number(network.chainId) } : null,
    blockNumber,
    rpcUrl: process.env.RPC_URL,
  });
});

// GET /api/blockchain/verify/:ref
const verifyByRef = asyncHandler(async (req, res) => {
  const { ref } = req.params;
  const { recordType } = req.query;

  if (!blockchainService.isAvailable()) {
    return res.json({
      success: true,
      available: false,
      message: "Blockchain not available. Start Hardhat node and configure CONTRACT_ADDRESS.",
    });
  }

  try {
    const exists = await blockchainService.contract.recordExists(ref);
    if (!exists) {
      return res.json({ success: true, available: true, exists: false, message: "Record not found on blockchain" });
    }

    const [versionIndex, commitment, timestamp, actor, action] =
      await blockchainService.contract.getLatestCommitment(ref);

    const history = await blockchainService.getRecordHistory(ref);

    // Look up the MongoDB tx record
    const dbTx = await BlockchainTransaction.findOne({ recordRef: ref, status: "confirmed" })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      available: true,
      exists: true,
      ref,
      recordType: recordType || "UNKNOWN",
      contractAddress: blockchainService.contractAddress,
      latestVersion: {
        versionIndex: Number(versionIndex),
        commitment: commitment.toLowerCase(),
        timestamp: new Date(Number(timestamp) * 1000),
        actor,
        action,
      },
      txHash: dbTx?.txHash,
      blockNumber: dbTx?.blockNumber,
      ...history,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/blockchain/transactions
const getTransactions = asyncHandler(async (req, res) => {
  const { recordType, status, page = 1, limit = 20 } = req.query;
  const query = {};
  if (recordType) query.recordType = recordType;
  if (status)     query.status = status;

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await BlockchainTransaction.countDocuments(query);
  const txs   = await BlockchainTransaction.find(query)
    .populate("initiatedBy", "fullName email role")
    .sort({ createdAt: -1 })
    .skip(skip).limit(Number(limit));

  res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / Number(limit)), transactions: txs });
});

// GET /api/blockchain/audit
const getAuditLog = asyncHandler(async (req, res) => {
  const { eventType, recordType, recordRef, page = 1, limit = 20 } = req.query;
  const query = {};
  if (eventType)  query.eventType  = eventType;
  if (recordType) query.recordType = recordType;
  if (recordRef)  query.recordRef  = new RegExp(recordRef, "i");

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await AuditLog.countDocuments(query);
  const logs  = await AuditLog.find(query)
    .populate("actor", "fullName email role")
    .sort({ createdAt: -1 })
    .skip(skip).limit(Number(limit));

  res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / Number(limit)), logs });
});

// GET /api/blockchain/stats
const getBlockchainStats = asyncHandler(async (req, res) => {
  const [total, confirmed, pending, failed] = await Promise.all([
    BlockchainTransaction.countDocuments(),
    BlockchainTransaction.countDocuments({ status: "confirmed" }),
    BlockchainTransaction.countDocuments({ status: "pending" }),
    BlockchainTransaction.countDocuments({ status: "failed" }),
  ]);

  const byType = await BlockchainTransaction.aggregate([
    { $group: { _id: "$recordType", count: { $sum: 1 } } },
  ]);

  const recent = await BlockchainTransaction.find({ status: "confirmed" })
    .sort({ createdAt: -1 }).limit(5);

  res.json({
    success: true,
    stats: { total, confirmed, pending, failed, byType },
    recent,
    available: blockchainService.isAvailable(),
    contractAddress: blockchainService.contractAddress,
  });
});

module.exports = { getBlockchainStatus, verifyByRef, getTransactions, getAuditLog, getBlockchainStats };

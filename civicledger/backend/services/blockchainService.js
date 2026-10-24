const { ethers } = require("ethers");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const BlockchainTransaction = require("../models/BlockchainTransaction");

let _provider = null;
let _signer = null;
let _contract = null;
let _contractAddress = null;
let _abi = null;
let _isAvailable = false;

/**
 * Load contract ABI from artifacts-export directory.
 * Falls back gracefully if blockchain files are missing.
 */
function loadABI() {
  const abiPath = path.join(
    __dirname,
    "../../blockchain/artifacts-export/TrafficRecordRegistry.abi.json"
  );
  if (fs.existsSync(abiPath)) {
    return JSON.parse(fs.readFileSync(abiPath, "utf8"));
  }
  // Minimal ABI so the service can fail gracefully
  return null;
}

/**
 * Initialize the blockchain service.
 * Called once at server startup. Does not throw — sets _isAvailable = false on error.
 */
async function initialize() {
  try {
    const rpcUrl   = process.env.RPC_URL || "http://127.0.0.1:8545";
    const privKey  = process.env.DEPLOYER_PRIVATE_KEY;
    const address  = process.env.CONTRACT_ADDRESS;

    if (!privKey || !address || address === "0x0000000000000000000000000000000000000000") {
      console.warn(
        "[Blockchain] CONTRACT_ADDRESS or DEPLOYER_PRIVATE_KEY not configured. Blockchain features disabled."
      );
      _isAvailable = false;
      return;
    }

    _abi = loadABI();
    if (!_abi) {
      console.warn("[Blockchain] ABI not found. Run `npm run deploy:local` in the blockchain folder first.");
      _isAvailable = false;
      return;
    }

    _provider = new ethers.JsonRpcProvider(rpcUrl);
    _signer   = new ethers.Wallet(privKey, _provider);
    _contract = new ethers.Contract(address, _abi, _signer);
    _contractAddress = address;

    // Quick connectivity test
    await _provider.getBlockNumber();
    _isAvailable = true;

    console.log(`[Blockchain] ✓ Connected to ${rpcUrl}`);
    console.log(`[Blockchain] ✓ Contract: ${address}`);
    console.log(`[Blockchain] ✓ Signer: ${_signer.address}`);
  } catch (err) {
    _isAvailable = false;
    console.warn(`[Blockchain] Not available: ${err.message}`);
  }
}

function isAvailable() { return _isAvailable; }

/**
 * Compute a deterministic SHA-256 commitment for any record.
 * The record object is canonically serialized (keys sorted alphabetically).
 * Returns a hex string prefixed with 0x.
 */
function computeCommitment(recordData) {
  const canonical = JSON.stringify(
    Object.fromEntries(
      Object.entries(recordData)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => [k, v instanceof Date ? v.toISOString() : String(v)])
        .sort(([a], [b]) => a.localeCompare(b))
    )
  );
  const hash = crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
  return "0x" + hash;
}

/**
 * Submit a commitment to the blockchain.
 * Returns {txHash, blockNumber, blockTimestamp} or throws.
 */
async function submitCommitment({ recordRef, recordType, commitment, action, isUpdate = false }) {
  if (!_isAvailable) throw new Error("Blockchain not available");

  const bytes32 = commitment; // already 0x-prefixed 32-byte hex from computeCommitment

  let tx;
  switch (recordType) {
    case "LICENSE":
      tx = isUpdate
        ? await _contract.updateLicense(recordRef, bytes32, action)
        : await _contract.registerLicense(recordRef, bytes32, action);
      break;
    case "VEHICLE":
      tx = await _contract.registerVehicle(recordRef, bytes32, action);
      break;
    case "INSURANCE":
      tx = isUpdate
        ? await _contract.updateInsurance(recordRef, bytes32, action)
        : await _contract.registerInsurance(recordRef, bytes32, action);
      break;
    case "VIOLATION":
      tx = isUpdate
        ? await _contract.updateViolation(recordRef, bytes32, action)
        : await _contract.registerViolation(recordRef, bytes32, action);
      break;
    default:
      throw new Error(`Unknown record type: ${recordType}`);
  }

  const receipt = await tx.wait(1);
  const block   = await _provider.getBlock(receipt.blockNumber);

  return {
    txHash:         receipt.hash,
    blockNumber:    receipt.blockNumber,
    blockTimestamp: block ? new Date(Number(block.timestamp) * 1000) : null,
    gasUsed:        receipt.gasUsed.toString(),
    contractAddress: _contractAddress,
  };
}

/**
 * Verify a record's integrity against on-chain commitment.
 * Returns {verified, onChainCommitment, recomputedCommitment, version, action, timestamp}
 */
async function verifyRecord(recordRef, recordData) {
  if (!_isAvailable) {
    return { verified: false, error: "Blockchain not available", status: "unavailable" };
  }

  try {
    const exists = await _contract.recordExists(recordRef);
    if (!exists) {
      return { verified: false, error: "Record not found on blockchain", status: "not_found" };
    }

    const [versionIndex, onChainCommitment, timestamp, actor, action] =
      await _contract.getLatestCommitment(recordRef);

    const recomputed = computeCommitment(recordData);
    const verified   = recomputed.toLowerCase() === onChainCommitment.toLowerCase();

    return {
      verified,
      status: verified ? "verified" : "tampered",
      onChainCommitment: onChainCommitment.toLowerCase(),
      recomputedCommitment: recomputed.toLowerCase(),
      versionIndex: Number(versionIndex),
      action,
      timestamp: new Date(Number(timestamp) * 1000),
      actor,
      contractAddress: _contractAddress,
    };
  } catch (err) {
    return { verified: false, error: err.message, status: "error" };
  }
}

/**
 * Get historical versions of a record from the blockchain.
 */
async function getRecordHistory(recordRef) {
  if (!_isAvailable) return { available: false, error: "Blockchain not available" };

  try {
    const exists = await _contract.recordExists(recordRef);
    if (!exists) return { available: false, error: "Record not on blockchain" };

    const count    = await _contract.getVersionCount(recordRef);
    const versions = [];

    for (let i = 0; i < Number(count); i++) {
      const [commitment, timestamp, actor, action] = await _contract.getVersionCommitment(recordRef, i);
      versions.push({
        versionIndex: i,
        commitment: commitment.toLowerCase(),
        timestamp: new Date(Number(timestamp) * 1000),
        actor,
        action,
      });
    }

    const recordType = await _contract.getRecordType(recordRef);
    return { available: true, recordRef, recordType, versions, totalVersions: Number(count) };
  } catch (err) {
    return { available: false, error: err.message };
  }
}

/**
 * Persist a BlockchainTransaction record in MongoDB.
 */
async function createTransactionRecord({
  recordRef,
  recordType,
  action,
  commitment,
  versionIndex = 0,
  initiatedBy,
  relatedRecord,
  recordModel,
}) {
  const txRecord = new BlockchainTransaction({
    recordRef,
    recordType,
    action,
    commitment,
    versionIndex,
    status: "pending",
    contractAddress: _contractAddress,
    network: "localhost",
    chainId: 31337,
    initiatedBy,
    relatedRecord,
    recordModel,
    lastAttempt: new Date(),
  });
  return txRecord.save();
}

/**
 * Update a BlockchainTransaction record after confirmation.
 */
async function confirmTransactionRecord(txRecordId, { txHash, blockNumber, blockTimestamp, gasUsed, contractAddress }) {
  return BlockchainTransaction.findByIdAndUpdate(
    txRecordId,
    {
      txHash,
      blockNumber,
      blockTimestamp,
      gasUsed,
      contractAddress,
      status: "confirmed",
      confirmedAt: new Date(),
    },
    { new: true }
  );
}

/**
 * Mark a transaction record as failed.
 */
async function failTransactionRecord(txRecordId, error) {
  return BlockchainTransaction.findByIdAndUpdate(
    txRecordId,
    {
      status: "failed",
      error: error.message || String(error),
      $inc: { retries: 1 },
      lastAttempt: new Date(),
    },
    { new: true }
  );
}

/**
 * Full register-and-track workflow.
 * Creates a pending tx record, submits to chain, updates the record.
 * Returns {txRecord, chainResult} or throws with txRecord marked failed.
 */
async function registerAndTrack({
  recordRef,
  recordType,
  action,
  recordData,
  isUpdate = false,
  initiatedBy,
  relatedRecord,
  recordModel,
}) {
  const commitment = computeCommitment(recordData);

  const txRecord = await createTransactionRecord({
    recordRef,
    recordType,
    action,
    commitment,
    versionIndex: isUpdate ? undefined : 0,
    initiatedBy,
    relatedRecord,
    recordModel,
  });

  if (!_isAvailable) {
    // Blockchain offline — mark not_attempted, return without throwing
    await BlockchainTransaction.findByIdAndUpdate(txRecord._id, { status: "not_attempted" });
    return { txRecord, chainResult: null, commitment, blockchainAvailable: false };
  }

  try {
    const chainResult = await submitCommitment({
      recordRef,
      recordType,
      commitment,
      action,
      isUpdate,
    });
    const updated = await confirmTransactionRecord(txRecord._id, chainResult);
    return { txRecord: updated, chainResult, commitment, blockchainAvailable: true };
  } catch (err) {
    await failTransactionRecord(txRecord._id, err);
    throw err;
  }
}

module.exports = {
  initialize,
  isAvailable,
  computeCommitment,
  submitCommitment,
  verifyRecord,
  getRecordHistory,
  registerAndTrack,
  createTransactionRecord,
  confirmTransactionRecord,
  failTransactionRecord,
  get provider() { return _provider; },
  get contract() { return _contract; },
  get contractAddress() { return _contractAddress; },
};

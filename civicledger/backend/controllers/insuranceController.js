const InsurancePolicy = require("../models/InsurancePolicy");
const Vehicle = require("../models/Vehicle");
const { asyncHandler } = require("../middleware/errorHandler");
const blockchainService = require("../services/blockchainService");
const auditService = require("../services/auditService");

async function nextPolicyRef() {
  const year = new Date().getFullYear();
  const prefix = `INS-${year}-`;
  const last = await InsurancePolicy.findOne({ policyRef: new RegExp(`^${prefix}`) })
    .sort({ policyRef: -1 }).lean();
  if (!last) return `${prefix}0001`;
  const n = parseInt(last.policyRef.split("-")[2]) + 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

function canonicalPolicy(p) {
  return {
    policyRef:      p.policyRef,
    policyNumber:   p.policyNumber,
    vehicleId:      p.vehicle?.toString(),
    insurerName:    p.insurerName,
    coverageType:   p.coverageType.join(","),
    coverageAmount: String(p.coverageAmount),
    premiumAmount:  String(p.premiumAmount),
    startDate:      p.startDate instanceof Date ? p.startDate.toISOString() : p.startDate,
    expiryDate:     p.expiryDate instanceof Date ? p.expiryDate.toISOString() : p.expiryDate,
    version:        String(p.version || 0),
  };
}

// POST /api/insurance
const issuePolicy = asyncHandler(async (req, res) => {
  const {
    vehicle, policyNumber, insurerName, coverageType, coverageAmount,
    premiumAmount, startDate, expiryDate, policyHolder, nomineeDetails, notes,
  } = req.body;

  // Verify vehicle exists
  const veh = await Vehicle.findById(vehicle);
  if (!veh) return res.status(404).json({ success: false, message: "Vehicle not found" });

  const policyRef = await nextPolicyRef();

  const policy = await InsurancePolicy.create({
    policyRef,
    policyNumber,
    vehicle,
    vehicleRef: veh.vehicleRef,
    policyHolder: policyHolder || veh.owner,
    issuedBy: req.user._id,
    insurerName,
    coverageType,
    coverageAmount,
    premiumAmount,
    startDate,
    expiryDate,
    nomineeDetails,
    notes,
    version: 0,
    history: [{
      action: "ISSUED",
      newStatus: "active",
      performedBy: req.user._id,
      performedAt: new Date(),
    }],
  });

  let bcAvailable = false;
  try {
    const result = await blockchainService.registerAndTrack({
      recordRef:    policyRef,
      recordType:   "INSURANCE",
      action:       "ISSUED",
      recordData:   canonicalPolicy(policy),
      isUpdate:     false,
      initiatedBy:  req.user._id,
      relatedRecord: policy._id,
      recordModel:   "InsurancePolicy",
    });
    bcAvailable = result.blockchainAvailable;
    if (result.chainResult) {
      await InsurancePolicy.findByIdAndUpdate(policy._id, {
        blockchainStatus: "confirmed",
        blockchainTxHash: result.chainResult.txHash,
        blockchainBlock:  result.chainResult.blockNumber,
      });
    }
  } catch (bcErr) {
    console.warn("[Insurance] Blockchain failed:", bcErr.message);
  }

  await auditService.log({
    eventType: "INSURANCE_ISSUED",
    recordRef: policyRef,
    recordType: "INSURANCE",
    actor: req.user._id, actorRole: req.user.role,
    description: `Policy ${policyRef} issued for vehicle ${veh.registrationNumber}`,
  });

  const populated = await InsurancePolicy.findById(policy._id)
    .populate("vehicle", "registrationNumber make model")
    .populate("policyHolder", "fullName email")
    .populate("issuedBy", "fullName");

  res.status(201).json({ success: true, message: "Policy issued", policy: populated, blockchainAvailable: bcAvailable });
});

// GET /api/insurance
const getPolicies = asyncHandler(async (req, res) => {
  const { status, vehicle, policyHolder, expiring, search, page = 1, limit = 20 } = req.query;
  const now = new Date();
  const query = {};

  if (req.user.role === "driver") {
    query.policyHolder = req.user._id;
  } else {
    if (policyHolder) query.policyHolder = policyHolder;
    if (vehicle) query.vehicle = vehicle;
  }

  if (status) query.status = status;
  if (expiring === "true") {
    const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    query.expiryDate = { $lte: soon, $gte: now };
  }
  if (search) {
    const re = new RegExp(search, "i");
    query.$or = [{ policyRef: re }, { policyNumber: re }, { insurerName: re }];
  }

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await InsurancePolicy.countDocuments(query);
  const policies = await InsurancePolicy.find(query)
    .populate("vehicle", "registrationNumber make model")
    .populate("policyHolder", "fullName email")
    .sort({ createdAt: -1 })
    .skip(skip).limit(Number(limit));

  res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / Number(limit)), policies });
});

// GET /api/insurance/:id
const getPolicy = asyncHandler(async (req, res) => {
  const policy = await InsurancePolicy.findById(req.params.id)
    .populate("vehicle", "registrationNumber make model year")
    .populate("policyHolder", "fullName email phone")
    .populate("issuedBy", "fullName email");

  if (!policy) return res.status(404).json({ success: false, message: "Policy not found" });

  if (req.user.role === "driver" && policy.policyHolder._id.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  // Compute actual validity
  const now = new Date();
  const isCurrentlyValid = policy.status === "active" && policy.startDate <= now && policy.expiryDate >= now;
  const daysUntilExpiry = Math.ceil((policy.expiryDate - now) / (1000 * 60 * 60 * 24));

  res.json({ success: true, policy, isCurrentlyValid, daysUntilExpiry });
});

// PUT /api/insurance/:id/status
const updatePolicyStatus = asyncHandler(async (req, res) => {
  const { status, notes } = req.body;
  const valid = ["active", "expired", "cancelled", "suspended"];
  if (!valid.includes(status)) {
    return res.status(400).json({ success: false, message: "Invalid status" });
  }

  const policy = await InsurancePolicy.findById(req.params.id);
  if (!policy) return res.status(404).json({ success: false, message: "Policy not found" });

  const previousStatus = policy.status;
  policy.status  = status;
  policy.version = (policy.version || 0) + 1;
  policy.history.push({
    action: status.toUpperCase(), previousStatus, newStatus: status,
    notes, performedBy: req.user._id, performedAt: new Date(),
  });
  await policy.save();

  try {
    await blockchainService.registerAndTrack({
      recordRef: policy.policyRef, recordType: "INSURANCE",
      action: status.toUpperCase(), recordData: canonicalPolicy(policy),
      isUpdate: true, initiatedBy: req.user._id,
    });
  } catch (bcErr) {
    console.warn("[Insurance] Blockchain update failed:", bcErr.message);
  }

  await auditService.log({
    eventType: "INSURANCE_" + status.toUpperCase(),
    recordRef: policy.policyRef, recordType: "INSURANCE",
    actor: req.user._id, actorRole: req.user.role,
    description: `Policy ${policy.policyRef} → ${status}`,
  });

  const populated = await InsurancePolicy.findById(policy._id)
    .populate("vehicle", "registrationNumber").populate("policyHolder", "fullName");
  res.json({ success: true, message: `Policy ${status}`, policy: populated });
});

// PUT /api/insurance/:id/renew
const renewPolicy = asyncHandler(async (req, res) => {
  const { expiryDate, premiumAmount, notes } = req.body;
  const policy = await InsurancePolicy.findById(req.params.id);
  if (!policy) return res.status(404).json({ success: false, message: "Policy not found" });

  policy.expiryDate    = new Date(expiryDate);
  policy.renewalDate   = new Date();
  policy.status        = "active";
  if (premiumAmount) policy.premiumAmount = premiumAmount;
  policy.version = (policy.version || 0) + 1;
  policy.history.push({
    action: "RENEWED", previousStatus: policy.status, newStatus: "active",
    notes: notes || "Policy renewed", performedBy: req.user._id, performedAt: new Date(),
  });
  await policy.save();

  try {
    await blockchainService.registerAndTrack({
      recordRef: policy.policyRef, recordType: "INSURANCE",
      action: "RENEWED", recordData: canonicalPolicy(policy),
      isUpdate: true, initiatedBy: req.user._id,
    });
  } catch (bcErr) {
    console.warn("[Insurance] Blockchain renewal failed:", bcErr.message);
  }

  await auditService.log({
    eventType: "INSURANCE_RENEWED", recordRef: policy.policyRef, recordType: "INSURANCE",
    actor: req.user._id, actorRole: req.user.role,
    description: `Policy ${policy.policyRef} renewed to ${expiryDate}`,
  });

  const populated = await InsurancePolicy.findById(policy._id)
    .populate("vehicle", "registrationNumber").populate("policyHolder", "fullName");
  res.json({ success: true, message: "Policy renewed", policy: populated });
});

// GET /api/insurance/:id/verify
const verifyPolicy = asyncHandler(async (req, res) => {
  const policy = await InsurancePolicy.findById(req.params.id);
  if (!policy) return res.status(404).json({ success: false, message: "Policy not found" });
  const result = await blockchainService.verifyRecord(policy.policyRef, canonicalPolicy(policy));
  res.json({ success: true, policyRef: policy.policyRef, ...result });
});

// GET /api/insurance/stats
const getInsuranceStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const [total, active, expired, cancelled, expiringSoon] = await Promise.all([
    InsurancePolicy.countDocuments(),
    InsurancePolicy.countDocuments({ status: "active" }),
    InsurancePolicy.countDocuments({ status: "expired" }),
    InsurancePolicy.countDocuments({ status: "cancelled" }),
    InsurancePolicy.countDocuments({ status: "active", expiryDate: { $lte: soon, $gte: now } }),
  ]);
  const recent = await InsurancePolicy.find()
    .populate("vehicle", "registrationNumber")
    .populate("policyHolder", "fullName")
    .sort({ createdAt: -1 }).limit(5);
  res.json({ success: true, stats: { total, active, expired, cancelled, expiringSoon }, recent });
});

module.exports = { issuePolicy, getPolicies, getPolicy, updatePolicyStatus, renewPolicy, verifyPolicy, getInsuranceStats };

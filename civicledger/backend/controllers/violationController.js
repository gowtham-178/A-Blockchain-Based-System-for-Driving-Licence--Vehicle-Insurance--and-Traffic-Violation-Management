const TrafficViolation = require("../models/TrafficViolation");
const Payment = require("../models/Payment");
const { asyncHandler } = require("../middleware/errorHandler");
const blockchainService = require("../services/blockchainService");
const auditService = require("../services/auditService");
const { v4: uuidv4 } = require("uuid");

async function nextViolationRef() {
  const year = new Date().getFullYear();
  const prefix = `VIO-${year}-`;
  const last = await TrafficViolation.findOne({ violationRef: new RegExp(`^${prefix}`) })
    .sort({ violationRef: -1 }).lean();
  if (!last) return `${prefix}0001`;
  const n = parseInt(last.violationRef.split("-")[2]) + 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

function canonicalViolation(v) {
  return {
    violationRef: v.violationRef,
    registrationNumber: v.registrationNumber || "",
    category: v.category,
    location: v.location,
    violationDate: v.violationDate instanceof Date ? v.violationDate.toISOString() : v.violationDate,
    fineAmount: String(v.fineAmount),
    status: v.status,
    version: String(v.version || 0),
  };
}

// POST /api/violations
const recordViolation = asyncHandler(async (req, res) => {
  const {
    vehicle, registrationNumber, driver, licenseRef, category,
    description, location, violationDate, fineAmount, evidenceRef, notes,
  } = req.body;

  const violationRef = await nextViolationRef();

  const violation = await TrafficViolation.create({
    violationRef,
    vehicle,
    registrationNumber: registrationNumber || "",
    driver,
    licenseRef,
    recordedBy: req.user._id,
    category,
    description,
    location,
    violationDate: new Date(violationDate),
    fineAmount,
    evidenceRef,
    notes,
    status: "pending",
    version: 0,
    history: [{
      action: "RECORDED",
      newStatus: "pending",
      performedBy: req.user._id,
      performedAt: new Date(),
    }],
  });

  let bcAvailable = false;
  try {
    const result = await blockchainService.registerAndTrack({
      recordRef:    violationRef,
      recordType:   "VIOLATION",
      action:       "RECORDED",
      recordData:   canonicalViolation(violation),
      isUpdate:     false,
      initiatedBy:  req.user._id,
      relatedRecord: violation._id,
      recordModel:   "TrafficViolation",
    });
    bcAvailable = result.blockchainAvailable;
    if (result.chainResult) {
      await TrafficViolation.findByIdAndUpdate(violation._id, {
        blockchainStatus: "confirmed",
        blockchainTxHash: result.chainResult.txHash,
        blockchainBlock:  result.chainResult.blockNumber,
      });
    }
  } catch (bcErr) {
    console.warn("[Violation] Blockchain failed:", bcErr.message);
  }

  await auditService.log({
    eventType: "VIOLATION_RECORDED",
    recordRef: violationRef,
    recordType: "VIOLATION",
    actor: req.user._id, actorRole: req.user.role,
    description: `Violation ${violationRef}: ${category} at ${location}`,
  });

  const populated = await TrafficViolation.findById(violation._id)
    .populate("vehicle", "registrationNumber make model")
    .populate("driver", "fullName email")
    .populate("recordedBy", "fullName");

  res.status(201).json({ success: true, message: "Violation recorded", violation: populated, blockchainAvailable: bcAvailable });
});

// GET /api/violations
const getViolations = asyncHandler(async (req, res) => {
  const { status, category, driver, vehicle, search, page = 1, limit = 20 } = req.query;
  const query = {};

  if (req.user.role === "driver") {
    query.driver = req.user._id;
  } else {
    if (driver) query.driver = driver;
    if (vehicle) query.vehicle = vehicle;
  }

  if (status) query.status = status;
  if (category) query.category = category;
  if (search) {
    const re = new RegExp(search, "i");
    query.$or = [{ violationRef: re }, { registrationNumber: re }, { location: re }];
  }

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await TrafficViolation.countDocuments(query);
  const violations = await TrafficViolation.find(query)
    .populate("vehicle", "registrationNumber make model")
    .populate("driver", "fullName email")
    .populate("recordedBy", "fullName")
    .sort({ violationDate: -1 })
    .skip(skip).limit(Number(limit));

  res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / Number(limit)), violations });
});

// GET /api/violations/:id
const getViolation = asyncHandler(async (req, res) => {
  const violation = await TrafficViolation.findById(req.params.id)
    .populate("vehicle", "registrationNumber make model year")
    .populate("driver", "fullName email phone")
    .populate("recordedBy", "fullName email");

  if (!violation) return res.status(404).json({ success: false, message: "Violation not found" });

  if (req.user.role === "driver") {
    const driverId = violation.driver?._id?.toString() || violation.driver?.toString();
    if (driverId !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
  }
  res.json({ success: true, violation });
});

// PUT /api/violations/:id/status
const updateViolationStatus = asyncHandler(async (req, res) => {
  const { status, notes, disputeReason } = req.body;
  const valid = ["pending", "paid", "disputed", "resolved", "cancelled"];
  if (!valid.includes(status)) {
    return res.status(400).json({ success: false, message: "Invalid status" });
  }

  const violation = await TrafficViolation.findById(req.params.id);
  if (!violation) return res.status(404).json({ success: false, message: "Violation not found" });

  const previousStatus = violation.status;
  violation.status  = status;
  violation.version = (violation.version || 0) + 1;
  if (disputeReason) violation.disputeReason = disputeReason;
  if (status === "resolved") violation.resolvedAt = new Date();
  violation.history.push({
    action: status.toUpperCase(), previousStatus, newStatus: status,
    notes, performedBy: req.user._id, performedAt: new Date(),
  });
  await violation.save();

  try {
    await blockchainService.registerAndTrack({
      recordRef: violation.violationRef, recordType: "VIOLATION",
      action: status.toUpperCase(), recordData: canonicalViolation(violation),
      isUpdate: true, initiatedBy: req.user._id,
    });
  } catch (bcErr) {
    console.warn("[Violation] Blockchain update failed:", bcErr.message);
  }

  await auditService.log({
    eventType: `VIOLATION_${status.toUpperCase()}`,
    recordRef: violation.violationRef, recordType: "VIOLATION",
    actor: req.user._id, actorRole: req.user.role,
    description: `Violation ${violation.violationRef} → ${status}`,
  });

  const populated = await TrafficViolation.findById(violation._id)
    .populate("vehicle", "registrationNumber").populate("driver", "fullName");
  res.json({ success: true, message: `Violation updated to ${status}`, violation: populated });
});

// GET /api/violations/stats
const getViolationStats = asyncHandler(async (req, res) => {
  const [total, pending, paid, disputed, resolved] = await Promise.all([
    TrafficViolation.countDocuments(),
    TrafficViolation.countDocuments({ status: "pending" }),
    TrafficViolation.countDocuments({ status: "paid" }),
    TrafficViolation.countDocuments({ status: "disputed" }),
    TrafficViolation.countDocuments({ status: "resolved" }),
  ]);

  const byCategory = await TrafficViolation.aggregate([
    { $group: { _id: "$category", count: { $sum: 1 }, totalFines: { $sum: "$fineAmount" } } },
    { $sort: { count: -1 } },
  ]);

  const totalFineAmount = await TrafficViolation.aggregate([
    { $group: { _id: null, total: { $sum: "$fineAmount" } } },
  ]);

  const recent = await TrafficViolation.find()
    .populate("vehicle", "registrationNumber")
    .populate("driver", "fullName")
    .sort({ createdAt: -1 }).limit(5);

  res.json({
    success: true,
    stats: {
      total, pending, paid, disputed, resolved,
      totalFineAmount: totalFineAmount[0]?.total || 0,
      byCategory,
    },
    recent,
  });
});

// GET /api/violations/:id/verify
const verifyViolation = asyncHandler(async (req, res) => {
  const violation = await TrafficViolation.findById(req.params.id);
  if (!violation) return res.status(404).json({ success: false, message: "Violation not found" });
  const result = await blockchainService.verifyRecord(violation.violationRef, canonicalViolation(violation));
  res.json({ success: true, violationRef: violation.violationRef, ...result });
});

// POST /api/violations/:id/pay  — simulated payment
const payViolation = asyncHandler(async (req, res) => {
  const { method, notes } = req.body;
  const violation = await TrafficViolation.findById(req.params.id);
  if (!violation) return res.status(404).json({ success: false, message: "Violation not found" });

  if (violation.status !== "pending" && violation.status !== "disputed") {
    return res.status(400).json({ success: false, message: "Only pending or disputed violations can be paid" });
  }

  const paymentRef = `PAY-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;
  const payment = await Payment.create({
    paymentRef,
    violation: violation._id,
    violationRef: violation.violationRef,
    payer: req.user._id,
    amount: violation.fineAmount,
    method: method || "Online",
    status: "completed",
    transactionId: `SIM-${uuidv4().slice(0, 12).toUpperCase()}`,
    notes,
    simulatedPayment: true,
    completedAt: new Date(),
  });

  // Update violation status
  violation.status     = "paid";
  violation.paymentRef = paymentRef;
  violation.version    = (violation.version || 0) + 1;
  violation.history.push({
    action: "PAID", previousStatus: violation.status, newStatus: "paid",
    notes: `Simulated payment ${paymentRef}`, performedBy: req.user._id, performedAt: new Date(),
  });
  await violation.save();

  try {
    await blockchainService.registerAndTrack({
      recordRef: violation.violationRef, recordType: "VIOLATION",
      action: "PAID", recordData: canonicalViolation(violation),
      isUpdate: true, initiatedBy: req.user._id,
    });
  } catch (bcErr) {
    console.warn("[Violation] Blockchain payment update failed:", bcErr.message);
  }

  await auditService.log({
    eventType: "PAYMENT_COMPLETED",
    recordRef: paymentRef, recordType: "PAYMENT",
    actor: req.user._id, actorRole: req.user.role,
    description: `SIMULATED PAYMENT ${paymentRef} for violation ${violation.violationRef}`,
    metadata: { simulated: true, disclaimer: payment.simulationDisclaimer },
  });

  res.json({
    success: true,
    message: "Simulated payment recorded",
    disclaimer: payment.simulationDisclaimer,
    payment,
    violation: { _id: violation._id, violationRef: violation.violationRef, status: "paid" },
  });
});

module.exports = {
  recordViolation, getViolations, getViolation, updateViolationStatus,
  getViolationStats, verifyViolation, payViolation,
};

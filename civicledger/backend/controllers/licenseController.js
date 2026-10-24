const License = require("../models/License");
const { asyncHandler } = require("../middleware/errorHandler");
const blockchainService = require("../services/blockchainService");
const auditService = require("../services/auditService");

// Generate next license reference
async function nextLicenseRef() {
  const year = new Date().getFullYear();
  const prefix = `LIC-${year}-`;
  const last = await License.findOne({ licenseRef: new RegExp(`^${prefix}`) })
    .sort({ licenseRef: -1 })
    .lean();
  if (!last) return `${prefix}0001`;
  const n = parseInt(last.licenseRef.split("-")[2]) + 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

// Build canonical object for commitment (only stable fields)
function canonicalLicense(lic) {
  return {
    licenseRef:  lic.licenseRef,
    driverId:    lic.driver?.toString(),
    category:    lic.category.join(","),
    issueDate:   lic.issueDate instanceof Date ? lic.issueDate.toISOString() : lic.issueDate,
    expiryDate:  lic.expiryDate instanceof Date ? lic.expiryDate.toISOString() : lic.expiryDate,
    bloodGroup:  lic.bloodGroup || "",
    dateOfBirth: lic.dateOfBirth instanceof Date ? lic.dateOfBirth.toISOString() : lic.dateOfBirth,
    version:     String(lic.version),
  };
}

// POST /api/licenses
const issueLicense = asyncHandler(async (req, res) => {
  const {
    driver, category, issueDate, expiryDate, bloodGroup,
    address, dateOfBirth, testScore, restrictions, notes,
  } = req.body;

  const licenseRef = await nextLicenseRef();

  const license = await License.create({
    licenseRef,
    driver,
    issuedBy: req.user._id,
    category,
    issueDate,
    expiryDate,
    bloodGroup,
    address,
    dateOfBirth,
    testScore,
    restrictions,
    notes,
    version: 0,
    history: [{
      action: "ISSUED",
      newStatus: "active",
      notes: "License issued",
      performedBy: req.user._id,
      performedAt: new Date(),
    }],
  });

  // Submit to blockchain asynchronously
  let blockchainResult = { blockchainAvailable: false };
  try {
    blockchainResult = await blockchainService.registerAndTrack({
      recordRef:    licenseRef,
      recordType:   "LICENSE",
      action:       "ISSUED",
      recordData:   canonicalLicense(license),
      isUpdate:     false,
      initiatedBy:  req.user._id,
      relatedRecord: license._id,
      recordModel:   "License",
    });

    if (blockchainResult.chainResult) {
      await License.findByIdAndUpdate(license._id, {
        blockchainStatus:   "confirmed",
        blockchainTxHash:   blockchainResult.chainResult.txHash,
        blockchainBlock:    blockchainResult.chainResult.blockNumber,
        lastBlockchainAttempt: new Date(),
      });
      license.blockchainStatus = "confirmed";
      license.blockchainTxHash = blockchainResult.chainResult.txHash;
    }
  } catch (bcErr) {
    console.warn("[License] Blockchain submission failed:", bcErr.message);
    await License.findByIdAndUpdate(license._id, {
      blockchainStatus: "failed",
      blockchainError:  bcErr.message,
    });
  }

  await auditService.log({
    eventType: "LICENSE_ISSUED",
    recordRef: licenseRef,
    recordType: "LICENSE",
    actor: req.user._id,
    actorRole: req.user.role,
    actorEmail: req.user.email,
    description: `License ${licenseRef} issued`,
    blockchainTxHash: blockchainResult.chainResult?.txHash,
  });

  const populated = await License.findById(license._id)
    .populate("driver", "fullName email")
    .populate("issuedBy", "fullName email");

  res.status(201).json({
    success: true,
    message: "License issued successfully",
    license: populated,
    blockchainAvailable: blockchainResult.blockchainAvailable,
  });
});

// GET /api/licenses
const getLicenses = asyncHandler(async (req, res) => {
  const { status, search, driver, page = 1, limit = 20 } = req.query;
  const query = {};

  if (req.user.role === "driver") {
    query.driver = req.user._id;
  } else {
    if (driver) query.driver = driver;
  }

  if (status) query.status = status;
  if (search) {
    const re = new RegExp(search, "i");
    query.$or = [{ licenseRef: re }];
  }

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await License.countDocuments(query);
  const licenses = await License.find(query)
    .populate("driver", "fullName email")
    .populate("issuedBy", "fullName")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit));

  res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / Number(limit)), licenses });
});

// GET /api/licenses/:id
const getLicense = asyncHandler(async (req, res) => {
  const license = await License.findById(req.params.id)
    .populate("driver", "fullName email phone")
    .populate("issuedBy", "fullName email");

  if (!license) return res.status(404).json({ success: false, message: "License not found" });

  if (req.user.role === "driver" && license.driver._id.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  res.json({ success: true, license });
});

// GET /api/licenses/ref/:ref
const getLicenseByRef = asyncHandler(async (req, res) => {
  const license = await License.findOne({ licenseRef: req.params.ref.toUpperCase() })
    .populate("driver", "fullName email phone")
    .populate("issuedBy", "fullName email");

  if (!license) return res.status(404).json({ success: false, message: "License not found" });

  if (req.user.role === "driver" && license.driver._id.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }

  res.json({ success: true, license });
});

// PUT /api/licenses/:id — update status (suspend/revoke/activate)
const updateLicenseStatus = asyncHandler(async (req, res) => {
  const { status, notes } = req.body;
  const valid = ["active", "suspended", "revoked", "expired"];
  if (!valid.includes(status)) {
    return res.status(400).json({ success: false, message: "Invalid status" });
  }

  const license = await License.findById(req.params.id);
  if (!license) return res.status(404).json({ success: false, message: "License not found" });

  const previousStatus = license.status;
  license.status  = status;
  license.version = (license.version || 0) + 1;
  license.history.push({
    action:         status.toUpperCase(),
    previousStatus,
    newStatus:      status,
    notes,
    performedBy:    req.user._id,
    performedAt:    new Date(),
  });
  await license.save();

  // Blockchain update
  try {
    const result = await blockchainService.registerAndTrack({
      recordRef:    license.licenseRef,
      recordType:   "LICENSE",
      action:       status.toUpperCase(),
      recordData:   canonicalLicense(license),
      isUpdate:     true,
      initiatedBy:  req.user._id,
      relatedRecord: license._id,
      recordModel:   "License",
    });
    if (result.chainResult) {
      license.blockchainStatus = "confirmed";
      license.blockchainTxHash = result.chainResult.txHash;
      license.blockchainBlock  = result.chainResult.blockNumber;
      await license.save();
    }
  } catch (bcErr) {
    console.warn("[License] Blockchain update failed:", bcErr.message);
  }

  await auditService.log({
    eventType: `LICENSE_${status.toUpperCase()}`,
    recordRef: license.licenseRef,
    recordType: "LICENSE",
    actor: req.user._id,
    actorRole: req.user.role,
    description: `License ${license.licenseRef} status → ${status}`,
  });

  const populated = await License.findById(license._id)
    .populate("driver", "fullName email")
    .populate("issuedBy", "fullName email");

  res.json({ success: true, message: `License ${status}`, license: populated });
});

// PUT /api/licenses/:id/renew
const renewLicense = asyncHandler(async (req, res) => {
  const { expiryDate, notes } = req.body;

  const license = await License.findById(req.params.id);
  if (!license) return res.status(404).json({ success: false, message: "License not found" });

  const previousStatus = license.status;
  license.expiryDate  = new Date(expiryDate);
  license.renewalDate = new Date();
  license.status      = "active";
  license.version     = (license.version || 0) + 1;
  license.history.push({
    action:         "RENEWED",
    previousStatus,
    newStatus:      "active",
    notes:          notes || "License renewed",
    performedBy:    req.user._id,
    performedAt:    new Date(),
  });
  await license.save();

  try {
    const result = await blockchainService.registerAndTrack({
      recordRef:    license.licenseRef,
      recordType:   "LICENSE",
      action:       "RENEWED",
      recordData:   canonicalLicense(license),
      isUpdate:     true,
      initiatedBy:  req.user._id,
      relatedRecord: license._id,
      recordModel:   "License",
    });
    if (result.chainResult) {
      license.blockchainStatus = "confirmed";
      license.blockchainTxHash = result.chainResult.txHash;
      await license.save();
    }
  } catch (bcErr) {
    console.warn("[License] Blockchain renewal failed:", bcErr.message);
  }

  await auditService.log({
    eventType: "LICENSE_RENEWED",
    recordRef: license.licenseRef,
    recordType: "LICENSE",
    actor: req.user._id,
    actorRole: req.user.role,
    description: `License ${license.licenseRef} renewed to ${expiryDate}`,
  });

  const populated = await License.findById(license._id)
    .populate("driver", "fullName email")
    .populate("issuedBy", "fullName email");

  res.json({ success: true, message: "License renewed", license: populated });
});

// GET /api/licenses/:id/verify — blockchain integrity check
const verifyLicense = asyncHandler(async (req, res) => {
  const license = await License.findById(req.params.id);
  if (!license) return res.status(404).json({ success: false, message: "License not found" });

  const result = await blockchainService.verifyRecord(
    license.licenseRef,
    canonicalLicense(license)
  );

  if (!result.verified && result.status === "tampered") {
    await auditService.log({
      eventType: "RECORD_TAMPER_DETECTED",
      recordRef: license.licenseRef,
      recordType: "LICENSE",
      actor: req.user._id,
      actorRole: req.user.role,
      description: `TAMPER DETECTED: License ${license.licenseRef}`,
    });
  }

  res.json({ success: true, licenseRef: license.licenseRef, ...result });
});

// GET /api/licenses/stats (for dashboard)
const getLicenseStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [total, active, expired, suspended, revoked, expiringSoon] = await Promise.all([
    License.countDocuments(),
    License.countDocuments({ status: "active" }),
    License.countDocuments({ status: "expired" }),
    License.countDocuments({ status: "suspended" }),
    License.countDocuments({ status: "revoked" }),
    License.countDocuments({ status: "active", expiryDate: { $lte: thirtyDays, $gte: now } }),
  ]);

  const recent = await License.find()
    .populate("driver", "fullName")
    .sort({ createdAt: -1 })
    .limit(5);

  res.json({ success: true, stats: { total, active, expired, suspended, revoked, expiringSoon }, recent });
});

module.exports = {
  issueLicense,
  getLicenses,
  getLicense,
  getLicenseByRef,
  updateLicenseStatus,
  renewLicense,
  verifyLicense,
  getLicenseStats,
};

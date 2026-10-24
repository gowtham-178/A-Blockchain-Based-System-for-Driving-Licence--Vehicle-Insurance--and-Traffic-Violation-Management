const User = require("../models/User");
const License = require("../models/License");
const Vehicle = require("../models/Vehicle");
const InsurancePolicy = require("../models/InsurancePolicy");
const TrafficViolation = require("../models/TrafficViolation");
const BlockchainTransaction = require("../models/BlockchainTransaction");
const { asyncHandler } = require("../middleware/errorHandler");
const blockchainService = require("../services/blockchainService");

// GET /api/dashboard/admin
const adminDashboard = asyncHandler(async (req, res) => {
  const now = new Date();

  const [
    totalUsers, totalLicenses, totalVehicles, totalPolicies,
    activeLicenses, activePolicies, totalViolations, pendingViolations,
    paidViolations, confirmedTxs, pendingTxs, failedTxs,
  ] = await Promise.all([
    User.countDocuments({ isActive: true }),
    License.countDocuments(),
    Vehicle.countDocuments(),
    InsurancePolicy.countDocuments(),
    License.countDocuments({ status: "active" }),
    InsurancePolicy.countDocuments({ status: "active" }),
    TrafficViolation.countDocuments(),
    TrafficViolation.countDocuments({ status: "pending" }),
    TrafficViolation.countDocuments({ status: "paid" }),
    BlockchainTransaction.countDocuments({ status: "confirmed" }),
    BlockchainTransaction.countDocuments({ status: "pending" }),
    BlockchainTransaction.countDocuments({ status: "failed" }),
  ]);

  const recentTxs = await BlockchainTransaction.find({ status: "confirmed" })
    .sort({ createdAt: -1 }).limit(5);

  const usersByRole = await User.aggregate([
    { $group: { _id: "$role", count: { $sum: 1 } } },
  ]);

  res.json({
    success: true,
    stats: {
      users: { total: totalUsers, byRole: usersByRole },
      licenses: { total: totalLicenses, active: activeLicenses },
      vehicles: { total: totalVehicles },
      insurance: { total: totalPolicies, active: activePolicies },
      violations: { total: totalViolations, pending: pendingViolations, paid: paidViolations },
      blockchain: {
        confirmed: confirmedTxs, pending: pendingTxs, failed: failedTxs,
        available: blockchainService.isAvailable(),
        contractAddress: blockchainService.contractAddress,
      },
    },
    recentBlockchainTxs: recentTxs,
  });
});

// GET /api/dashboard/driver
const driverDashboard = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const [license, vehicles, insurance, violations] = await Promise.all([
    License.findOne({ driver: userId }).sort({ createdAt: -1 }),
    Vehicle.find({ owner: userId }),
    InsurancePolicy.find({ policyHolder: userId }).populate("vehicle", "registrationNumber"),
    TrafficViolation.find({ driver: userId }).sort({ violationDate: -1 }).limit(10),
  ]);

  const pendingFines = violations.filter((v) => v.status === "pending").reduce((s, v) => s + v.fineAmount, 0);
  const now = new Date();

  const activeInsurance = insurance.filter(
    (p) => p.status === "active" && p.startDate <= now && p.expiryDate >= now
  );

  res.json({
    success: true,
    license: license || null,
    vehicles,
    insurance,
    activeInsurance,
    violations,
    stats: {
      totalViolations: violations.length,
      pendingViolations: violations.filter((v) => v.status === "pending").length,
      paidViolations: violations.filter((v) => v.status === "paid").length,
      pendingFines,
      totalVehicles: vehicles.length,
      hasActiveLicense: license?.status === "active",
      hasActiveInsurance: activeInsurance.length > 0,
    },
  });
});

module.exports = { adminDashboard, driverDashboard };

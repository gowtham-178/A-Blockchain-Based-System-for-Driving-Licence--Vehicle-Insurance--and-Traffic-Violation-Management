const Vehicle = require("../models/Vehicle");
const { asyncHandler } = require("../middleware/errorHandler");
const blockchainService = require("../services/blockchainService");
const auditService = require("../services/auditService");

async function nextVehicleRef() {
  const year = new Date().getFullYear();
  const prefix = `VEH-${year}-`;
  const last = await Vehicle.findOne({ vehicleRef: new RegExp(`^${prefix}`) })
    .sort({ vehicleRef: -1 }).lean();
  if (!last) return `${prefix}0001`;
  const n = parseInt(last.vehicleRef.split("-")[2]) + 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

function canonicalVehicle(v) {
  return {
    vehicleRef:          v.vehicleRef,
    registrationNumber:  v.registrationNumber,
    ownerId:             v.owner?.toString(),
    make:                v.make,
    model:               v.model,
    year:                String(v.year),
    vehicleType:         v.vehicleType,
    fuelType:            v.fuelType,
    chassisNumber:       v.chassisNumber,
    engineNumber:        v.engineNumber,
    version:             String(v.version || 0),
  };
}

// POST /api/vehicles
const registerVehicle = asyncHandler(async (req, res) => {
  const {
    owner, registrationNumber, make, model, year,
    vehicleType, fuelType, color, chassisNumber, engineNumber,
    seatingCapacity, registrationDate, fitnessExpiryDate, notes,
  } = req.body;

  const vehicleRef = await nextVehicleRef();

  const vehicle = await Vehicle.create({
    vehicleRef,
    owner,
    registeredBy: req.user._id,
    registrationNumber,
    make, model, year, vehicleType, fuelType, color,
    chassisNumber, engineNumber, seatingCapacity,
    registrationDate, fitnessExpiryDate, notes,
    version: 0,
  });

  let bcAvailable = false;
  try {
    const result = await blockchainService.registerAndTrack({
      recordRef:    vehicleRef,
      recordType:   "VEHICLE",
      action:       "REGISTERED",
      recordData:   canonicalVehicle(vehicle),
      isUpdate:     false,
      initiatedBy:  req.user._id,
      relatedRecord: vehicle._id,
      recordModel:   "Vehicle",
    });
    bcAvailable = result.blockchainAvailable;
    if (result.chainResult) {
      await Vehicle.findByIdAndUpdate(vehicle._id, {
        blockchainStatus: "confirmed",
        blockchainTxHash: result.chainResult.txHash,
        blockchainBlock:  result.chainResult.blockNumber,
      });
    }
  } catch (bcErr) {
    console.warn("[Vehicle] Blockchain failed:", bcErr.message);
    await Vehicle.findByIdAndUpdate(vehicle._id, {
      blockchainStatus: "failed", blockchainError: bcErr.message,
    });
  }

  await auditService.log({
    eventType: "VEHICLE_REGISTERED",
    recordRef: vehicleRef,
    recordType: "VEHICLE",
    actor: req.user._id, actorRole: req.user.role,
    description: `Vehicle ${registrationNumber} registered`,
  });

  const populated = await Vehicle.findById(vehicle._id)
    .populate("owner", "fullName email")
    .populate("registeredBy", "fullName");

  res.status(201).json({ success: true, message: "Vehicle registered", vehicle: populated, blockchainAvailable: bcAvailable });
});

// GET /api/vehicles
const getVehicles = asyncHandler(async (req, res) => {
  const { owner, search, vehicleType, page = 1, limit = 20 } = req.query;
  const query = {};

  if (req.user.role === "driver") {
    query.owner = req.user._id;
  } else {
    if (owner) query.owner = owner;
  }

  if (vehicleType) query.vehicleType = vehicleType;
  if (search) {
    const re = new RegExp(search, "i");
    query.$or = [{ registrationNumber: re }, { vehicleRef: re }, { make: re }, { model: re }];
  }

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await Vehicle.countDocuments(query);
  const vehicles = await Vehicle.find(query)
    .populate("owner", "fullName email")
    .sort({ createdAt: -1 })
    .skip(skip).limit(Number(limit));

  res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / Number(limit)), vehicles });
});

// GET /api/vehicles/:id
const getVehicle = asyncHandler(async (req, res) => {
  const vehicle = await Vehicle.findById(req.params.id)
    .populate("owner", "fullName email phone")
    .populate("registeredBy", "fullName email");

  if (!vehicle) return res.status(404).json({ success: false, message: "Vehicle not found" });
  if (req.user.role === "driver" && vehicle.owner._id.toString() !== req.user._id.toString()) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }
  res.json({ success: true, vehicle });
});

// GET /api/vehicles/stats
const getVehicleStats = asyncHandler(async (req, res) => {
  const total = await Vehicle.countDocuments();
  const active = await Vehicle.countDocuments({ isActive: true });
  const byType = await Vehicle.aggregate([
    { $group: { _id: "$vehicleType", count: { $sum: 1 } } },
  ]);
  const recent = await Vehicle.find()
    .populate("owner", "fullName")
    .sort({ createdAt: -1 }).limit(5);

  res.json({ success: true, stats: { total, active, byType }, recent });
});

// GET /api/vehicles/:id/verify
const verifyVehicle = asyncHandler(async (req, res) => {
  const vehicle = await Vehicle.findById(req.params.id);
  if (!vehicle) return res.status(404).json({ success: false, message: "Vehicle not found" });

  const result = await blockchainService.verifyRecord(vehicle.vehicleRef, canonicalVehicle(vehicle));
  res.json({ success: true, vehicleRef: vehicle.vehicleRef, ...result });
});

module.exports = { registerVehicle, getVehicles, getVehicle, getVehicleStats, verifyVehicle };

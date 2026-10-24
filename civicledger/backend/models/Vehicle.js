const mongoose = require("mongoose");

const VEHICLE_TYPES = ["Car", "Motorcycle", "Truck", "Bus", "Auto-Rickshaw", "Van", "Tractor", "Other"];
const FUEL_TYPES    = ["Petrol", "Diesel", "Electric", "CNG", "LPG", "Hybrid"];
const VEHICLE_COLORS = ["White", "Black", "Silver", "Grey", "Red", "Blue", "Green", "Yellow", "Orange", "Brown", "Other"];

const vehicleSchema = new mongoose.Schema(
  {
    registrationNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 20,
    },
    vehicleRef: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    registeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    make: { type: String, required: true, maxlength: 50, trim: true },
    model: { type: String, required: true, maxlength: 50, trim: true },
    year: {
      type: Number,
      required: true,
      min: 1900,
      max: new Date().getFullYear() + 1,
    },
    vehicleType: {
      type: String,
      enum: VEHICLE_TYPES,
      required: true,
    },
    fuelType: {
      type: String,
      enum: FUEL_TYPES,
      required: true,
    },
    color: {
      type: String,
      enum: VEHICLE_COLORS,
      required: true,
    },
    chassisNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 50,
    },
    engineNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: 50,
    },
    seatingCapacity: { type: Number, min: 1, max: 200 },
    registrationDate: { type: Date, required: true },
    fitnessExpiryDate: { type: Date },
    insuranceRef: { type: String },
    isActive: { type: Boolean, default: true },
    notes: { type: String, maxlength: 500 },
    version: { type: Number, default: 0 },
    // Blockchain
    blockchainStatus: {
      type: String,
      enum: ["not_submitted", "pending", "confirmed", "failed"],
      default: "not_submitted",
    },
    blockchainTxHash: { type: String },
    blockchainBlock: { type: Number },
    blockchainError: { type: String },
    blockchainRetries: { type: Number, default: 0 },
    lastBlockchainAttempt: { type: Date },
  },
  { timestamps: true }
);

vehicleSchema.index({ registrationNumber: 1 }, { unique: true });
vehicleSchema.index({ owner: 1 });
vehicleSchema.index({ vehicleRef: 1 }, { unique: true });

module.exports = mongoose.model("Vehicle", vehicleSchema);

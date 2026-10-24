require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("../models/User");
const License = require("../models/License");
const Vehicle = require("../models/Vehicle");
const InsurancePolicy = require("../models/InsurancePolicy");
const TrafficViolation = require("../models/TrafficViolation");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/civicledger";

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log("✓ Connected to MongoDB\n");

  // Clear existing demo data
  await User.deleteMany({});
  await License.deleteMany({});
  await Vehicle.deleteMany({});
  await InsurancePolicy.deleteMany({});
  await TrafficViolation.deleteMany({});
  console.log("✓ Cleared existing data\n");

  // ─── Create users ────────────────────────────────────────────
  const users = await User.create([
    {
      fullName: "System Administrator",
      email: "admin@civicledger.dev",
      password: "Admin@1234",
      role: "admin",
      department: "IT Administration",
      employeeId: "EMP-0001",
    },
    {
      fullName: "Rajesh Kumar",
      email: "licensing@civicledger.dev",
      password: "License@1234",
      role: "licensing_authority",
      department: "Regional Transport Office",
      employeeId: "EMP-0002",
    },
    {
      fullName: "Priya Sharma",
      email: "insurance@civicledger.dev",
      password: "Insure@1234",
      role: "insurance_company",
      department: "National Insurance Company",
      employeeId: "EMP-0003",
    },
    {
      fullName: "Inspector Suresh Nair",
      email: "police@civicledger.dev",
      password: "Police@1234",
      role: "traffic_police",
      department: "Traffic Police Division",
      employeeId: "EMP-0004",
    },
    {
      fullName: "Amit Verma",
      email: "driver1@civicledger.dev",
      password: "Driver@1234",
      role: "driver",
      phone: "+91-9876543210",
    },
    {
      fullName: "Sneha Patel",
      email: "driver2@civicledger.dev",
      password: "Driver@1234",
      role: "driver",
      phone: "+91-9876543211",
    },
    {
      fullName: "Ravi Mehta",
      email: "driver3@civicledger.dev",
      password: "Driver@1234",
      role: "driver",
      phone: "+91-9876543212",
    },
  ]);

  const [admin, licensing, insurance, police, driver1, driver2, driver3] = users;
  console.log("✓ Created 7 demo users");

  // ─── Create licenses ──────────────────────────────────────────
  const now = new Date();
  const past = (y) => new Date(now.getFullYear() - y, now.getMonth(), now.getDate());
  const future = (y, m = 0) => new Date(now.getFullYear() + y, now.getMonth() + m, now.getDate());

  const licenses = await License.create([
    {
      licenseRef: "LIC-2022-0001",
      driver: driver1._id,
      issuedBy: licensing._id,
      category: ["LMV", "MCWG"],
      status: "active",
      issueDate: past(2),
      expiryDate: future(3),
      bloodGroup: "B+",
      address: "12, Gandhi Nagar, Mumbai, Maharashtra - 400001",
      dateOfBirth: new Date("1992-05-15"),
      testScore: 88,
      restrictions: "None",
      version: 0,
      blockchainStatus: "not_submitted",
      history: [{
        action: "ISSUED", newStatus: "active",
        notes: "Initial license issuance — Demo seed data",
        performedBy: licensing._id, performedAt: past(2),
      }],
    },
    {
      licenseRef: "LIC-2023-0001",
      driver: driver2._id,
      issuedBy: licensing._id,
      category: ["LMV"],
      status: "active",
      issueDate: past(1),
      expiryDate: future(4),
      bloodGroup: "A+",
      address: "45, Nehru Street, Chennai, Tamil Nadu - 600001",
      dateOfBirth: new Date("1995-11-22"),
      testScore: 92,
      restrictions: "None",
      version: 0,
      blockchainStatus: "not_submitted",
      history: [{
        action: "ISSUED", newStatus: "active",
        performedBy: licensing._id, performedAt: past(1),
      }],
    },
    {
      licenseRef: "LIC-2019-0003",
      driver: driver3._id,
      issuedBy: licensing._id,
      category: ["LMV", "HMV"],
      status: "expired",
      issueDate: past(5),
      expiryDate: past(0),
      bloodGroup: "O+",
      address: "78, MG Road, Bangalore, Karnataka - 560001",
      dateOfBirth: new Date("1985-03-10"),
      testScore: 75,
      restrictions: "Corrective lenses required",
      version: 0,
      blockchainStatus: "not_submitted",
      history: [{
        action: "ISSUED", newStatus: "active",
        performedBy: licensing._id, performedAt: past(5),
      }],
    },
  ]);
  console.log("✓ Created 3 demo licenses");

  // ─── Create vehicles ──────────────────────────────────────────
  const vehicles = await Vehicle.create([
    {
      vehicleRef: "VEH-2022-0001",
      registrationNumber: "MH-01-AB-1234",
      owner: driver1._id,
      registeredBy: licensing._id,
      make: "Maruti Suzuki", model: "Swift Dzire",
      year: 2021, vehicleType: "Car", fuelType: "Petrol", color: "White",
      chassisNumber: "MA3FJEB1S00123456",
      engineNumber: "K12N1234567",
      seatingCapacity: 5,
      registrationDate: past(2),
      fitnessExpiryDate: future(5),
      version: 0,
      blockchainStatus: "not_submitted",
    },
    {
      vehicleRef: "VEH-2023-0001",
      registrationNumber: "TN-09-CD-5678",
      owner: driver2._id,
      registeredBy: licensing._id,
      make: "Honda", model: "City",
      year: 2022, vehicleType: "Car", fuelType: "Petrol", color: "Silver",
      chassisNumber: "MRHGM6650NP654321",
      engineNumber: "L15Z1654321",
      seatingCapacity: 5,
      registrationDate: past(1),
      fitnessExpiryDate: future(6),
      version: 0,
      blockchainStatus: "not_submitted",
    },
    {
      vehicleRef: "VEH-2021-0003",
      registrationNumber: "KA-03-EF-9012",
      owner: driver3._id,
      registeredBy: licensing._id,
      make: "Bajaj", model: "Pulsar 150",
      year: 2020, vehicleType: "Motorcycle", fuelType: "Petrol", color: "Black",
      chassisNumber: "MD2DHDHZZSCM12345",
      engineNumber: "DHDHSCM12345",
      seatingCapacity: 2,
      registrationDate: past(3),
      fitnessExpiryDate: future(2),
      version: 0,
      blockchainStatus: "not_submitted",
    },
  ]);
  console.log("✓ Created 3 demo vehicles");

  // ─── Create insurance policies ────────────────────────────────
  const policies = await InsurancePolicy.create([
    {
      policyRef: "INS-2022-0001",
      policyNumber: "NIC/2022/CAR/001234",
      vehicle: vehicles[0]._id,
      vehicleRef: vehicles[0].vehicleRef,
      policyHolder: driver1._id,
      issuedBy: insurance._id,
      insurerName: "National Insurance Company",
      coverageType: ["Comprehensive", "Personal Accident"],
      coverageAmount: 500000,
      premiumAmount: 12500,
      startDate: past(1),
      expiryDate: future(0, 2), // expiring in 2 months
      status: "active",
      version: 0,
      blockchainStatus: "not_submitted",
      history: [{
        action: "ISSUED", newStatus: "active",
        performedBy: insurance._id, performedAt: past(1),
      }],
    },
    {
      policyRef: "INS-2023-0001",
      policyNumber: "HDFC/2023/CAR/005678",
      vehicle: vehicles[1]._id,
      vehicleRef: vehicles[1].vehicleRef,
      policyHolder: driver2._id,
      issuedBy: insurance._id,
      insurerName: "HDFC ERGO General Insurance",
      coverageType: ["Comprehensive", "Zero Depreciation"],
      coverageAmount: 750000,
      premiumAmount: 18000,
      startDate: past(1),
      expiryDate: future(1),
      status: "active",
      version: 0,
      blockchainStatus: "not_submitted",
      history: [{
        action: "ISSUED", newStatus: "active",
        performedBy: insurance._id, performedAt: past(1),
      }],
    },
    {
      policyRef: "INS-2020-0003",
      policyNumber: "UIIC/2020/BIKE/009012",
      vehicle: vehicles[2]._id,
      vehicleRef: vehicles[2].vehicleRef,
      policyHolder: driver3._id,
      issuedBy: insurance._id,
      insurerName: "United India Insurance",
      coverageType: ["Third Party"],
      coverageAmount: 150000,
      premiumAmount: 3500,
      startDate: past(3),
      expiryDate: past(1), // already expired
      status: "expired",
      version: 0,
      blockchainStatus: "not_submitted",
      history: [{
        action: "ISSUED", newStatus: "active",
        performedBy: insurance._id, performedAt: past(3),
      }],
    },
  ]);
  console.log("✓ Created 3 demo insurance policies");

  // ─── Create violations ────────────────────────────────────────
  await TrafficViolation.create([
    {
      violationRef: "VIO-2024-0001",
      vehicle: vehicles[0]._id,
      vehicleRef: vehicles[0].vehicleRef,
      registrationNumber: vehicles[0].registrationNumber,
      driver: driver1._id,
      licenseRef: licenses[0].licenseRef,
      recordedBy: police._id,
      category: "Overspeeding",
      description: "Vehicle detected at 87 km/h in a 60 km/h zone. Speed camera evidence attached.",
      location: "Western Express Highway, Mumbai near Andheri flyover",
      violationDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      fineAmount: 2000,
      status: "pending",
      evidenceRef: "CAM-EVIDENCE-2024-0001",
      version: 0,
      blockchainStatus: "not_submitted",
      history: [{
        action: "RECORDED", newStatus: "pending",
        performedBy: police._id,
        performedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      }],
    },
    {
      violationRef: "VIO-2024-0002",
      vehicle: vehicles[1]._id,
      vehicleRef: vehicles[1].vehicleRef,
      registrationNumber: vehicles[1].registrationNumber,
      driver: driver2._id,
      licenseRef: licenses[1].licenseRef,
      recordedBy: police._id,
      category: "Signal Violation",
      description: "Vehicle crossed red signal at Anna Salai junction. CCTV evidence confirmed.",
      location: "Anna Salai & Cathedral Road Junction, Chennai",
      violationDate: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
      fineAmount: 1000,
      status: "paid",
      evidenceRef: "CCTV-EVIDENCE-2024-0002",
      paymentRef: "PAY-SEED-0002",
      version: 1,
      blockchainStatus: "not_submitted",
      history: [
        {
          action: "RECORDED", newStatus: "pending",
          performedBy: police._id,
          performedAt: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
        },
        {
          action: "PAID", newStatus: "paid",
          notes: "Fine paid online — Demo seed data",
          performedBy: driver2._id,
          performedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
        },
      ],
    },
    {
      violationRef: "VIO-2024-0003",
      vehicle: vehicles[2]._id,
      vehicleRef: vehicles[2].vehicleRef,
      registrationNumber: vehicles[2].registrationNumber,
      driver: driver3._id,
      licenseRef: licenses[2].licenseRef,
      recordedBy: police._id,
      category: "Invalid Insurance",
      description: "Vehicle operating with expired insurance policy. Policy expired 1 month ago.",
      location: "MG Road, Bangalore",
      violationDate: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      fineAmount: 2000,
      status: "disputed",
      evidenceRef: "INS-EXPIRED-2024-0003",
      disputeReason: "Owner claims insurance was renewed. Verification pending.",
      version: 1,
      blockchainStatus: "not_submitted",
      history: [
        {
          action: "RECORDED", newStatus: "pending",
          performedBy: police._id,
          performedAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
        },
        {
          action: "DISPUTED", previousStatus: "pending", newStatus: "disputed",
          notes: "Driver filed dispute",
          performedBy: driver3._id,
          performedAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
        },
      ],
    },
  ]);
  console.log("✓ Created 3 demo violations\n");

  console.log("═══════════════════════════════════════════════════════");
  console.log("  CivicLedger Demo Data Seeded Successfully");
  console.log("═══════════════════════════════════════════════════════\n");
  console.log("  ⚠️  DEVELOPMENT-ONLY CREDENTIALS — DO NOT USE IN PRODUCTION\n");
  console.log("  Role                  Email                          Password");
  console.log("  ───────────────────── ───────────────────────────── ─────────────");
  console.log("  Admin                 admin@civicledger.dev          Admin@1234");
  console.log("  Licensing Authority   licensing@civicledger.dev      License@1234");
  console.log("  Insurance Company     insurance@civicledger.dev      Insure@1234");
  console.log("  Traffic Police        police@civicledger.dev         Police@1234");
  console.log("  Driver 1              driver1@civicledger.dev        Driver@1234");
  console.log("  Driver 2              driver2@civicledger.dev        Driver@1234");
  console.log("  Driver 3              driver3@civicledger.dev        Driver@1234");
  console.log("\n═══════════════════════════════════════════════════════\n");

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});

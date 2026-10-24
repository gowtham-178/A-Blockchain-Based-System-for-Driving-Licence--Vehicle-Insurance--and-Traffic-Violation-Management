require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");

const { errorHandler, notFound } = require("./middleware/errorHandler");
const blockchainService = require("./services/blockchainService");

// ─── Routes ──────────────────────────────────────────────────
const authRoutes       = require("./routes/auth");
const userRoutes       = require("./routes/users");
const licenseRoutes    = require("./routes/licenses");
const vehicleRoutes    = require("./routes/vehicles");
const insuranceRoutes  = require("./routes/insurance");
const violationRoutes  = require("./routes/violations");
const blockchainRoutes = require("./routes/blockchain");
const dashboardRoutes  = require("./routes/dashboard");

const app = express();

// ─── Security middleware ──────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

// ─── Rate limiting ────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000"),
  max:      parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "200"),
  message:  { success: false, message: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders:   false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: "Too many authentication attempts. Try again in 15 minutes." },
});

app.use(limiter);

// ─── Body parsing & logging ───────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("dev"));
}

// ─── Health check ─────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "CivicLedger API",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    blockchain: blockchainService.isAvailable() ? "connected" : "unavailable",
  });
});

// ─── API routes ───────────────────────────────────────────────
app.use("/api/auth",       authLimiter, authRoutes);
app.use("/api/users",      userRoutes);
app.use("/api/licenses",   licenseRoutes);
app.use("/api/vehicles",   vehicleRoutes);
app.use("/api/insurance",  insuranceRoutes);
app.use("/api/violations", violationRoutes);
app.use("/api/blockchain", blockchainRoutes);
app.use("/api/dashboard",  dashboardRoutes);

// ─── Error handling ───────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Database connection ──────────────────────────────────────
const connectDB = async () => {
  try {
    const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/civicledger";
    await mongoose.connect(uri);
    console.log(`[MongoDB] ✓ Connected to ${uri}`);
  } catch (err) {
    console.error("[MongoDB] Connection failed:", err.message);
    process.exit(1);
  }
};

// ─── Start ────────────────────────────────────────────────────
const startServer = async () => {
  await connectDB();
  await blockchainService.initialize();

  const PORT = process.env.PORT || 5000;
  const server = app.listen(PORT, () => {
    console.log("\n=============================================");
    console.log(`  CivicLedger API running on port ${PORT}`);
    console.log(`  Environment : ${process.env.NODE_ENV || "development"}`);
    console.log(`  Blockchain  : ${blockchainService.isAvailable() ? "✓ connected" : "✗ unavailable"}`);
    console.log("=============================================\n");
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    server.close(() => {
      mongoose.connection.close(false, () => {
        console.log("[Server] Gracefully shut down");
        process.exit(0);
      });
    });
  });
};

if (process.env.NODE_ENV !== "test") {
  startServer();
}

module.exports = { app, connectDB };

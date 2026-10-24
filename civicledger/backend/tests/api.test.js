require("dotenv").config({ path: __dirname + "/../.env" });
const mongoose = require("mongoose");
const request = require("supertest");
const { app, connectDB } = require("../server");

let authToken;
let adminToken;
let licenseId;

const MONGODB_TEST_URI =
  process.env.MONGODB_TEST_URI ||
  "mongodb://localhost:27017/civicledger_test";

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.MONGODB_URI = MONGODB_TEST_URI;
  process.env.JWT_SECRET = "test_jwt_secret_civicledger";
  await mongoose.connect(MONGODB_TEST_URI);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

describe("Authentication", () => {
  const adminData = {
    fullName: "Test Admin",
    email: "testadmin@test.com",
    password: "Admin@12345",
  };

  it("POST /api/auth/register — creates a driver account", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ fullName: "Test Driver", email: "testdriver@test.com", password: "Driver@1234" });
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user.role).toBe("driver");
    expect(res.body.token).toBeDefined();
    authToken = res.body.token;
  });

  it("POST /api/auth/register — rejects short password", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ fullName: "Bad", email: "bad@test.com", password: "123" });
    expect(res.statusCode).toBe(400);
  });

  it("POST /api/auth/login — returns token on success", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "testdriver@test.com", password: "Driver@1234" });
    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it("POST /api/auth/login — rejects wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "testdriver@test.com", password: "WrongPassword" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/auth/me — returns authenticated user", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.user.email).toBe("testdriver@test.com");
  });

  it("GET /api/auth/me — rejects unauthenticated request", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.statusCode).toBe(401);
  });
});

describe("User Management (Admin)", () => {
  let createdLicensingUserId;

  it("POST /api/users — admin creates licensing authority", async () => {
    // First create admin via register (seeded scenario not available in test)
    // We'll manually create via User model
    const User = require("../models/User");
    const admin = await User.create({
      fullName: "Admin Test",
      email: "admin_test@test.com",
      password: "Admin@1234",
      role: "admin",
    });

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin_test@test.com", password: "Admin@1234" });
    adminToken = loginRes.body.token;

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        fullName: "Test Licensing",
        email: "testlicensing@test.com",
        password: "License@1234",
        role: "licensing_authority",
      });
    expect(res.statusCode).toBe(201);
    expect(res.body.user.role).toBe("licensing_authority");
    createdLicensingUserId = res.body.user._id;
  });

  it("POST /api/users — driver cannot create users", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ fullName: "Bad", email: "bad@test.com", password: "Test@1234", role: "admin" });
    expect(res.statusCode).toBe(403);
  });

  it("GET /api/users — admin can list all users", async () => {
    const res = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.users).toBeDefined();
    expect(Array.isArray(res.body.users)).toBe(true);
  });
});

describe("License Management", () => {
  let licensingToken;
  let driverId;

  beforeAll(async () => {
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "testlicensing@test.com", password: "License@1234" });
    licensingToken = loginRes.body.token;

    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${authToken}`);
    driverId = meRes.body.user._id;
  });

  it("POST /api/licenses — licensing authority can issue license", async () => {
    const res = await request(app)
      .post("/api/licenses")
      .set("Authorization", `Bearer ${licensingToken}`)
      .send({
        driver: driverId,
        category: ["LMV"],
        issueDate: new Date().toISOString(),
        expiryDate: new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString(),
        bloodGroup: "O+",
        address: "Test Address, City 123456",
        dateOfBirth: new Date("1990-01-01").toISOString(),
        testScore: 85,
      });
    expect(res.statusCode).toBe(201);
    expect(res.body.license.licenseRef).toMatch(/^LIC-\d{4}-\d{4}$/);
    licenseId = res.body.license._id;
  });

  it("POST /api/licenses — driver cannot issue license", async () => {
    const res = await request(app)
      .post("/api/licenses")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ driver: driverId, category: ["LMV"] });
    expect(res.statusCode).toBe(403);
  });

  it("GET /api/licenses — returns license list", async () => {
    const res = await request(app)
      .get("/api/licenses")
      .set("Authorization", `Bearer ${licensingToken}`);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.licenses)).toBe(true);
  });

  it("GET /api/licenses/:id — returns license details", async () => {
    const res = await request(app)
      .get(`/api/licenses/${licenseId}`)
      .set("Authorization", `Bearer ${licensingToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.license._id).toBe(licenseId);
  });

  it("PUT /api/licenses/:id/status — licensing can suspend license", async () => {
    const res = await request(app)
      .put(`/api/licenses/${licenseId}/status`)
      .set("Authorization", `Bearer ${licensingToken}`)
      .send({ status: "suspended", notes: "Test suspension" });
    expect(res.statusCode).toBe(200);
    expect(res.body.license.status).toBe("suspended");
  });

  it("PUT /api/licenses/:id/renew — licensing can renew license", async () => {
    const newExpiry = new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000).toISOString();
    const res = await request(app)
      .put(`/api/licenses/${licenseId}/renew`)
      .set("Authorization", `Bearer ${licensingToken}`)
      .send({ expiryDate: newExpiry, notes: "Test renewal" });
    expect(res.statusCode).toBe(200);
    expect(res.body.license.status).toBe("active");
  });
});

describe("Blockchain Integration", () => {
  it("GET /api/blockchain/status — returns availability", async () => {
    const res = await request(app)
      .get("/api/blockchain/status")
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.statusCode).toBe(200);
    expect(res.body.available).toBeDefined();
  });

  it("GET /api/blockchain/verify/:ref — returns unavailable or result", async () => {
    const res = await request(app)
      .get("/api/blockchain/verify/LIC-TEST-0001")
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.statusCode).toBe(200);
    // Either available:false (no blockchain running) or exists:false
    expect(res.body.success).toBe(true);
  });
});

describe("Health Check", () => {
  it("GET /health — returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

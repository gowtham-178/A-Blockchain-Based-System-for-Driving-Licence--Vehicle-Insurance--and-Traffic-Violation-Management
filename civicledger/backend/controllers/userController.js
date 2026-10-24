const User = require("../models/User");
const { asyncHandler } = require("../middleware/errorHandler");
const auditService = require("../services/auditService");

const PRIVILEGED_ROLES = ["admin", "licensing_authority", "insurance_company", "traffic_police"];

// GET /api/users  (admin)
const getUsers = asyncHandler(async (req, res) => {
  const { role, isActive, search, page = 1, limit = 20 } = req.query;
  const query = {};
  if (role)     query.role = role;
  if (isActive !== undefined) query.isActive = isActive === "true";
  if (search) {
    const re = new RegExp(search, "i");
    query.$or = [{ fullName: re }, { email: re }];
  }

  const skip  = (Number(page) - 1) * Number(limit);
  const total = await User.countDocuments(query);
  const users = await User.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit));

  res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / Number(limit)), users });
});

// GET /api/users/:id
const getUser = asyncHandler(async (req, res) => {
  // Drivers can only see their own profile
  if (req.user.role === "driver" && req.user._id.toString() !== req.params.id) {
    return res.status(403).json({ success: false, message: "Access denied" });
  }
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: "User not found" });
  res.json({ success: true, user });
});

// POST /api/users  (admin creates privileged accounts)
const createUser = asyncHandler(async (req, res) => {
  const { fullName, email, password, role, phone, department, employeeId } = req.body;

  // Only allow privileged roles through this endpoint
  if (!PRIVILEGED_ROLES.includes(role)) {
    return res.status(400).json({ success: false, message: "Use /register for driver accounts" });
  }

  const user = await User.create({
    fullName,
    email,
    password,
    role,
    phone,
    department,
    employeeId,
    createdBy: req.user._id,
  });

  await auditService.log({
    eventType: "USER_CREATED",
    recordType: "USER",
    actor: req.user._id,
    actorRole: req.user.role,
    actorEmail: req.user.email,
    description: `Admin created ${role} account: ${email}`,
    ipAddress: req.ip,
  });

  res.status(201).json({ success: true, message: "User created", user });
});

// PUT /api/users/:id (admin)
const updateUser = asyncHandler(async (req, res) => {
  const { fullName, phone, address, department, employeeId, isActive, role } = req.body;
  const allowed = {};
  if (fullName    !== undefined) allowed.fullName    = fullName;
  if (phone       !== undefined) allowed.phone       = phone;
  if (address     !== undefined) allowed.address     = address;
  if (department  !== undefined) allowed.department  = department;
  if (employeeId  !== undefined) allowed.employeeId  = employeeId;
  if (isActive    !== undefined) allowed.isActive    = isActive;
  if (role        !== undefined) allowed.role        = role;

  const user = await User.findByIdAndUpdate(req.params.id, allowed, {
    new: true,
    runValidators: true,
  });
  if (!user) return res.status(404).json({ success: false, message: "User not found" });

  await auditService.log({
    eventType: "USER_UPDATED",
    recordType: "USER",
    actor: req.user._id,
    actorRole: req.user.role,
    description: `User ${user.email} updated`,
  });

  res.json({ success: true, message: "User updated", user });
});

// DELETE /api/users/:id → deactivate (soft delete)
const deactivateUser = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true }
  );
  if (!user) return res.status(404).json({ success: false, message: "User not found" });

  await auditService.log({
    eventType: "USER_DEACTIVATED",
    recordType: "USER",
    actor: req.user._id,
    actorRole: req.user.role,
    description: `User ${user.email} deactivated`,
  });

  res.json({ success: true, message: "User deactivated", user });
});

// GET /api/users/drivers  — list all drivers (for licensing authority)
const getDrivers = asyncHandler(async (req, res) => {
  const { search, page = 1, limit = 20 } = req.query;
  const query = { role: "driver", isActive: true };
  if (search) {
    const re = new RegExp(search, "i");
    query.$or = [{ fullName: re }, { email: re }];
  }
  const skip  = (Number(page) - 1) * Number(limit);
  const total = await User.countDocuments(query);
  const users = await User.find(query).sort({ fullName: 1 }).skip(skip).limit(Number(limit));
  res.json({ success: true, total, users });
});

module.exports = { getUsers, getUser, createUser, updateUser, deactivateUser, getDrivers };

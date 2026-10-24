const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { asyncHandler } = require("../middleware/errorHandler");
const auditService = require("../services/auditService");

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "7d" });

// POST /api/auth/register
const register = asyncHandler(async (req, res) => {
  const { fullName, email, password, phone } = req.body;

  // Public registration only creates drivers
  const user = await User.create({
    fullName,
    email,
    password,
    phone,
    role: "driver",
  });

  await auditService.log({
    eventType: "USER_CREATED",
    recordType: "USER",
    actor: user._id,
    actorRole: user.role,
    actorEmail: user.email,
    description: `Driver self-registered: ${user.email}`,
    ipAddress: req.ip,
  });

  const token = signToken(user._id);
  res.status(201).json({
    success: true,
    message: "Account created successfully",
    token,
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    },
  });
});

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email and password are required" });
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
  if (!user) {
    return res.status(401).json({ success: false, message: "Invalid email or password" });
  }
  if (!user.isActive) {
    return res.status(401).json({ success: false, message: "Account is deactivated. Contact an administrator." });
  }

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    await auditService.log({
      eventType: "AUTH_FAILED",
      recordType: "AUTH",
      actorEmail: email,
      description: `Failed login attempt for ${email}`,
      ipAddress: req.ip,
    });
    return res.status(401).json({ success: false, message: "Invalid email or password" });
  }

  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  await auditService.log({
    eventType: "AUTH_LOGIN",
    recordType: "AUTH",
    actor: user._id,
    actorRole: user.role,
    actorEmail: user.email,
    description: `User logged in: ${user.email}`,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
  });

  const token = signToken(user._id);
  res.status(200).json({
    success: true,
    message: "Login successful",
    token,
    user: {
      id: user._id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      lastLogin: user.lastLogin,
    },
  });
});

// GET /api/auth/me
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  res.json({ success: true, user });
});

// PUT /api/auth/profile
const updateProfile = asyncHandler(async (req, res) => {
  const { fullName, phone, address } = req.body;
  const allowed = {};
  if (fullName) allowed.fullName = fullName;
  if (phone   ) allowed.phone    = phone;
  if (address ) allowed.address  = address;

  const user = await User.findByIdAndUpdate(req.user._id, allowed, {
    new: true,
    runValidators: true,
  });
  res.json({ success: true, message: "Profile updated", user });
});

// PUT /api/auth/change-password
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select("+password");
  if (!(await user.comparePassword(currentPassword))) {
    return res.status(400).json({ success: false, message: "Current password is incorrect" });
  }

  user.password = newPassword;
  await user.save();
  res.json({ success: true, message: "Password changed successfully" });
});

module.exports = { register, login, getMe, updateProfile, changePassword };

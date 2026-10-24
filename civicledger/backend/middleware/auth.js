const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Middleware: authenticate JWT
const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    }
    if (!token) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("+password");

    if (!user) {
      return res.status(401).json({ success: false, message: "User not found" });
    }
    if (!user.isActive) {
      return res.status(401).json({ success: false, message: "Account is deactivated" });
    }
    if (user.passwordChangedAfter(decoded.iat)) {
      return res.status(401).json({ success: false, message: "Password changed. Please log in again." });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ success: false, message: "Session expired. Please log in again." });
    }
    return res.status(401).json({ success: false, message: "Invalid authentication token" });
  }
};

// Middleware: restrict to specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Authentication required" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(" or ")}`,
      });
    }
    next();
  };
};

// Convenience role groups
const ADMIN       = ["admin"];
const LICENSING   = ["admin", "licensing_authority"];
const INSURANCE   = ["admin", "insurance_company"];
const POLICE      = ["admin", "traffic_police"];
const ANY_STAFF   = ["admin", "licensing_authority", "insurance_company", "traffic_police"];
const ANY_USER    = ["admin", "licensing_authority", "insurance_company", "traffic_police", "driver"];

module.exports = { protect, authorize, ADMIN, LICENSING, INSURANCE, POLICE, ANY_STAFF, ANY_USER };

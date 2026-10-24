const express = require("express");
const router  = express.Router();
const {
  recordViolation, getViolations, getViolation, updateViolationStatus,
  getViolationStats, verifyViolation, payViolation,
} = require("../controllers/violationController");
const { protect, authorize, POLICE, ANY_USER, ANY_STAFF } = require("../middleware/auth");

router.use(protect);
router.get("/stats",          authorize(...POLICE),    getViolationStats);
router.post("/",              authorize(...POLICE),    recordViolation);
router.get("/",               authorize(...ANY_USER),  getViolations);
router.get("/:id",            authorize(...ANY_USER),  getViolation);
router.put("/:id/status",     authorize(...POLICE),    updateViolationStatus);
router.get("/:id/verify",     authorize(...ANY_USER),  verifyViolation);
router.post("/:id/pay",       authorize(...ANY_USER),  payViolation);

module.exports = router;

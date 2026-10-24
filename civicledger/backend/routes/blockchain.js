const express = require("express");
const router  = express.Router();
const {
  getBlockchainStatus, verifyByRef, getTransactions, getAuditLog, getBlockchainStats,
} = require("../controllers/blockchainController");
const { protect, authorize, ANY_USER, ANY_STAFF, ADMIN } = require("../middleware/auth");

router.use(protect);
router.get("/status",              authorize(...ANY_USER),  getBlockchainStatus);
router.get("/stats",               authorize(...ANY_STAFF), getBlockchainStats);
router.get("/verify/:ref",         authorize(...ANY_USER),  verifyByRef);
router.get("/transactions",        authorize(...ANY_STAFF), getTransactions);
router.get("/audit",               authorize(...ANY_STAFF), getAuditLog);

module.exports = router;

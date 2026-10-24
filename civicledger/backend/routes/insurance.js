const express = require("express");
const router  = express.Router();
const {
  issuePolicy, getPolicies, getPolicy, updatePolicyStatus, renewPolicy,
  verifyPolicy, getInsuranceStats,
} = require("../controllers/insuranceController");
const { protect, authorize, INSURANCE, ANY_USER } = require("../middleware/auth");

router.use(protect);
router.get("/stats",             authorize(...INSURANCE), getInsuranceStats);
router.post("/",                 authorize(...INSURANCE), issuePolicy);
router.get("/",                  authorize(...ANY_USER),  getPolicies);
router.get("/:id",               authorize(...ANY_USER),  getPolicy);
router.put("/:id/status",        authorize(...INSURANCE), updatePolicyStatus);
router.put("/:id/renew",         authorize(...INSURANCE), renewPolicy);
router.get("/:id/verify",        authorize(...ANY_USER),  verifyPolicy);

module.exports = router;

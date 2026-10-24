const express = require("express");
const router = express.Router();
const {
  issueLicense, getLicenses, getLicense, getLicenseByRef,
  updateLicenseStatus, renewLicense, verifyLicense, getLicenseStats,
} = require("../controllers/licenseController");
const { protect, authorize, LICENSING, ANY_STAFF, ANY_USER } = require("../middleware/auth");

router.use(protect);

router.get("/stats",     authorize(...LICENSING),  getLicenseStats);
router.get("/ref/:ref",  authorize(...ANY_USER),   getLicenseByRef);
router.post("/",         authorize(...LICENSING),  issueLicense);
router.get("/",          authorize(...ANY_USER),   getLicenses);
router.get("/:id",       authorize(...ANY_USER),   getLicense);
router.put("/:id/status", authorize(...LICENSING), updateLicenseStatus);
router.put("/:id/renew",  authorize(...LICENSING), renewLicense);
router.get("/:id/verify", authorize(...ANY_USER),  verifyLicense);

module.exports = router;

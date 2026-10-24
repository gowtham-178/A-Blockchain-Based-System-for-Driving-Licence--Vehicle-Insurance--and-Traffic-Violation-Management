const express = require("express");
const router  = express.Router();
const { adminDashboard, driverDashboard } = require("../controllers/dashboardController");
const { protect, authorize, ADMIN, ANY_STAFF } = require("../middleware/auth");

router.use(protect);
router.get("/admin",  authorize(...ANY_STAFF), adminDashboard);
router.get("/driver", authorize("driver"),     driverDashboard);

module.exports = router;

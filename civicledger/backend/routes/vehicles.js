const express = require("express");
const router  = express.Router();
const { registerVehicle, getVehicles, getVehicle, getVehicleStats, verifyVehicle } = require("../controllers/vehicleController");
const { protect, authorize, LICENSING, ANY_USER } = require("../middleware/auth");

router.use(protect);
router.get("/stats",         authorize(...LICENSING),    getVehicleStats);
router.post("/",             authorize(...LICENSING),    registerVehicle);
router.get("/",              authorize(...ANY_USER),     getVehicles);
router.get("/:id",           authorize(...ANY_USER),     getVehicle);
router.get("/:id/verify",    authorize(...ANY_USER),     verifyVehicle);

module.exports = router;

const express = require("express");
const router = express.Router();
const { getUsers, getUser, createUser, updateUser, deactivateUser, getDrivers } = require("../controllers/userController");
const { protect, authorize, ADMIN, LICENSING, ANY_STAFF } = require("../middleware/auth");

router.use(protect);

router.get("/drivers", authorize(...LICENSING), getDrivers);
router.get("/", authorize(...ADMIN), getUsers);
router.post("/", authorize(...ADMIN), createUser);
router.get("/:id", authorize(...ANY_STAFF, "driver"), getUser);
router.put("/:id", authorize(...ADMIN), updateUser);
router.delete("/:id", authorize(...ADMIN), deactivateUser);

module.exports = router;

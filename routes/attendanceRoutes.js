const express = require("express");
const router = express.Router();
const { getAttendance, saveAttendance } = require("../controllers/attendanceController");
const { protect, admin } = require("../middleware/authMiddleware");

router.route("/").post(protect, admin, saveAttendance);
router.route("/:internshipId").get(protect, admin, getAttendance);

module.exports = router;

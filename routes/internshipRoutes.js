const express = require("express");
const router = express.Router();
const {
  applyForInternship,
  getInternshipApplications,
  updateInternshipStatus,
  deleteInternshipApplication,
  getMyInternshipApplications,
} = require("../controllers/internshipController");
const { protect, admin } = require("../middleware/authMiddleware");

router.post("/apply", protect, applyForInternship);
router.get("/my-applications", protect, getMyInternshipApplications);

// Admin routes
router.get("/", protect, admin, getInternshipApplications);
router.patch("/:id/status", protect, admin, updateInternshipStatus);
router.put("/:id/status", protect, admin, updateInternshipStatus); // Keep PUT for compatibility
router.delete("/:id", protect, admin, deleteInternshipApplication);

module.exports = router;

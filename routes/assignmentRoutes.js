const express = require("express");
const router = express.Router();
const {
  submitAssignment,
  getSubmissionsByActivity,
  reviewAssignment
} = require("../controllers/assignmentController");
const { protect, admin, staff } = require("../middleware/authMiddleware");

// All routes are protected
router.use(protect);

// Student routes
router.post("/submit", submitAssignment);

// Admin routes
router.get("/:activityId", staff, getSubmissionsByActivity);
router.put("/:id/review", admin, reviewAssignment);

module.exports = router;

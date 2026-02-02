const express = require("express");
const router = express.Router();
const {
  createTask,
  getTasks,
  updateTask,
  deleteTask,
  submitTask,
  getSubmissions,
  evaluateSubmission,
  updateEligibility,
  getProgress,
} = require("../controllers/activityController");
const { protect, admin } = require("../middleware/authMiddleware");

// Task routes
router.route("/tasks")
  .post(protect, admin, createTask)
  .get(protect, getTasks);

router.route("/tasks/:id")
  .put(protect, admin, updateTask)
  .delete(protect, admin, deleteTask);

// Submission routes
router.route("/submissions")
  .post(protect, submitTask)
  .get(protect, getSubmissions);

router.route("/submissions/:id/evaluate")
  .put(protect, admin, evaluateSubmission);

// Progress/Eligibility routes
router.route("/progress/:internshipId")
  .get(protect, getProgress);

router.route("/progress/:internshipId/eligibility")
  .put(protect, admin, updateEligibility);

module.exports = router;

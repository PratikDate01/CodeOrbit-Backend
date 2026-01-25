const express = require("express");
const router = express.Router();
const {
  createApplication,
  getMyApplications,
  getApplications,
  updateApplicationStatus,
} = require("../controllers/applicationController");
const { protect, admin } = require("../middleware/authMiddleware");

router
  .route("/")
  .post(protect, createApplication)
  .get(protect, admin, getApplications);

router.get("/my-applications", protect, getMyApplications);

router.put("/:id/status", protect, admin, updateApplicationStatus);

module.exports = router;

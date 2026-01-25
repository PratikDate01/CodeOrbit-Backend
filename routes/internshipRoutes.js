const express = require("express");
const router = express.Router();
const {
  applyForInternship,
  getInternshipApplications,
  updateInternshipStatus,
  deleteInternshipApplication,
  getMyInternshipApplications,
  createInternshipOrder,
  verifyInternshipPayment,
  razorpayWebhook,
} = require("../controllers/internshipController");
const { protect, admin } = require("../middleware/authMiddleware");
const { contactLimiter } = require("../middleware/rateLimiter");

router.post("/", contactLimiter, protect, applyForInternship);
router.post("/webhook", razorpayWebhook);
router.post("/create-order", protect, createInternshipOrder);
router.post("/verify-payment", protect, verifyInternshipPayment);
router.get("/my-applications", protect, getMyInternshipApplications);

// Admin routes
router.get("/", protect, admin, getInternshipApplications);
router.put("/:id/status", protect, admin, updateInternshipStatus);
router.delete("/:id", protect, admin, deleteInternshipApplication);

module.exports = router;

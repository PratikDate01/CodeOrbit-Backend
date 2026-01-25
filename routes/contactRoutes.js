const express = require("express");
const router = express.Router();
const {
  submitContact,
  getContactMessages,
  deleteContactMessage,
  updateContactStatus,
} = require("../controllers/contactController");
const { protect, admin } = require("../middleware/authMiddleware");
const { contactLimiter } = require("../middleware/rateLimiter");

router.post("/", contactLimiter, submitContact);

// Admin routes
router.get("/", protect, admin, getContactMessages);
router.delete("/:id", protect, admin, deleteContactMessage);
router.put("/:id/status", protect, admin, updateContactStatus);

module.exports = router;

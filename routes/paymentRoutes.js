const express = require("express");
const router = express.Router();
const {
  validateCoupon,
  createOrder,
  verifyPayment,
  razorpayWebhook,
} = require("../controllers/paymentController");
const { protect } = require("../middleware/authMiddleware");

router.post("/validate-coupon", protect, validateCoupon);
router.post("/create-order", protect, createOrder);
router.post("/verify", protect, verifyPayment);
router.post("/webhook", razorpayWebhook);

module.exports = router;

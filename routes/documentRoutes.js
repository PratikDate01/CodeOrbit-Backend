const express = require("express");
const router = express.Router();
const { generateDocuments, getDocumentByVerificationId, generatePaymentSlip } = require("../controllers/documentController");
// Assuming there's a protect and admin middleware
const { protect, admin } = require("../middleware/authMiddleware");

// In some projects it might be different, let's check existing routes for middleware usage
router.post("/generate-offer-letter", protect, admin, generateDocuments);
router.post("/generate-payment-slip", protect, admin, generatePaymentSlip);
router.get("/verify/:verificationId", getDocumentByVerificationId);

module.exports = router;

const express = require("express");
const router = express.Router();
const { protect, admin } = require("../middleware/authMiddleware");
const { 
  generateOfferLetter, 
  generateCertificate, 
  generateLOC, 
  toggleVisibility, 
  getDocuments,
  getDocumentByVerificationId, 
  generatePaymentSlip 
} = require("../controllers/documentController");

router.post("/generate/offer-letter", protect, admin, generateOfferLetter);
router.post("/generate/certificate", protect, admin, generateCertificate);
router.post("/generate/loc", protect, admin, generateLOC);
router.patch("/visibility", protect, admin, toggleVisibility);
router.get("/application/:applicationId", protect, getDocuments);
router.post("/generate-payment-slip", protect, admin, generatePaymentSlip);
router.get("/verify/:verificationId", getDocumentByVerificationId);

module.exports = router;

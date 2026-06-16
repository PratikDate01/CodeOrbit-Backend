const express = require("express");
const router = express.Router();
const {
  getSystemHealth,
  getDataIntegrityReport,
  healDataIntegrity,
  getErrorLogs,
} = require("../controllers/systemController");
const { protect, admin } = require("../middleware/authMiddleware");

// All system routes require authentication and admin access
router.use(protect);
router.use(admin);

router.get("/health", getSystemHealth);
router.get("/integrity", getDataIntegrityReport);
router.post("/integrity/heal", healDataIntegrity);
router.get("/logs", getErrorLogs);

module.exports = router;

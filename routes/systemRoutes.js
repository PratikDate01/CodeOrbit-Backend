const express = require("express");
const router = express.Router();
const {
  getSystemHealth,
  getDataIntegrityReport,
  healDataIntegrity,
  getErrorLogs,
  getMaintenanceSettings,
  updateMaintenanceSettings,
} = require("../controllers/systemController");
const { protect, admin } = require("../middleware/authMiddleware");

// All system routes require authentication and admin access
router.use(protect);
router.use(admin);

router.get("/health", getSystemHealth);
router.get("/integrity", getDataIntegrityReport);
router.post("/integrity/heal", healDataIntegrity);
router.get("/logs", getErrorLogs);
router.get("/maintenance", getMaintenanceSettings);
router.put("/maintenance", updateMaintenanceSettings);

module.exports = router;

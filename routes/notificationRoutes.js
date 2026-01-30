const express = require("express");
const router = express.Router();
const {
  getNotifications,
  markAsRead,
  clearNotifications,
} = require("../controllers/notificationController");
const { protect } = require("../middleware/authMiddleware");

router.use(protect);

router.get("/", getNotifications);
router.delete("/", clearNotifications);
router.put("/:id/read", markAsRead);

module.exports = router;

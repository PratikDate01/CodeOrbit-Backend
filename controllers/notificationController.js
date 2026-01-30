const Notification = require("../models/Notification");
const asyncHandler = require("../middleware/asyncHandler");

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
const getNotifications = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ recipient: req.user._id }).sort("-createdAt");
  res.json(notifications);
});

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
const markAsRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findById(req.params.id);

  if (notification) {
    if (notification.recipient.toString() !== req.user._id.toString()) {
      res.status(401);
      throw new Error("Not authorized");
    }
    notification.isRead = true;
    await notification.save();
    res.json({ message: "Notification marked as read" });
  } else {
    res.status(404);
    throw new Error("Notification not found");
  }
});

// @desc    Clear all user notifications
// @route   DELETE /api/notifications
// @access  Private
const clearNotifications = asyncHandler(async (req, res) => {
  await Notification.deleteMany({ recipient: req.user._id });
  res.json({ message: "All notifications cleared" });
});

// Helper function to create notification
const createNotification = async (recipientId, title, message, type) => {
  try {
    await Notification.create({
      recipient: recipientId,
      title,
      message,
      type,
    });
  } catch (error) {
    console.error("Error creating notification:", error);
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  clearNotifications,
  createNotification,
};

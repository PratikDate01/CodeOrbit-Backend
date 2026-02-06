const User = require("../models/User");
const InternshipApplication = require("../models/InternshipApplication");
const Contact = require("../models/Contact");
const AuditLog = require("../models/AuditLog");
const asyncHandler = require("../middleware/asyncHandler");

// @desc    Get admin stats
// @route   GET /api/admin/stats
// @access  Private/Admin
const getStats = asyncHandler(async (req, res, next) => {
  console.log("Fetching admin stats - Start");
  
  console.log("Counting applications...");
  const totalApplications = await InternshipApplication.countDocuments();
  
  console.log("Counting messages...");
  const totalMessages = await Contact.countDocuments();
  
  console.log("Counting users...");
  const totalUsers = await User.countDocuments({ role: "client" });
  
  console.log("Counting pending reviews...");
  const pendingReviews = await InternshipApplication.countDocuments({ status: "New" });

  console.log("Aggregating applications by status...");
  const applicationsByStatus = await InternshipApplication.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  console.log("Fetching recent applications...");
  const recentApplications = await InternshipApplication.find()
    .sort({ createdAt: -1 })
    .limit(5);

  console.log("Stats fetched successfully:", {
    totalApplications,
    totalMessages,
    totalUsers,
    pendingReviews,
  });

  res.json({
    totalApplications,
    totalMessages,
    totalUsers,
    pendingReviews,
    applicationsByStatus,
    recentApplications,
  });
});

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private/Admin
const getUsers = asyncHandler(async (req, res, next) => {
  const { role, page = 1, limit = 100 } = req.query;
  const query = {};
  
  // Whitelist query parameters to prevent injection
  if (role) query.role = String(role);

  const users = await User.find(query)
    .select("-password")
    .limit(Number(limit))
    .skip((Number(page) - 1) * Number(limit))
    .sort({ createdAt: -1 });

  res.json(users);
});

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
const deleteUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (user) {
    if (user.role === "admin") {
      res.status(400);
      throw new Error("Cannot delete admin user");
    }
    await user.deleteOne();

    await AuditLog.create({
      admin: req.user._id,
      actionType: "DELETE_USER",
      targetType: "User",
      targetId: req.params.id,
      details: { name: user.name, email: user.email },
    });

    res.json({ message: "User removed" });
  } else {
    res.status(404);
    throw new Error("User not found");
  }
});

// @desc    Get audit logs
// @route   GET /api/admin/audit-logs
// @access  Private/Admin
const getAuditLogs = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 50 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const logs = await AuditLog.find()
    .populate("admin", "name email")
    .sort({ timestamp: -1 })
    .limit(Number(limit))
    .skip(skip);

  const total = await AuditLog.countDocuments();

  res.json({
    logs,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)),
    total,
  });
});

module.exports = {
  getStats,
  getUsers,
  deleteUser,
  getAuditLogs,
};

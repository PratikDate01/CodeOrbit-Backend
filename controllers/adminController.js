const User = require("../models/User");
const InternshipApplication = require("../models/InternshipApplication");
const Contact = require("../models/Contact");

// @desc    Get admin stats
// @route   GET /api/admin/stats
// @access  Private/Admin
const getStats = async (req, res, next) => {
  try {
    console.log("Fetching admin stats...");
    const totalApplications = await InternshipApplication.countDocuments();
    const totalMessages = await Contact.countDocuments();
    const totalUsers = await User.countDocuments({ role: "client" });
    const pendingReviews = await InternshipApplication.countDocuments({ status: "New" });

    const applicationsByStatus = await InternshipApplication.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

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
  } catch (error) {
    console.error("Error in getStats:", error);
    next(error);
  }
};

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private/Admin
const getUsers = async (req, res, next) => {
  try {
    const users = await User.find({}).select("-password");
    res.json(users);
  } catch (error) {
    next(error);
  }
};

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (user) {
      if (user.role === "admin") {
        res.status(400);
        throw new Error("Cannot delete admin user");
      }
      await user.deleteOne();
      res.json({ message: "User removed" });
    } else {
      res.status(404);
      throw new Error("User not found");
    }
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStats,
  getUsers,
  deleteUser,
};

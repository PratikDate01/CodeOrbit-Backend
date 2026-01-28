const User = require("../models/User");
const InternshipApplication = require("../models/InternshipApplication");
const Contact = require("../models/Contact");

// @desc    Get admin stats
// @route   GET /api/admin/stats
// @access  Private/Admin
const getStats = async (req, res, next) => {
  try {
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
  } catch (error) {
    console.error("Error in getStats Controller:", error.message);
    console.error(error.stack);
    next(error);
  }
};

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private/Admin
const getUsers = async (req, res, next) => {
  try {
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

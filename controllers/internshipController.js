const InternshipApplication = require("../models/InternshipApplication");
const asyncHandler = require("../middleware/asyncHandler");
const mongoose = require("mongoose");

// @desc    Apply for Internship
// @route   POST /api/internships/apply
// @access  Private
const applyForInternship = asyncHandler(async (req, res) => {
  const { preferredDomain, duration, formData } = req.body;

  // Check if user already has a pending or active application for this domain
  const existingApp = await InternshipApplication.findOne({
    user: req.user._id,
    preferredDomain,
    status: { $in: ["New", "Reviewed", "Contacted", "Selected", "Approved"] }
  });

  if (existingApp) {
    res.status(400);
    throw new Error("You already have an active application for this domain.");
  }

  const application = await InternshipApplication.create({
    ...formData,
    preferredDomain,
    duration,
    user: req.user._id,
    status: "New"
  });

  res.status(201).json({
    message: "Application submitted successfully",
    application
  });
});

// @desc    Get all internship applications
// @route   GET /api/internships
// @access  Private/Admin
const getInternshipApplications = asyncHandler(async (req, res) => {
  console.log("Fetching all internship applications...");
  const applications = await InternshipApplication.aggregate([
    {
      $sort: { createdAt: -1 }
    },
    {
      $lookup: {
        from: "documents",
        localField: "_id",
        foreignField: "applicationId",
        as: "documents"
      }
    },
    {
      $addFields: {
        documents: { $arrayElemAt: ["$documents", 0] }
      }
    }
  ]);
  
  console.log(`Found ${applications.length} applications`);
  res.json(applications);
});

const { createNotification } = require("./notificationController");

// @desc    Update internship application status
// @route   PUT /api/internships/:id/status
// @access  Private/Admin
const updateInternshipStatus = asyncHandler(async (req, res) => {
  const application = await InternshipApplication.findById(req.params.id);

  if (application) {
    const oldStatus = application.status;
    application.status = req.body.status || application.status;
    application.paymentStatus = req.body.paymentStatus || application.paymentStatus;
    application.startDate = req.body.startDate || application.startDate;
    application.endDate = req.body.endDate || application.endDate;
    
    const updatedApplication = await application.save();

    // Create notification for user if linked
    if (application.user && oldStatus !== application.status) {
      try {
        await createNotification(
          application.user,
          "Application Status Updated",
          `Your application for ${application.preferredDomain} has been updated to ${application.status}`,
          "application_status"
        );
      } catch (notifError) {
        console.error("Notification error:", notifError);
      }
    }

    res.json(updatedApplication);
  } else {
    res.status(404);
    throw new Error("Application not found");
  }
});

// @desc    Delete internship application
// @route   DELETE /api/internships/:id
// @access  Private/Admin
const deleteInternshipApplication = asyncHandler(async (req, res) => {
  const application = await InternshipApplication.findById(req.params.id);

  if (application) {
    await application.deleteOne();
    res.json({ message: "Application removed" });
  } else {
    res.status(404);
    throw new Error("Application not found");
  }
});

// @desc    Get my internship applications
// @route   GET /api/internships/my-applications
// @access  Private
const getMyInternshipApplications = asyncHandler(async (req, res) => {
  const applications = await InternshipApplication.aggregate([
    {
      $match: { user: new mongoose.Types.ObjectId(req.user._id) }
    },
    {
      $sort: { createdAt: -1 }
    },
    {
      $lookup: {
        from: "documents",
        localField: "_id",
        foreignField: "applicationId",
        as: "documents"
      }
    },
    {
      $addFields: {
        documents: { $arrayElemAt: ["$documents", 0] }
      }
    }
  ]);

  res.json(applications);
});

module.exports = {
  applyForInternship,
  getInternshipApplications,
  updateInternshipStatus,
  deleteInternshipApplication,
  getMyInternshipApplications,
};

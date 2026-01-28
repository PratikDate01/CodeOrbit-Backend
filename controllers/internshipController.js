const InternshipApplication = require("../models/InternshipApplication");
const asyncHandler = require("../middleware/asyncHandler");
const { uploadBufferToCloudinary } = require("../config/cloudinary");

// @desc    Apply for Internship
// @route   POST /api/internships/apply
// @access  Private
const applyForInternship = asyncHandler(async (req, res) => {
  const { preferredDomain, duration, amount, formData } = req.body;

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
    amount: amount || 0,
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
  const applications = await InternshipApplication.find({}).sort({ createdAt: -1 });
  
  const documentModels = require("../models/Document");
  const appsWithDocs = await Promise.all(applications.map(async (app) => {
    const documents = await documentModels.findOne({ applicationId: app._id });
    return { ...app.toObject(), documents };
  }));

  res.json(appsWithDocs);
});

const { createNotification } = require("./notificationController");

// @desc    Update internship application status
// @route   PUT /api/internships/:id/status
// @access  Private/Admin
const updateInternshipStatus = asyncHandler(async (req, res) => {
  const application = await InternshipApplication.findById(req.params.id);

  if (application) {
    const oldStatus = application.status;
    const oldPaymentStatus = application.paymentStatus;
    application.status = req.body.status || application.status;
    application.paymentStatus = req.body.paymentStatus || application.paymentStatus;
    application.startDate = req.body.startDate || application.startDate;
    application.endDate = req.body.endDate || application.endDate;
    
    const updatedApplication = await application.save();

    // Create notification for user if linked
    if (application.user) {
      if (oldStatus !== application.status) {
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

      if (oldPaymentStatus !== application.paymentStatus) {
        try {
          await createNotification(
            application.user,
            "Payment Status Updated",
            `Your payment status for ${application.preferredDomain} has been updated to ${application.paymentStatus}`,
            "payment_status"
          );
        } catch (notifError) {
          console.error("Notification error:", notifError);
        }
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
  const applications = await InternshipApplication.find({ user: req.user._id })
    .sort({ createdAt: -1 });

  const documentModels = require("../models/Document");
  const appsWithDocs = await Promise.all(applications.map(async (app) => {
    const documents = await documentModels.findOne({ applicationId: app._id });
    return { ...app.toObject(), documents };
  }));

  res.json(appsWithDocs);
});

// @desc    Submit payment details
// @route   POST /api/internships/:id/payment
// @access  Private
const submitPaymentDetails = asyncHandler(async (req, res) => {
  const { transactionId } = req.body;
  const application = await InternshipApplication.findById(req.params.id);

  if (application) {
    if (application.user.toString() !== req.user._id.toString()) {
      res.status(401);
      throw new Error("Not authorized");
    }

    application.transactionId = transactionId;
    if (req.file) {
      try {
        const uploadResult = await uploadBufferToCloudinary(
          req.file.buffer,
          "payments/screenshots",
          `payment_${application._id}_${Date.now()}`,
          "image"
        );
        application.paymentScreenshot = uploadResult.secure_url;
        application.paymentScreenshotPublicId = uploadResult.public_id;
      } catch (uploadError) {
        console.error("Cloudinary upload failed:", uploadError);
        res.status(500);
        throw new Error("Failed to upload payment screenshot");
      }
    }
    application.paymentStatus = "Processing";
    
    const updatedApplication = await application.save();
    res.json(updatedApplication);
  } else {
    res.status(404);
    throw new Error("Application not found");
  }
});

module.exports = {
  applyForInternship,
  getInternshipApplications,
  updateInternshipStatus,
  deleteInternshipApplication,
  getMyInternshipApplications,
  submitPaymentDetails,
};

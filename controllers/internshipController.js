const InternshipApplication = require("../models/InternshipApplication");
const Document = require("../models/Document");
const asyncHandler = require("../middleware/asyncHandler");
const { createNotification } = require("./notificationController");

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
  const { status, preferredDomain, paymentStatus, page = 1, limit = 100 } = req.query;
  const query = {};

  // Whitelist query parameters
  if (status) query.status = String(status);
  if (preferredDomain) query.preferredDomain = String(preferredDomain);
  if (paymentStatus) query.paymentStatus = String(paymentStatus);

  const applications = await InternshipApplication.find(query)
    .sort({ createdAt: -1 })
    .limit(Number(limit))
    .skip((Number(page) - 1) * Number(limit))
    .lean();
  
  if (!applications || applications.length === 0) {
    return res.json([]);
  }

  const applicationIds = applications.map(app => app._id);
  const allDocuments = await Document.find({ applicationId: { $in: applicationIds } }).lean();
  
  const appsWithDocs = applications.map(app => {
    const documents = allDocuments.find(doc => 
      doc.applicationId && doc.applicationId.toString() === app._id.toString()
    );
    return { ...app, documents };
  });

  res.json(appsWithDocs);
});

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
    .sort({ createdAt: -1 })
    .lean();

  if (!applications || applications.length === 0) {
    return res.json([]);
  }

  const applicationIds = applications.map(app => app._id);
  const allDocuments = await Document.find({ applicationId: { $in: applicationIds } }).lean();

  const appsWithDocs = applications.map(app => {
    const documents = allDocuments.find(doc => 
      doc.applicationId && doc.applicationId.toString() === app._id.toString()
    );
    return { ...app, documents };
  });

  res.json(appsWithDocs);
});

module.exports = {
  applyForInternship,
  getInternshipApplications,
  updateInternshipStatus,
  deleteInternshipApplication,
  getMyInternshipApplications,
};

const InternshipApplication = require("../models/InternshipApplication");
const Program = require("../models/Program");
const Document = require("../models/Document");
const AuditLog = require("../models/AuditLog");
const asyncHandler = require("../middleware/asyncHandler");
const { createNotification } = require("./notificationController");
const { autoEnrollUser } = require("../utils/lmsHelpers");

// @desc    Get all published programs
// @route   GET /api/internships/programs
// @access  Public
const getPublishedPrograms = asyncHandler(async (req, res) => {
  const programs = await Program.find({ isPublished: true }).sort({ createdAt: -1 });
  res.json(programs);
});

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

  let finalAmount = amount;
  if (!finalAmount || finalAmount === 0) {
    finalAmount = duration === 1 ? 399 : duration === 3 ? 599 : 999;
  }

  const application = await InternshipApplication.create({
    ...formData,
    preferredDomain,
    duration,
    amount: finalAmount,
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
    application.status = req.body.status !== undefined ? req.body.status : application.status;
    application.paymentStatus = req.body.paymentStatus !== undefined ? req.body.paymentStatus : application.paymentStatus;
    application.startDate = req.body.startDate !== undefined ? req.body.startDate : application.startDate;
    application.endDate = req.body.endDate !== undefined ? req.body.endDate : application.endDate;
    application.documentIssueDate = req.body.documentIssueDate !== undefined ? req.body.documentIssueDate : application.documentIssueDate;
    
    const updatedApplication = await application.save();

    // Trigger LMS enrollment if application is Approved or Selected
    if (
      (updatedApplication.status === "Approved" || updatedApplication.status === "Selected") &&
      updatedApplication.user
    ) {
      await autoEnrollUser(
        updatedApplication.user,
        updatedApplication.preferredDomain,
        updatedApplication._id
      );
    }

    // Log admin action
    await AuditLog.create({
      admin: req.user._id,
      actionType: "UPDATE_INTERNSHIP_STATUS",
      targetType: "InternshipApplication",
      targetId: updatedApplication._id,
      details: { 
        oldStatus, 
        newStatus: updatedApplication.status,
        oldPaymentStatus,
        newPaymentStatus: updatedApplication.paymentStatus 
      },
    });

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

    await AuditLog.create({
      admin: req.user._id,
      actionType: "DELETE_INTERNSHIP_APPLICATION",
      targetType: "InternshipApplication",
      targetId: req.params.id,
      details: { name: application.name, email: application.email },
    });

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
  let applications = await InternshipApplication.find({ user: req.user._id })
    .sort({ createdAt: -1 });

  if (!applications || applications.length === 0) {
    return res.json([]);
  }

  // Fix 0 amounts for existing applications
  for (let app of applications) {
    if (!app.amount || app.amount === 0) {
      app.amount = app.duration === 1 ? 399 : app.duration === 3 ? 599 : 999;
      await app.save();
    }
  }

  const applicationsLean = applications.map(app => app.toObject());
  const applicationIds = applicationsLean.map(app => app._id);
  const allDocuments = await Document.find({ applicationId: { $in: applicationIds } }).lean();

  const appsWithDocs = applicationsLean.map(app => {
    const documents = allDocuments.find(doc => 
      doc.applicationId && doc.applicationId.toString() === app._id.toString()
    );
    
    // Filter out URLs based on visibility for security
    if (documents) {
      if (!documents.offerLetterVisible) delete documents.offerLetterUrl;
      if (!documents.certificateVisible) delete documents.certificateUrl;
      if (!documents.locVisible) delete documents.locUrl;
      if (!documents.paymentSlipVisible) delete documents.paymentSlipUrl;
    }

    return { ...app, documents };
  });

  res.json(appsWithDocs);
});

module.exports = {
  getPublishedPrograms,
  applyForInternship,
  getInternshipApplications,
  updateInternshipStatus,
  deleteInternshipApplication,
  getMyInternshipApplications,
};

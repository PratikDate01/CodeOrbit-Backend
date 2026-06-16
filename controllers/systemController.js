const os = require("os");
const dns = require("dns");
const mongoose = require("mongoose");
const ErrorLog = require("../models/ErrorLog");
const Enrollment = require("../models/Enrollment");
const User = require("../models/User");
const Program = require("../models/Program");
const LMSActivityProgress = require("../models/LMSActivityProgress");
const LMSCertificate = require("../models/LMSCertificate");
const asyncHandler = require("../middleware/asyncHandler");

// @desc    Get detailed system health status
// @route   GET /api/admin/system/health
// @access  Private/Admin
const getSystemHealth = asyncHandler(async (req, res) => {
  const health = {
    uptime: process.uptime(),
    timestamp: Date.now(),
    system: {
      platform: os.platform(),
      release: os.release(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      memoryUsagePercentage: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100,
      cpuLoad: os.loadavg(),
    },
    services: {
      database: {
        status: mongoose.connection.readyState === 1 ? "Healthy" : "Unhealthy",
        connectionState: mongoose.connection.readyState,
      },
      cloudinary: {
        status: (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) ? "Configured" : "Not Configured",
      },
      razorpay: {
        status: (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) ? "Configured" : "Not Configured",
      },
      googleOAuth: {
        status: (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) ? "Configured" : "Not Configured",
      }
    },
    dns: {
      status: "Unknown",
    }
  };

  // Check DNS resolution
  try {
    await new Promise((resolve, reject) => {
      dns.resolve("google.com", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    health.dns.status = "Healthy";
  } catch (dnsErr) {
    health.dns.status = "Unhealthy";
    health.dns.error = dnsErr.message;
  }

  res.json(health);
});

// @desc    Audit database relationships and return data integrity metrics
// @route   GET /api/admin/system/integrity
// @access  Private/Admin
const getDataIntegrityReport = asyncHandler(async (req, res) => {
  // 1. Audit Enrollments
  const enrollments = await Enrollment.find().lean();
  const orphanEnrollments = [];
  const duplicateMap = {};
  const duplicateEnrollments = [];

  for (const enrollment of enrollments) {
    // Check if user and program references exist
    const userExists = enrollment.user ? await User.exists({ _id: enrollment.user }) : null;
    const programExists = enrollment.program ? await Program.exists({ _id: enrollment.program }) : null;

    if (!userExists || !programExists) {
      orphanEnrollments.push({
        enrollmentId: enrollment._id,
        userRef: enrollment.user,
        userExists: !!userExists,
        programRef: enrollment.program,
        programExists: !!programExists,
      });
    }

    // Check duplicates: user_program unique violation check
    if (enrollment.user && enrollment.program && enrollment.status === "Active") {
      const key = `${enrollment.user.toString()}_${enrollment.program.toString()}`;
      if (duplicateMap[key]) {
        duplicateEnrollments.push({
          key,
          originalId: duplicateMap[key],
          duplicateId: enrollment._id,
        });
      } else {
        duplicateMap[key] = enrollment._id;
      }
    }
  }

  // 2. Audit Activity Progress
  const progressRecords = await LMSActivityProgress.find().lean();
  const orphanProgress = [];
  for (const progress of progressRecords) {
    const enrollmentExists = progress.enrollment ? await Enrollment.exists({ _id: progress.enrollment }) : null;
    if (!enrollmentExists) {
      orphanProgress.push({
        progressId: progress._id,
        enrollmentRef: progress.enrollment,
        userRef: progress.user,
      });
    }
  }

  // 3. Audit Certificates
  const certificates = await LMSCertificate.find().lean();
  const orphanCertificates = [];
  for (const cert of certificates) {
    const enrollmentExists = cert.enrollment ? await Enrollment.exists({ _id: cert.enrollment }) : null;
    if (!enrollmentExists) {
      orphanCertificates.push({
        certificateId: cert._id,
        certificateCode: cert.certificateId,
        enrollmentRef: cert.enrollment,
      });
    }
  }

  res.json({
    summary: {
      orphanEnrollmentsCount: orphanEnrollments.length,
      duplicateEnrollmentsCount: duplicateEnrollments.length,
      orphanProgressCount: orphanProgress.length,
      orphanCertificatesCount: orphanCertificates.length,
      isClean: (orphanEnrollments.length + duplicateEnrollments.length + orphanProgress.length + orphanCertificates.length) === 0,
    },
    details: {
      orphanEnrollments,
      duplicateEnrollments,
      orphanProgress,
      orphanCertificates,
    }
  });
});

// @desc    Self-heal orphaned database references
// @route   POST /api/admin/system/integrity/heal
// @access  Private/Admin
const healDataIntegrity = asyncHandler(async (req, res) => {
  const healingResults = {
    resolvedUsers: 0,
    cleanedProgressRecords: 0,
    cleanedCertificates: 0,
    errors: [],
  };

  try {
    // 1. Heal orphan enrollments by matching email addresses
    const enrollments = await Enrollment.find().populate("internshipApplication");
    for (const enrollment of enrollments) {
      let resolvedUserId = enrollment.user;

      // Check if user is missing or doesn't exist
      const userExists = resolvedUserId ? await User.exists({ _id: resolvedUserId }) : false;
      
      if (!userExists && enrollment.internshipApplication && enrollment.internshipApplication.email) {
        const matchingUser = await User.findOne({ email: enrollment.internshipApplication.email });
        if (matchingUser) {
          enrollment.user = matchingUser._id;
          await enrollment.save();
          
          // Also link the application user if missing
          enrollment.internshipApplication.user = matchingUser._id;
          await enrollment.internshipApplication.save();

          healingResults.resolvedUsers++;
        }
      }
    }

    // 2. Clean up orphaned progress records
    const progressRecords = await LMSActivityProgress.find();
    for (const progress of progressRecords) {
      const enrollmentExists = progress.enrollment ? await Enrollment.exists({ _id: progress.enrollment }) : false;
      if (!enrollmentExists) {
        await progress.deleteOne();
        healingResults.cleanedProgressRecords++;
      }
    }

    // 3. Clean up orphaned certificates
    const certificates = await LMSCertificate.find();
    for (const cert of certificates) {
      const enrollmentExists = cert.enrollment ? await Enrollment.exists({ _id: cert.enrollment }) : false;
      if (!enrollmentExists) {
        await cert.deleteOne();
        healingResults.cleanedCertificates++;
      }
    }

  } catch (error) {
    healingResults.errors.push(error.message);
  }

  res.json({
    success: healingResults.errors.length === 0,
    results: healingResults
  });
});

// @desc    Get paginated error logs
// @route   GET /api/admin/system/logs
// @access  Private/Admin
const getErrorLogs = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const count = await ErrorLog.countDocuments();
  const logs = await ErrorLog.find()
    .populate("user", "name email")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.json({
    logs,
    page,
    pages: Math.ceil(count / limit),
    totalLogs: count,
  });
});

module.exports = {
  getSystemHealth,
  getDataIntegrityReport,
  healDataIntegrity,
  getErrorLogs,
};

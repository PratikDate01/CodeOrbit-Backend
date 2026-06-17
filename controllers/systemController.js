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
const SystemSetting = require("../models/SystemSetting");
const Payment = require("../models/Payment");
const SecurityEvent = require("../models/SecurityEvent");
const RequestLog = require("../models/RequestLog");
const DocumentGenerationLog = require("../models/DocumentGenerationLog");
const IntegrityAudit = require("../models/IntegrityAudit");
const AuditLog = require("../models/AuditLog");
const Document = require("../models/Document");
const Submission = require("../models/Submission");
const AssignmentSubmission = require("../models/AssignmentSubmission");
const InternshipApplication = require("../models/InternshipApplication");
const ActivityProgress = require("../models/ActivityProgress");
const { getEventLoopData } = require("../utils/eventLoopMonitor");
const { updateMaintenanceCache } = require("../middleware/maintenanceMiddleware");

// @desc    Get detailed system health status
// @route   GET /api/admin/system/health
// @access  Private/Admin
const getSystemHealth = asyncHandler(async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  
  // 1. Process Memory usage
  const mem = process.memoryUsage();
  const rssMB = Number((mem.rss / 1024 / 1024).toFixed(2));
  const heapUsedMB = Number((mem.heapUsed / 1024 / 1024).toFixed(2));
  const heapTotalMB = Number((mem.heapTotal / 1024 / 1024).toFixed(2));
  const externalMB = Number((mem.external / 1024 / 1024).toFixed(2));
  const heapUsagePercentage = Number(((mem.heapUsed / mem.heapTotal) * 100).toFixed(2));
  const rssUsagePercentage = Number(((mem.rss / os.totalmem()) * 100).toFixed(2));

  // 2. Event loop lag details
  const eventLoop = getEventLoopData();

  // 3. Database status & latency
  const dbStart = Date.now();
  let dbPing = 0;
  let dbStatus = "Disconnected";
  try {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.db.admin().ping();
      dbPing = Date.now() - dbStart;
      dbStatus = "Connected";
    } else if (mongoose.connection.readyState === 2) {
      dbStatus = "Connecting";
    }
  } catch {
    dbPing = -1;
    dbStatus = "Disconnected";
  }

  // 4. API Performance Center calculations
  const totalRequestsToday = await RequestLog.countDocuments({ timestamp: { $gte: startOfDay } });
  const successfulRequestsToday = await RequestLog.countDocuments({ timestamp: { $gte: startOfDay }, statusCode: { $lt: 400 } });
  const failedRequestsToday = await RequestLog.countDocuments({ timestamp: { $gte: startOfDay }, statusCode: { $gte: 400 } });
  
  const successRate = totalRequestsToday ? Number(((successfulRequestsToday / totalRequestsToday) * 100).toFixed(2)) : 100;
  const errorRate = totalRequestsToday ? Number(((failedRequestsToday / totalRequestsToday) * 100).toFixed(2)) : 0;

  const responseTimeAgg = await RequestLog.aggregate([
    { $match: { timestamp: { $gte: startOfDay } } },
    { $group: { _id: null, avgTime: { $avg: "$responseTime" } } }
  ]);
  const avgResponseTime = responseTimeAgg.length ? Number(responseTimeAgg[0].avgTime.toFixed(2)) : 0;

  const slowestRequest = await RequestLog.findOne({ timestamp: { $gte: startOfDay } }).sort({ responseTime: -1 }).lean();
  const fastestRequest = await RequestLog.findOne({ timestamp: { $gte: startOfDay } }).sort({ responseTime: 1 }).lean();

  const topEndpoints = await RequestLog.aggregate([
    { $match: { timestamp: { $gte: startOfDay } } },
    { $group: {
        _id: { route: "$route", method: "$method" },
        hits: { $sum: 1 },
        avgTime: { $avg: "$responseTime" },
        errors: { $sum: { $cond: [{ $gte: ["$statusCode", 400] }, 1, 0] } }
      }
    },
    { $sort: { hits: -1 } },
    { $limit: 10 },
    { $project: {
        _id: 0,
        route: "$_id.route",
        method: "$_id.method",
        hits: 1,
        avgResponseTime: { $round: ["$avgTime", 2] },
        errors: 1
      }
    }
  ]);

  // 5. Payment Health
  const paymentsToday = await Payment.countDocuments({ createdAt: { $gte: startOfDay } });
  const verifiedPaymentsToday = await Payment.countDocuments({ createdAt: { $gte: startOfDay }, status: "captured" });
  const pendingPaymentsToday = await Payment.countDocuments({ createdAt: { $gte: startOfDay }, status: "created" });
  const failedPaymentsToday = await Payment.countDocuments({ createdAt: { $gte: startOfDay }, status: "failed" });

  const razorpayFailuresToday = await SecurityEvent.countDocuments({
    eventType: "suspicious_request",
    timestamp: { $gte: startOfDay },
    action: /Razorpay signature verification failed/i
  });
  
  const webhookFailuresToday = await SecurityEvent.countDocuments({
    eventType: "suspicious_request",
    timestamp: { $gte: startOfDay },
    action: /Razorpay Webhook signature verification failed/i
  });

  const duplicateAttemptsToday = await SecurityEvent.countDocuments({
    eventType: "suspicious_request",
    timestamp: { $gte: startOfDay },
    action: /Duplicate payment/i
  });

  const paymentSuccessRate = paymentsToday ? Number(((verifiedPaymentsToday / paymentsToday) * 100).toFixed(2)) : 100;

  // Payments chart trends (last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const paymentTrends = await Payment.aggregate([
    { $match: { createdAt: { $gte: sevenDaysAgo } } },
    { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        total: { $sum: 1 },
        verified: { $sum: { $cond: [{ $eq: ["$status", "captured"] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] } }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // 6. LMS Health
  const activeStudents = (await Enrollment.distinct("user", { status: "Active" })).length;
  const activeEnrollments = await Enrollment.countDocuments({ status: "Active" });
  const completedPrograms = await Enrollment.countDocuments({ status: "Completed" });
  const certificatesIssued = await LMSCertificate.countDocuments();
  const assignmentSubmissions = await AssignmentSubmission.countDocuments();

  // LMS Integrity Summary
  const lmsIntegrity = {
    missingPrograms: 0,
    missingStudents: 0,
    brokenEnrollments: 0
  };
  
  const enrollmentPrograms = await Enrollment.distinct("program");
  const existingPrograms = await Program.distinct("_id");
  const missingProgramIds = enrollmentPrograms.filter(p => !existingPrograms.some(ep => ep.toString() === p.toString()));
  lmsIntegrity.missingPrograms = await Enrollment.countDocuments({ program: { $in: missingProgramIds } });

  const enrollmentUsers = await Enrollment.distinct("user");
  const existingUsers = await User.distinct("_id");
  const missingUserIds = enrollmentUsers.filter(u => !existingUsers.some(eu => eu.toString() === u.toString()));
  lmsIntegrity.missingStudents = await Enrollment.countDocuments({ user: { $in: missingUserIds } });

  const progressEnrollments = await LMSActivityProgress.distinct("enrollment");
  const certEnrollments = await LMSCertificate.distinct("enrollment");
  const uniqueProgressCertEnrollments = Array.from(new Set([...progressEnrollments, ...certEnrollments]));
  const existingEnrollments = await Enrollment.distinct("_id");
  const missingEnrollmentIds = uniqueProgressCertEnrollments.filter(e => !existingEnrollments.some(ee => ee.toString() === e.toString()));
  
  lmsIntegrity.brokenEnrollments = (await LMSActivityProgress.countDocuments({ enrollment: { $in: missingEnrollmentIds } })) + 
                                   (await LMSCertificate.countDocuments({ enrollment: { $in: missingEnrollmentIds } }));

  // 7. Document Generation Health
  const offerLettersGen = await DocumentGenerationLog.countDocuments({ documentType: "offerLetter", success: true });
  const certificatesGen = await DocumentGenerationLog.countDocuments({ documentType: "certificate", success: true });
  const locGen = await DocumentGenerationLog.countDocuments({ documentType: "loc", success: true });
  const internshipDetailsGen = await DocumentGenerationLog.countDocuments({ documentType: "internshipDetails", success: true });
  const attendanceGen = await DocumentGenerationLog.countDocuments({ documentType: "attendance", success: true });
  const paymentReceiptsGen = await DocumentGenerationLog.countDocuments({ documentType: "paymentReceipt", success: true });

  const docStats = await DocumentGenerationLog.aggregate([
    { $group: {
        _id: null,
        total: { $sum: 1 },
        successes: { $sum: { $cond: ["$success", 1, 0] } },
        avgTime: { $avg: "$duration" },
        maxTime: { $max: "$duration" }
      }
    }
  ]);

  const docTotal = docStats.length ? docStats[0].total : 0;
  const docSuccesses = docStats.length ? docStats[0].successes : 0;
  const docAvgTime = docStats.length ? Number(docStats[0].avgTime.toFixed(2)) : 0;
  const docMaxTime = docStats.length ? docStats[0].maxTime : 0;
  const docSuccessRate = docTotal ? Number(((docSuccesses / docTotal) * 100).toFixed(2)) : 100;
  const docFailedCount = docTotal - docSuccesses;

  const docTrends = await DocumentGenerationLog.aggregate([
    { $match: { createdAt: { $gte: sevenDaysAgo } } },
    { $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
        successes: { $sum: { $cond: ["$success", 1, 0] } }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // 8. Security Events
  const failedLogins = await SecurityEvent.countDocuments({ eventType: "failed_login", timestamp: { $gte: startOfDay } });
  const unauthorizedAccesses = await SecurityEvent.countDocuments({ eventType: "unauthorized_access", timestamp: { $gte: startOfDay } });
  const invalidJWTs = await SecurityEvent.countDocuments({ eventType: "invalid_jwt", timestamp: { $gte: startOfDay } });
  const suspiciousRequests = await SecurityEvent.countDocuments({ eventType: "suspicious_request", timestamp: { $gte: startOfDay } });
  const adminActionsToday = await AuditLog.countDocuments({ createdAt: { $gte: startOfDay } });

  const securityEventsLog = await SecurityEvent.find()
    .populate("user", "name email")
    .sort({ timestamp: -1 })
    .limit(10)
    .lean();

  // 9. User Activity
  const usersActiveToday = await User.countDocuments({ lastActive: { $gte: startOfDay } });
  const studentsActiveToday = await User.countDocuments({ role: "client", lastActive: { $gte: startOfDay } });
  const adminsActiveToday = await User.countDocuments({ role: "admin", lastActive: { $gte: startOfDay } });

  // Combined Activity Feed
  const submissionsFeed = await Submission.find().populate("student", "name email").sort({ createdAt: -1 }).limit(10).lean();
  const assignmentsFeed = await AssignmentSubmission.find().populate("user", "name email").populate("activity", "title").sort({ createdAt: -1 }).limit(10).lean();
  const auditLogsFeed = await AuditLog.find().populate("admin", "name email").sort({ createdAt: -1 }).limit(10).lean();

  const combinedFeed = [];
  submissionsFeed.forEach(s => {
    combinedFeed.push({
      id: s._id,
      timestamp: s.createdAt,
      type: "internship_submission",
      user: s.student,
      message: `Submitted internship task for domain "${s.internshipApplication?.preferredDomain || "Internship"}"`
    });
  });
  assignmentsFeed.forEach(a => {
    combinedFeed.push({
      id: a._id,
      timestamp: a.submittedAt || a.createdAt,
      type: "lms_submission",
      user: a.user,
      message: `Submitted LMS assignment for "${a.activity?.title || "LMS Module"}"`
    });
  });
  auditLogsFeed.forEach(a => {
    combinedFeed.push({
      id: a._id,
      timestamp: a.createdAt,
      type: "admin_action",
      user: a.admin,
      message: `Admin action: ${a.actionType} on ${a.targetType}`
    });
  });

  combinedFeed.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const recentActivityFeed = combinedFeed.slice(0, 15);

  // 10. Deployment Info
  const fs = require("fs");
  const path = require("path");
  let buildTimestamp = null;
  try {
    const stats = fs.statSync(path.join(__dirname, "../index.js"));
    buildTimestamp = stats.mtime;
  } catch {
    buildTimestamp = new Date();
  }

  let gitCommit = "N/A";
  let gitBranch = "N/A";
  try {
    const { execSync } = require("child_process");
    gitCommit = execSync("git rev-parse --short HEAD", { timeout: 1000 }).toString().trim();
    gitBranch = execSync("git rev-parse --abbrev-ref HEAD", { timeout: 1000 }).toString().trim();
  } catch {
    if (process.env.RENDER_GIT_COMMIT) gitCommit = process.env.RENDER_GIT_COMMIT.substring(0, 7);
    if (process.env.RENDER_GIT_BRANCH) gitBranch = process.env.RENDER_GIT_BRANCH;
  }

  const deployment = {
    environment: process.env.NODE_ENV || "development",
    backendVersion: "1.0.0",
    applicationVersion: "0.1.0",
    deploymentTimestamp: new Date(Date.now() - process.uptime() * 1000),
    buildTimestamp,
    gitCommit,
    gitBranch
  };

  // 11. System Health Score (0 - 100)
  let healthScore = 0;
  // MongoDB Connection State (20%)
  if (mongoose.connection.readyState === 1) healthScore += 20;
  // API Success Rate (20%)
  healthScore += 20 * (successRate / 100);
  // Payment Success Rate (15%)
  healthScore += 15 * (paymentSuccessRate / 100);
  // LMS Integrity (15%)
  const totalEnrollments = await Enrollment.countDocuments();
  const totalLmsOrphans = lmsIntegrity.missingPrograms + lmsIntegrity.missingStudents + lmsIntegrity.brokenEnrollments;
  const lmsIntegrityRatio = totalEnrollments ? Math.max(0, 1 - (totalLmsOrphans / totalEnrollments)) : 1;
  healthScore += 15 * lmsIntegrityRatio;
  // Error Rate (15%): deduction based on errors today vs total API calls today.
  const errorPoints = Math.max(0, 15 * (1 - (errorRate / 10))); // Lose all 15 points if error rate is 10% or more
  healthScore += errorPoints;
  // Memory Usage load (10%)
  const memoryRatio = Math.max(0, 1 - (heapUsagePercentage / 100));
  healthScore += 10 * memoryRatio;
  // Event Loop Lag (5%)
  if (eventLoop.status === "Healthy") healthScore += 5;
  else if (eventLoop.status === "Warning") healthScore += 2;

  healthScore = Math.round(healthScore);

  let healthScoreStatus = "Excellent";
  if (healthScore < 50) healthScoreStatus = "Critical";
  else if (healthScore < 80) healthScoreStatus = "Warning";
  else if (healthScore < 90) healthScoreStatus = "Good";

  // Check DNS resolution
  let dnsStatus = "Unknown";
  try {
    await new Promise((resolve, reject) => {
      dns.resolve("google.com", (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    dnsStatus = "Healthy";
  } catch {
    dnsStatus = "Unhealthy";
  }

  // Combined health payload
  const health = {
    uptime: process.uptime(),
    timestamp: Date.now(),
    system: {
      platform: os.platform(),
      release: os.release(),
      totalMemory: os.totalmem(),
      freeMemory: os.freemem(),
      // Backward compatibility variables
      memoryUsagePercentage: heapUsagePercentage,
      cpuLoad: os.loadavg(),
      // Node process metrics
      nodeMemory: {
        rss: rssMB,
        heapUsed: heapUsedMB,
        heapTotal: heapTotalMB,
        external: externalMB,
        heapUsagePercentage,
        rssUsagePercentage,
        lastUpdated: new Date()
      }
    },
    eventLoop,
    services: {
      database: {
        status: dbStatus === "Connected" ? "Healthy" : "Unhealthy",
        connectionState: mongoose.connection.readyState,
        ping: dbPing
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
      status: dnsStatus,
    },
    apiPerformance: {
      totalRequestsToday,
      successfulRequestsToday,
      failedRequestsToday,
      successRate,
      errorRate,
      avgResponseTime,
      slowestEndpoint: slowestRequest ? `${slowestRequest.method} ${slowestRequest.route} (${slowestRequest.responseTime}ms)` : "N/A",
      fastestEndpoint: fastestRequest ? `${fastestRequest.method} ${fastestRequest.route} (${fastestRequest.responseTime}ms)` : "N/A",
      topEndpoints
    },
    payments: {
      paymentsToday,
      verifiedPaymentsToday,
      pendingPaymentsToday,
      failedPaymentsToday,
      failures: {
        razorpayFailuresToday,
        webhookFailuresToday,
        duplicateAttemptsToday
      },
      paymentSuccessRate,
      paymentTrends
    },
    lms: {
      activeStudents,
      activeEnrollments,
      completedPrograms,
      certificatesIssued,
      assignmentSubmissions,
      integrity: lmsIntegrity
    },
    documentGeneration: {
      offerLettersGen,
      certificatesGen,
      locGen,
      internshipDetailsGen,
      attendanceGen,
      paymentReceiptsGen,
      successRate: docSuccessRate,
      failedCount: docFailedCount,
      avgTime: docAvgTime,
      longestTime: docMaxTime,
      trends: docTrends
    },
    security: {
      failedLogins,
      unauthorizedAccesses,
      invalidJWTs,
      suspiciousRequests,
      adminActionsToday,
      events: securityEventsLog
    },
    userActivity: {
      usersActiveToday,
      studentsActiveToday,
      adminsActiveToday,
      recentActivityFeed
    },
    deployment,
    healthScore: {
      score: healthScore,
      status: healthScoreStatus
    }
  };

  res.json(health);
});

// @desc    Audit database relationships and return data integrity metrics
// @route   GET /api/admin/system/integrity
// @access  Private/Admin
const getDataIntegrityReport = asyncHandler(async (req, res) => {
  // 1. Orphan Users (role client/student who have no InternshipApplication and no Enrollment)
  const studentUsers = await User.find({ role: "client" }).distinct("_id");
  const userApplications = await InternshipApplication.distinct("user");
  const userEnrollments = await Enrollment.distinct("user");
  
  const activeUserIds = new Set([
    ...userApplications.map(id => id ? id.toString() : ""),
    ...userEnrollments.map(id => id ? id.toString() : "")
  ].filter(Boolean));

  const orphanUsers = [];
  for (const uid of studentUsers) {
    if (!activeUserIds.has(uid.toString())) {
      const u = await User.findById(uid).select("name email role createdAt").lean();
      if (u) orphanUsers.push(u);
    }
  }

  // 2. Orphan Applications (user ref is missing/broken)
  const applications = await InternshipApplication.find().lean();
  const orphanApplications = [];
  for (const app of applications) {
    if (app.user) {
      const userExists = await User.exists({ _id: app.user });
      if (!userExists) {
        orphanApplications.push({
          applicationId: app._id,
          name: app.name,
          email: app.email,
          preferredDomain: app.preferredDomain,
          userRef: app.user
        });
      }
    }
  }

  // 3. Orphan Enrollments (user or program missing, or duplicate active)
  const enrollments = await Enrollment.find().lean();
  const orphanEnrollments = [];
  const duplicateMap = {};
  const duplicateEnrollments = [];
  for (const enrollment of enrollments) {
    const userExists = enrollment.user ? await User.exists({ _id: enrollment.user }) : false;
    const programExists = enrollment.program ? await Program.exists({ _id: enrollment.program }) : false;
    
    if (!userExists || !programExists) {
      orphanEnrollments.push({
        enrollmentId: enrollment._id,
        userRef: enrollment.user,
        userExists,
        programRef: enrollment.program,
        programExists
      });
    }

    if (enrollment.user && enrollment.program && enrollment.status === "Active") {
      const key = `${enrollment.user.toString()}_${enrollment.program.toString()}`;
      if (duplicateMap[key]) {
        duplicateEnrollments.push({
          key,
          originalId: duplicateMap[key],
          duplicateId: enrollment._id
        });
      } else {
        duplicateMap[key] = enrollment._id;
      }
    }
  }

  // 4. Orphan Certificates (LMSCertificate or Document referencing missing records)
  const lmsCertificates = await LMSCertificate.find().lean();
  const docs = await Document.find().lean();
  const orphanCertificates = [];
  
  for (const cert of lmsCertificates) {
    const enrollmentExists = cert.enrollment ? await Enrollment.exists({ _id: cert.enrollment }) : false;
    if (!enrollmentExists) {
      orphanCertificates.push({
        certificateId: cert._id,
        certificateCode: cert.certificateId,
        enrollmentRef: cert.enrollment,
        type: "LMSCertificate"
      });
    }
  }

  for (const doc of docs) {
    const appExists = doc.applicationId ? await InternshipApplication.exists({ _id: doc.applicationId }) : false;
    const userExists = doc.user ? await User.exists({ _id: doc.user }) : false;
    
    if (!appExists || !userExists) {
      orphanCertificates.push({
        certificateId: doc._id,
        verificationId: doc.verificationId,
        userRef: doc.user,
        userExists,
        applicationRef: doc.applicationId,
        applicationExists: appExists,
        type: "Document"
      });
    }
  }

  // 5. Orphan Progress Logs (LMSActivityProgress or ActivityProgress)
  const progressRecords = await LMSActivityProgress.find().lean();
  const internProgressRecords = await ActivityProgress.find().lean();
  const orphanProgress = [];

  for (const progress of progressRecords) {
    const enrollmentExists = progress.enrollment ? await Enrollment.exists({ _id: progress.enrollment }) : false;
    if (!enrollmentExists) {
      orphanProgress.push({
        progressId: progress._id,
        enrollmentRef: progress.enrollment,
        userRef: progress.user,
        type: "LMSProgress"
      });
    }
  }

  for (const progress of internProgressRecords) {
    const appExists = progress.internshipApplication ? await InternshipApplication.exists({ _id: progress.internshipApplication }) : false;
    if (!appExists) {
      orphanProgress.push({
        progressId: progress._id,
        applicationRef: progress.internshipApplication,
        type: "InternshipProgress"
      });
    }
  }

  const issuesCount = orphanUsers.length + orphanApplications.length + orphanEnrollments.length + duplicateEnrollments.length + orphanCertificates.length + orphanProgress.length;
  const result = issuesCount === 0 ? "clean" : "issues_found";

  // Create audit history log
  await IntegrityAudit.create({
    timestamp: new Date(),
    result,
    issuesFound: issuesCount,
    details: {
      orphanUsersCount: orphanUsers.length,
      orphanApplicationsCount: orphanApplications.length,
      orphanEnrollmentsCount: orphanEnrollments.length,
      duplicateEnrollmentsCount: duplicateEnrollments.length,
      orphanCertificatesCount: orphanCertificates.length,
      orphanProgressCount: orphanProgress.length
    }
  });

  // Fetch audit history (latest 10 runs)
  const auditHistory = await IntegrityAudit.find().sort({ timestamp: -1 }).limit(10).lean();

  res.json({
    summary: {
      orphanUsersCount: orphanUsers.length,
      orphanApplicationsCount: orphanApplications.length,
      orphanEnrollmentsCount: orphanEnrollments.length,
      duplicateEnrollmentsCount: duplicateEnrollments.length,
      orphanProgressCount: orphanProgress.length,
      orphanCertificatesCount: orphanCertificates.length,
      isClean: issuesCount === 0,
      issuesCount
    },
    details: {
      orphanUsers,
      orphanApplications,
      orphanEnrollments,
      duplicateEnrollments,
      orphanProgress,
      orphanCertificates
    },
    auditHistory
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

      const userExists = resolvedUserId ? await User.exists({ _id: resolvedUserId }) : false;
      
      if (!userExists && enrollment.internshipApplication && enrollment.internshipApplication.email) {
        const matchingUser = await User.findOne({ email: enrollment.internshipApplication.email });
        if (matchingUser) {
          enrollment.user = matchingUser._id;
          await enrollment.save();
          
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

    // Log the healing activity to AuditLog
    await AuditLog.create({
      admin: req.user._id,
      actionType: "HEAL_DATABASE_INTEGRITY",
      targetType: "System",
      targetId: req.user._id,
      details: healingResults
    });

  } catch (error) {
    healingResults.errors.push(error.message);
  }

  res.json({
    success: healingResults.errors.length === 0,
    results: healingResults
  });
});

// @desc    Get paginated and filtered error logs
// @route   GET /api/admin/system/logs
// @access  Private/Admin
const getErrorLogs = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  // Filters setup
  const filter = {};

  if (req.query.resolvedStatus === "unresolved") {
    filter.resolved = false;
  } else if (req.query.resolvedStatus === "resolved") {
    filter.resolved = true;
  }

  if (req.query.severity) {
    filter.severity = req.query.severity;
  }

  if (req.query.route) {
    filter.path = new RegExp(req.query.route, "i");
  }

  if (req.query.startDate || req.query.endDate) {
    filter.createdAt = {};
    if (req.query.startDate) {
      filter.createdAt.$gte = new Date(req.query.startDate);
    }
    if (req.query.endDate) {
      const end = new Date(req.query.endDate);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  if (req.query.user) {
    const matchedUsers = await User.find({
      $or: [
        { name: new RegExp(req.query.user, "i") },
        { email: new RegExp(req.query.user, "i") }
      ]
    }).distinct("_id");
    
    if (mongoose.Types.ObjectId.isValid(req.query.user)) {
      matchedUsers.push(req.query.user);
    }

    filter.user = { $in: matchedUsers };
  }

  const count = await ErrorLog.countDocuments(filter);
  const logs = await ErrorLog.find(filter)
    .populate("user", "name email")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  // Stats summaries
  const totalErrors = await ErrorLog.countDocuments();
  const criticalErrors = await ErrorLog.countDocuments({ severity: "critical" });
  const warningErrors = await ErrorLog.countDocuments({ severity: "warning" });
  const resolvedErrors = await ErrorLog.countDocuments({ resolved: true });

  res.json({
    logs,
    page,
    pages: Math.ceil(count / limit),
    totalLogs: count,
    summary: {
      totalErrors,
      criticalErrors,
      warningErrors,
      resolvedErrors
    }
  });
});

// @desc    Mark error log as resolved
// @route   PUT /api/admin/system/logs/:id/resolve
// @access  Private/Admin
const resolveErrorLog = asyncHandler(async (req, res) => {
  const log = await ErrorLog.findById(req.params.id);
  if (!log) {
    res.status(404);
    throw new Error("Error log not found");
  }

  log.resolved = true;
  await log.save();

  await AuditLog.create({
    admin: req.user._id,
    actionType: "RESOLVE_ERROR_LOG",
    targetType: "ErrorLog",
    targetId: log._id,
    details: { message: log.message }
  });

  res.json({ success: true, log });
});

// @desc    Get maintenance settings
// @route   GET /api/admin/system/maintenance
// @access  Private/Admin
const getMaintenanceSettings = asyncHandler(async (req, res) => {
  let settings = await SystemSetting.findOne({ key: "maintenance_config" })
    .populate("enabledBy", "name email");

  if (!settings) {
    settings = await SystemSetting.create({
      key: "maintenance_config",
      maintenanceMode: false,
      allowedUsers: [],
      enabledBy: null,
      enabledAt: null,
    });
  }

  res.json(settings);
});

// @desc    Update maintenance settings
// @route   PUT /api/admin/system/maintenance
// @access  Private/Admin
const updateMaintenanceSettings = asyncHandler(async (req, res) => {
  const { maintenanceMode, allowedUsers } = req.body;

  let settings = await SystemSetting.findOne({ key: "maintenance_config" });
  if (!settings) {
    settings = new SystemSetting({ key: "maintenance_config" });
  }

  const previousMode = settings.maintenanceMode;

  if (maintenanceMode !== undefined) {
    settings.maintenanceMode = maintenanceMode;
    if (maintenanceMode && !previousMode) {
      settings.enabledBy = req.user._id;
      settings.enabledAt = new Date();
    } else if (!maintenanceMode) {
      settings.enabledBy = null;
      settings.enabledAt = null;
    }
  }

  if (allowedUsers !== undefined) {
    settings.allowedUsers = allowedUsers
      .map((u) => u.trim())
      .filter((u) => u.length > 0);
  }

  await settings.save();

  // Update in-memory cache in the middleware
  updateMaintenanceCache({
    maintenanceMode: settings.maintenanceMode,
    allowedUsers: settings.allowedUsers,
  });

  // Log action
  await AuditLog.create({
    admin: req.user._id,
    actionType: "UPDATE_MAINTENANCE_MODE",
    targetType: "SystemSetting",
    targetId: settings._id,
    details: { maintenanceMode, allowedUsersCount: settings.allowedUsers.length }
  });

  const populated = await SystemSetting.findOne({ key: "maintenance_config" })
    .populate("enabledBy", "name email");

  res.json(populated);
});

module.exports = {
  getSystemHealth,
  getDataIntegrityReport,
  healDataIntegrity,
  getErrorLogs,
  resolveErrorLog,
  getMaintenanceSettings,
  updateMaintenanceSettings,
};

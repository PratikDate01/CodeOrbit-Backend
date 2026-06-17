const os = require("os");
const mongoose = require("mongoose");
const ErrorLog = require("../models/ErrorLog");
const Enrollment = require("../models/Enrollment");
const User = require("../models/User");
const Program = require("../models/Program");
const LMSActivityProgress = require("../models/LMSActivityProgress");
const LMSCertificate = require("../models/LMSCertificate");
const asyncHandler = require("../middleware/asyncHandler");
const SystemSetting = require("../models/SystemSetting");
const SecurityEvent = require("../models/SecurityEvent");
const RequestLog = require("../models/RequestLog");
const IntegrityAudit = require("../models/IntegrityAudit");
const AuditLog = require("../models/AuditLog");
const Document = require("../models/Document");
const InternshipApplication = require("../models/InternshipApplication");
const ActivityProgress = require("../models/ActivityProgress");
const CentralLog = require("../models/CentralLog");
const ColdStartWorker = require("../models/ColdStartWorker");
const { getEventLoopData } = require("../utils/eventLoopMonitor");
const { updateMaintenanceCache } = require("../middleware/maintenanceMiddleware");

// --- HELPER SEEDING FUNCTION ---
const seedCentralLogsOnDemand = async () => {
  try {
    const count = await CentralLog.countDocuments();
    if (count > 0) return;

    console.log("[Seeder] CentralLog is empty. Seeding historical logs asynchronously...");

    // 1. Seed recent errors
    const errorLogs = await ErrorLog.find().sort({ createdAt: -1 }).limit(100).lean();
    const centralErrors = errorLogs.map((doc) => ({
      timestamp: doc.createdAt,
      user: doc.user || null,
      method: doc.method || "",
      route: doc.path || "",
      status: doc.severity === "critical" ? "500" : "400",
      ipAddress: doc.ip || "",
      message: doc.message,
      logType: doc.severity === "warning" ? "warning" : "error",
      severity: doc.severity || "error",
      details: { stack: doc.stack, metadata: doc.metadata },
    }));

    // 2. Seed recent security events
    const securityEvents = await SecurityEvent.find().sort({ timestamp: -1 }).limit(100).lean();
    const centralSecurity = securityEvents.map((doc) => ({
      timestamp: doc.timestamp,
      user: doc.user || null,
      method: "",
      route: (doc.details && doc.details.path) || "",
      status: "401",
      ipAddress: doc.ipAddress || "",
      message: doc.action,
      logType: "security",
      severity: doc.eventType === "failed_login" ? "warning" : "error",
      details: doc.details,
    }));

    // 3. Seed recent audit logs
    const auditLogs = await AuditLog.find().sort({ createdAt: -1 }).limit(100).lean();
    const centralAudits = auditLogs.map((doc) => ({
      timestamp: doc.createdAt,
      user: doc.admin || null,
      method: "",
      route: "",
      status: "200",
      ipAddress: doc.ipAddress || "",
      message: `${doc.actionType} on ${doc.targetType}`,
      logType: "audit",
      severity: "info",
      details: doc.details,
    }));

    const allLogs = [...centralErrors, ...centralSecurity, ...centralAudits];
    if (allLogs.length > 0) {
      allLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      await CentralLog.insertMany(allLogs);
      console.log(`[Seeder] Seeded ${allLogs.length} historical logs into CentralLog successfully.`);
    }
  } catch (err) {
    console.error("[Seeder] Failed to seed CentralLogs:", err.message);
  }
};

// @desc    Get system status overview hub
// @route   GET /api/admin/system/overview
// @access  Private/Admin
const getSystemOverview = asyncHandler(async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // 1. process memory usage
  const mem = process.memoryUsage();
  const rssMB = Number((mem.rss / 1024 / 1024).toFixed(2));
  const heapUsedMB = Number((mem.heapUsed / 1024 / 1024).toFixed(2));
  const heapTotalMB = Number((mem.heapTotal / 1024 / 1024).toFixed(2));
  const externalMB = Number((mem.external / 1024 / 1024).toFixed(2));
  const heapUsagePercentage = Number(((mem.heapUsed / mem.heapTotal) * 100).toFixed(2));

  // 2. Event Loop & API Success Rate
  const eventLoop = getEventLoopData();
  const totalReq = await RequestLog.countDocuments({ timestamp: { $gte: startOfDay } });
  const failedReq = await RequestLog.countDocuments({ timestamp: { $gte: startOfDay }, statusCode: { $gte: 400 } });
  const successRate = totalReq ? Number((((totalReq - failedReq) / totalReq) * 100).toFixed(2)) : 100;

  // 3. Dynamic Backend Status
  let backendStatus = "Healthy";
  if (
    mongoose.connection.readyState !== 1 || 
    eventLoop.averageLag > 300 || 
    rssMB > 480 || 
    (totalReq >= 10 && successRate < 50)
  ) {
    backendStatus = "Critical";
  } else if (
    mongoose.connection.readyState === 2 || 
    eventLoop.averageLag > 100 || 
    rssMB > 400 || 
    (totalReq >= 10 && successRate < 85)
  ) {
    backendStatus = "Warning";
  }

  // 4. MongoDB connection status
  let dbStatus = "Disconnected";
  if (mongoose.connection.readyState === 1) {
    dbStatus = "Healthy";
  } else if (mongoose.connection.readyState === 2) {
    dbStatus = "Warning";
  }

  // 5. Active users count
  const activeUsersToday = await User.countDocuments({ lastActive: { $gte: startOfDay } });

  // 6. API Requests
  const apiRequestsToday = await RequestLog.countDocuments({ timestamp: { $gte: startOfDay } });

  // 7. Errors today
  const errorsToday = await CentralLog.countDocuments({
    logType: { $in: ["error", "warning"] },
    timestamp: { $gte: startOfDay }
  });

  // 8. Maintenance Mode Status
  let maintenanceConfig = await SystemSetting.findOne({ key: "maintenance_config" });
  const maintenanceMode = maintenanceConfig ? maintenanceConfig.maintenanceMode : false;

  // 9. Uptime
  const uptime = process.uptime();

  // Last deployment and Git Commit
  let buildTimestamp = null;
  try {
    const fs = require("fs");
    const path = require("path");
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

  // 10. Cold Start Worker Metrics
  let workerStatus = {
    status: "Inactive",
    lastSuccessPing: null,
    lastFailedPing: null,
    successCount: 0,
    failureCount: 0,
    lastPingDuration: 0,
    lastPingTime: null,
    successRate: 100
  };

  const workerDoc = await ColdStartWorker.findOne({ workerId: "main_worker" });
  if (workerDoc) {
    const total = workerDoc.successCount + workerDoc.failureCount;
    const rate = total > 0 ? Number(((workerDoc.successCount / total) * 100).toFixed(1)) : 100;
    workerStatus = {
      status: workerDoc.status,
      lastSuccessPing: workerDoc.lastSuccessPing,
      lastFailedPing: workerDoc.lastFailedPing,
      successCount: workerDoc.successCount,
      failureCount: workerDoc.failureCount,
      lastPingDuration: workerDoc.lastPingDuration,
      lastPingTime: workerDoc.lastPingTime,
      successRate: rate
    };
  }

  res.json({
    backendStatus,
    dbStatus,
    dbPing: 0,
    memory: {
      rss: rssMB,
      heapUsed: heapUsedMB,
      heapTotal: heapTotalMB,
      external: externalMB,
      percentage: heapUsagePercentage
    },
    activeUsers: activeUsersToday,
    apiRequestsToday,
    apiSuccessRate: successRate,
    errorsToday,
    maintenanceMode,
    uptime,
    deployment: {
      environment: process.env.NODE_ENV || "development",
      deploymentTimestamp: new Date(Date.now() - process.uptime() * 1000),
      buildTimestamp,
      gitCommit,
      gitBranch
    },
    coldStartWorker: workerStatus
  });
});

// @desc    Get real-time performance metrics
// @route   GET /api/admin/system/performance
// @access  Private/Admin
const getSystemPerformance = asyncHandler(async (req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const mem = process.memoryUsage();
  const rssMB = Number((mem.rss / 1024 / 1024).toFixed(2));
  const heapUsedMB = Number((mem.heapUsed / 1024 / 1024).toFixed(2));
  const heapTotalMB = Number((mem.heapTotal / 1024 / 1024).toFixed(2));
  const externalMB = Number((mem.external / 1024 / 1024).toFixed(2));

  const cpuLoad = os.loadavg();
  const uptime = process.uptime();
  const eventLoop = getEventLoopData();

  const totalRequestsToday = await RequestLog.countDocuments({ timestamp: { $gte: startOfDay } });
  
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

  const last5Mins = new Date(Date.now() - 5 * 60 * 1000);
  const requestsLast5Mins = await RequestLog.countDocuments({ timestamp: { $gte: last5Mins } });
  const rpm = Number((requestsLast5Mins / 5).toFixed(1));

  res.json({
    memory: {
      rss: rssMB,
      heapUsed: heapUsedMB,
      heapTotal: heapTotalMB,
      external: externalMB,
      percentage: Number(((mem.heapUsed / mem.heapTotal) * 100).toFixed(2))
    },
    cpu: {
      loadavg: cpuLoad,
      cores: os.cpus().length,
      platform: os.platform()
    },
    uptime,
    eventLoop,
    apiMetrics: {
      totalRequestsToday,
      avgResponseTime,
      slowestEndpoint: slowestRequest ? `${slowestRequest.method} ${slowestRequest.route} (${slowestRequest.responseTime}ms)` : "N/A",
      fastestEndpoint: fastestRequest ? `${fastestRequest.method} ${fastestRequest.route} (${fastestRequest.responseTime}ms)` : "N/A",
      topEndpoints,
      rpm
    }
  });
});

// --- CACHE VARS FOR DATABASE METRICS ---
let dbStatsCache = null;
let dbStatsCacheTime = 0;

// @desc    Get real MongoDB diagnostic metrics
// @route   GET /api/admin/system/database
// @access  Private/Admin
const getDatabaseDiagnostics = asyncHandler(async (req, res) => {
  const forceRefresh = req.query.refresh === "true";
  const now = Date.now();

  if (!forceRefresh && dbStatsCache && (now - dbStatsCacheTime < 60000)) {
    return res.json({ ...dbStatsCache, cached: true });
  }

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

  let collectionsCount = 0;
  let totalDocs = 0;
  let indexesCount = 0;

  const businessCounts = {
    Users: 0,
    Applications: 0,
    Enrollments: 0,
    Programs: 0,
    Certificates: 0,
    ProgressLogs: 0
  };

  if (mongoose.connection.readyState === 1) {
    try {
      const db = mongoose.connection.db;
      const collections = await db.listCollections().toArray();
      collectionsCount = collections.length;

      const [
        users,
        applications,
        enrollments,
        programs,
        certificates,
        lmsProgress,
        internProgress
      ] = await Promise.all([
        User.countDocuments(),
        InternshipApplication.countDocuments(),
        Enrollment.countDocuments(),
        Program.countDocuments(),
        LMSCertificate.countDocuments(),
        LMSActivityProgress.countDocuments(),
        ActivityProgress.countDocuments()
      ]);

      businessCounts.Users = users;
      businessCounts.Applications = applications;
      businessCounts.Enrollments = enrollments;
      businessCounts.Programs = programs;
      businessCounts.Certificates = certificates;
      businessCounts.ProgressLogs = lmsProgress + internProgress;

      for (const col of collections) {
        try {
          const stats = await db.collection(col.name).stats();
          totalDocs += stats.count || 0;
          indexesCount += stats.nindexes || 0;
        } catch {
          // stats error fallback
        }
      }
    } catch (dbStatsError) {
      console.error("Error fetching database metrics:", dbStatsError.message);
    }
  }

  dbStatsCache = {
    dbStatus,
    connectionState: mongoose.connection.readyState,
    dbPing,
    collectionsCount,
    totalDocuments: totalDocs,
    indexesCount,
    businessCounts
  };
  dbStatsCacheTime = now;

  res.json({ ...dbStatsCache, cached: false });
});

// --- CACHE VARS FOR INTEGRITY REPORT ---
let integrityReportCache = null;
let integrityReportCacheTime = 0;

// @desc    Audit database relationships and return data integrity metrics
// @route   GET /api/admin/system/integrity
// @access  Private/Admin
const getDataIntegrityReport = asyncHandler(async (req, res) => {
  const forceRefresh = req.query.refresh === "true";
  const now = Date.now();

  if (!forceRefresh && integrityReportCache && (now - integrityReportCacheTime < 60000)) {
    return res.json({ ...integrityReportCache, cached: true });
  }

  // 1. Orphan Users (role client/student who have no InternshipApplication and no Enrollment)
  const studentUsers = await User.find({ role: "client" }).distinct("_id");
  const userApplications = await InternshipApplication.distinct("user");
  const userEnrollments = await Enrollment.distinct("user");
  
  const activeUserIds = new Set([
    ...userApplications.map(id => id ? id.toString() : ""),
    ...userEnrollments.map(id => id ? id.toString() : "")
  ].filter(Boolean));

  const orphanUsers = [];
  const allStudentUsers = await User.find({ _id: { $in: studentUsers } }).select("name email role createdAt").lean();
  for (const u of allStudentUsers) {
    if (!activeUserIds.has(u._id.toString())) {
      orphanUsers.push(u);
    }
  }

  // 2. Orphan Applications (user ref is missing/broken)
  const applications = await InternshipApplication.find().select("_id name email preferredDomain user").lean();
  const orphanApplications = [];
  const applicationUserIds = applications.map(app => app.user).filter(Boolean);
  const existingUserIds = new Set((await User.find({ _id: { $in: applicationUserIds } }).distinct("_id")).map(id => id.toString()));

  for (const app of applications) {
    if (app.user && !existingUserIds.has(app.user.toString())) {
      orphanApplications.push({
        applicationId: app._id,
        name: app.name,
        email: app.email,
        preferredDomain: app.preferredDomain,
        userRef: app.user
      });
    }
  }

  // 3. Orphan Enrollments (user or program missing, or duplicate active)
  const enrollments = await Enrollment.find().lean();
  const orphanEnrollments = [];
  const duplicateMap = {};
  const duplicateEnrollments = [];

  const enrollmentUserIds = enrollments.map(e => e.user).filter(Boolean);
  const enrollmentProgramIds = enrollments.map(e => e.program).filter(Boolean);

  const [existingEnrollmentUsers, existingEnrollmentPrograms] = await Promise.all([
    User.find({ _id: { $in: enrollmentUserIds } }).distinct("_id"),
    Program.find({ _id: { $in: enrollmentProgramIds } }).distinct("_id")
  ]);

  const existingEnrollmentUserSet = new Set(existingEnrollmentUsers.map(id => id.toString()));
  const existingEnrollmentProgramSet = new Set(existingEnrollmentPrograms.map(id => id.toString()));

  for (const enrollment of enrollments) {
    const userExists = enrollment.user ? existingEnrollmentUserSet.has(enrollment.user.toString()) : false;
    const programExists = enrollment.program ? existingEnrollmentProgramSet.has(enrollment.program.toString()) : false;
    
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

  // 4. Orphan Certificates
  const lmsCertificates = await LMSCertificate.find().lean();
  const docs = await Document.find().lean();
  const orphanCertificates = [];

  const certEnrollmentIds = lmsCertificates.map(c => c.enrollment).filter(Boolean);
  const existingEnrollmentIdsSet = new Set((await Enrollment.find({ _id: { $in: certEnrollmentIds } }).distinct("_id")).map(id => id.toString()));

  for (const cert of lmsCertificates) {
    const enrollmentExists = cert.enrollment ? existingEnrollmentIdsSet.has(cert.enrollment.toString()) : false;
    if (!enrollmentExists) {
      orphanCertificates.push({
        certificateId: cert._id,
        certificateCode: cert.certificateId,
        enrollmentRef: cert.enrollment,
        type: "LMSCertificate"
      });
    }
  }

  const docAppIds = docs.map(d => d.applicationId).filter(Boolean);
  const docUserIds = docs.map(d => d.user).filter(Boolean);

  const [existingDocApps, existingDocUsers] = await Promise.all([
    InternshipApplication.find({ _id: { $in: docAppIds } }).distinct("_id"),
    User.find({ _id: { $in: docUserIds } }).distinct("_id")
  ]);

  const existingDocAppsSet = new Set(existingDocApps.map(id => id.toString()));
  const existingDocUsersSet = new Set(existingDocUsers.map(id => id.toString()));

  for (const doc of docs) {
    const appExists = doc.applicationId ? existingDocAppsSet.has(doc.applicationId.toString()) : false;
    const userExists = doc.user ? existingDocUsersSet.has(doc.user.toString()) : false;
    
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

  // 5. Orphan Progress Logs
  const progressRecords = await LMSActivityProgress.find().lean();
  const internProgressRecords = await ActivityProgress.find().lean();
  const orphanProgress = [];

  const progressEnrollmentIds = progressRecords.map(p => p.enrollment).filter(Boolean);
  const existingProgressEnrollmentsSet = new Set((await Enrollment.find({ _id: { $in: progressEnrollmentIds } }).distinct("_id")).map(id => id.toString()));

  for (const progress of progressRecords) {
    const enrollmentExists = progress.enrollment ? existingProgressEnrollmentsSet.has(progress.enrollment.toString()) : false;
    if (!enrollmentExists) {
      orphanProgress.push({
        progressId: progress._id,
        enrollmentRef: progress.enrollment,
        userRef: progress.user,
        type: "LMSProgress"
      });
    }
  }

  const internProgressAppIds = internProgressRecords.map(p => p.internshipApplication).filter(Boolean);
  const existingInternProgressAppsSet = new Set((await InternshipApplication.find({ _id: { $in: internProgressAppIds } }).distinct("_id")).map(id => id.toString()));

  for (const progress of internProgressRecords) {
    const appExists = progress.internshipApplication ? existingInternProgressAppsSet.has(progress.internshipApplication.toString()) : false;
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

  const auditHistory = await IntegrityAudit.find().sort({ timestamp: -1 }).limit(10).lean();

  integrityReportCache = {
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
  };
  integrityReportCacheTime = now;

  res.json({ ...integrityReportCache, cached: false });
});

// @desc    Self-heal orphaned database references (with Safe Preview system)
// @route   POST /api/admin/system/integrity/heal
// @access  Private/Admin
const healDataIntegrity = asyncHandler(async (req, res) => {
  const isConfirm = req.body.confirm === true;

  // 1. Calculate the preview metrics first
  const healingPreview = {
    recordsAffected: 0,
    collectionsAffected: [],
    actions: []
  };

  // Check Action 1: Re-link Orphan Enrollments
  let repairableEnrollments = 0;
  const enrollments = await Enrollment.find().populate("internshipApplication");
  for (const enrollment of enrollments) {
    if (enrollment.user) {
      const userExists = await User.exists({ _id: enrollment.user });
      if (!userExists && enrollment.internshipApplication && enrollment.internshipApplication.email) {
        const matchingUser = await User.findOne({ email: enrollment.internshipApplication.email });
        if (matchingUser) {
          repairableEnrollments++;
        }
      }
    }
  }
  if (repairableEnrollments > 0) {
    healingPreview.actions.push({
      action: "Re-link Orphaned Enrollments to users (by email matching)",
      count: repairableEnrollments,
      collection: "Enrollment"
    });
    healingPreview.recordsAffected += repairableEnrollments;
    healingPreview.collectionsAffected.push("Enrollment");
  }

  // Check Action 2: Deletable Progress Records
  let deletableProgress = 0;
  const progressRecords = await LMSActivityProgress.find().lean();
  for (const progress of progressRecords) {
    const enrollmentExists = progress.enrollment ? await Enrollment.exists({ _id: progress.enrollment }) : false;
    if (!enrollmentExists) {
      deletableProgress++;
    }
  }
  if (deletableProgress > 0) {
    healingPreview.actions.push({
      action: "Delete orphaned LMS Activity Progress records",
      count: deletableProgress,
      collection: "LMSActivityProgress"
    });
    healingPreview.recordsAffected += deletableProgress;
    healingPreview.collectionsAffected.push("LMSActivityProgress");
  }

  // Check Action 3: Deletable Certificates
  let deletableCerts = 0;
  const certificates = await LMSCertificate.find().lean();
  for (const cert of certificates) {
    const enrollmentExists = cert.enrollment ? await Enrollment.exists({ _id: cert.enrollment }) : false;
    if (!enrollmentExists) {
      deletableCerts++;
    }
  }
  if (deletableCerts > 0) {
    healingPreview.actions.push({
      action: "Delete orphaned LMS Certificates",
      count: deletableCerts,
      collection: "LMSCertificate"
    });
    healingPreview.recordsAffected += deletableCerts;
    healingPreview.collectionsAffected.push("LMSCertificate");
  }

  // If not confirmed, return the safe preview summary
  if (!isConfirm) {
    return res.json({
      success: true,
      preview: true,
      summary: healingPreview
    });
  }

  // Execute Phase:
  const healingResults = {
    resolvedUsers: 0,
    cleanedProgressRecords: 0,
    cleanedCertificates: 0,
    errors: [],
  };

  try {
    // Execute Action 1: Re-link enrollments
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

    // Execute Action 2: Deleting progress records
    const progressRecordsToDelete = await LMSActivityProgress.find();
    for (const progress of progressRecordsToDelete) {
      const enrollmentExists = progress.enrollment ? await Enrollment.exists({ _id: progress.enrollment }) : false;
      if (!enrollmentExists) {
        await progress.deleteOne();
        healingResults.cleanedProgressRecords++;
      }
    }

    // Execute Action 3: Deleting certificates
    const certificatesToDelete = await LMSCertificate.find();
    for (const cert of certificatesToDelete) {
      const enrollmentExists = cert.enrollment ? await Enrollment.exists({ _id: cert.enrollment }) : false;
      if (!enrollmentExists) {
        await cert.deleteOne();
        healingResults.cleanedCertificates++;
      }
    }

    // Clear caches
    integrityReportCache = null;

    // Log the healing activity to AuditLog & CentralLog
    await AuditLog.create({
      admin: req.user._id,
      actionType: "HEAL_DATABASE_INTEGRITY",
      targetType: "System",
      targetId: req.user._id,
      details: healingResults,
      ipAddress: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress
    });

  } catch (error) {
    healingResults.errors.push(error.message);
  }

  res.json({
    success: healingResults.errors.length === 0,
    preview: false,
    results: healingResults
  });
});

// @desc    Get paginated and filtered error logs (from CentralLog engine)
// @route   GET /api/admin/system/logs
// @access  Private/Admin
const getErrorLogs = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  // Run initial seeding asynchronously if CentralLog collection is empty
  const centralCount = await CentralLog.countDocuments();
  if (centralCount === 0) {
    await seedCentralLogsOnDemand();
  }

  const filter = {};

  if (req.query.resolvedStatus === "unresolved") {
    filter.resolved = { $ne: true };
    filter.severity = { $ne: "info" }; // skip informational audit logs in error view
  } else if (req.query.resolvedStatus === "resolved") {
    filter.resolved = true;
  }

  if (req.query.severity) {
    filter.severity = req.query.severity;
  }

  if (req.query.logType) {
    filter.logType = req.query.logType;
  }

  if (req.query.route) {
    filter.route = new RegExp(req.query.route, "i");
  }

  if (req.query.startDate || req.query.endDate) {
    filter.timestamp = {};
    if (req.query.startDate) {
      filter.timestamp.$gte = new Date(req.query.startDate);
    }
    if (req.query.endDate) {
      const end = new Date(req.query.endDate);
      end.setHours(23, 59, 59, 999);
      filter.timestamp.$lte = end;
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

  const count = await CentralLog.countDocuments(filter);
  const logs = await CentralLog.find(filter)
    .populate("user", "name email")
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit);

  const totalErrors = await CentralLog.countDocuments({ logType: { $in: ["error", "warning"] } });
  const criticalErrors = await CentralLog.countDocuments({ severity: "critical" });
  const warningErrors = await CentralLog.countDocuments({ severity: "warning" });
  const resolvedErrors = await CentralLog.countDocuments({ resolved: true });

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

// @desc    Mark error log as resolved in both collections
// @route   PUT /api/admin/system/logs/:id/resolve
// @access  Private/Admin
const resolveErrorLog = asyncHandler(async (req, res) => {
  const log = await CentralLog.findById(req.params.id);
  if (!log) {
    const errLog = await ErrorLog.findById(req.params.id);
    if (!errLog) {
      res.status(404);
      throw new Error("Log record not found");
    }
    errLog.resolved = true;
    await errLog.save();
    return res.json({ success: true, log: errLog });
  }

  log.resolved = true;
  await log.save();

  // Resolve matching ErrorLogs in bulk
  await ErrorLog.updateMany(
    { message: log.message, createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    { resolved: true }
  );

  await AuditLog.create({
    admin: req.user._id,
    actionType: "RESOLVE_ERROR_LOG",
    targetType: "CentralLog",
    targetId: log._id,
    details: { message: log.message },
    ipAddress: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress
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

  // Fetch Cold Start Worker status
  let workerStatus = {
    status: "Inactive",
    lastSuccessPing: null,
    lastFailedPing: null,
    successCount: 0,
    failureCount: 0,
    lastPingDuration: 0,
    lastPingTime: null,
    successRate: 100
  };

  const workerDoc = await ColdStartWorker.findOne({ workerId: "main_worker" });
  if (workerDoc) {
    const total = workerDoc.successCount + workerDoc.failureCount;
    const rate = total > 0 ? Number(((workerDoc.successCount / total) * 100).toFixed(1)) : 100;
    workerStatus = {
      status: workerDoc.status,
      lastSuccessPing: workerDoc.lastSuccessPing,
      lastFailedPing: workerDoc.lastFailedPing,
      successCount: workerDoc.successCount,
      failureCount: workerDoc.failureCount,
      lastPingDuration: workerDoc.lastPingDuration,
      lastPingTime: workerDoc.lastPingTime,
      successRate: rate
    };
  }

  res.json({
    ...settings.toObject(),
    coldStartWorker: workerStatus
  });
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

  updateMaintenanceCache({
    maintenanceMode: settings.maintenanceMode,
    allowedUsers: settings.allowedUsers,
  });

  await AuditLog.create({
    admin: req.user._id,
    actionType: "UPDATE_MAINTENANCE_MODE",
    targetType: "SystemSetting",
    targetId: settings._id,
    details: { maintenanceMode, allowedUsersCount: settings.allowedUsers.length },
    ipAddress: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress
  });

  const populated = await SystemSetting.findOne({ key: "maintenance_config" })
    .populate("enabledBy", "name email");

  // Fetch Cold Start Worker status
  let workerStatus = {
    status: "Inactive",
    lastSuccessPing: null,
    lastFailedPing: null,
    successCount: 0,
    failureCount: 0,
    lastPingDuration: 0,
    lastPingTime: null,
    successRate: 100
  };

  const workerDoc = await ColdStartWorker.findOne({ workerId: "main_worker" });
  if (workerDoc) {
    const total = workerDoc.successCount + workerDoc.failureCount;
    const rate = total > 0 ? Number(((workerDoc.successCount / total) * 100).toFixed(1)) : 100;
    workerStatus = {
      status: workerDoc.status,
      lastSuccessPing: workerDoc.lastSuccessPing,
      lastFailedPing: workerDoc.lastFailedPing,
      successCount: workerDoc.successCount,
      failureCount: workerDoc.failureCount,
      lastPingDuration: workerDoc.lastPingDuration,
      lastPingTime: workerDoc.lastPingTime,
      successRate: rate
    };
  }

  res.json({
    ...populated.toObject(),
    coldStartWorker: workerStatus
  });
});

module.exports = {
  getSystemOverview,
  getSystemPerformance,
  getDatabaseDiagnostics,
  getDataIntegrityReport,
  healDataIntegrity,
  getErrorLogs,
  resolveErrorLog,
  getMaintenanceSettings,
  updateMaintenanceSettings,
};

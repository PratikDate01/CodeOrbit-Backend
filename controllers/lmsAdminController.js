const Program = require("../models/Program");
const Course = require("../models/Course");
const Module = require("../models/Module");
const Activity = require("../models/Activity");
const LMSActivityProgress = require("../models/LMSActivityProgress");
const Enrollment = require("../models/Enrollment");
const LMSCertificate = require("../models/LMSCertificate");
const AuditLog = require("../models/AuditLog");
const asyncHandler = require("../middleware/asyncHandler");
const { updateEnrollmentProgress } = require("../utils/lmsHelpers");

// --- Program Controllers ---

// @desc    Get all programs
// @route   GET /api/admin/lms/programs
// @access  Private/Staff
const getPrograms = asyncHandler(async (req, res) => {
  const programs = await Program.find().sort({ createdAt: -1 });
  res.json(programs);
});

// @desc    Create a program
// @route   POST /api/admin/lms/programs
// @access  Private/Admin
const createProgram = asyncHandler(async (req, res) => {
  const { title, description, internshipDomain, thumbnail, duration } = req.body;
  const program = await Program.create({
    title,
    description,
    internshipDomain,
    thumbnail,
    duration,
    createdBy: req.user._id,
  });

  await AuditLog.create({
    admin: req.user._id,
    actionType: "CREATE_LMS_PROGRAM",
    targetType: "Program",
    targetId: program._id,
    details: { title },
  });

  res.status(201).json(program);
});

// @desc    Update a program
// @route   PUT /api/admin/lms/programs/:id
// @access  Private/Admin
const updateProgram = asyncHandler(async (req, res) => {
  const program = await Program.findById(req.params.id);
  if (!program) {
    res.status(404);
    throw new Error("Program not found");
  }

  const updatedProgram = await Program.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );

  await AuditLog.create({
    admin: req.user._id,
    actionType: "UPDATE_LMS_PROGRAM",
    targetType: "Program",
    targetId: program._id,
    details: req.body,
  });

  res.json(updatedProgram);
});

// --- Course Controllers ---

// @desc    Get courses for a program
// @route   GET /api/admin/lms/programs/:programId/courses
// @access  Private/Staff
const getCourses = asyncHandler(async (req, res) => {
  const courses = await Course.find({ program: req.params.programId }).sort({ order: 1 });
  res.json(courses);
});

// @desc    Create a course
// @route   POST /api/admin/lms/courses
// @access  Private/Admin
const createCourse = asyncHandler(async (req, res) => {
  const { program, title, description, order } = req.body;
  const course = await Course.create({ program, title, description, order });

  await AuditLog.create({
    admin: req.user._id,
    actionType: "CREATE_LMS_COURSE",
    targetType: "Course",
    targetId: course._id,
    details: { title, programId: program },
  });

  res.status(201).json(course);
});

// --- Module Controllers ---

// @desc    Get modules for a course
// @route   GET /api/admin/lms/courses/:courseId/modules
// @access  Private/Staff
const getModules = asyncHandler(async (req, res) => {
  const modules = await Module.find({ course: req.params.courseId }).sort({ order: 1 });
  res.json(modules);
});

// @desc    Create a module
// @route   POST /api/admin/lms/modules
// @access  Private/Admin
const createModule = asyncHandler(async (req, res) => {
  const { course, title, description, order } = req.body;
  const moduleObj = await Module.create({ course, title, description, order });

  await AuditLog.create({
    admin: req.user._id,
    actionType: "CREATE_LMS_MODULE",
    targetType: "Module",
    targetId: moduleObj._id,
    details: { title, courseId: course },
  });

  res.status(201).json(moduleObj);
});

// --- Activity Controllers ---

// @desc    Get activities for a lesson
// @route   GET /api/admin/lms/lessons/:lessonId/activities
// @access  Private/Staff
const getActivities = asyncHandler(async (req, res) => {
  const activities = await Activity.find({ lesson: req.params.lessonId }).sort({ order: 1 });
  res.json(activities);
});

// @desc    Create an activity
// @route   POST /api/admin/lms/activities
// @access  Private/Admin
const createActivity = asyncHandler(async (req, res) => {
  const activity = await Activity.create(req.body);

  await AuditLog.create({
    admin: req.user._id,
    actionType: "CREATE_LMS_ACTIVITY",
    targetType: "Activity",
    targetId: activity._id,
    details: { title: activity.title, type: activity.type, lessonId: activity.lesson },
  });

  res.status(201).json(activity);
});

// --- Approval Controllers ---

// @desc    Approve/Reject activity progress
// @route   PATCH /api/admin/lms/progress/:id/approve
// @access  Private/Admin
const approveActivityProgress = asyncHandler(async (req, res) => {
  const { status, remarks, marks } = req.body;
  const progress = await LMSActivityProgress.findById(req.params.id).populate("enrollment");
  
  if (!progress) {
    res.status(404);
    throw new Error("Progress record not found");
  }

  progress.status = status;
  progress.marks = marks || progress.marks;
  progress.adminApproval = {
    isApproved: status === "Completed",
    approvedBy: req.user._id,
    approvedAt: Date.now(),
    remarks,
  };

  await progress.save();

  // If approved, update overall enrollment progress
  if (status === "Completed") {
    await updateEnrollmentProgress(progress.enrollment._id);
  }

  await AuditLog.create({
    admin: req.user._id,
    actionType: "APPROVE_LMS_ACTIVITY",
    targetType: "LMSActivityProgress",
    targetId: progress._id,
    details: { status, remarks, enrollmentId: progress.enrollment._id },
  });

  res.json(progress);
});

// @desc    Get all enrollments for admin review
// @route   GET /api/admin/lms/enrollments
// @access  Private/Staff
const getEnrollments = asyncHandler(async (req, res) => {
  const { program, status, user } = req.query;
  const query = {};
  if (program) query.program = program;
  if (status) query.status = status;
  if (user) query.user = user;

  const enrollments = await Enrollment.find(query)
    .populate("user", "name email")
    .populate("program", "title")
    .sort({ createdAt: -1 });
  res.json(enrollments);
});

// @desc    Issue certificate for an enrollment
// @route   POST /api/admin/lms/enrollments/:id/issue-certificate
// @access  Private/Admin
const issueCertificate = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findById(req.params.id)
    .populate("user")
    .populate("program");

  if (!enrollment) {
    res.status(404);
    throw new Error("Enrollment not found");
  }

  if (enrollment.progress < 100) {
    res.status(400);
    throw new Error("Program not yet completed (Progress < 100%)");
  }

  // Check if certificate already exists
  const existingCert = await LMSCertificate.findOne({ enrollment: enrollment._id });
  if (existingCert) {
    res.status(400);
    throw new Error("Certificate already issued for this enrollment");
  }

  // Generate unique certificate ID (Example: CO-LMS-2026-XXXXX)
  const certId = `CO-LMS-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  const certificate = await LMSCertificate.create({
    enrollment: enrollment._id,
    user: enrollment.user._id,
    program: enrollment.program._id,
    certificateId: certId,
    approvedBy: req.user._id,
  });

  enrollment.isCertificateIssued = true;
  enrollment.status = "Completed";
  enrollment.completedAt = Date.now();
  await enrollment.save();

  await AuditLog.create({
    admin: req.user._id,
    actionType: "ISSUE_LMS_CERTIFICATE",
    targetType: "LMSCertificate",
    targetId: certificate._id,
    details: { certificateId: certId, userId: enrollment.user._id },
  });

  res.status(201).json(certificate);
});

// @desc    Delete a program
// @route   DELETE /api/admin/lms/programs/:id
// @access  Private/Admin
const deleteProgram = asyncHandler(async (req, res) => {
  const program = await Program.findById(req.params.id);
  if (!program) {
    res.status(404);
    throw new Error("Program not found");
  }

  await program.deleteOne();

  await AuditLog.create({
    admin: req.user._id,
    actionType: "DELETE_LMS_PROGRAM",
    targetType: "Program",
    targetId: req.params.id,
    details: { title: program.title },
  });

  res.json({ message: "Program deleted successfully" });
});

module.exports = {
  getPrograms,
  createProgram,
  updateProgram,
  deleteProgram,
  getCourses,
  createCourse,
  getModules,
  createModule,
  getActivities,
  createActivity,
  approveActivityProgress,
  getEnrollments,
  issueCertificate,
};

const asyncHandler = require("../middleware/asyncHandler");
const Task = require("../models/Task");
const Submission = require("../models/Submission");
const ActivityProgress = require("../models/ActivityProgress");
const AuditLog = require("../models/AuditLog");
const InternshipApplication = require("../models/InternshipApplication");

// --- Task Management (Admin) ---

// @desc    Create a new task
// @route   POST /api/activity/tasks
// @access  Private/Admin
const createTask = asyncHandler(async (req, res) => {
  const { title, description, type, internshipDomain, maxMarks, passingMarks, deadline } = req.body;

  const task = await Task.create({
    title,
    description,
    type,
    internshipDomain,
    maxMarks,
    passingMarks,
    deadline,
    createdBy: req.user._id,
  });

  await AuditLog.create({
    admin: req.user._id,
    actionType: "CREATE_TASK",
    targetType: "Task",
    targetId: task._id,
    details: { title, internshipDomain },
  });

  res.status(201).json(task);
});

// @desc    Get all tasks (Admin) or filtered by domain
// @route   GET /api/activity/tasks
// @access  Private
const getTasks = asyncHandler(async (req, res) => {
  const { domain } = req.query;
  const query = domain ? { internshipDomain: domain } : {};
  
  const tasks = await Task.find(query).sort({ createdAt: -1 });
  res.json(tasks);
});

// @desc    Update a task
// @route   PUT /api/activity/tasks/:id
// @access  Private/Admin
const updateTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);

  if (task) {
    task.title = req.body.title || task.title;
    task.description = req.body.description || task.description;
    task.type = req.body.type || task.type;
    task.internshipDomain = req.body.internshipDomain || task.internshipDomain;
    task.maxMarks = req.body.maxMarks || task.maxMarks;
    task.passingMarks = req.body.passingMarks || task.passingMarks;
    task.deadline = req.body.deadline || task.deadline;

    const updatedTask = await task.save();

    await AuditLog.create({
      admin: req.user._id,
      actionType: "UPDATE_TASK",
      targetType: "Task",
      targetId: task._id,
      details: { title: task.title },
    });

    res.json(updatedTask);
  } else {
    res.status(404);
    throw new Error("Task not found");
  }
});

// @desc    Delete a task
// @route   DELETE /api/activity/tasks/:id
// @access  Private/Admin
const deleteTask = asyncHandler(async (req, res) => {
  const task = await Task.findById(req.params.id);

  if (task) {
    await task.deleteOne();

    await AuditLog.create({
      admin: req.user._id,
      actionType: "DELETE_TASK",
      targetType: "Task",
      targetId: req.params.id,
    });

    res.json({ message: "Task removed" });
  } else {
    res.status(404);
    throw new Error("Task not found");
  }
});

// --- Submission Management ---

// @desc    Submit a task (Student)
// @route   POST /api/activity/submissions
// @access  Private
const submitTask = asyncHandler(async (req, res) => {
  const { taskId, internshipId, content } = req.body;

  // Validate internship application exists and belongs to user
  const application = await InternshipApplication.findOne({
    _id: internshipId,
    user: req.user._id,
  });

  if (!application) {
    res.status(404);
    throw new Error("Internship application not found");
  }

  const task = await Task.findById(taskId);
  if (!task) {
    res.status(404);
    throw new Error("Task not found");
  }

  // Check if already submitted
  const existingSubmission = await Submission.findOne({
    task: taskId,
    student: req.user._id,
    internshipApplication: internshipId,
  });

  if (existingSubmission && ["Submitted", "Approved"].includes(existingSubmission.status)) {
    res.status(400);
    throw new Error("Task already submitted or approved");
  }

  let submission;
  if (existingSubmission) {
    // Update existing if resubmission required
    existingSubmission.content = content;
    existingSubmission.status = "Submitted";
    submission = await existingSubmission.save();
  } else {
    submission = await Submission.create({
      task: taskId,
      student: req.user._id,
      internshipApplication: internshipId,
      content,
    });
  }

  res.status(201).json(submission);
});

// @desc    Get submissions for a specific task (Admin) or user (Student)
// @route   GET /api/activity/submissions
// @access  Private
const getSubmissions = asyncHandler(async (req, res) => {
  const { taskId, internshipId } = req.query;
  const query = {};

  if (req.user.role === "admin") {
    if (taskId) query.task = taskId;
    if (internshipId) query.internshipApplication = internshipId;
  } else {
    query.student = req.user._id;
    if (internshipId) query.internshipApplication = internshipId;
  }

  const submissions = await Submission.find(query)
    .populate("task", "title type")
    .populate("student", "name email")
    .sort({ createdAt: -1 });

  res.json(submissions);
});

// @desc    Evaluate a submission (Admin)
// @route   PUT /api/activity/submissions/:id/evaluate
// @access  Private/Admin
const evaluateSubmission = asyncHandler(async (req, res) => {
  const { status, marks, adminRemarks } = req.body;
  const submission = await Submission.findById(req.params.id).populate("task");

  if (submission) {
    submission.status = status || submission.status;
    submission.marks = marks !== undefined ? marks : submission.marks;
    submission.adminRemarks = adminRemarks || submission.adminRemarks;
    submission.evaluatedBy = req.user._id;
    submission.evaluatedAt = Date.now();

    const updatedSubmission = await submission.save();

    // Trigger progress update
    await updateActivityProgress(submission.internshipApplication, submission.student);

    await AuditLog.create({
      admin: req.user._id,
      actionType: "EVALUATE_SUBMISSION",
      targetType: "Submission",
      targetId: submission._id,
      details: { status, marks },
    });

    res.json(updatedSubmission);
  } else {
    res.status(404);
    throw new Error("Submission not found");
  }
});

// --- Progress & Eligibility Logic ---

const updateActivityProgress = async (internshipId, userId) => {
  const application = await InternshipApplication.findById(internshipId);
  if (!application) return;

  // Get total tasks for this domain
  const totalTasks = await Task.countDocuments({ internshipDomain: application.preferredDomain });
  
  // Get approved submissions
  const approvedSubmissions = await Submission.countDocuments({
    internshipApplication: internshipId,
    student: userId,
    status: "Approved",
  });

  const progressPercentage = totalTasks > 0 ? (approvedSubmissions / totalTasks) * 100 : 0;

  let progress = await ActivityProgress.findOne({ internshipApplication: internshipId });

  if (!progress) {
    progress = new ActivityProgress({
      internshipApplication: internshipId,
      user: userId,
    });
  }

  progress.progressPercentage = progressPercentage;
  progress.completedTasksCount = approvedSubmissions;
  
  // Auto-set eligibility if criteria met (e.g., 100% tasks approved)
  // Admin can still override this
  if (progressPercentage >= 100 && !progress.adminManuallyCompleted) {
    // progress.isEligibleForCertificate = true; // Keep it manual for now as per requirements
  }

  await progress.save();
};

// @desc    Update eligibility status manually (Admin)
// @route   PUT /api/activity/progress/:internshipId/eligibility
// @access  Private/Admin
const updateEligibility = asyncHandler(async (req, res) => {
  const { isEligibleForCertificate, adminManuallyCompleted } = req.body;
  
  let progress = await ActivityProgress.findOne({ internshipApplication: req.params.internshipId });

  if (!progress) {
    const application = await InternshipApplication.findById(req.params.internshipId);
    if (!application) {
      res.status(404);
      throw new Error("Internship application not found");
    }
    progress = new ActivityProgress({
      internshipApplication: req.params.internshipId,
      user: application.user,
    });
  }

  progress.isEligibleForCertificate = isEligibleForCertificate !== undefined ? isEligibleForCertificate : progress.isEligibleForCertificate;
  progress.adminManuallyCompleted = adminManuallyCompleted !== undefined ? adminManuallyCompleted : progress.adminManuallyCompleted;
  progress.lastUpdatedBy = req.user._id;

  const updatedProgress = await progress.save();

  await AuditLog.create({
    admin: req.user._id,
    actionType: "UPDATE_ELIGIBILITY",
    targetType: "ActivityProgress",
    targetId: updatedProgress._id,
    details: { isEligibleForCertificate, adminManuallyCompleted },
  });

  res.json(updatedProgress);
});

// @desc    Get activity progress for an internship
// @route   GET /api/activity/progress/:internshipId
// @access  Private
const getProgress = asyncHandler(async (req, res) => {
  const progress = await ActivityProgress.findOne({ internshipApplication: req.params.internshipId })
    .populate("user", "name email");

  if (!progress) {
    return res.json({
      progressPercentage: 0,
      completedTasksCount: 0,
      isEligibleForCertificate: false,
    });
  }

  res.json(progress);
});

module.exports = {
  createTask,
  getTasks,
  updateTask,
  deleteTask,
  submitTask,
  getSubmissions,
  evaluateSubmission,
  updateEligibility,
  getProgress,
};

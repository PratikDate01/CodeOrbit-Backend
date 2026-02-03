const Program = require("../models/Program");
const Course = require("../models/Course");
const Module = require("../models/Module");
const Lesson = require("../models/Lesson");
const Activity = require("../models/Activity");
const LMSActivityProgress = require("../models/LMSActivityProgress");
const Enrollment = require("../models/Enrollment");
const asyncHandler = require("../middleware/asyncHandler");

// @desc    Get my enrollments
// @route   GET /api/lms/my-enrollments
// @access  Private
const getMyEnrollments = asyncHandler(async (req, res) => {
  const enrollments = await Enrollment.find({ user: req.user._id })
    .populate("program")
    .sort({ createdAt: -1 });
  res.json(enrollments);
});

// @desc    Get program details (if enrolled)
// @route   GET /api/lms/programs/:id
// @access  Private
const getProgramDetails = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findOne({
    user: req.user._id,
    program: req.params.id,
  });

  if (!enrollment && req.user.role === "client") {
    res.status(403);
    throw new Error("Not enrolled in this program");
  }

  const program = await Program.findById(req.params.id);
  const courses = await Course.find({ program: req.params.id, isPublished: true }).sort({ order: 1 });

  res.json({ program, courses });
});

// @desc    Get module/lesson details with progress
// @route   GET /api/lms/courses/:courseId/content
// @access  Private
const getCourseContent = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.courseId);
  if (!course) {
    res.status(404);
    throw new Error("Course not found");
  }

  // Check enrollment
  const enrollment = await Enrollment.findOne({
    user: req.user._id,
    program: course.program,
  });

  if (!enrollment && req.user.role === "client") {
    res.status(403);
    throw new Error("Not enrolled in this program");
  }

  const modules = await Module.find({ course: req.params.courseId, isPublished: true }).sort({ order: 1 });
  
  // Get all lessons for these modules
  const moduleIds = modules.map(m => m._id);
  const lessons = await Lesson.find({ module: { $in: moduleIds }, isPublished: true }).sort({ order: 1 });

  // Get all activities for these lessons
  const lessonIds = lessons.map(l => l._id);
  const activities = await Activity.find({ lesson: { $in: lessonIds }, isPublished: true }).sort({ order: 1 });

  // Get user progress for these activities
  const progress = await LMSActivityProgress.find({
    enrollment: enrollment._id,
    activity: { $in: activities.map(a => a._id) },
  });

  res.json({ modules, lessons, activities, progress });
});

// @desc    Update activity progress
// @route   POST /api/lms/activities/:id/progress
// @access  Private
const updateActivityProgress = asyncHandler(async (req, res) => {
  const { status, progressData, submissionContent } = req.body;
  const activity = await Activity.findById(req.params.id).populate({
    path: "lesson",
    populate: { path: "module", populate: { path: "course" } }
  });

  if (!activity) {
    res.status(404);
    throw new Error("Activity not found");
  }

  const enrollment = await Enrollment.findOne({
    user: req.user._id,
    program: activity.lesson.module.course.program,
  });

  if (!enrollment) {
    res.status(403);
    throw new Error("Not enrolled in this program");
  }

  let progress = await LMSActivityProgress.findOne({
    enrollment: enrollment._id,
    activity: activity._id,
  });

  if (!progress) {
    progress = new LMSActivityProgress({
      enrollment: enrollment._id,
      activity: activity._id,
      user: req.user._id,
    });
  }

  // If activity is a Quiz or Assignment, status might be 'Submitted' or 'Pending Approval'
  // Auto-complete if it's Text or Video (depending on criteria)
  progress.status = status || progress.status;
  if (progressData) {
    progress.progressData = { ...progress.progressData, ...progressData };
  }
  if (submissionContent) {
    progress.submissionContent = submissionContent;
  }

  await progress.save();
  res.json(progress);
});

// @desc    Submit quiz
// @route   POST /api/lms/activities/:id/submit-quiz
// @access  Private
const submitQuiz = asyncHandler(async (req, res) => {
  const { answers } = req.body; // Array of answers
  const activity = await Activity.findById(req.params.id).populate({
    path: "lesson",
    populate: { path: "module", populate: { path: "course" } }
  });

  if (!activity || activity.type !== "Quiz") {
    res.status(404);
    throw new Error("Quiz not found");
  }

  const enrollment = await Enrollment.findOne({
    user: req.user._id,
    program: activity.lesson.module.course.program,
  });

  if (!enrollment) {
    res.status(403);
    throw new Error("Not enrolled in this program");
  }

  // Calculate score
  let correctCount = 0;
  activity.quizData.forEach((q, index) => {
    if (answers[index] === q.correctAnswer) {
      correctCount++;
    }
  });

  const score = (correctCount / activity.quizData.length) * 100;

  let progress = await LMSActivityProgress.findOne({
    enrollment: enrollment._id,
    activity: activity._id,
  });

  if (!progress) {
    progress = new LMSActivityProgress({
      enrollment: enrollment._id,
      activity: activity._id,
      user: req.user._id,
    });
  }

  progress.status = "Pending Approval";
  progress.marks = score;
  progress.progressData.quizAttempts = (progress.progressData.quizAttempts || 0) + 1;
  progress.progressData.lastAttemptDate = Date.now();
  progress.submissionContent = JSON.stringify(answers);

  await progress.save();

  res.json({
    message: "Quiz submitted successfully. Pending admin approval.",
    score,
    status: progress.status,
  });
});

module.exports = {
  getMyEnrollments,
  getProgramDetails,
  getCourseContent,
  updateActivityProgress,
  submitQuiz,
};

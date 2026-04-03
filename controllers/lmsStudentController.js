const Program = require("../models/Program");
const Course = require("../models/Course");
const Module = require("../models/Module");
const Lesson = require("../models/Lesson");
const Activity = require("../models/Activity");
const LMSActivityProgress = require("../models/LMSActivityProgress");
const Enrollment = require("../models/Enrollment");
const User = require("../models/User");
const asyncHandler = require("../middleware/asyncHandler");
const { updateEnrollmentProgress } = require("../utils/lmsHelpers");

// @desc    Get my enrollments with current module info
// @route   GET /api/lms/my-enrollments
// @access  Private
const getMyEnrollments = asyncHandler(async (req, res) => {
  const enrollments = await Enrollment.find({ user: req.user._id })
    .populate("program")
    .sort({ createdAt: -1 });

  // Add current module info for each enrollment
  const enrollmentsWithModule = await Promise.all(enrollments.map(async (enrollment) => {
    // Find the last completed or started activity for this enrollment
    const lastProgress = await LMSActivityProgress.findOne({
      enrollment: enrollment._id
    }).sort({ updatedAt: -1 }).populate({
      path: 'activity',
      populate: { path: 'lesson', populate: { path: 'module' } }
    });

    const enrollmentObj = enrollment.toObject();
    
    if (lastProgress && lastProgress.activity && lastProgress.activity.lesson) {
      enrollmentObj.currentModule = lastProgress.activity.lesson.module;
      enrollmentObj.lastActivityTitle = lastProgress.activity.title;
    } else {
      // If no progress, find the first module of the program
      const firstCourse = await Course.findOne({ program: enrollment.program._id }).sort({ order: 1 });
      if (firstCourse) {
        const firstModule = await Module.findOne({ course: firstCourse._id }).sort({ order: 1 });
        enrollmentObj.currentModule = firstModule;
      }
    }
    
    return enrollmentObj;
  }));

  res.json(enrollmentsWithModule);
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
  const courses = await Course.find({ program: req.params.id }).sort({ order: 1 });

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

  const modules = await Module.find({ course: req.params.courseId }).sort({ order: 1 });
  
  // Get all lessons for these modules
  const moduleIds = modules.map(m => m._id);
  const lessons = await Lesson.find({ module: { $in: moduleIds } }).sort({ order: 1 });

  // Get all activities for these lessons
  const lessonIds = lessons.map(l => l._id);
  const activities = await Activity.find({ lesson: { $in: lessonIds } })
    .populate("task");

  // Get user progress for these activities
  const progress = await LMSActivityProgress.find({
    enrollment: enrollment._id,
    activity: { $in: activities.map(a => a._id) },
  });

  // Sort activities based on hierarchy: Module Order -> Lesson Order -> Activity Order
  const moduleOrderMap = {};
  modules.forEach(m => moduleOrderMap[m._id.toString()] = m.order);

  const lessonDataMap = {};
  lessons.forEach(l => {
    lessonDataMap[l._id.toString()] = {
      moduleOrder: moduleOrderMap[l.module.toString()] || 0,
      lessonOrder: l.order
    };
  });

  activities.sort((a, b) => {
    const dataA = lessonDataMap[a.lesson.toString()];
    const dataB = lessonDataMap[b.lesson.toString()];
    
    if (dataA.moduleOrder !== dataB.moduleOrder) {
      return dataA.moduleOrder - dataB.moduleOrder;
    }
    if (dataA.lessonOrder !== dataB.lessonOrder) {
      return dataA.lessonOrder - dataB.lessonOrder;
    }
    return a.order - b.order;
  });

  // IMPLEMENT SEQUENTIAL LOCKING LOGIC
  let previousCompleted = true; // First activity is always unlocked
  const activitiesWithLock = activities.map((activity) => {
    const activityProgress = progress.find(p => p.activity.toString() === activity._id.toString());
    const isCompleted = activityProgress?.status === "Completed";
    
    // An activity is locked if the previous one was NOT completed
    const isLocked = !previousCompleted;
    
    // Update for next iteration: only REQUIRED activities block the next one
    if (activity.isRequired) {
      previousCompleted = isCompleted;
    }

    return {
      ...activity.toObject(),
      isLocked,
      isCompleted
    };
  });

  res.json({ modules, lessons, activities: activitiesWithLock, progress });
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
    if (!progress.progressData) {
      progress.progressData = {
        watchTime: 0,
        percentageWatched: 0,
        quizAttempts: 0,
      };
    }
    progress.progressData = { ...progress.progressData.toObject(), ...progressData };
  }
  if (submissionContent) {
    progress.submissionContent = submissionContent;
  }

  await progress.save();
  
  // Award XP if completed
  if (status === "Completed") {
    const activity = await Activity.findById(progress.activity);
    if (activity && activity.xpPoints > 0 && progress.xpEarned === 0) {
      progress.xpEarned = activity.xpPoints;
      await progress.save();
      
      await User.findByIdAndUpdate(req.user._id, {
        $inc: { totalXP: activity.xpPoints }
      });
    }
  }

  // Trigger progress update if status is Completed
  if (status === "Completed") {
    await updateEnrollmentProgress(enrollment._id);
  }

  res.json(progress);
});

// @desc    Submit quiz
// @route   POST /api/lms/quiz/submit
// @access  Private
const submitQuiz = asyncHandler(async (req, res) => {
  const activityId = req.body.activityId || req.params.id;
  const { answers } = req.body; // Array of answers

  if (!activityId || !answers || !Array.isArray(answers)) {
    res.status(400);
    throw new Error("Activity ID and answers are required and must be an array");
  }

  const activity = await Activity.findById(activityId).populate({
    path: "lesson",
    populate: { path: "module", populate: { path: "course" } }
  });

  if (!activity || activity.type !== "Quiz") {
    res.status(404);
    throw new Error("Quiz not found");
  }

  const questions = activity.questions && activity.questions.length > 0 ? activity.questions : activity.quizData;

  if (!questions || questions.length === 0) {
    res.status(400);
    throw new Error("This quiz has no questions");
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
  questions.forEach((q, index) => {
    const userAnswer = answers[index];
    const correctAnswer = q.correctAnswer;

    // Handle index-based comparison (New System)
    if (typeof correctAnswer === 'number' || !isNaN(correctAnswer)) {
      if (userAnswer == correctAnswer) {
        correctCount++;
      }
    } 
    // Handle text-based comparison (Old System)
    else if (userAnswer === correctAnswer) {
      correctCount++;
    }
    // Handle case where user submits index but correct answer is text
    else if (typeof userAnswer === 'number' && q.options && q.options[userAnswer] === correctAnswer) {
      correctCount++;
    }
  });

  const score = questions.length > 0 ? (correctCount / questions.length) * 100 : 0;
  const passed = score >= (activity.passingScore || 60);

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

  if (!progress.progressData) {
    progress.progressData = {
      quizAttempts: 0,
      lastAttemptDate: Date.now()
    };
  }

  progress.status = passed ? "Completed" : "Rejected";
  progress.marks = score;
  progress.progressData.quizAttempts = (progress.progressData.quizAttempts || 0) + 1;
  progress.progressData.lastAttemptDate = Date.now();
  progress.submissionContent = JSON.stringify(answers);

  // Award XP if completed
  if (progress.status === "Completed" && activity.xpPoints > 0 && (!progress.xpEarned || progress.xpEarned === 0)) {
    progress.xpEarned = activity.xpPoints;
    await User.findByIdAndUpdate(req.user._id, {
      $inc: { totalXP: activity.xpPoints }
    });
  }

  await progress.save();

  // Trigger enrollment progress update if passed
  if (passed) {
    await updateEnrollmentProgress(enrollment._id);
  }

  res.json({
    score,
    passed,
    status: progress.status,
  });
});

// @desc    Get activity details
// @route   GET /api/lms/activities/:id
// @access  Private
const getActivityById = asyncHandler(async (req, res) => {
  const activity = await Activity.findById(req.params.id);
  if (!activity) {
    res.status(404);
    throw new Error("Activity not found");
  }
  res.json(activity);
});

module.exports = {
  getMyEnrollments,
  getProgramDetails,
  getCourseContent,
  updateActivityProgress,
  submitQuiz,
  getActivityById,
};

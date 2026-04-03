const AssignmentSubmission = require("../models/AssignmentSubmission");
const Activity = require("../models/Activity");
const LMSActivityProgress = require("../models/LMSActivityProgress");
const Enrollment = require("../models/Enrollment");
const User = require("../models/User");
const asyncHandler = require("../middleware/asyncHandler");
const { updateEnrollmentProgress } = require("../utils/lmsHelpers");

// @desc    Submit an assignment
// @route   POST /api/lms/assignment/submit
// @access  Private
const submitAssignment = asyncHandler(async (req, res) => {
  const { activityId, submissionText, fileUrl } = req.body;

  if (!activityId) {
    res.status(400);
    throw new Error("Activity ID is required");
  }

  const activity = await Activity.findById(activityId).populate({
    path: "lesson",
    populate: { path: "module", populate: { path: "course" } }
  });

  if (!activity || activity.type !== "Assignment") {
    res.status(404);
    throw new Error("Assignment activity not found");
  }

  const enrollment = await Enrollment.findOne({
    user: req.user._id,
    program: activity.lesson.module.course.program,
  });

  if (!enrollment) {
    res.status(403);
    throw new Error("Not enrolled in this program");
  }

  let submission = await AssignmentSubmission.findOne({
    user: req.user._id,
    activity: activityId
  });

  if (submission) {
    submission.submissionText = submissionText;
    submission.fileUrl = fileUrl;
    submission.status = "Pending";
    submission.submittedAt = Date.now();
    await submission.save();
  } else {
    submission = await AssignmentSubmission.create({
      user: req.user._id,
      activity: activityId,
      submissionText,
      fileUrl,
      status: "Pending"
    });
  }

  // Update Activity Progress status to "Submitted" or similar
  let progress = await LMSActivityProgress.findOne({
    enrollment: enrollment._id,
    activity: activityId,
  });

  if (!progress) {
    progress = new LMSActivityProgress({
      enrollment: enrollment._id,
      activity: activityId,
      user: req.user._id,
    });
  }

  progress.status = "Pending Approval";
  progress.submissionContent = submissionText + (fileUrl ? `\n\n[FILE_URL]: ${fileUrl}` : "");
  await progress.save();

  res.status(201).json(submission);
});

// @desc    Get submissions for an activity (Admin view)
// @route   GET /api/lms/assignment/:activityId
// @access  Private/Admin
const getSubmissionsByActivity = asyncHandler(async (req, res) => {
  const submissions = await AssignmentSubmission.find({ activity: req.params.activityId })
    .populate("user", "name email")
    .sort("-submittedAt");

  res.json(submissions);
});

// @desc    Review/Evaluate an assignment submission
// @route   PUT /api/lms/assignment/:id/review
// @access  Private/Admin
const reviewAssignment = asyncHandler(async (req, res) => {
  const { marks, remarks, status } = req.body;

  const submission = await AssignmentSubmission.findById(req.params.id);

  if (!submission) {
    res.status(404);
    throw new Error("Submission not found");
  }

  submission.marks = marks;
  submission.remarks = remarks;
  submission.status = status;
  await submission.save();

  // Find the activity to get the program context
  const activity = await Activity.findById(submission.activity).populate({
    path: "lesson",
    populate: { path: "module", populate: { path: "course" } }
  });

  // Find the user's enrollment
  const enrollment = await Enrollment.findOne({
    user: submission.user,
    program: activity.lesson.module.course.program,
  });

  if (enrollment) {
    let progress = await LMSActivityProgress.findOne({
      enrollment: enrollment._id,
      activity: activity._id,
    });

    if (progress) {
      if (status === "Approved") {
        progress.status = "Completed";
        progress.marks = marks;
        
        // Award XP if first time completing
        if (activity.xpPoints > 0 && (!progress.xpEarned || progress.xpEarned === 0)) {
          progress.xpEarned = activity.xpPoints;
          await User.findByIdAndUpdate(submission.user, {
            $inc: { totalXP: activity.xpPoints }
          });
        }
        
        await progress.save();
        await updateEnrollmentProgress(enrollment._id);
      } else if (status === "Rejected") {
        progress.status = "Rejected";
        await progress.save();
      }
    }
  }

  res.json(submission);
});

module.exports = {
  submitAssignment,
  getSubmissionsByActivity,
  reviewAssignment
};

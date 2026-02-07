const Enrollment = require("../models/Enrollment");
const Activity = require("../models/Activity");
const LMSActivityProgress = require("../models/LMSActivityProgress");
const Course = require("../models/Course");
const Module = require("../models/Module");
const Lesson = require("../models/Lesson");
const Program = require("../models/Program");

/**
 * Auto-enroll a user into a program based on their internship domain
 * @param {string} userId 
 * @param {string} domain 
 * @param {string} applicationId 
 */
const autoEnrollUser = async (userId, domain, applicationId) => {
  try {
    // 1. Find the program matching the domain
    const program = await Program.findOne({ internshipDomain: domain, isPublished: true });
    if (!program) {
      console.warn(`No published program found for domain: ${domain}`);
      return null;
    }

    // 2. Check if already enrolled
    let enrollment = await Enrollment.findOne({ user: userId, program: program._id });
    if (enrollment) {
      return enrollment;
    }

    // 3. Create enrollment
    enrollment = await Enrollment.create({
      user: userId,
      program: program._id,
      internshipApplication: applicationId,
      status: "Active",
    });

    return enrollment;
  } catch (error) {
    console.error("Auto-enrollment error:", error);
    return null;
  }
};

/**
 * Recalculate and update the overall progress of an enrollment
 * @param {string} enrollmentId 
 */
const updateEnrollmentProgress = async (enrollmentId) => {
  const enrollment = await Enrollment.findById(enrollmentId).populate("program");
  if (!enrollment) return;

  // 1. Get all activities in the program
  const courses = await Course.find({ program: enrollment.program._id, isPublished: true });
  const courseIds = courses.map(c => c._id);
  
  const modules = await Module.find({ course: { $in: courseIds }, isPublished: true });
  const moduleIds = modules.map(m => m._id);

  const lessons = await Lesson.find({ module: { $in: moduleIds }, isPublished: true });
  const lessonIds = lessons.map(l => l._id);

  const requiredActivities = await Activity.find({ 
    lesson: { $in: lessonIds }, 
    isPublished: true,
    isRequired: true 
  }).select("_id");
  
  const totalRequiredCount = requiredActivities.length;
  const requiredActivityIds = requiredActivities.map(a => a._id);

  if (totalRequiredCount === 0) {
    enrollment.progress = 0;
    await enrollment.save();
    return;
  }

  // 2. Get completed REQUIRED activities for this user
  const completedRequiredCount = await LMSActivityProgress.countDocuments({
    enrollment: enrollmentId,
    activity: { $in: requiredActivityIds },
    status: "Completed"
  });

  // 3. Calculate percentage
  const progressPercentage = (completedRequiredCount / totalRequiredCount) * 100;
  
  enrollment.progress = Math.min(Math.round(progressPercentage), 100);
  
  // Auto-set status to Completed if progress is 100% 
  // (Wait, user said no auto-certification, but progress can be 100%)
  if (enrollment.progress === 100) {
    // We don't issue certificate here, just update status
    enrollment.status = "Active"; // Keep it active until admin finalizes? 
    // Actually, user said: "Certificate generated ONLY IF: All required activities completed, Minimum marks achieved, Admin approval recorded"
  }

  await enrollment.save();
  return enrollment.progress;
};

module.exports = {
  updateEnrollmentProgress,
  autoEnrollUser,
};

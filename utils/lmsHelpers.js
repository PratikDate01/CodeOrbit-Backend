const Enrollment = require("../models/Enrollment");
const Activity = require("../models/Activity");
const LMSActivityProgress = require("../models/LMSActivityProgress");
const Course = require("../models/Course");
const Module = require("../models/Module");
const Lesson = require("../models/Lesson");
const Program = require("../models/Program");

// Helper function isDomainMatch to compare domains flexibly
const isDomainMatch = (domainA, domainB) => {
  if (!domainA || !domainB) return false;

  const normalize = (str) => {
    return str.trim().toLowerCase();
  };

  const getCandidates = (str) => {
    const list = [str];
    const parenRegex = /\(([^)]+)\)/g;
    let match;
    while ((match = parenRegex.exec(str)) !== null) {
      list.push(match[1]);
    }
    const cleanStr = str.replace(/\([^)]+\)/g, "").trim();
    if (cleanStr) {
      list.push(cleanStr);
    }
    return list.map(s => s.trim()).filter(Boolean);
  };

  const cleanForAcronym = (str) => {
    return str
      .replace(/&/g, "and")
      .split(/[^a-zA-Z0-9]+/g)
      .filter(Boolean);
  };

  const checkAcronym = (words, acronym) => {
    if (acronym.length < 2) return false;
    const cleanAcronym = acronym.toLowerCase();
    
    const stdAcronym = words.map(w => w[0]).join("").toLowerCase();
    if (stdAcronym === cleanAcronym) return true;

    const filteredAcronym = words
      .filter(w => !["and", "or", "of", "the", "in", "to", "for"].includes(w.toLowerCase()))
      .map(w => w[0])
      .join("")
      .toLowerCase();
    if (filteredAcronym === cleanAcronym) return true;

    return false;
  };

  const candidatesA = getCandidates(domainA);
  const candidatesB = getCandidates(domainB);

  for (const catA of candidatesA) {
    for (const catB of candidatesB) {
      const normA = normalize(catA);
      const normB = normalize(catB);

      if (normA === normB) return true;

      // Check acronyms
      const wordsA = cleanForAcronym(catA);
      const wordsB = cleanForAcronym(catB);

      if (wordsA.length === 1 && checkAcronym(wordsB, wordsA[0])) return true;
      if (wordsB.length === 1 && checkAcronym(wordsA, wordsB[0])) return true;
    }
  }

  return false;
};

/**
 * Auto-enroll a user into a program based on their internship domain
 * @param {string} userId 
 * @param {string} domain 
 * @param {string} applicationId 
 */
const autoEnrollUser = async (userId, domain, applicationId) => {
  try {
    const mongoose = require("mongoose");
    const InternshipApplication = mongoose.model("InternshipApplication");
    const User = mongoose.model("User");

    // 1. Resolve application and user
    const application = await InternshipApplication.findById(applicationId);
    if (!application) {
      console.warn(`Application not found: ${applicationId}`);
      return null;
    }

    let resolvedUserId = userId || application.user;
    if (!resolvedUserId && application.email) {
      const userObj = await User.findOne({ email: application.email });
      if (userObj) {
        resolvedUserId = userObj._id;
        // Update application's user reference to ensure consistency
        application.user = resolvedUserId;
        await application.save();
      }
    }

    if (!resolvedUserId) {
      console.warn(`No user associated with application: ${applicationId}`);
      return null;
    }

    // 2. Find the program matching the domain
    const programs = await Program.find({ isPublished: true });
    const program = programs.find(p => isDomainMatch(p.internshipDomain, domain) || isDomainMatch(p.title, domain));
    if (!program) {
      console.warn(`No published program found for domain: ${domain}`);
      return null;
    }

    // 3. Check if already enrolled for this application
    let enrollment = await Enrollment.findOne({ internshipApplication: applicationId });
    if (enrollment) {
      let modified = false;
      if (!enrollment.user) {
        enrollment.user = resolvedUserId;
        modified = true;
      }
      if (!enrollment.program) {
        enrollment.program = program._id;
        modified = true;
      }
      if (modified) {
        await enrollment.save();
      }
      return enrollment;
    }

    // Check if user is already enrolled in this program (prevent duplicate active enrollments)
    enrollment = await Enrollment.findOne({ user: resolvedUserId, program: program._id });
    if (enrollment) {
      if (!enrollment.internshipApplication) {
        enrollment.internshipApplication = applicationId;
        await enrollment.save();
      }
      return enrollment;
    }


    // 4. Create enrollment
    try {
      enrollment = await Enrollment.create({
        user: resolvedUserId,
        program: program._id,
        internshipApplication: applicationId,
        status: "Active",
      });
    } catch (createErr) {
      if (createErr.code === 11000) {
        console.log(`[autoEnrollUser] Concurrency race condition detected for application ${applicationId}. Fetching existing enrollment.`);
        enrollment = await Enrollment.findOne({ internshipApplication: applicationId });
        if (!enrollment) {
          throw createErr;
        }
      } else {
        throw createErr;
      }
    }

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
  isDomainMatch,
};

const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
try {
  const currentServers = dns.getServers();
  if (currentServers.length === 0 || (currentServers.length === 1 && (currentServers[0] === "127.0.0.1" || currentServers[0] === "::1"))) {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
  }
} catch (dnsErr) {}

const mongoose = require("mongoose");
const dotenv = require("dotenv");

// Load backend env
dotenv.config();

// Load models
const User = require("../models/User");
const InternshipApplication = require("../models/InternshipApplication");
const Enrollment = require("../models/Enrollment");
const Program = require("../models/Program");
const LMSActivityProgress = require("../models/LMSActivityProgress");
const LMSCertificate = require("../models/LMSCertificate");
const AssignmentSubmission = require("../models/AssignmentSubmission");
const Activity = require("../models/Activity");
const Task = require("../models/Task");

const runRepair = async () => {
  try {
    const uri = process.env.MONGO_URI.replace("/jewellery_db", "/codeorbitDB");
    await mongoose.connect(uri);
    console.log("Connected to database for integrity repair & migration.");

    // --- PHASE 1: DATA MIGRATION ("AIML" -> "Artificial Intelligence & Machine Learning") ---
    console.log("\n--- Starting Domain String Migration ---");

    // 1. Update Program titles and domains
    const programUpdateResult = await Program.updateMany(
      {
        $or: [
          { title: "AIML (Artificial Intelligence & Machine Learning)" },
          { internshipDomain: "AIML" },
          { internshipDomain: "AIML (Artificial Intelligence & Machine Learning)" }
        ]
      },
      {
        $set: {
          title: "Artificial Intelligence & Machine Learning",
          internshipDomain: "Artificial Intelligence & Machine Learning"
        }
      }
    );
    console.log(`Updated programs: ${programUpdateResult.modifiedCount}`);

    // 2. Update InternshipApplication preferredDomain
    const appUpdateResult = await InternshipApplication.updateMany(
      {
        preferredDomain: {
          $in: ["AIML", "AIML (Artificial Intelligence & Machine Learning)", "Artificial Intelligence & Machine Learning"]
        }
      },
      {
        $set: {
          preferredDomain: "Artificial Intelligence & Machine Learning"
        }
      }
    );
    console.log(`Updated internship applications: ${appUpdateResult.modifiedCount}`);

    // 3. Update Task internshipDomain
    const taskUpdateResult = await Task.updateMany(
      {
        internshipDomain: {
          $in: ["AIML", "AIML (Artificial Intelligence & Machine Learning)", "Artificial Intelligence & Machine Learning"]
        }
      },
      {
        $set: {
          internshipDomain: "Artificial Intelligence & Machine Learning"
        }
      }
    );
    console.log(`Updated tasks: ${taskUpdateResult.modifiedCount}`);

    // --- PHASE 2: AUDIT & REPORT ---
    console.log("\n--- Starting Database Integrity Audit ---");

    // Gather active valid IDs
    const allUsers = await User.find({}, "_id").lean();
    const userIds = new Set(allUsers.map(u => u._id.toString()));

    const allApps = await InternshipApplication.find({}, "_id").lean();
    const appIds = new Set(allApps.map(a => a._id.toString()));

    const allPrograms = await Program.find({}, "_id").lean();
    const programIds = new Set(allPrograms.map(p => p._id.toString()));

    const allActivities = await Activity.find({}, "_id").lean();
    const activityIds = new Set(allActivities.map(a => a._id.toString()));

    // Load all records to check for orphans
    const enrollments = await Enrollment.find({}).lean();
    const progresses = await LMSActivityProgress.find({}).lean();
    const certificates = await LMSCertificate.find({}).lean();
    const submissions = await AssignmentSubmission.find({}).lean();

    let brokenUsers = 0;
    let brokenApplications = 0;
    let orphanEnrollments = 0;
    let orphanProgress = 0;
    let orphanCertificates = 0;
    let orphanSubmissions = 0;

    const enrollmentsToDelete = [];
    const progressToDelete = [];
    const certificatesToDelete = [];
    const submissionsToDelete = [];

    // Audit Enrollments
    for (const e of enrollments) {
      let isOrphan = false;

      const userRefExists = e.user && userIds.has(e.user.toString());
      const appRefExists = !e.internshipApplication || appIds.has(e.internshipApplication.toString());
      const programRefExists = e.program && programIds.has(e.program.toString());

      if (!userRefExists) {
        brokenUsers++;
        isOrphan = true;
      }
      if (!appRefExists) {
        brokenApplications++;
        isOrphan = true;
      }
      if (!programRefExists) {
        isOrphan = true;
      }

      if (isOrphan) {
        orphanEnrollments++;
        enrollmentsToDelete.push(e._id);
      }
    }

    // Determine remaining valid enrollments
    const validEnrollmentIds = new Set(
      enrollments
        .filter(e => !enrollmentsToDelete.some(delId => delId.toString() === e._id.toString()))
        .map(e => e._id.toString())
    );

    // Audit LMSActivityProgress
    for (const p of progresses) {
      const userRefExists = p.user && userIds.has(p.user.toString());
      const enrollmentRefExists = p.enrollment && validEnrollmentIds.has(p.enrollment.toString());
      const activityRefExists = p.activity && activityIds.has(p.activity.toString());

      if (!userRefExists || !enrollmentRefExists || !activityRefExists) {
        orphanProgress++;
        progressToDelete.push(p._id);
      }
    }

    // Audit Certificates
    for (const c of certificates) {
      const userRefExists = c.user && userIds.has(c.user.toString());
      const enrollmentRefExists = c.enrollment && validEnrollmentIds.has(c.enrollment.toString());
      const programRefExists = c.program && programIds.has(c.program.toString());

      if (!userRefExists || !enrollmentRefExists || !programRefExists) {
        orphanCertificates++;
        certificatesToDelete.push(c._id);
      }
    }

    // Audit Submissions
    for (const s of submissions) {
      const userRefExists = s.user && userIds.has(s.user.toString());
      const enrollmentRefExists = !s.enrollment || validEnrollmentIds.has(s.enrollment.toString());
      const activityRefExists = s.activity && activityIds.has(s.activity.toString());

      if (!userRefExists || !enrollmentRefExists || !activityRefExists) {
        orphanSubmissions++;
        submissionsToDelete.push(s._id);
      }
    }

    // Print integrity report
    console.log("\n================ DATABASE INTEGRITY REPORT ================");
    console.log(`Orphan Enrollments: ${orphanEnrollments}`);
    console.log(`Broken Users: ${brokenUsers}`);
    console.log(`Broken Applications: ${brokenApplications}`);
    console.log(`Orphan LMSActivityProgress: ${orphanProgress}`);
    console.log(`Orphan Certificates: ${orphanCertificates}`);
    console.log(`Orphan Assignment Submissions: ${orphanSubmissions}`);
    console.log("===========================================================");

    // --- PHASE 3: SAFE REPAIR & CLEANUP ---
    console.log("\n--- Starting Safe Cleanup of Orphaned Records ---");

    if (enrollmentsToDelete.length > 0) {
      console.log(`Deleting ${enrollmentsToDelete.length} orphan Enrollments...`);
      await Enrollment.deleteMany({ _id: { $in: enrollmentsToDelete } });
    }
    if (progressToDelete.length > 0) {
      console.log(`Deleting ${progressToDelete.length} orphan LMSActivityProgress records...`);
      await LMSActivityProgress.deleteMany({ _id: { $in: progressToDelete } });
    }
    if (certificatesToDelete.length > 0) {
      console.log(`Deleting ${certificatesToDelete.length} orphan Certificates...`);
      await LMSCertificate.deleteMany({ _id: { $in: certificatesToDelete } });
    }
    if (submissionsToDelete.length > 0) {
      console.log(`Deleting ${submissionsToDelete.length} orphan AssignmentSubmissions...`);
      await AssignmentSubmission.deleteMany({ _id: { $in: submissionsToDelete } });
    }

    // --- PHASE 4: ENROLLMENT RECOVERY FOR APPROVED APPLICATIONS ---
    console.log("\n--- Starting Enrollment Recovery for Approved Applications ---");
    const { autoEnrollUser } = require("./lmsHelpers");
    const approvedApps = await InternshipApplication.find({ status: "Approved" });
    console.log(`Found ${approvedApps.length} Approved applications. Checking enrollments...`);
    
    let enrolledCount = 0;
    for (const app of approvedApps) {
      const existingEnrollment = await Enrollment.findOne({ internshipApplication: app._id });
      if (!existingEnrollment) {
        console.log(`Enrolling application ID: ${app._id} (Domain: ${app.preferredDomain}, User: ${app.user})`);
        const enrollment = await autoEnrollUser(app.user, app.preferredDomain, app._id);
        if (enrollment) {
          enrolledCount++;
        }
      }
    }
    console.log(`Auto-enrolled ${enrolledCount} applications.`);

    console.log("\nDatabase integrity repair completed successfully!");
    mongoose.connection.close();
  } catch (err) {
    console.error("Error executing repair:", err);
    process.exit(1);
  }
};

runRepair();

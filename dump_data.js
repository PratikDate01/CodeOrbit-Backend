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

// Models
const User = require("./models/User");
const InternshipApplication = require("./models/InternshipApplication");
const Enrollment = require("./models/Enrollment");
const Program = require("./models/Program");

const run = async () => {
  try {
    const uri = process.env.MONGO_URI.replace("/jewellery_db", "/codeorbitDB");
    await mongoose.connect(uri);

    console.log("Connected to codeorbitDB.");

    // A. Trace why "Unknown Users" still appear in Admin LMS Enrollments
    const enrollments = await Enrollment.find({}).lean();
    console.log(`\nAnalyzing ${enrollments.length} enrollments for Unknown Users...`);
    
    let unknownUsersCount = 0;
    for (const e of enrollments) {
      const userExists = e.user ? await User.exists({ _id: e.user }) : null;
      const appExists = e.internshipApplication ? await InternshipApplication.exists({ _id: e.internshipApplication }) : null;

      if (!userExists) {
        unknownUsersCount++;
        console.log(`[Unknown User Found]`);
        console.log(`  Enrollment ID: ${e._id}`);
        console.log(`  User ID in Enrollment: ${e.user}`);
        console.log(`  Does User ID exist in Users Collection?: ${!!userExists}`);
        console.log(`  App ID in Enrollment: ${e.internshipApplication}`);
        console.log(`  Does App ID exist in App Collection?: ${!!appExists}`);
        if (e.internshipApplication) {
          const app = await InternshipApplication.findById(e.internshipApplication).lean();
          if (app) {
            console.log(`  App Email: ${app.email} | App Name: ${app.name}`);
          } else {
            console.log(`  App Document is deleted.`);
          }
        }
      }
    }
    console.log(`Total enrollments with missing/invalid user reference: ${unknownUsersCount}`);

    // B. Trace the tested user (codeorbit.internship@gmail.com)
    const testUser = await User.findOne({ email: "codeorbit.internship@gmail.com" }).lean();
    if (testUser) {
      console.log(`\n================ TESTED USER TRACE ================`);
      console.log(`User ID: ${testUser._id}`);
      console.log(`User Name: ${testUser.name}`);
      console.log(`User Email: ${testUser.email}`);
      console.log(`User Role: ${testUser.role}`);

      // Find applications for this user
      const userApps = await InternshipApplication.find({ email: "codeorbit.internship@gmail.com" }).lean();
      console.log(`\nApplications for this user (${userApps.length}):`);
      userApps.forEach(app => {
        console.log(`  ID: ${app._id} | Domain: ${app.preferredDomain} | Status: ${app.status} | Paid: ${app.paymentStatus}`);
      });

      // Find enrollments for this user
      const userEnrollments = await Enrollment.find({ user: testUser._id }).lean();
      console.log(`\nEnrollments for this user (${userEnrollments.length}):`);
      for (const e of userEnrollments) {
        const prog = await Program.findById(e.program).lean();
        console.log(`  Enrollment ID: ${e._id}`);
        console.log(`  Program: ${prog ? `${prog.title} (Domain: ${prog.internshipDomain})` : "Unknown Program"}`);
        console.log(`  Application Reference: ${e.internshipApplication}`);
        console.log(`  Status: ${e.status} | Progress: ${e.progress}`);
      }
    } else {
      console.log("\nTested user (codeorbit.internship@gmail.com) not found in DB!");
    }

    // C. Check Program vs Application Domains
    console.log(`\n================ DOMAIN NAMES CHECK ================`);
    const allPrograms = await Program.find({}).lean();
    console.log("Programs in DB:");
    allPrograms.forEach(p => {
      console.log(`  Program: "${p.title}" | internshipDomain: "${p.internshipDomain}"`);
    });

    mongoose.connection.close();
  } catch (err) {
    console.error("Error running script:", err);
    process.exit(1);
  }
};

run();

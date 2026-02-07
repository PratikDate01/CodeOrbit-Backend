const mongoose = require("mongoose");

const programSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    thumbnail: {
      type: String,
    },
    duration: {
      type: String, // e.g., "4 Weeks", "3 Months"
    },
    internshipDomain: {
      type: String,
      required: true,
      index: true,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Cascade delete: delete courses and related enrollments when a program is deleted
programSchema.pre("deleteOne", { document: true, query: false }, async function (next) {
  const programId = this._id;
  
  // Delete all courses associated with this program
  // Using find() then loop deleteOne() to trigger Course hooks
  const Course = mongoose.model("Course");
  const courses = await Course.find({ program: programId });
  for (const course of courses) {
    await course.deleteOne();
  }

  // Delete all enrollments
  const Enrollment = mongoose.model("Enrollment");
  await Enrollment.deleteMany({ program: programId });

  // Delete all certificates
  const LMSCertificate = mongoose.model("LMSCertificate");
  await LMSCertificate.deleteMany({ program: programId });

  next();
});

module.exports = mongoose.model("Program", programSchema);

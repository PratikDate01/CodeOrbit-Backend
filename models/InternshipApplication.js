const mongoose = require("mongoose");

const internshipApplicationSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    college: {
      type: String,
      required: true,
    },
    course: {
      type: String,
      required: [true, "Course/Degree is required"],
    },
    year: {
      type: String,
      required: [true, "Year of study is required"],
    },
    skills: {
      type: String,
      required: [true, "Skills are required"],
    },
    experience: {
      type: String,
    },
    preferredDomain: {
      type: String,
      required: true,
      index: true,
    },
    duration: {
      type: Number,
      required: true,
      default: 1
    },
    amount: {
      type: Number,
      default: 0
    },
    paymentStatus: {
      type: String,
      enum: ["Pending", "Processing", "Verified", "Failed"],
      default: "Pending"
    },
    transactionId: {
      type: String,
    },
    razorpayOrderId: {
      type: String,
    },
    razorpayPaymentId: {
      type: String,
    },
    razorpaySignature: {
      type: String,
    },
    paymentScreenshot: {
      type: String,
    },
    paymentScreenshotPublicId: {
      type: String,
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    documentIssueDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["New", "Reviewed", "Contacted", "Selected", "Rejected", "Approved", "Completed"],
      default: "New",
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);


// Cascade delete related records when application is deleted
internshipApplicationSchema.pre("deleteOne", { document: true, query: false }, async function (next) {
  try {
    const mongoose = require("mongoose");
    const Enrollment = mongoose.model("Enrollment");
    const LMSActivityProgress = mongoose.model("LMSActivityProgress");
    const LMSCertificate = mongoose.model("LMSCertificate");
    const AssignmentSubmission = mongoose.model("AssignmentSubmission");

    // Find all enrollments associated with this application to clean up their sub-records
    const enrollments = await Enrollment.find({ internshipApplication: this._id });
    const enrollmentIds = enrollments.map(e => e._id);

    if (enrollmentIds.length > 0) {
      await Enrollment.deleteMany({ _id: { $in: enrollmentIds } });
      await LMSActivityProgress.deleteMany({ enrollment: { $in: enrollmentIds } });
      await LMSCertificate.deleteMany({ enrollment: { $in: enrollmentIds } });
      await AssignmentSubmission.deleteMany({ enrollment: { $in: enrollmentIds } });
    }

    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model(
  "InternshipApplication",
  internshipApplicationSchema
);

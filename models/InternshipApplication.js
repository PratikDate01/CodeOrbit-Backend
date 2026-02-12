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

module.exports = mongoose.model(
  "InternshipApplication",
  internshipApplicationSchema
);

const mongoose = require("mongoose");

const lmsActivityProgressSchema = new mongoose.Schema(
  {
    enrollment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Enrollment",
      required: true,
      index: true,
    },
    activity: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Activity",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["Started", "Submitted", "Pending Approval", "Completed", "Rejected"],
      default: "Started",
    },
    progressData: {
      watchTime: { type: Number, default: 0 }, // For videos
      percentageWatched: { type: Number, default: 0 },
      quizAttempts: { type: Number, default: 0 },
      lastAttemptDate: { type: Date },
    },
    submissionContent: {
      type: String, // For Assignments/Reflections
    },
    marks: {
      type: Number,
      default: 0,
    },
    adminApproval: {
      isApproved: { type: Boolean, default: false },
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      approvedAt: { type: Date },
      remarks: { type: String },
    },
  },
  {
    timestamps: true,
  }
);

// Unique progress per enrollment per activity
lmsActivityProgressSchema.index({ enrollment: 1, activity: 1 }, { unique: true });

module.exports = mongoose.model("LMSActivityProgress", lmsActivityProgressSchema);

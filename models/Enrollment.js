const mongoose = require("mongoose");

const enrollmentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Program",
      required: true,
      index: true,
    },
    internshipApplication: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipApplication",
    },
    progress: {
      type: Number,
      default: 0, // Overall percentage
    },
    status: {
      type: String,
      enum: ["Active", "Completed", "Dropped", "Locked"],
      default: "Active",
    },
    enrolledAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
      type: Date,
    },
    isCertificateIssued: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Unique enrollment per internship application
enrollmentSchema.index({ internshipApplication: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Enrollment", enrollmentSchema);

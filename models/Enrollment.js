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
      index: true,
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

// Unique enrollment per user per program
enrollmentSchema.index({ user: 1, program: 1 }, { unique: true });

module.exports = mongoose.model("Enrollment", enrollmentSchema);

const mongoose = require("mongoose");

const activityProgressSchema = mongoose.Schema(
  {
    internshipApplication: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipApplication",
      required: true,
      unique: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isEligibleForCertificate: {
      type: Boolean,
      default: false,
    },
    progressPercentage: {
      type: Number,
      default: 0,
    },
    completedTasksCount: {
      type: Number,
      default: 0,
    },
    adminManuallyCompleted: {
      type: Boolean,
      default: false,
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ActivityProgress", activityProgressSchema);

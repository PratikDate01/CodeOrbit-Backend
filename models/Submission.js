const mongoose = require("mongoose");

const submissionSchema = mongoose.Schema(
  {
    task: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    internshipApplication: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipApplication",
      required: true,
    },
    content: {
      type: String, // Can be text content, file URL, or link
      required: true,
    },
    status: {
      type: String,
      enum: ["Submitted", "Approved", "Rejected", "Resubmission Required"],
      default: "Submitted",
    },
    marks: {
      type: Number,
      default: 0,
    },
    adminRemarks: {
      type: String,
    },
    evaluatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    evaluatedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Submission", submissionSchema);

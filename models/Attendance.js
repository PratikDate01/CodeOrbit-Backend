const mongoose = require("mongoose");

const attendanceSchema = mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    internshipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipApplication",
      required: true,
    },
    weeks: [
      {
        weekNumber: {
          type: Number,
          required: true,
        },
        presentDays: {
          type: Number,
          required: true,
        },
        totalDays: {
          type: Number,
          required: true,
        },
        percentage: {
          type: Number,
          required: true,
        },
      },
    ],
    totalPresentDays: {
      type: Number,
      required: true,
    },
    totalWorkingDays: {
      type: Number,
      required: true,
    },
    overallPercentage: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["Excellent", "Good", "Average", "Poor"],
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Attendance", attendanceSchema);

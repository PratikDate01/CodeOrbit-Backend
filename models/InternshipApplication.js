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
      required: true,
    },
    year: {
      type: String,
      required: true,
    },
    skills: {
      type: String,
      required: true,
    },
    experience: {
      type: String,
    },
    preferredDomain: {
      type: String,
      required: true,
    },
    duration: {
      type: Number,
      required: true,
      default: 1
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["New", "Reviewed", "Contacted", "Selected", "Rejected", "Approved", "Completed"],
      default: "New",
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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

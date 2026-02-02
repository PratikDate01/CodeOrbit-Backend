const mongoose = require("mongoose");

const taskSchema = mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["MCQ", "File", "Link", "Text"],
      required: true,
    },
    internshipDomain: {
      type: String, // To assign tasks to all students in a domain (e.g., Web Development)
      required: true,
    },
    maxMarks: {
      type: Number,
      default: 100,
    },
    passingMarks: {
      type: Number,
      default: 40,
    },
    deadline: {
      type: Date,
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

module.exports = mongoose.model("Task", taskSchema);

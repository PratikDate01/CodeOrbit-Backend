const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
  {
    lesson: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lesson",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["Video", "PDF", "Text", "ExternalLink", "Quiz", "Assignment", "Reflection"],
      required: true,
    },
    content: {
      type: String, // URL for Video/PDF/Link, or HTML/Markdown for Text
    },
    quizData: [
      {
        question: String,
        options: [String],
        correctAnswer: String, // Or index/value
        explanation: String,
        questionType: {
          type: String,
          enum: ["MCQ", "TrueFalse", "Descriptive"],
          default: "MCQ"
        }
      }
    ],
    order: {
      type: Number,
      default: 0,
    },
    isRequired: {
      type: Boolean,
      default: true,
    },
    passingScore: {
      type: Number,
      default: 0,
    },
    maxMarks: {
      type: Number,
      default: 100,
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for ordering activities within a lesson
activitySchema.index({ lesson: 1, order: 1 });

module.exports = mongoose.model("Activity", activitySchema);

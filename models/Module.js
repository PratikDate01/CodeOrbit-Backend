const mongoose = require("mongoose");

const moduleSchema = new mongoose.Schema(
  {
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
    },
    order: {
      type: Number,
      default: 0,
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

// Index for ordering modules within a course
moduleSchema.index({ course: 1, order: 1 });

// Cascade delete: delete lessons when a module is deleted
moduleSchema.pre("deleteOne", { document: true, query: false }, async function (next) {
  const moduleId = this._id;
  const Lesson = mongoose.model("Lesson");
  const lessons = await Lesson.find({ module: moduleId });
  for (const lesson of lessons) {
    await lesson.deleteOne();
  }
  next();
});

module.exports = mongoose.model("Module", moduleSchema);

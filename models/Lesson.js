const mongoose = require("mongoose");

const lessonSchema = new mongoose.Schema(
  {
    module: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Module",
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

// Index for ordering lessons within a module
lessonSchema.index({ module: 1, order: 1 });

// Cascade delete: delete activities when a lesson is deleted
lessonSchema.pre("deleteOne", { document: true, query: false }, async function (next) {
  const lessonId = this._id;
  const Activity = mongoose.model("Activity");
  const activities = await Activity.find({ lesson: lessonId });
  for (const activity of activities) {
    await activity.deleteOne();
  }
  next();
});

module.exports = mongoose.model("Lesson", lessonSchema);

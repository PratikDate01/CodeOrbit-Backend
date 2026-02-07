const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema(
  {
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Program",
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

// Index for ordering courses within a program
courseSchema.index({ program: 1, order: 1 });

// Cascade delete: delete modules when a course is deleted
courseSchema.pre("deleteOne", { document: true, query: false }, async function (next) {
  const courseId = this._id;
  const Module = mongoose.model("Module");
  const modules = await Module.find({ course: courseId });
  for (const moduleObj of modules) {
    await moduleObj.deleteOne();
  }
  next();
});

module.exports = mongoose.model("Course", courseSchema);

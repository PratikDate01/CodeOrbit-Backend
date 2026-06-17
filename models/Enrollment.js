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

// Unique enrollment per internship application
enrollmentSchema.index({ internshipApplication: 1 }, { unique: true, sparse: true });

// Pre-save hook to prevent saving enrollments with non-existent references
enrollmentSchema.pre("save", async function (next) {
  try {
    const User = mongoose.model("User");
    const Program = mongoose.model("Program");
    const InternshipApplication = mongoose.model("InternshipApplication");

    const userExists = await User.exists({ _id: this.user });
    if (!userExists) {
      return next(new Error(`Referenced user does not exist: ${this.user}`));
    }

    const programExists = await Program.exists({ _id: this.program });
    if (!programExists) {
      return next(new Error(`Referenced program does not exist: ${this.program}`));
    }

    if (this.internshipApplication) {
      const appExists = await InternshipApplication.exists({ _id: this.internshipApplication });
      if (!appExists) {
        return next(new Error(`Referenced internshipApplication does not exist: ${this.internshipApplication}`));
      }
    }

    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model("Enrollment", enrollmentSchema);

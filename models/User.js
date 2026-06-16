const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: function() {
        return !this.googleId;
      },
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    role: {
      type: String,
      enum: ["client", "admin", "instructor", "moderator"],
      default: "client",
      index: true,
    },
    phone: {
      type: String,
    },
    education: {
      type: String,
    },
    skills: {
      type: [String],
    },
    totalXP: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Encrypt password using bcrypt
userSchema.pre("save", async function (next) {
  if (!this.password || !this.isModified("password")) {
    return next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});


// Cascade delete related records when user is deleted
userSchema.pre("deleteOne", { document: true, query: false }, async function (next) {
  try {
    const mongoose = require("mongoose");
    const Enrollment = mongoose.model("Enrollment");
    const InternshipApplication = mongoose.model("InternshipApplication");
    const LMSActivityProgress = mongoose.model("LMSActivityProgress");
    const LMSCertificate = mongoose.model("LMSCertificate");
    const AssignmentSubmission = mongoose.model("AssignmentSubmission");

    await Enrollment.deleteMany({ user: this._id });
    await InternshipApplication.deleteMany({ user: this._id });
    await LMSActivityProgress.deleteMany({ user: this._id });
    await LMSCertificate.deleteMany({ user: this._id });
    await AssignmentSubmission.deleteMany({ user: this._id });

    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model("User", userSchema);

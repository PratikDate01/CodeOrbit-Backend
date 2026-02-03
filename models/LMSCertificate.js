const mongoose = require("mongoose");

const lmsCertificateSchema = new mongoose.Schema(
  {
    enrollment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Enrollment",
      required: true,
      unique: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    program: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Program",
      required: true,
    },
    certificateId: {
      type: String,
      required: true,
      unique: true,
    },
    issueDate: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["Issued", "Revoked"],
      default: "Issued",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    verificationUrl: {
      type: String,
    },
    metadata: {
      marksObtained: Number,
      totalMarks: Number,
      percentage: Number,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("LMSCertificate", lmsCertificateSchema);

const mongoose = require("mongoose");

const documentSchema = mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipApplication",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    offerLetterUrl: {
      type: String,
    },
    certificateUrl: {
      type: String,
    },
    locUrl: {
      type: String,
    },
    paymentSlipUrl: {
      type: String,
    },
    verificationId: {
      type: String,
      unique: true,
      required: true,
    },
    issuedOn: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Document", documentSchema);

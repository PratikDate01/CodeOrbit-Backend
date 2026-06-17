const mongoose = require("mongoose");

const documentGenerationLogSchema = new mongoose.Schema(
  {
    documentType: {
      type: String,
      required: true,
      enum: ["offerLetter", "certificate", "loc", "internshipDetails", "attendance", "paymentReceipt"],
      index: true,
    },
    success: {
      type: Boolean,
      required: true,
      index: true,
    },
    duration: {
      type: Number, // in ms
      required: true,
    },
    error: {
      type: String,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-expire document generation logs after 30 days
documentGenerationLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model("DocumentGenerationLog", documentGenerationLogSchema);

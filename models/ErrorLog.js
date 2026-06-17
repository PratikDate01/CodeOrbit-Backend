const mongoose = require("mongoose");

const errorLogSchema = new mongoose.Schema(
  {
    message: {
      type: String,
      required: true,
      index: true,
    },
    stack: {
      type: String,
    },
    path: {
      type: String,
      index: true,
    },
    method: {
      type: String,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    ip: {
      type: String,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
    severity: {
      type: String,
      enum: ["warning", "error", "critical"],
      default: "error",
      index: true,
    },
    resolved: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-expire error logs after 30 days to prevent DB bloat
errorLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model("ErrorLog", errorLogSchema);

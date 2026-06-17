const mongoose = require("mongoose");

const integrityAuditSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      default: Date.now,
    },
    result: {
      type: String,
      required: true,
      enum: ["clean", "issues_found"],
      index: true,
    },
    issuesFound: {
      type: Number,
      default: 0,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Keep integrity audits for 90 days to provide historical trend of database health
integrityAuditSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model("IntegrityAudit", integrityAuditSchema);

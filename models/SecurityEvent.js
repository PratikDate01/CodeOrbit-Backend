const mongoose = require("mongoose");

const securityEventSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
      enum: ["failed_login", "unauthorized_access", "invalid_jwt", "suspicious_request", "admin_action"],
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    email: {
      type: String,
      index: true,
    },
    action: {
      type: String,
      required: true,
    },
    ipAddress: {
      type: String,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
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

// Auto-expire security logs after 30 days
securityEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

securityEventSchema.post("save", async function (doc) {
  try {
    const CentralLog = mongoose.model("CentralLog");
    await CentralLog.create({
      timestamp: doc.timestamp || doc.createdAt || new Date(),
      user: doc.user || null,
      method: "",
      route: (doc.details && doc.details.path) || "",
      status: "401",
      ipAddress: doc.ipAddress || "",
      message: doc.action || `Security event: ${doc.eventType}`,
      logType: "security",
      severity: doc.eventType === "failed_login" ? "warning" : "error",
      details: doc.details,
    });
  } catch (err) {
    console.error("CentralLog synchronization from SecurityEvent failed:", err.message);
  }
});

module.exports = mongoose.model("SecurityEvent", securityEventSchema);

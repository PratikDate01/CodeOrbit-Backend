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

errorLogSchema.post("save", async function (doc) {
  try {
    const CentralLog = mongoose.model("CentralLog");
    await CentralLog.create({
      timestamp: doc.createdAt || new Date(),
      user: doc.user || null,
      method: doc.method || "",
      route: doc.path || "",
      status: doc.severity === "critical" ? "500" : "400",
      ipAddress: doc.ip || "",
      message: doc.message,
      logType: doc.severity === "warning" ? "warning" : "error",
      severity: doc.severity || "error",
      details: { stack: doc.stack, metadata: doc.metadata },
    });
  } catch (err) {
    console.error("CentralLog synchronization from ErrorLog failed:", err.message);
  }
});

module.exports = mongoose.model("ErrorLog", errorLogSchema);

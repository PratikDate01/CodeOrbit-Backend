const mongoose = require("mongoose");

const auditLogSchema = mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    actionType: {
      type: String,
      required: true,
    },
    targetType: {
      type: String, // e.g., "Task", "Submission", "Eligibility"
      required: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
    },
    ipAddress: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

auditLogSchema.post("save", async function (doc) {
  try {
    const CentralLog = mongoose.model("CentralLog");
    await CentralLog.create({
      timestamp: doc.createdAt || new Date(),
      user: doc.admin || null,
      method: "",
      route: "",
      status: "200",
      ipAddress: doc.ipAddress || "",
      message: `${doc.actionType} on ${doc.targetType}`,
      logType: "audit",
      severity: "info",
      details: doc.details,
    });
  } catch (err) {
    console.error("CentralLog synchronization from AuditLog failed:", err.message);
  }
});

module.exports = mongoose.model("AuditLog", auditLogSchema);

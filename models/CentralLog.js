const mongoose = require("mongoose");

const centralLogSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },
    method: {
      type: String,
      default: "",
    },
    route: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      default: "",
    },
    responseTime: {
      type: Number,
      default: null,
    },
    ipAddress: {
      type: String,
      default: "",
    },
    message: {
      type: String,
      required: true,
      index: true,
    },
    logType: {
      type: String,
      enum: ["error", "warning", "security", "audit"],
      required: true,
      index: true,
    },
    severity: {
      type: String,
      enum: ["info", "warning", "error", "critical"],
      default: "info",
      index: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-expire logs after 30 days to prevent DB bloat
centralLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const redactKeys = [
  "password",
  "token",
  "authorization",
  "cookie",
  "razorpay_signature",
  "newpassword",
  "confirmpassword",
];

function redactSecrets(obj) {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj.map(redactSecrets);
  }
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (redactKeys.some((rKey) => lowerKey.includes(rKey))) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object") {
      sanitized[key] = redactSecrets(value);
    } else if (typeof value === "string") {
      let val = value;
      // Redact if value looks like a Bearer token or Authorization header
      if (lowerKey === "authorization" || value.toLowerCase().startsWith("bearer ")) {
        val = "[REDACTED]";
      }
      sanitized[key] = val;
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

centralLogSchema.pre("save", function (next) {
  if (this.details) {
    this.details = redactSecrets(this.details);
  }
  if (this.message) {
    // Basic protection against plaintext secrets in message string
    let msg = this.message;
    redactKeys.forEach((key) => {
      const regex = new RegExp("(" + key + ")[\\s\\:\\=\\'\\\"\\`]+([^\\s&'\",;]+)", "gi");
      msg = msg.replace(regex, "$1:[REDACTED]");
    });
    this.message = msg;
  }
  next();
});

module.exports = mongoose.model("CentralLog", centralLogSchema);

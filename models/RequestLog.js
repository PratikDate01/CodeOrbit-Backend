const mongoose = require("mongoose");

const requestLogSchema = new mongoose.Schema(
  {
    route: {
      type: String,
      required: true,
      index: true,
    },
    method: {
      type: String,
      required: true,
      index: true,
    },
    statusCode: {
      type: Number,
      required: true,
      index: true,
    },
    responseTime: {
      type: Number,
      required: true,
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

// Auto-expire logs after 2 days to prevent database bloat
requestLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2 * 24 * 60 * 60 });

module.exports = mongoose.model("RequestLog", requestLogSchema);

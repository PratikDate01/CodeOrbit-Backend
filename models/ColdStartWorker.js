const mongoose = require("mongoose");

const coldStartWorkerSchema = new mongoose.Schema(
  {
    workerId: {
      type: String,
      required: true,
      unique: true,
      default: "main_worker",
    },
    status: {
      type: String,
      default: "Inactive", // Active, Degraded, Inactive
    },
    lastSuccessPing: {
      type: Date,
      default: null,
    },
    lastFailedPing: {
      type: Date,
      default: null,
    },
    successCount: {
      type: Number,
      default: 0,
    },
    failureCount: {
      type: Number,
      default: 0,
    },
    lastPingDuration: {
      type: Number,
      default: 0, // milliseconds
    },
    lastPingTime: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ColdStartWorker", coldStartWorkerSchema);

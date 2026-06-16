const mongoose = require("mongoose");

const systemSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "maintenance_config",
    },
    maintenanceMode: {
      type: Boolean,
      required: true,
      default: false,
    },
    allowedUsers: {
      type: [String],
      default: [],
    },
    enabledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    enabledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("SystemSetting", systemSettingSchema);

const mongoose = require("mongoose");

const couponUsageSchema = mongoose.Schema(
  {
    coupon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Coupon",
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    application: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InternshipApplication",
      required: true,
    },
    discountAmount: {
      type: Number,
      required: true,
    },
    appliedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("CouponUsage", couponUsageSchema);

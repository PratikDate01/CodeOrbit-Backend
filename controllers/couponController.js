const Coupon = require("../models/Coupon");
const CouponUsage = require("../models/CouponUsage");
const AuditLog = require("../models/AuditLog");
const asyncHandler = require("../middleware/asyncHandler");

// @desc    Create a new coupon
// @route   POST /api/admin/coupons
// @access  Private/Admin
const createCoupon = asyncHandler(async (req, res) => {
  const {
    code,
    discountType,
    discountValue,
    maxUses,
    maxUsesPerUser,
    expiryDate,
    status,
    applicablePlans,
  } = req.body;

  const couponExists = await Coupon.findOne({ code: code.toUpperCase() });

  if (couponExists) {
    res.status(400);
    throw new Error("Coupon code already exists");
  }

  const coupon = await Coupon.create({
    code,
    discountType,
    discountValue,
    maxUses,
    maxUsesPerUser,
    expiryDate,
    status,
    applicablePlans,
    createdBy: req.user._id,
  });

  await AuditLog.create({
    admin: req.user._id,
    actionType: "CREATE_COUPON",
    targetType: "Coupon",
    targetId: coupon._id,
    details: { code: coupon.code, discountValue: coupon.discountValue },
  });

  res.status(201).json(coupon);
});

// @desc    Get all coupons
// @route   GET /api/admin/coupons
// @access  Private/Admin
const getCoupons = asyncHandler(async (req, res) => {
  const coupons = await Coupon.find({}).sort({ createdAt: -1 });
  res.json(coupons);
});

// @desc    Get coupon by ID
// @route   GET /api/admin/coupons/:id
// @access  Private/Admin
const getCouponById = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);

  if (coupon) {
    res.json(coupon);
  } else {
    res.status(404);
    throw new Error("Coupon not found");
  }
});

// @desc    Update coupon
// @route   PUT /api/admin/coupons/:id
// @access  Private/Admin
const updateCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);

  if (coupon) {
    coupon.code = req.body.code?.toUpperCase() || coupon.code;
    coupon.discountType = req.body.discountType || coupon.discountType;
    coupon.discountValue = req.body.discountValue || coupon.discountValue;
    coupon.maxUses = req.body.maxUses !== undefined ? req.body.maxUses : coupon.maxUses;
    coupon.maxUsesPerUser = req.body.maxUsesPerUser !== undefined ? req.body.maxUsesPerUser : coupon.maxUsesPerUser;
    coupon.expiryDate = req.body.expiryDate || coupon.expiryDate;
    coupon.status = req.body.status || coupon.status;
    coupon.applicablePlans = req.body.applicablePlans || coupon.applicablePlans;

    const updatedCoupon = await coupon.save();

    await AuditLog.create({
      admin: req.user._id,
      actionType: "UPDATE_COUPON",
      targetType: "Coupon",
      targetId: updatedCoupon._id,
      details: { code: updatedCoupon.code },
    });

    res.json(updatedCoupon);
  } else {
    res.status(404);
    throw new Error("Coupon not found");
  }
});

// @desc    Delete coupon
// @route   DELETE /api/admin/coupons/:id
// @access  Private/Admin
const deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findById(req.params.id);

  if (coupon) {
    await coupon.deleteOne();

    await AuditLog.create({
      admin: req.user._id,
      actionType: "DELETE_COUPON",
      targetType: "Coupon",
      targetId: req.params.id,
      details: { code: coupon.code },
    });

    res.json({ message: "Coupon removed" });
  } else {
    res.status(404);
    throw new Error("Coupon not found");
  }
});

// @desc    Get coupon usage history
// @route   GET /api/admin/coupons/usage-history
// @access  Private/Admin
const getCouponUsageHistory = asyncHandler(async (req, res) => {
  const history = await CouponUsage.find({})
    .populate("coupon", "code")
    .populate("user", "name email")
    .populate("application", "preferredDomain")
    .sort({ createdAt: -1 });
  
  res.json(history);
});

module.exports = {
  createCoupon,
  getCoupons,
  getCouponById,
  updateCoupon,
  deleteCoupon,
  getCouponUsageHistory,
};

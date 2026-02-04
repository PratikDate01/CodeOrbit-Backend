const nodeCrypto = require("crypto");
const Razorpay = require("razorpay");
const InternshipApplication = require("../models/InternshipApplication");
const Coupon = require("../models/Coupon");
const CouponUsage = require("../models/CouponUsage");
const Payment = require("../models/Payment");
const asyncHandler = require("../middleware/asyncHandler");

// Helper to validate coupon
const checkCouponValidity = async (code, userId, amount) => {
  const coupon = await Coupon.findOne({ code: code.toUpperCase(), status: "active" });

  if (!coupon) {
    throw new Error("Invalid coupon code");
  }

  // Check expiry
  if (new Date(coupon.expiryDate) < new Date()) {
    throw new Error("Coupon has expired");
  }

  // Check global usage limit
  if (coupon.maxUses > 0 && coupon.currentUses >= coupon.maxUses) {
    throw new Error("Coupon usage limit reached");
  }

  // Check per user usage limit
  const userUsageCount = await CouponUsage.countDocuments({ coupon: coupon._id, user: userId });
  if (coupon.maxUsesPerUser > 0 && userUsageCount >= coupon.maxUsesPerUser) {
    throw new Error("You have already used this coupon");
  }

  // Check eligibility for plan
  if (coupon.applicablePlans && coupon.applicablePlans.length > 0) {
    // Round to handle potential float issues, though amounts should be integers
    const currentAmount = Math.round(amount);
    const isApplicable = coupon.applicablePlans.some(plan => Math.round(plan) === currentAmount);
    if (!isApplicable) {
      throw new Error("Coupon not applicable for this plan");
    }
  }

  return coupon;
};

// @desc    Validate coupon API
// @route   POST /api/payments/validate-coupon
// @access  Private
const validateCoupon = asyncHandler(async (req, res) => {
  const { code, applicationId } = req.body;
  const application = await InternshipApplication.findById(applicationId);

  if (!application) {
    res.status(404);
    throw new Error("Application not found");
  }

  // Ensure amount is set
  if (!application.amount || application.amount === 0) {
    application.amount = application.duration === 1 ? 399 : application.duration === 3 ? 599 : 999;
    await application.save();
  }

  try {
    const coupon = await checkCouponValidity(code, req.user._id, application.amount);
    
    let discountAmount = 0;
    const baseAmount = Number(application.amount) || 0;
    
    if (coupon.discountType === "percentage") {
      discountAmount = Math.floor((baseAmount * Number(coupon.discountValue)) / 100);
    } else {
      discountAmount = Number(coupon.discountValue) || 0;
    }

    const finalAmount = Math.max(0, baseAmount - discountAmount);

    res.json({
      success: true,
      couponId: coupon._id,
      code: coupon.code,
      discountAmount,
      finalAmount,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// @desc    Create Razorpay Order
// @route   POST /api/payments/create-order
// @access  Private
const createOrder = asyncHandler(async (req, res) => {
  const { applicationId, couponCode } = req.body;
  const application = await InternshipApplication.findById(applicationId);

  if (!application) {
    res.status(404);
    throw new Error("Application not found");
  }

  if (application.status !== "Selected") {
    res.status(400);
    throw new Error("Application is not approved for payment yet");
  }

  // Ensure amount is set
  if (!application.amount || application.amount === 0) {
    application.amount = application.duration === 1 ? 399 : application.duration === 3 ? 599 : 999;
    await application.save();
  }

  let discountAmount = 0;
  let baseAmount = Number(application.amount) || 0;
  let finalAmount = baseAmount;
  let coupon = null;

  if (couponCode) {
    try {
      coupon = await checkCouponValidity(couponCode, req.user._id, baseAmount);
      if (coupon.discountType === "percentage") {
        discountAmount = Math.floor((baseAmount * Number(coupon.discountValue)) / 100);
      } else {
        discountAmount = Number(coupon.discountValue) || 0;
      }
      finalAmount = Math.max(0, baseAmount - discountAmount);
    } catch (error) {
      res.status(400);
      throw new Error(`Coupon Error: ${error.message}`);
    }
  }

  const instance = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

  const options = {
    amount: Math.round(finalAmount * 100), // amount in smallest currency unit (paise)
    currency: "INR",
    receipt: `receipt_${application._id}`,
    notes: {
      applicationId: application._id.toString(),
      couponId: coupon ? coupon._id.toString() : null,
    },
  };

  const order = await instance.orders.create(options);

  if (!order) {
    res.status(500);
    throw new Error("Error creating Razorpay order");
  }

  // Update application with Order ID
  application.razorpayOrderId = order.id;
  await application.save();

  // Save payment record
  await Payment.create({
    applicationId: application._id,
    userId: req.user._id,
    razorpayOrderId: order.id,
    amount: finalAmount,
    originalAmount: application.amount,
    discountAmount: discountAmount,
    couponUsed: coupon ? coupon._id : null,
    status: "created",
  });

  res.json({
    success: true,
    order,
    finalAmount,
    discountAmount
  });
});

// @desc    Verify Razorpay Payment
// @route   POST /api/payments/verify
// @access  Private
const verifyPayment = asyncHandler(async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    applicationId
  } = req.body;

  const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });

  if (!payment) {
    res.status(404);
    throw new Error("Payment record not found");
  }

  const generated_signature = nodeCrypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(razorpay_order_id + "|" + razorpay_payment_id)
    .digest("hex");

  if (generated_signature === razorpay_signature) {
    // Payment verified
    payment.status = "captured";
    payment.razorpayPaymentId = razorpay_payment_id;
    payment.razorpaySignature = razorpay_signature;
    await payment.save();

    // Update application
    const application = await InternshipApplication.findById(applicationId);
    if (application && application.paymentStatus !== "Verified") {
      application.paymentStatus = "Verified";
      application.razorpayPaymentId = razorpay_payment_id;
      application.razorpaySignature = razorpay_signature;
      application.transactionId = razorpay_payment_id;
      application.status = "Approved"; 
      await application.save();

      // If coupon was used, update coupon usage
      if (payment.couponUsed) {
        const coupon = await Coupon.findById(payment.couponUsed);
        if (coupon) {
          coupon.currentUses += 1;
          await coupon.save();

          await CouponUsage.create({
            coupon: coupon._id,
            user: application.user,
            application: applicationId,
            discountAmount: payment.discountAmount
          });
        }
      }
    }

    res.json({ success: true, message: "Payment verified successfully" });
  } else {
    payment.status = "failed";
    await payment.save();
    res.status(400).json({ success: false, message: "Invalid payment signature" });
  }
});

// @desc    Razorpay Webhook
// @route   POST /api/payments/webhook
// @access  Public
const razorpayWebhook = asyncHandler(async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers["x-razorpay-signature"];

  const shasum = nodeCrypto.createHmac("sha256", webhookSecret);
  shasum.update(JSON.stringify(req.body));
  const digest = shasum.digest("hex");

  if (signature !== digest) {
    return res.status(400).json({ success: false, message: "Invalid signature" });
  }

  const event = req.body.event;
  const payload = req.body.payload;

  if (event === "payment.captured") {
    const razorpayOrderId = payload.payment.entity.order_id;
    const razorpayPaymentId = payload.payment.entity.id;

    const payment = await Payment.findOne({ razorpayOrderId });
    if (payment && payment.status !== "captured") {
      payment.status = "captured";
      payment.razorpayPaymentId = razorpayPaymentId;
      await payment.save();

      const application = await InternshipApplication.findById(payment.applicationId);
      if (application && application.paymentStatus !== "Verified") {
        application.paymentStatus = "Verified";
        application.razorpayPaymentId = razorpayPaymentId;
        application.transactionId = razorpayPaymentId;
        application.status = "Approved";
        await application.save();

        // Coupon usage update logic if not already done
        if (payment.couponUsed) {
          const couponUsageExists = await CouponUsage.findOne({ application: application._id });
          if (!couponUsageExists) {
            const coupon = await Coupon.findById(payment.couponUsed);
            if (coupon) {
              coupon.currentUses += 1;
              await coupon.save();

              await CouponUsage.create({
                coupon: coupon._id,
                user: application.user,
                application: application._id,
                discountAmount: payment.discountAmount
              });
            }
          }
        }
      }
    }
  }

  res.json({ status: "ok" });
});

module.exports = {
  validateCoupon,
  createOrder,
  verifyPayment,
  razorpayWebhook,
};

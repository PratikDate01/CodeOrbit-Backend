const nodeCrypto = require("crypto");
const razorpay = require("../config/razorpay");
const InternshipApplication = require("../models/InternshipApplication");
const asyncHandler = require("../middleware/asyncHandler");

// @desc    Create Razorpay Order
// @route   POST /api/payments/create-order
// @access  Private
const createOrder = asyncHandler(async (req, res) => {
  const { applicationId } = req.body;

  const application = await InternshipApplication.findById(applicationId);

  if (!application) {
    res.status(404);
    throw new Error("Application not found");
  }

  let amount = application.amount;
  if (!amount || amount === 0) {
    // Fallback logic: 1 Rupee for 1 month for testing
    amount = application.duration === 1 ? 1 : application.duration === 3 ? 599 : 999;
    application.amount = amount;
    await application.save();
  }

  const options = {
    amount: Math.round(amount * 100), // amount in the smallest currency unit (paise)
    currency: "INR",
    receipt: `receipt_${applicationId}`,
  };

  try {
    const order = await razorpay.orders.create(options);
    
    application.razorpayOrderId = order.id;
    await application.save();

    res.status(201).json({
      success: true,
      order,
    });
  } catch (error) {
    console.error("Razorpay Order Creation Error:", error);
    res.status(500);
    throw new Error("Razorpay Order creation failed");
  }
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

  const sign = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSign = nodeCrypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(sign.toString())
    .digest("hex");

  if (razorpay_signature === expectedSign) {
    const application = await InternshipApplication.findById(applicationId);
    
    if (!application) {
      res.status(404);
      throw new Error("Application not found");
    }

    application.paymentStatus = "Verified";
    application.razorpayPaymentId = razorpay_payment_id;
    application.razorpaySignature = razorpay_signature;
    application.transactionId = razorpay_payment_id; // For backward compatibility if needed
    
    await application.save();

    res.status(200).json({
      success: true,
      message: "Payment verified successfully",
    });
  } else {
    res.status(400);
    throw new Error("Invalid signature sent!");
  }
});

module.exports = {
  createOrder,
  verifyPayment,
};

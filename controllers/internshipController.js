const InternshipApplication = require("../models/InternshipApplication");
const Document = require("../models/Document");
const asyncHandler = require("../middleware/asyncHandler");
const Razorpay = require("razorpay");
const crypto = require("crypto");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const programs = [
  { title: 'Web Development', basePrice: 2000 },
  { title: 'Data Science', basePrice: 2500 },
  { title: 'Cloud Computing', basePrice: 2200 },
  { title: 'UI/UX Design', basePrice: 1800 }
];

const calculateServerFee = (domain, duration) => {
  const program = programs.find(p => p.title === domain);
  if (!program) return 0;
  return program.basePrice * duration;
};

// @desc    Create Razorpay Order
// @route   POST /api/internships/create-order
// @access  Private
const createInternshipOrder = asyncHandler(async (req, res) => {
  const { preferredDomain, duration, formData } = req.body;

  const amount = calculateServerFee(preferredDomain, duration);

  if (amount <= 0) {
    res.status(400);
    throw new Error("Invalid domain or duration");
  }

  const options = {
    amount: amount * 100, // amount in the smallest currency unit (paise)
    currency: "INR",
    receipt: `receipt_${Date.now()}`,
    notes: {
      userId: req.user._id.toString()
    }
  };

  try {
    const order = await razorpay.orders.create(options);

    if (!order) {
      res.status(500);
      throw new Error("Error creating Razorpay order");
    }

    // Create a pending application
    if (formData) {
      await InternshipApplication.create({
        ...formData,
        amount,
        razorpayOrderId: order.id,
        paymentStatus: "Pending",
        user: req.user._id,
      });
    }

    res.json(order);
  } catch (error) {
    console.error("Razorpay Order Error:", error);
    
    // If Razorpay fails (e.g. dummy keys), we still want to save the application
    // so it shows in the admin panel for tracking.
    if (formData) {
      try {
        const application = await InternshipApplication.create({
          ...formData,
          amount,
          paymentStatus: "Failed",
          user: req.user._id,
        });
        
        // Return a response that indicates success in submission but failure in payment
        return res.status(201).json({
          message: "Application submitted, but payment gateway is down. Please contact support.",
          application,
          offline: true,
          error: error.message
        });
      } catch (saveError) {
        console.error("Failed to save application after Razorpay error:", saveError);
      }
    }

    res.status(500);
    throw new Error("Error creating Razorpay order: " + error.message);
  }
});

// @desc    Verify Payment and Create Application
// @route   POST /api/internships/verify-payment
// @access  Private
const verifyInternshipPayment = asyncHandler(async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  } = req.body;

  const sign = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSign = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(sign.toString())
    .digest("hex");

  if (razorpay_signature !== expectedSign) {
    res.status(400);
    throw new Error("Invalid payment signature");
  }

  const application = await InternshipApplication.findOne({ razorpayOrderId: razorpay_order_id });
  
  if (!application) {
    res.status(404);
    throw new Error("Application not found for this order");
  }

  if (application.paymentStatus !== "Verified") {
    application.paymentStatus = "Verified";
    application.razorpayPaymentId = razorpay_payment_id;
    application.razorpaySignature = razorpay_signature;
    await application.save();
  }

  res.status(200).json(application);
});

// @desc    Razorpay Webhook
// @route   POST /api/internships/webhook
// @access  Public
const razorpayWebhook = asyncHandler(async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  const shasum = crypto.createHmac("sha256", secret);
  shasum.update(JSON.stringify(req.body));
  const digest = shasum.digest("hex");

  if (digest === req.headers["x-razorpay-signature"]) {
    const event = req.body.event;

    if (event === "payment.captured") {
      const payment = req.body.payload.payment.entity;
      const orderId = payment.order_id;

      const application = await InternshipApplication.findOne({ razorpayOrderId: orderId });
      
      if (application && application.paymentStatus !== "Verified") {
        application.paymentStatus = "Verified";
        application.razorpayPaymentId = payment.id;
        // signature is not available in webhook payload easily usually, 
        // but paymentStatus Verified is what matters for admin.
        await application.save();
        console.log("Payment verified via webhook for order:", orderId);
      }
    }
    res.json({ status: "ok" });
  } else {
    res.status(400).send("Invalid signature");
  }
});

const applyForInternship = asyncHandler(async (req, res) => {
  // This function might be deprecated or used for free ones if any, 
  // but for now we follow the verify-payment flow.
  res.status(400);
  throw new Error("Please use the payment flow to apply");
});

// @desc    Get all internship applications
// @route   GET /api/internships
// @access  Private/Admin
const getInternshipApplications = asyncHandler(async (req, res) => {
  const applications = await InternshipApplication.find({}).sort("-createdAt").lean();
  
  // Attach documents to each application
  const applicationsWithDocs = await Promise.all(applications.map(async (app) => {
    const documents = await Document.findOne({ applicationId: app._id });
    return { ...app, documents };
  }));

  res.json(applicationsWithDocs);
});

const { createNotification } = require("./notificationController");

// @desc    Update internship application status
// @route   PUT /api/internships/:id/status
// @access  Private/Admin
const updateInternshipStatus = asyncHandler(async (req, res) => {
  try {
    const application = await InternshipApplication.findById(req.params.id);

    if (application) {
      const oldStatus = application.status;
      application.status = req.body.status || application.status;
      application.paymentStatus = req.body.paymentStatus || application.paymentStatus;
      application.startDate = req.body.startDate || application.startDate;
      application.endDate = req.body.endDate || application.endDate;
      
      const updatedApplication = await application.save();

      // Create notification for user if linked
      if (application.user && oldStatus !== application.status) {
        try {
          await createNotification(
            application.user,
            "Application Status Updated",
            `Your application for ${application.preferredDomain} has been updated to ${application.status}`,
            "application_status"
          );
        } catch (notifError) {
          console.error("Notification error:", notifError);
        }
      }

      res.json(updatedApplication);
    } else {
      res.status(404);
      throw new Error("Application not found");
    }
  } catch (error) {
    console.error("Update status error:", error);
    res.status(res.statusCode === 200 ? 500 : res.statusCode);
    throw error;
  }
});

// @desc    Delete internship application
// @route   DELETE /api/internships/:id
// @access  Private/Admin
const deleteInternshipApplication = asyncHandler(async (req, res) => {
  const application = await InternshipApplication.findById(req.params.id);

  if (application) {
    await application.deleteOne();
    res.json({ message: "Application removed" });
  } else {
    res.status(404);
    throw new Error("Application not found");
  }
});

// @desc    Get my internship applications
// @route   GET /api/internships/my-applications
// @access  Private
const getMyInternshipApplications = asyncHandler(async (req, res) => {
  const applications = await InternshipApplication.find({ user: req.user._id }).sort("-createdAt").lean();
  
  // Attach documents to each application
  const applicationsWithDocs = await Promise.all(applications.map(async (app) => {
    const documents = await Document.findOne({ applicationId: app._id });
    return { ...app, documents };
  }));

  res.json(applicationsWithDocs);
});

module.exports = {
  applyForInternship,
  getInternshipApplications,
  updateInternshipStatus,
  deleteInternshipApplication,
  getMyInternshipApplications,
  createInternshipOrder,
  verifyInternshipPayment,
  razorpayWebhook,
};

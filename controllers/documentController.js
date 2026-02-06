const Document = require("../models/Document");
const InternshipApplication = require("../models/InternshipApplication");
const ActivityProgress = require("../models/ActivityProgress");
const AuditLog = require("../models/AuditLog");
const { generatePDF } = require("../utils/pdfGenerator");
const { numberToWords } = require("../utils/numberToWords");
const asyncHandler = require("../middleware/asyncHandler");
const { uploadBufferToCloudinary } = require("../config/cloudinary");
const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");

const getBase64Image = (filePath) => {
  const fullPath = path.join(__dirname, "..", filePath);
  if (fs.existsSync(fullPath)) {
    const bitmap = fs.readFileSync(fullPath);
    const extension = path.extname(fullPath).substring(1);
    return `data:image/${extension};base64,${bitmap.toString("base64")}`;
  }
  return null;
};

// Helper to get or create Document record
const getOrCreateDocument = async (applicationId, user) => {
  let document = await Document.findOne({ applicationId });
  if (!document) {
    const verificationId = `COS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    document = await Document.create({
      applicationId,
      user,
      verificationId
    });
  }
  return document;
};

const formatDate = (date) => {
  if (!date) return "Not Specified";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "Not Specified";
  // DD Month YYYY format
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
};

// Common data for PDF generation
const getDocData = async (application, verificationId) => {
  const verificationUrl = `${process.env.FRONTEND_URL}/verify/${verificationId}`;
  const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl);
  
  return {
    name: application.name,
    role: application.preferredDomain,
    college: application.college,
    startDate: formatDate(application.startDate),
    endDate: formatDate(application.endDate),
    date: formatDate(application.documentIssueDate),
    verificationId,
    verificationUrl: "verify.codeorbit.in",
    qrCode: qrCodeDataUrl,
    companyLogo: getBase64Image("assets/logos/Company Logo.png"),
    aicteLogo: getBase64Image("assets/logos/AICTE LOGO.png"),
    msmeLogo: getBase64Image("assets/logos/MSME LOGO.png"),
    companyStamp: getBase64Image("assets/stamps/COMPANY STAMP.png"),
    signatoryName: "Tejas Date",
    signatoryTitle: "CO-FOUNDER"
  };
};

const generateOfferLetter = asyncHandler(async (req, res) => {
  const { applicationId } = req.body;
  const application = await InternshipApplication.findById(applicationId).populate("user");
  if (!application) {
    res.status(404);
    throw new Error("Application not found");
  }

  if (!application.documentIssueDate) {
    res.status(400);
    throw new Error("Please set document issue date before generating.");
  }

  const document = await getOrCreateDocument(applicationId, application.user?._id || application.user);
  const docData = await getDocData(application, document.verificationId);

  const buffer = await generatePDF("offerLetter", docData, { margin: { top: "0", bottom: "0" } });
  const upload = await uploadBufferToCloudinary(buffer, "documents/offer_letters", `offer_letter_${applicationId}`);

  document.offerLetterUrl = upload.secure_url;
  document.offerLetterPublicId = upload.public_id;
  await document.save();

  // Update application status to approved if it was pending
  if (application.status === "Pending") {
    application.status = "Approved";
    await application.save();
  }

  await AuditLog.create({
    admin: req.user._id,
    actionType: "GENERATE_OFFER_LETTER",
    targetType: "InternshipApplication",
    targetId: applicationId,
  });

  res.status(200).json({ success: true, url: upload.secure_url });
});

const generateCertificate = asyncHandler(async (req, res) => {
  const { applicationId } = req.body;
  const application = await InternshipApplication.findById(applicationId).populate("user");
  if (!application) {
    res.status(404);
    throw new Error("Application not found");
  }

  if (!application.documentIssueDate) {
    res.status(400);
    throw new Error("Please set document issue date before generating.");
  }

  // Check Eligibility
  const progress = await ActivityProgress.findOne({ internshipApplication: applicationId });
  if (!progress?.isEligibleForCertificate) {
    res.status(400);
    throw new Error("Student not eligible for certificate yet");
  }

  const document = await getOrCreateDocument(applicationId, application.user?._id || application.user);
  const docData = await getDocData(application, document.verificationId);

  const buffer = await generatePDF("certificate", docData, { landscape: true, margin: { top: "0", bottom: "0" } });
  const upload = await uploadBufferToCloudinary(buffer, "documents/certificates", `certificate_${applicationId}`);

  document.certificateUrl = upload.secure_url;
  document.certificatePublicId = upload.public_id;
  await document.save();

  await AuditLog.create({
    admin: req.user._id,
    actionType: "GENERATE_CERTIFICATE",
    targetType: "InternshipApplication",
    targetId: applicationId,
  });

  res.status(200).json({ success: true, url: upload.secure_url });
});

const generateLOC = asyncHandler(async (req, res) => {
  const { applicationId } = req.body;
  const application = await InternshipApplication.findById(applicationId).populate("user");
  if (!application) {
    res.status(404);
    throw new Error("Application not found");
  }

  if (!application.documentIssueDate) {
    res.status(400);
    throw new Error("Please set document issue date before generating.");
  }

  const document = await getOrCreateDocument(applicationId, application.user?._id || application.user);
  const docData = await getDocData(application, document.verificationId);

  const buffer = await generatePDF("loc", docData, { margin: { top: "0", bottom: "0" } });
  const upload = await uploadBufferToCloudinary(buffer, "documents/locs", `loc_${applicationId}`);

  document.locUrl = upload.secure_url;
  document.locPublicId = upload.public_id;
  await document.save();

  await AuditLog.create({
    admin: req.user._id,
    actionType: "GENERATE_LOC",
    targetType: "InternshipApplication",
    targetId: applicationId,
  });

  res.status(200).json({ success: true, url: upload.secure_url });
});

const toggleVisibility = asyncHandler(async (req, res) => {
  const { applicationId, type, visible } = req.body;
  const document = await Document.findOne({ applicationId });
  if (!document) {
    res.status(404);
    throw new Error("Document record not found");
  }

  const field = `${type}Visible`;
  document[field] = visible;
  await document.save();

  res.status(200).json({ success: true, [field]: document[field] });
});

const getDocuments = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const document = await Document.findOne({ applicationId });
  res.status(200).json(document || {});
});

const generatePaymentSlip = asyncHandler(async (req, res) => {
  const { applicationId, regenerate = false } = req.body;

  const existingDoc = await Document.findOne({ applicationId });
  if (!regenerate && existingDoc?.paymentSlipUrl) {
    return res.status(200).json({
      success: true,
      message: "Payment slip already exists",
      paymentSlipUrl: existingDoc.paymentSlipUrl
    });
  }

  const application = await InternshipApplication.findById(applicationId).populate("user");
  if (!application || application.paymentStatus !== "Verified") {
    res.status(400);
    throw new Error("Application not found or payment not verified");
  }

  if (!application.documentIssueDate) {
    res.status(400);
    throw new Error("Please set document issue date before generating.");
  }

  console.log(`[Controller] ${regenerate ? "Regenerating" : "Generating"} Payment Slip for: ${application.name}`);
  
  const verificationId = existingDoc?.verificationId || `COS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const amount = application.amount || 0;
  const docData = {
    receiptNo: `REC-${Date.now().toString().slice(-6)}`,
    name: application.name,
    email: application.email,
    phone: application.phone,
    college: application.college,
    role: application.preferredDomain,
    duration: application.duration,
    amount: amount,
    amountInWords: numberToWords(amount),
    date: formatDate(application.documentIssueDate),
    transactionId: application.transactionId || 'N/A',
    companyLogo: getBase64Image("assets/logos/Company Logo.png"),
    aicteLogo: getBase64Image("assets/logos/AICTE LOGO.png"),
    msmeLogo: getBase64Image("assets/logos/MSME LOGO.png"),
    companyStamp: getBase64Image("assets/stamps/COMPANY STAMP.png"),
  };

  try {
    const buffer = await generatePDF("paymentSlip", docData, { margin: { top: "0", bottom: "0" } });
    const upload = await uploadBufferToCloudinary(buffer, "documents/payment_slips", `payment_slip_${applicationId}`);

    const updatedDoc = await Document.findOneAndUpdate(
      { applicationId },
      { 
        $set: { 
          paymentSlipUrl: upload.secure_url, 
          paymentSlipPublicId: upload.public_id,
          user: application.user?._id || application.user,
          verificationId,
          applicationId
        } 
      },
      { upsert: true, new: true }
    );

    await AuditLog.create({
      admin: req.user._id,
      actionType: regenerate ? "REGENERATE_PAYMENT_SLIP" : "GENERATE_PAYMENT_SLIP",
      targetType: "InternshipApplication",
      targetId: applicationId,
    });

    res.status(201).json({
      success: true,
      message: regenerate ? "Payment slip regenerated successfully" : "Payment slip generated successfully",
      paymentSlipUrl: updatedDoc.paymentSlipUrl
    });
  } catch (error) {
    console.error("[Controller] Payment Slip Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

const getDocumentByVerificationId = async (req, res) => {
  try {
    const { verificationId } = req.params;
    const document = await Document.findOne({ verificationId }).populate("applicationId user");
    if (!document) return res.status(404).json({ message: "Document not found" });
    res.status(200).json(document);
  } catch (error) {
    res.status(500).json({ message: "Error fetching document", error: error.message });
  }
};

module.exports = {
  generateOfferLetter,
  generateCertificate,
  generateLOC,
  toggleVisibility,
  getDocuments,
  getDocumentByVerificationId,
  generatePaymentSlip,
};
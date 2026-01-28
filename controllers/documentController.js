const Document = require("../models/Document");
const InternshipApplication = require("../models/InternshipApplication");
const { generatePDF } = require("../utils/pdfGenerator");
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

const generateDocuments = asyncHandler(async (req, res) => {
  const { applicationId, startDate: reqStartDate, endDate: reqEndDate } = req.body;
  
  // Always fetch existing record to preserve verificationId if it exists
  const existingDoc = await Document.findOne({ applicationId });
  
  // 2. Fetch Application Data
  const application = await InternshipApplication.findById(applicationId).populate("user");
  if (!application) {
    res.status(404);
    throw new Error("Application not found");
  }

  console.log(`[Controller] Starting document generation for: ${application.name}`);

  const verificationId = existingDoc?.verificationId || `COS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const verificationUrl = `${process.env.FRONTEND_URL}/verify/${verificationId}`;
  const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl);

  const docData = {
    name: application.name,
    role: application.preferredDomain,
    startDate: new Date(reqStartDate || application.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
    endDate: new Date(reqEndDate || application.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
    date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
    verificationId,
    qrCode: qrCodeDataUrl,
    companyLogo: getBase64Image("assets/logos/Company Logo.png"),
    aicteLogo: getBase64Image("assets/logos/AICTE LOGO.png"),
    msmeLogo: getBase64Image("assets/logos/MSME LOGO.png"),
    companyStamp: getBase64Image("assets/stamps/COMPANY STAMP.png"),
  };

  try {
    // 3. Sequential PDF Generation & Confirmed Uploads
    // Offer Letter
    console.log("[Step 1/3] Generating Offer Letter...");
    const olBuffer = await generatePDF("offerLetter", docData, { margin: { top: "0", bottom: "0" } });
    if (!olBuffer || olBuffer.length < 5000) throw new Error("Offer Letter PDF is corrupt or too small");
    
    const olUpload = await uploadBufferToCloudinary(olBuffer, "documents/offer_letters", `offer_letter_${applicationId}.pdf`, "raw");

    // Certificate
    console.log("[Step 2/3] Generating Certificate...");
    const certBuffer = await generatePDF("certificate", docData, { landscape: true, margin: { top: "0", bottom: "0" } });
    if (!certBuffer || certBuffer.length < 5000) throw new Error("Certificate PDF is corrupt or too small");
    
    const certUpload = await uploadBufferToCloudinary(certBuffer, "documents/certificates", `certificate_${applicationId}.pdf`, "raw");

    // LOC
    console.log("[Step 3/3] Generating LOC...");
    const locBuffer = await generatePDF("loc", docData, { margin: { top: "0", bottom: "0" } });
    if (!locBuffer || locBuffer.length < 5000) throw new Error("LOC PDF is corrupt or too small");
    
    const locUpload = await uploadBufferToCloudinary(locBuffer, "documents/locs", `loc_${applicationId}.pdf`, "raw");

    // 4. Atomic Database Update (Only if all uploads succeeded)
    const docUpdate = {
      applicationId,
      user: application.user?._id || req.user?._id,
      offerLetterUrl: olUpload.secure_url,
      offerLetterPublicId: olUpload.public_id,
      certificateUrl: certUpload.secure_url,
      certificatePublicId: certUpload.public_id,
      locUrl: locUpload.secure_url,
      locPublicId: locUpload.public_id,
      verificationId,
    };

    let document = await Document.findOneAndUpdate(
      { applicationId },
      { $set: docUpdate },
      { upsert: true, new: true }
    );

    // Update application status
    application.status = "Approved";
    if (reqStartDate) application.startDate = reqStartDate;
    if (reqEndDate) application.endDate = reqEndDate;
    await application.save();

    console.log(`[Controller] Successfully completed all tasks for ${applicationId}`);

    res.status(201).json({
      success: true,
      message: "All documents generated and uploaded successfully",
      verificationId: document.verificationId,
      offerLetterUrl: document.offerLetterUrl,
      certificateUrl: document.certificateUrl,
      locUrl: document.locUrl
    });

  } catch (error) {
    console.error("[Controller] CRITICAL ERROR during document process:", error);
    res.status(500).json({
      success: false,
      message: "Document generation failed at a critical step",
      error: error.message
    });
  }
});

const generatePaymentSlip = asyncHandler(async (req, res) => {
  const { applicationId } = req.body;

  const application = await InternshipApplication.findById(applicationId).populate("user");
  if (!application || application.paymentStatus !== "Verified") {
    res.status(400);
    throw new Error("Application not found or payment not verified");
  }

  console.log(`[Controller] Generating Payment Slip for: ${application.name}`);

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
    date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
    transactionId: application.transactionId || 'N/A',
    companyLogo: getBase64Image("assets/logos/Company Logo.png"),
    companyStamp: getBase64Image("assets/stamps/COMPANY STAMP.png"),
  };

  try {
    const buffer = await generatePDF("paymentSlip", docData, { margin: { top: "0", bottom: "0" } });
    if (!buffer || buffer.length < 2000) throw new Error("Payment slip PDF is corrupt");

    const upload = await uploadBufferToCloudinary(buffer, "documents/payment_slips", `payment_slip_${applicationId}.pdf`, "raw");

    await Document.findOneAndUpdate(
      { applicationId },
      { $set: { paymentSlipUrl: upload.secure_url, paymentSlipPublicId: upload.public_id } },
      { upsert: true }
    );

    res.status(201).json({
      success: true,
      message: "Payment slip generated successfully",
      paymentSlipUrl: upload.secure_url
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
  generateDocuments,
  getDocumentByVerificationId,
  generatePaymentSlip,
};

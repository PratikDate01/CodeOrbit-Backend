const Document = require("../models/Document");
const InternshipApplication = require("../models/InternshipApplication");
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

const generateDocuments = asyncHandler(async (req, res) => {
  const { applicationId, startDate: reqStartDate, endDate: reqEndDate, regenerate = false } = req.body;
  
  // 1. Check if documents already exist and we are NOT regenerating
  const existingDoc = await Document.findOne({ applicationId });
  if (!regenerate && existingDoc?.offerLetterUrl && existingDoc?.certificateUrl && existingDoc?.locUrl) {
    console.log(`[Controller] Documents already exist for ${applicationId}, skipping generation`);
    return res.status(200).json({
      success: true,
      message: "Documents already exist",
      verificationId: existingDoc.verificationId,
      offerLetterUrl: existingDoc.offerLetterUrl,
      certificateUrl: existingDoc.certificateUrl,
      locUrl: existingDoc.locUrl
    });
  }
  
  // 2. Fetch Application Data
  const application = await InternshipApplication.findById(applicationId).populate("user");
  if (!application) {
    res.status(404);
    throw new Error("Application not found");
  }

  console.log(`[Controller] ${regenerate ? "Regenerating" : "Generating"} documents for: ${application.name}`);

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
    if (!olBuffer || !Buffer.isBuffer(olBuffer) || olBuffer.slice(0, 5).toString() !== "%PDF-") {
      throw new Error(`Offer Letter PDF generation failed: Invalid or corrupted buffer`);
    }
    
    const olUpload = await uploadBufferToCloudinary(olBuffer, "documents/offer_letters", `offer_letter_${applicationId}`);

    // Certificate
    console.log("[Step 2/3] Generating Certificate...");
    const certBuffer = await generatePDF("certificate", docData, { landscape: true, margin: { top: "0", bottom: "0" } });
    if (!certBuffer || !Buffer.isBuffer(certBuffer) || certBuffer.slice(0, 5).toString() !== "%PDF-") {
      throw new Error(`Certificate PDF generation failed: Invalid or corrupted buffer`);
    }
    
    const certUpload = await uploadBufferToCloudinary(certBuffer, "documents/certificates", `certificate_${applicationId}`);

    // LOC
    console.log("[Step 3/3] Generating LOC...");
    const locBuffer = await generatePDF("loc", docData, { margin: { top: "0", bottom: "0" } });
    if (!locBuffer || !Buffer.isBuffer(locBuffer) || locBuffer.slice(0, 5).toString() !== "%PDF-") {
      throw new Error(`LOC PDF generation failed: Invalid or corrupted buffer`);
    }
    
    const locUpload = await uploadBufferToCloudinary(locBuffer, "documents/locs", `loc_${applicationId}`);

    // 4. Atomic Database Update (Only if ALL uploads succeeded)
    console.log("[Step 4/4] Updating Database records...");
    const docUpdate = {
      applicationId,
      user: application.user?._id || application.user,
      offerLetterUrl: olUpload.secure_url,
      offerLetterPublicId: olUpload.public_id,
      certificateUrl: certUpload.secure_url,
      certificatePublicId: certUpload.public_id,
      locUrl: locUpload.secure_url,
      locPublicId: locUpload.public_id,
      verificationId,
    };

    if (!docUpdate.offerLetterUrl || !docUpdate.certificateUrl || !docUpdate.locUrl) {
      throw new Error("One or more Cloudinary upload URLs are missing");
    }

    const document = await Document.findOneAndUpdate(
      { applicationId },
      { $set: docUpdate },
      { upsert: true, new: true }
    );

    if (!document) {
      throw new Error("Failed to update or create Document record");
    }

    // Update application status
    application.status = "Approved";
    if (reqStartDate) application.startDate = reqStartDate;
    if (reqEndDate) application.endDate = reqEndDate;
    await application.save();

    console.log(`[Controller] SUCCESS: All documents generated, uploaded, and records saved for ${applicationId}`);

    res.status(201).json({
      success: true,
      message: regenerate ? "Documents regenerated successfully" : "All documents generated and uploaded successfully",
      verificationId: document.verificationId,
      offerLetterUrl: document.offerLetterUrl,
      certificateUrl: document.certificateUrl,
      locUrl: document.locUrl
    });

  } catch (error) {
    console.error("[Controller] CRITICAL ERROR during document process:", error);
    // Ensure we don't send a success response if something failed
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "Document generation failed",
        error: error.message
      });
    }
  }
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
    date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
    transactionId: application.transactionId || 'N/A',
    companyLogo: getBase64Image("assets/logos/Company Logo.png"),
    aicteLogo: getBase64Image("assets/logos/AICTE LOGO.png"),
    msmeLogo: getBase64Image("assets/logos/MSME LOGO.png"),
    companyStamp: getBase64Image("assets/stamps/COMPANY STAMP.png"),
  };

  try {
    const buffer = await generatePDF("paymentSlip", docData, { margin: { top: "0", bottom: "0" } });
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.slice(0, 5).toString() !== "%PDF-") {
      throw new Error(`Payment slip PDF generation failed: Invalid or corrupted buffer`);
    }

    const upload = await uploadBufferToCloudinary(buffer, "documents/payment_slips", `payment_slip_${applicationId}`);

    if (!upload || !upload.secure_url) {
      throw new Error("Payment slip upload failed: No URL returned from Cloudinary");
    }

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

    if (!updatedDoc) {
      throw new Error("Failed to update Document record with payment slip");
    }

    res.status(201).json({
      success: true,
      message: regenerate ? "Payment slip regenerated successfully" : "Payment slip generated successfully",
      paymentSlipUrl: updatedDoc.paymentSlipUrl
    });
  } catch (error) {
    console.error("[Controller] Payment Slip Error:", error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        message: "Payment slip generation failed",
        error: error.message 
      });
    }
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

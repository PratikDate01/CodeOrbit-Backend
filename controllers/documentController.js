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
  try {
    const { applicationId, startDate: reqStartDate, endDate: reqEndDate, regenerate = false } = req.body;
    
    // Check if documents already exist
    const existingDoc = await Document.findOne({ applicationId });
    if (existingDoc && !regenerate && existingDoc.offerLetterUrl && existingDoc.certificateUrl && existingDoc.locUrl) {
      return res.status(200).json({
        success: true,
        message: "Documents already exist",
        verificationId: existingDoc.verificationId,
        offerLetterUrl: existingDoc.offerLetterUrl,
        certificateUrl: existingDoc.certificateUrl,
        locUrl: existingDoc.locUrl
      });
    }

    const application = await InternshipApplication.findById(applicationId).populate("user");

    if (!application) {
      res.status(404);
      throw new Error("Application not found");
    }

    const verificationId = existingDoc?.verificationId || `COS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const verificationUrl = `${process.env.FRONTEND_URL}/verify/${verificationId}`;
    
    // Generate QR Code
    const qrCodeDataUrl = await QRCode.toDataURL(verificationUrl);

    // Get images as base64
    const companyLogo = getBase64Image("assets/logos/Company Logo.png");
    const aicteLogo = getBase64Image("assets/logos/AICTE LOGO.png");
    const msmeLogo = getBase64Image("assets/logos/MSME LOGO.png");
    const companyStamp = getBase64Image("assets/stamps/COMPANY STAMP.png");

    const finalStartDate = reqStartDate || application.startDate;
    const finalEndDate = reqEndDate || application.endDate;

    const formatDate = (date) => {
      if (!date) return "TBD";
      const d = new Date(date);
      return isNaN(d.getTime()) ? "TBD" : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    };

    const docData = {
      name: application.name,
      role: application.preferredDomain,
      startDate: formatDate(finalStartDate),
      endDate: formatDate(finalEndDate),
      date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
      verificationId,
      qrCode: qrCodeDataUrl,
      companyLogo,
      aicteLogo,
      msmeLogo,
      companyStamp
    };

    // Start PDF generation and Cloudinary upload
    try {
      // Generate and Upload Offer Letter
      console.log("Generating and Uploading Offer Letter...");
      const offerLetterBuffer = await generatePDF("offerLetter", docData, {
        margin: { top: "0", bottom: "0", left: "0", right: "0" }
      });
      const offerLetterUpload = await uploadBufferToCloudinary(
        offerLetterBuffer,
        "documents/offer_letters",
        `offer_letter_${applicationId}`,
        "raw"
      );

      // Generate and Upload Certificate (Landscape)
      console.log("Generating and Uploading Certificate...");
      const certificateBuffer = await generatePDF("certificate", docData, { 
        landscape: true, 
        margin: { top: "0", bottom: "0", left: "0", right: "0" } 
      });
      const certificateUpload = await uploadBufferToCloudinary(
        certificateBuffer,
        "documents/certificates",
        `certificate_${applicationId}`,
        "raw"
      );

      // Generate and Upload LOC
      console.log("Generating and Uploading LOC...");
      const locBuffer = await generatePDF("loc", docData, {
        margin: { top: "0", bottom: "0", left: "0", right: "0" }
      });
      const locUpload = await uploadBufferToCloudinary(
        locBuffer,
        "documents/locs",
        `loc_${applicationId}`,
        "raw"
      );

      // Update application status
      if (reqStartDate) application.startDate = reqStartDate;
      if (reqEndDate) application.endDate = reqEndDate;
      application.status = "Approved";
      await application.save();

      // Create or Update Document record
      let document = await Document.findOne({ applicationId });
      
      const docUpdate = {
        applicationId,
        user: application.user ? application.user._id : req.user._id,
        offerLetterUrl: offerLetterUpload.secure_url,
        offerLetterPublicId: offerLetterUpload.public_id,
        certificateUrl: certificateUpload.secure_url,
        certificatePublicId: certificateUpload.public_id,
        locUrl: locUpload.secure_url,
        locPublicId: locUpload.public_id,
        verificationId,
      };

      if (document) {
        Object.assign(document, docUpdate);
        await document.save();
      } else {
        document = await Document.create(docUpdate);
      }
      
      res.status(201).json({
        success: true,
        message: "Documents generated and uploaded successfully",
        verificationId,
        offerLetterUrl: document.offerLetterUrl,
        certificateUrl: document.certificateUrl,
        locUrl: document.locUrl
      });
    } catch (genError) {
      console.error("PDF generation or upload failed:", genError);
      res.status(500).json({ 
        success: false,
        message: "Failed to generate or upload documents", 
        error: genError.message 
      });
    }
  } catch (error) {
    console.error("General Document error:", error);
    res.status(500).json({ 
      success: false,
      message: "Error in document process", 
      error: error.message 
    });
  }
});

const getDocumentByVerificationId = async (req, res) => {
  try {
    const { verificationId } = req.params;
    const document = await Document.findOne({ verificationId }).populate("applicationId user");

    if (!document) {
      return res.status(404).json({ message: "Document not found" });
    }

    res.status(200).json(document);
  } catch (error) {
    res.status(500).json({ message: "Error fetching document", error: error.message });
  }
};

const amountToWords = (amount) => {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const convert = (n) => {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + ones[n % 10] : "");
    if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " and " + convert(n % 100) : "");
    if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 !== 0 ? " " + convert(n % 1000) : "");
    if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 !== 0 ? " " + convert(n % 100000) : "");
    return "Amount too large";
  };

  if (amount === 0) return "Zero Only";
  return convert(amount) + " Only";
};

const generatePaymentSlip = asyncHandler(async (req, res) => {
  const { applicationId, regenerate = false } = req.body;

  // Check if payment slip already exists
  const existingDoc = await Document.findOne({ applicationId });
  if (existingDoc && !regenerate && existingDoc.paymentSlipUrl) {
    return res.status(200).json({
      success: true,
      message: "Payment slip already exists",
      paymentSlipUrl: existingDoc.paymentSlipUrl
    });
  }

  const application = await InternshipApplication.findById(applicationId).populate("user");

  if (!application) {
    res.status(404);
    throw new Error("Application not found");
  }

  if (application.paymentStatus !== "Verified") {
    res.status(400);
    throw new Error("Payment must be verified before generating slip");
  }

  const companyLogo = getBase64Image("assets/logos/Company Logo.png");
  const aicteLogo = getBase64Image("assets/logos/AICTE LOGO.png");
  const msmeLogo = getBase64Image("assets/logos/MSME LOGO.png");
  const companyStamp = getBase64Image("assets/stamps/COMPANY STAMP.png");

  const amount = application.amount || (application.duration === 1 ? 399 : application.duration === 3 ? 599 : 999);
  
  const docData = {
    receiptNo: `REC-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1000)}`,
    name: application.name,
    email: application.email,
    phone: application.phone,
    college: application.college,
    role: application.preferredDomain,
    duration: application.duration,
    amount: amount,
    date: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
    transactionId: application.transactionId || 'N/A',
    amountInWords: amountToWords(amount),
    currentYear: new Date().getFullYear(),
    companyLogo,
    aicteLogo,
    msmeLogo,
    companyStamp
  };

  try {
    console.log("Generating and Uploading Payment Slip...");
    const buffer = await generatePDF("paymentSlip", docData, {
      margin: { top: "0", bottom: "0", left: "0", right: "0" }
    });
    
    const uploadResult = await uploadBufferToCloudinary(
      buffer,
      "documents/payment_slips",
      `payment_slip_${applicationId}`,
      "raw"
    );

    let document = await Document.findOne({ applicationId });
    if (document) {
      document.paymentSlipUrl = uploadResult.secure_url;
      document.paymentSlipPublicId = uploadResult.public_id;
      await document.save();
    } else {
      const verificationId = `COS-P-${Date.now()}`;
      document = await Document.create({
        applicationId,
        user: application.user ? application.user._id : req.user._id,
        paymentSlipUrl: uploadResult.secure_url,
        paymentSlipPublicId: uploadResult.public_id,
        verificationId
      });
    }

    res.status(201).json({
      success: true,
      message: "Payment slip generated and uploaded successfully",
      paymentSlipUrl: document.paymentSlipUrl
    });
  } catch (error) {
    console.error("Payment slip generation or upload failed:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate or upload payment slip",
      error: error.message
    });
  }
});

module.exports = {
  generateDocuments,
  getDocumentByVerificationId,
  generatePaymentSlip,
};

const Document = require("../models/Document");
const InternshipApplication = require("../models/InternshipApplication");
const { generatePDF } = require("../utils/pdfGenerator");
const asyncHandler = require("../middleware/asyncHandler");
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
    const { applicationId, startDate: reqStartDate, endDate: reqEndDate } = req.body;
    const application = await InternshipApplication.findById(applicationId).populate("user");

    if (!application) {
      res.status(404);
      throw new Error("Application not found");
    }

    const verificationId = `COS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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

    // Ensure upload directory exists
    const uploadsBaseDir = path.join(__dirname, "../uploads");
    const uploadDir = path.join(uploadsBaseDir, "documents");
    
    if (!fs.existsSync(uploadsBaseDir)) {
      fs.mkdirSync(uploadsBaseDir, { recursive: true });
    }
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Start PDF generation
    try {
      // Generate Offer Letter
      console.log("Generating Offer Letter...");
      const offerLetterBuffer = await generatePDF("offerLetter", docData);
      const offerLetterFilename = `offer_letter_${applicationId}.pdf`;
      const offerLetterPath = path.join(uploadDir, offerLetterFilename);
      fs.writeFileSync(offerLetterPath, offerLetterBuffer);

      // Generate Certificate (Landscape)
      console.log("Generating Certificate...");
      const certificateBuffer = await generatePDF("certificate", docData, { 
        landscape: true, 
        margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" } 
      });
      const certificateFilename = `certificate_${applicationId}.pdf`;
      const certificatePath = path.join(uploadDir, certificateFilename);
      fs.writeFileSync(certificatePath, certificateBuffer);

      // Generate LOC
      console.log("Generating LOC...");
      const locBuffer = await generatePDF("loc", docData);
      const locFilename = `loc_${applicationId}.pdf`;
      const locPath = path.join(uploadDir, locFilename);
      fs.writeFileSync(locPath, locBuffer);

      // Update application status ONLY after successful PDF generation
      if (reqStartDate) application.startDate = reqStartDate;
      if (reqEndDate) application.endDate = reqEndDate;
      application.status = "Approved";
      await application.save();
      console.log(`Application ${applicationId} status updated to Approved after PDF generation.`);

      // Create or Update Document record
      let document = await Document.findOne({ applicationId });
      
      if (document) {
        document.offerLetterUrl = `/uploads/documents/${offerLetterFilename}`;
        document.certificateUrl = `/uploads/documents/${certificateFilename}`;
        document.locUrl = `/uploads/documents/${locFilename}`;
        document.verificationId = verificationId;
        await document.save();
      } else {
        await Document.create({
          applicationId,
          user: application.user ? application.user._id : req.user._id,
          offerLetterUrl: `/uploads/documents/${offerLetterFilename}`,
          certificateUrl: `/uploads/documents/${certificateFilename}`,
          locUrl: `/uploads/documents/${locFilename}`,
          verificationId,
        });
      }
      
      console.log("PDF generation and database updates completed successfully.");
      
      res.status(201).json({
        success: true,
        message: "Documents generated and application approved successfully",
        verificationId,
        offerLetterUrl: `/uploads/documents/${offerLetterFilename}`
      });
    } catch (genError) {
      console.error("PDF generation failed:", {
        message: genError.message,
        stack: genError.stack,
        applicationId
      });
      
      res.status(500).json({ 
        success: false,
        message: "Failed to generate PDF documents. Application status was not updated.", 
        type: "PDF_GENERATION_ERROR",
        error: genError.message 
      });
    }
  } catch (error) {
    console.error("General Document generation error:", error);
    const statusCode = error.name === 'ValidationError' ? 400 : 500;
    res.status(statusCode).json({ 
      message: "Error in document generation process", 
      type: "GENERAL_ERROR",
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
  const { applicationId } = req.body;
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

  const uploadDir = path.join(__dirname, "../uploads/documents");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  try {
    const buffer = await generatePDF("paymentSlip", docData);
    const filename = `payment_slip_${applicationId}.pdf`;
    const filePath = path.join(uploadDir, filename);
    fs.writeFileSync(filePath, buffer);

    let document = await Document.findOne({ applicationId });
    if (document) {
      document.paymentSlipUrl = `/uploads/documents/${filename}`;
      await document.save();
    } else {
      const verificationId = `COS-P-${Date.now()}`;
      await Document.create({
        applicationId,
        user: application.user ? application.user._id : req.user._id,
        paymentSlipUrl: `/uploads/documents/${filename}`,
        verificationId
      });
    }

    res.status(201).json({
      success: true,
      message: "Payment slip generated successfully",
      paymentSlipUrl: `/uploads/documents/${filename}`
    });
  } catch (error) {
    res.status(500);
    throw new Error(`Failed to generate payment slip: ${error.message}`);
  }
});

module.exports = {
  generateDocuments,
  getDocumentByVerificationId,
  generatePaymentSlip,
};

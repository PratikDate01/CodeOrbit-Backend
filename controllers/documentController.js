const Document = require("../models/Document");
const InternshipApplication = require("../models/InternshipApplication");
const { generatePDF } = require("../utils/pdfGenerator");
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

const generateDocuments = async (req, res) => {
  try {
    const { applicationId, startDate: reqStartDate, endDate: reqEndDate } = req.body;
    const application = await InternshipApplication.findById(applicationId).populate("user");

    if (!application) {
      return res.status(404).json({ message: "Application not found" });
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
    const uploadDir = path.join(__dirname, "../uploads/documents");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Update application with dates if provided
    if (reqStartDate) application.startDate = reqStartDate;
    if (reqEndDate) application.endDate = reqEndDate;
    await application.save();

    // Generate Offer Letter
    console.log("Generating Offer Letter...");
    const offerLetterBuffer = await generatePDF("offerLetter", docData);
    const offerLetterFilename = `offer_letter_${applicationId}.pdf`;
    const offerLetterPath = path.join(uploadDir, offerLetterFilename);
    fs.writeFileSync(offerLetterPath, offerLetterBuffer);

    // Generate Certificate (Landscape)
    console.log("Generating Certificate...");
    const certificateBuffer = await generatePDF("certificate", docData, { landscape: true, margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" } });
    const certificateFilename = `certificate_${applicationId}.pdf`;
    const certificatePath = path.join(uploadDir, certificateFilename);
    fs.writeFileSync(certificatePath, certificateBuffer);

    // Generate LOC
    console.log("Generating LOC...");
    const locBuffer = await generatePDF("loc", docData);
    const locFilename = `loc_${applicationId}.pdf`;
    const locPath = path.join(uploadDir, locFilename);
    fs.writeFileSync(locPath, locBuffer);

    // Create or Update Document record
    let document = await Document.findOne({ applicationId });
    
    if (document) {
      document.offerLetterUrl = `/uploads/documents/${offerLetterFilename}`;
      document.certificateUrl = `/uploads/documents/${certificateFilename}`;
      document.locUrl = `/uploads/documents/${locFilename}`;
      document.verificationId = verificationId;
      await document.save();
    } else {
      document = await Document.create({
        applicationId,
        user: application.user ? application.user._id : req.user._id,
        offerLetterUrl: `/uploads/documents/${offerLetterFilename}`,
        certificateUrl: `/uploads/documents/${certificateFilename}`,
        locUrl: `/uploads/documents/${locFilename}`,
        verificationId,
      });
    }

    // Update Application status
    application.status = "Approved";
    await application.save();

    res.status(200).json({
      message: "Documents generated successfully",
      document,
    });
  } catch (error) {
    console.error("Document generation error:", error);
    res.status(500).json({ message: "Error generating documents", error: error.message });
  }
};

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

module.exports = {
  generateDocuments,
  getDocumentByVerificationId,
};

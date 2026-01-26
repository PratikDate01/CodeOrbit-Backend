const puppeteer = require("puppeteer");
const handlebars = require("handlebars");
const fs = require("fs");
const path = require("path");

const generatePDF = async (templateName, data, options = {}) => {
  console.log(`Starting PDF generation for template: ${templateName}`);
  const templatePath = path.join(__dirname, "../templates", `${templateName}.html`);
  
  if (!fs.existsSync(templatePath)) {
    console.error(`Template path does not exist: ${templatePath}`);
    throw new Error(`Template not found: ${templateName}`);
  }

  const htmlContent = fs.readFileSync(templatePath, "utf-8");
  const template = handlebars.compile(htmlContent);
  const finalHtml = template(data);

  let browser;
  try {
    console.log("Launching Puppeteer...");
    browser = await puppeteer.launch({
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
      headless: "new",
    });
    
    const page = await browser.newPage();
    console.log("Setting page content...");
    
    // Set content and wait for images/fonts to load
    await page.setContent(finalHtml, { 
      waitUntil: ["networkidle0", "domcontentloaded"],
      timeout: 60000 // Increase timeout to 60s for production
    });
    
    const pdfOptions = {
      format: "A4",
      printBackground: true,
      margin: {
        top: "10mm",
        right: "10mm",
        bottom: "10mm",
        left: "10mm",
      },
      ...options
    };

    console.log("Generating PDF buffer...");
    const pdfBuffer = await page.pdf(pdfOptions);
    console.log("PDF generation successful");
    return pdfBuffer;
  } catch (error) {
    console.error("Puppeteer PDF generation error:", {
      message: error.message,
      stack: error.stack,
      templateName
    });
    throw new Error(`Failed to generate PDF: ${error.message}`);
  } finally {
    if (browser) {
      console.log("Closing browser...");
      await browser.close();
    }
  }
};

module.exports = { generatePDF };

const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");
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
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    
    const page = await browser.newPage();
    console.log("Setting page content...");
    await page.setContent(finalHtml, { 
      waitUntil: "networkidle0",
      timeout: 30000 
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

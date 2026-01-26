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
  let retryCount = 0;
  const maxRetries = 2;

  while (retryCount <= maxRetries) {
    try {
      console.log(`Launching Puppeteer (Attempt ${retryCount + 1})...`);
      browser = await puppeteer.launch({
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-first-run",
          "--no-zygote",
          "--single-process",
        ],
        headless: "new",
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
        timeout: 60000, // 60s timeout for launch
      });
      break; // Success
    } catch (launchError) {
      retryCount++;
      console.error(`Puppeteer launch failed (Attempt ${retryCount}):`, launchError.message);
      if (retryCount > maxRetries) throw new Error(`Failed to launch browser after ${maxRetries} retries: ${launchError.message}`);
      // Wait a bit before retrying
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  try {
    const page = await browser.newPage();
    console.log("Setting page content...");
    
    // Set content and wait for images/fonts to load
    await page.setContent(finalHtml, { 
      waitUntil: ["networkidle0", "load", "domcontentloaded"],
      timeout: 90000 // Increase timeout to 90s for production cold starts
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

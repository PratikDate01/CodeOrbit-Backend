const puppeteer = require("puppeteer");
const handlebars = require("handlebars");
const fs = require("fs");
const path = require("path");

// Cache for compiled templates to improve performance safely
const templateCache = new Map();

/**
 * Generates a PDF buffer from a Handlebars template
 * @param {string} templateName - Name of the template file (without .html)
 * @param {object} data - Data to inject into the template
 * @param {object} options - Puppeteer PDF options
 * @returns {Promise<Buffer>}
 */
const generatePDF = async (templateName, data, options = {}) => {
  console.log(`[PDF] Starting generation for template: ${templateName}`);
  
  let template = templateCache.get(templateName);
  
  if (!template) {
    const templatePath = path.join(__dirname, "../templates", `${templateName}.html`);
    if (!fs.existsSync(templatePath)) {
      console.error(`[PDF] Template path does not exist: ${templatePath}`);
      throw new Error(`Template not found: ${templateName}`);
    }
    const htmlContent = fs.readFileSync(templatePath, "utf-8");
    template = handlebars.compile(htmlContent);
    templateCache.set(templateName, template);
    console.log(`[PDF] Template ${templateName} compiled and cached`);
  }

  const finalHtml = template(data);
  
  // Defensive check: Ensure HTML is non-empty before launching browser
  if (!finalHtml || finalHtml.trim().length === 0) {
    throw new Error(`Generated HTML for ${templateName} is empty`);
  }
  console.log(`[PDF] HTML content validated (length: ${finalHtml.length})`);

  let browser;
  let page;

  try {
    console.log(`[PDF] Launching browser for ${templateName}...`);
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
      timeout: 60000,
    });

    page = await browser.newPage();
    console.log("[PDF] Page created successfully");

    // CRITICAL FIX: Ensure HTML finishes rendering before moving to PDF generation
    // Use networkidle0 to wait for all resources (images/styles) to load
    console.log("[PDF] Setting content and waiting for networkidle0...");
    await page.setContent(finalHtml, { 
      waitUntil: "networkidle0",
      timeout: 90000 
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

    console.log("[PDF] Generating PDF buffer...");
    // CRITICAL FIX: Explicitly await the PDF generation
    const pdfBuffer = await page.pdf(pdfOptions);
    
    if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error("Generated PDF buffer is empty");
    }

    console.log(`[PDF] Generation successful (${pdfBuffer.length} bytes)`);
    return pdfBuffer;
  } catch (error) {
    console.error("[PDF] Generation failed:", {
      message: error.message,
      stack: error.stack,
      templateName
    });
    throw new Error(`Failed to generate PDF: ${error.message}`);
  } finally {
    // SAFE CLEANUP: Close page and browser properly
    if (page) {
      console.log("[PDF] Closing page...");
      await page.close().catch(err => console.error("[PDF] Error closing page:", err.message));
    }
    if (browser) {
      console.log("[PDF] Closing browser...");
      await browser.close().catch(err => console.error("[PDF] Error closing browser:", err.message));
    }
  }
};

module.exports = { generatePDF };

const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");
const handlebars = require("handlebars");
const fs = require("fs");
const path = require("path");

// Cache for compiled templates
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
  }

  const finalHtml = template(data);
  
  if (!finalHtml || finalHtml.trim().length === 0) {
    throw new Error(`Generated HTML for ${templateName} is empty`);
  }

  let browser = null;
  try {
    const isProduction = process.env.NODE_ENV === "production" || process.env.RENDER;
    
    console.log(`[PDF] Launching browser (isProduction: ${!!isProduction})...`);
    
    browser = await puppeteer.launch({
      args: isProduction ? chromium.args : [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
      defaultViewport: chromium.defaultViewport,
      executablePath: isProduction 
        ? await chromium.executablePath() 
        : (process.env.PUPPETEER_EXECUTABLE_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"),
      headless: isProduction ? chromium.headless : true,
    });

    const page = await browser.newPage();
    console.log("[PDF] Page created");

    // Use networkidle0 to ensure all images and styles are loaded
    await page.setContent(finalHtml, { 
      waitUntil: "networkidle0",
      timeout: 60000 
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

    console.log("[PDF] Generating PDF...");
    const pdfBuffer = await page.pdf(pdfOptions);
    
    if (!pdfBuffer) {
        throw new Error("Puppeteer failed to generate PDF buffer (null/undefined)");
    }

    // Convert to Buffer if it's a Uint8Array (standard Puppeteer return)
    const finalBuffer = Buffer.from(pdfBuffer);
    
    // Validate PDF header and size
    const isPDF = finalBuffer.slice(0, 5).toString() === "%PDF-";
    if (!isPDF || finalBuffer.length < 1000) {
        throw new Error(`Invalid PDF generated. Header: ${finalBuffer.slice(0, 5).toString()}, Size: ${finalBuffer.length} bytes`);
    }

    console.log(`[PDF] Successfully generated (${finalBuffer.length} bytes)`);
    return finalBuffer;
  } catch (error) {
    console.error("[PDF] CRITICAL FAILURE:", error);
    throw new Error(`PDF Generation failed: ${error.message}`);
  } finally {
    if (browser !== null) {
      console.log("[PDF] Closing browser...");
      await browser.close();
    }
  }
};

module.exports = { generatePDF };

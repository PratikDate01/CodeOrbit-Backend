const puppeteer = require("puppeteer");
const handlebars = require("handlebars");
const fs = require("fs");
const path = require("path");

const generatePDF = async (templateName, data, options = {}) => {
  const templatePath = path.join(__dirname, "../templates", `${templateName}.html`);
  const htmlContent = fs.readFileSync(templatePath, "utf-8");
  const template = handlebars.compile(htmlContent);
  const finalHtml = template(data);

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setContent(finalHtml, { waitUntil: "networkidle0" });
  
  const pdfOptions = {
    format: "A4",
    printBackground: true,
    margin: {
      top: "0mm",
      right: "0mm",
      bottom: "0mm",
      left: "0mm",
    },
    ...options
  };

  const pdfBuffer = await page.pdf(pdfOptions);

  await browser.close();
  return pdfBuffer;
};

module.exports = { generatePDF };

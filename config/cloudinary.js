const cloudinary = require("cloudinary").v2;
require("dotenv").config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Uploads a buffer to Cloudinary with strict Promise handling
 * @param {Buffer} buffer - The file buffer
 * @param {string} folder - Cloudinary folder name
 * @param {string} filename - Desired filename
 */
const uploadBufferToCloudinary = (buffer, folder, filename) => {
  return new Promise((resolve, reject) => {
    // 1. Pre-upload validation
    if (!buffer || buffer.length < 1000) {
      console.error(`[Cloudinary] Upload failed: Buffer is empty or too small for ${filename}`);
      return reject(new Error("PDF Buffer is empty or corrupt - cannot upload"));
    }

    // Clean public_id and ensure it ends with .pdf for raw resource type
    const cleanPublicId = filename.replace(/\.pdf$/i, "");
    
    const options = {
      folder: folder,
      public_id: `${cleanPublicId}.pdf`, 
      resource_type: "raw",
      overwrite: true,
      invalidate: true,
      content_disposition: "inline" 
    };

    console.log(`[Cloudinary] Starting RAW upload for: ${options.public_id}`);

    const uploadStream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) {
          console.error(`[Cloudinary] UPLOAD ERROR for ${filename}:`, error);
          return reject(error);
        }
        if (!result || !result.secure_url) {
          console.error(`[Cloudinary] INVALID RESULT for ${filename}`);
          return reject(new Error("Cloudinary upload succeeded but no URL returned"));
        }
        console.log(`[Cloudinary] SUCCESS: ${result.secure_url}`);
        resolve(result);
      }
    );

    // 2. Handle stream errors
    uploadStream.on("error", (err) => {
      console.error(`[Cloudinary] Stream Event Error for ${filename}:`, err);
      reject(err);
    });

    // 3. Finalize stream
    uploadStream.end(buffer);
  });
};

module.exports = {
  cloudinary,
  uploadBufferToCloudinary,
};

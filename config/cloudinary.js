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
    if (!buffer || !Buffer.isBuffer(buffer)) {
      console.error(`[Cloudinary] Invalid input: Expected Buffer for ${filename}`);
      return reject(new Error("Upload failed: Input is not a valid Buffer"));
    }

    if (buffer.length < 1000) {
      console.error(`[Cloudinary] Buffer too small (${buffer.length} bytes) for ${filename}`);
      return reject(new Error("Upload failed: Buffer is too small to be a valid PDF"));
    }

    // Ensure we have a clean filename without any .pdf extension
    const cleanPublicId = filename.replace(/\.pdf$/gi, "");
    
    // Cloudinary upload options according to requirements
    const options = {
      public_id: `${folder}/${cleanPublicId}`.replace(/\/+/g, "/"),
      resource_type: "auto",             // Auto-detect type (handles PDFs correctly)
      overwrite: true,
      invalidate: true,
      unique_filename: false,
    };

    console.log(`[Cloudinary] Uploading ${buffer.length} bytes for: ${options.public_id}`);

    const uploadStream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) {
          console.error(`[Cloudinary] UPLOAD ERROR:`, error);
          return reject(error);
        }
        if (!result || !result.secure_url) {
          return reject(new Error("Cloudinary upload succeeded but no URL returned"));
        }
        console.log(`[Cloudinary] SUCCESS: ${result.secure_url} (${result.bytes} bytes)`);
        resolve(result);
      }
    );

    uploadStream.on("error", (err) => {
      console.error(`[Cloudinary] Stream error:`, err);
      reject(err);
    });

    uploadStream.end(buffer);
  });
};

module.exports = {
  cloudinary,
  uploadBufferToCloudinary,
};

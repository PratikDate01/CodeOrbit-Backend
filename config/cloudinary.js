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
 * @param {string} resourceType - Cloudinary resource type (raw, image, auto)
 */
const uploadBufferToCloudinary = (buffer, folder, filename, resourceType = "auto") => {
  return new Promise((resolve, reject) => {
    // 1. Pre-upload validation
    if (!buffer || !Buffer.isBuffer(buffer)) {
      console.error(`[Cloudinary] Invalid input: Expected Buffer for ${filename}`);
      return reject(new Error("Upload failed: Input is not a valid Buffer"));
    }

    if (buffer.length < 100) {
      console.error(`[Cloudinary] Buffer too small (${buffer.length} bytes) for ${filename}`);
      return reject(new Error("Upload failed: Buffer is too small"));
    }

    // For PDFs, we want 'image' or 'auto' to ensure they are viewable in browsers
    // 'raw' resource type often leads to 'untrusted' errors or download-only behavior.
    const finalResourceType = (filename.toLowerCase().endsWith(".pdf") || resourceType === "raw") 
      ? "auto" 
      : resourceType;

    // Cloudinary upload options
    const options = {
      folder: folder.replace(/\/+/g, "/"),
      public_id: filename.replace(/\.[^/.]+$/, ""), // Remove extension for better path handling in Cloudinary
      resource_type: finalResourceType,
      overwrite: true,
      invalidate: true,
      access_mode: "public",
    };

    console.log(`[Cloudinary] Uploading ${buffer.length} bytes as ${finalResourceType} to ${options.folder}/${options.public_id}`);

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

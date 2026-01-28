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
 * @param {string} resourceType - raw, image, auto
 */
const uploadBufferToCloudinary = (buffer, folder, filename, resourceType = "raw") => {
  return new Promise((resolve, reject) => {
    // 1. Pre-upload validation
    if (!buffer || buffer.length === 0) {
      console.error(`[Cloudinary] Upload failed: Buffer is empty for ${filename}`);
      return reject(new Error("PDF Buffer is empty - cannot upload"));
    }

    const options = {
      folder: folder,
      public_id: filename, // Keep the full filename including extension
      resource_type: resourceType,
      overwrite: true,
      invalidate: true,
      content_disposition: "inline" // Try to force inline viewing
    };

    console.log(`[Cloudinary] Starting ${resourceType} upload for: ${filename}`);
    console.log(`[Cloudinary] Folder: ${folder}, Size: ${buffer.length} bytes`);

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
        console.log(`[Cloudinary] SUCCESS: ${filename} => ${result.secure_url}`);
        resolve(result);
      }
    );

    // 2. Handle stream errors (e.g., network issues during streaming)
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

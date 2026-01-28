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
    if (!buffer || buffer.length < 500) {
      console.error(`[Cloudinary] Upload failed: Buffer is empty or too small for ${filename}`);
      return reject(new Error("PDF Buffer is empty or corrupt - cannot upload"));
    }

    // Strip .pdf from public_id if it exists to prevent double extension
    const cleanPublicId = filename.replace(/\.pdf$/i, "");
    
    const options = {
      folder: folder,
      public_id: `${cleanPublicId}.pdf`, // For raw files, extension MUST be in public_id
      resource_type: "raw",              // Ensures /raw/upload/ URL
      overwrite: true,
      invalidate: true,
      unique_filename: false,            // Prevents Cloudinary from adding random suffixes
      use_filename: true,               // Uses the provided filename
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

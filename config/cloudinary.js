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

    // Ensure we have a clean filename without any .pdf extension
    const cleanPublicId = filename.replace(/\.pdf$/gi, "");
    
    // For RAW resource type, we must include the folder in the public_id 
    // and explicitly include the .pdf extension at the end of the public_id.
    const options = {
      public_id: `${folder}/${cleanPublicId}.pdf`.replace(/\/+/g, "/"),
      resource_type: "raw",              // Forces /raw/upload/
      overwrite: true,
      invalidate: true,
      unique_filename: false,            // Ensures no random characters are added
    };

    console.log(`[Cloudinary] Uploading with options:`, JSON.stringify(options));

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

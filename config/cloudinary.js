const cloudinary = require("cloudinary").v2;
require("dotenv").config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Uploads a buffer to Cloudinary
 * @param {Buffer} buffer - The file buffer
 * @param {string} folder - Cloudinary folder name
 * @param {string} filename - Desired filename (without extension)
 * @param {string} resourceType - Cloudinary resource type (image, raw, video, auto)
 * @returns {Promise<object>} - Cloudinary upload response
 */
const uploadBufferToCloudinary = (buffer, folder, filename, resourceType = "auto") => {
  return new Promise((resolve, reject) => {
    if (!buffer || buffer.length === 0) {
      return reject(new Error("Empty buffer provided for upload"));
    }

    const options = {
      folder: folder,
      public_id: filename,
      resource_type: resourceType,
    };

    console.log(`[Cloudinary] Starting ${resourceType} upload to folder: ${folder}`);

    const uploadStream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) {
          console.error("[Cloudinary] Upload Stream Callback Error:", error);
          return reject(error);
        }
        console.log(`[Cloudinary] Upload Successful: ${result.secure_url}`);
        resolve(result);
      }
    );

    uploadStream.on("error", (err) => {
      console.error("[Cloudinary] Upload Stream Event Error:", err);
      reject(err);
    });

    uploadStream.end(buffer);
  });
};

module.exports = {
  cloudinary,
  uploadBufferToCloudinary,
};

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
    const options = {
      folder: folder,
      public_id: filename,
      resource_type: resourceType,
    };

    const uploadStream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    uploadStream.end(buffer);
  });
};

module.exports = {
  cloudinary,
  uploadBufferToCloudinary,
};

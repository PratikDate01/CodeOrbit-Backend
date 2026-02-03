const dotenv = require("dotenv");
dotenv.config();

const requiredEnvVars = [
  "MONGO_URI",
  "PORT",
  "JWT_SECRET",
  "FRONTEND_URL",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_CALLBACK_URL",
  "ADMIN_EMAIL"
];

const validateEnv = () => {
  const missingVars = requiredEnvVars.filter((envVar) => !process.env[envVar]);

  if (missingVars.length > 0) {
    console.error(
      `FATAL ERROR: Missing required environment variables: ${missingVars.join(
        ", "
      )}`
    );
    process.exit(1);
  }
};

module.exports = validateEnv;

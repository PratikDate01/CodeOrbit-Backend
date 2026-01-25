const dotenv = require("dotenv");
dotenv.config();

const requiredEnvVars = ["MONGO_URI", "PORT"];

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

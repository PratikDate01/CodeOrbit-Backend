const ErrorLog = require("../models/ErrorLog");

const sanitizeMetadata = (req) => {
  const metadata = {
    headers: { ...req.headers },
    query: { ...req.query },
    body: { ...req.body },
  };

  // Remove sensitive headers
  const sensitiveHeaders = ["authorization", "cookie", "x-razorpay-signature"];
  sensitiveHeaders.forEach((header) => {
    if (metadata.headers[header]) {
      metadata.headers[header] = "[REDACTED]";
    }
  });

  // Remove sensitive body keys
  const sensitiveBodyKeys = ["password", "token", "newPassword", "confirmPassword", "razorpay_signature"];
  sensitiveBodyKeys.forEach((key) => {
    if (metadata.body[key]) {
      metadata.body[key] = "[REDACTED]";
    }
  });

  return metadata;
};

const errorHandler = (err, req, res, _next) => {
  // Log the error for server-side debugging
  console.error(`Error: ${err.message}`);
  console.error(err.stack);

  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  const severity = statusCode >= 500 ? "critical" : "warning";

  // Asynchronously log to the database without blocking the request
  try {
    ErrorLog.create({
      message: err.message || "Unknown Error",
      stack: err.stack,
      path: req.originalUrl || req.url,
      method: req.method,
      user: req.user ? req.user._id : undefined,
      ip: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      metadata: sanitizeMetadata(req),
      severity,
      resolved: false,
    }).catch((dbErr) => {
      console.error("Failed to write error log to MongoDB:", dbErr.message);
    });
  } catch (logErr) {
    console.error("Error logging failed:", logErr.message);
  }

  res.status(statusCode);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
};

module.exports = errorHandler;

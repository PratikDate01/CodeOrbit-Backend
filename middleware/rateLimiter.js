const rateLimit = require("express-rate-limit");

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Increased for Admin Panel dashboard needs
  message: {
    message: "Too many requests from this IP, please try again after 15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, 
  message: {
    message:
      "Too many contact submissions from this IP, please try again after an hour",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Slightly increased but still strict
  message: {
    message: "Too many attempts from this IP, please try again after an hour",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { apiLimiter, contactLimiter, authLimiter };

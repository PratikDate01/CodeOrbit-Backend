const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const path = require("path");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const hpp = require("hpp");
const connectDB = require("./config/db");
const errorHandler = require("./middleware/errorHandler");
const { apiLimiter, contactLimiter, authLimiter } = require("./middleware/rateLimiter");

dotenv.config();

// Connect to Database
connectDB();

const app = express();

// 1. Security & Optimization Middleware
app.use(helmet({
  crossOriginResourcePolicy: false, // Allow serving static images
}));
app.use(express.json({ limit: "10kb" })); // Body limit to prevent DDoS
app.use(mongoSanitize()); // Data sanitization against NoSQL injection
app.use(xss()); // Data sanitization against XSS
app.use(hpp()); // Prevent HTTP parameter pollution
app.use(compression());
app.use(morgan("dev"));

// 2. CORS Configuration
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://code-orbit-tech.vercel.app",
  "http://localhost:3000"
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.error(`CORS Blocked: ${origin}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

// 3. Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4. Rate Limiting (Exclude Admin/Critical Routes)
app.use("/api", (req, res, next) => {
  const skipPaths = ["/internships", "/documents", "/admin", "/auth", "/applications", "/payments"];
  const isSkip = skipPaths.some(path => req.path.startsWith(path));
  if (isSkip) return next();
  return apiLimiter(req, res, next);
});

// 5. Static Folders (Absolute Paths)
app.use("/uploads", express.static(path.resolve(__dirname, "uploads")));
app.use("/assets", express.static(path.resolve(__dirname, "assets")));

// 6. Routes
app.get("/api/ping", (req, res) => res.status(200).send("pong"));

// Apply stricter rate limiting to auth and payments
app.use("/api/auth", authLimiter);
app.use("/api/payments", authLimiter);

app.use("/api/contact", require("./routes/contactRoutes"));
app.use("/api/internships", require("./routes/internshipRoutes"));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/applications", require("./routes/applicationRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/documents", require("./routes/documentRoutes"));
app.use("/api/payments", require("./routes/paymentRoutes"));

app.get("/", (req, res) => {
  res.send("Backend is running");
});

// 7. 404 Handler
app.use((req, res, _next) => {
  console.warn(`404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    message: `Route not found - ${req.originalUrl}`,
    method: req.method
  });
});

// 8. Global Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

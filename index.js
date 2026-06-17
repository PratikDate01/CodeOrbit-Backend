const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");
try {
  const currentServers = dns.getServers();
  if (currentServers.length === 0 || (currentServers.length === 1 && (currentServers[0] === "127.0.0.1" || currentServers[0] === "::1"))) {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
    console.log("Configured Node DNS resolver with public fallbacks for SRV lookups");
  }
} catch (dnsErr) {
  console.warn("Could not set DNS fallback:", dnsErr.message);
}

const express = require("express");
const dotenv = require("dotenv");
// Load env vars first!
dotenv.config();

const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const path = require("path");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");
const hpp = require("hpp");
const passport = require("passport");
const validateEnv = require("./config/env");
const connectDB = require("./config/db");
require("./config/passport");
const errorHandler = require("./middleware/errorHandler");
const { apiLimiter, authLimiter, contactLimiter } = require("./middleware/rateLimiter");
const { maintenanceMiddleware } = require("./middleware/maintenanceMiddleware");

// Event Loop Monitor
const { startMonitoring } = require("./utils/eventLoopMonitor");
startMonitoring();

// Register CentralLog model
require("./models/CentralLog");
require("./models/ColdStartWorker");

const apiPerformanceMiddleware = require("./middleware/apiPerformanceMiddleware");

// Validate Environment Variables
validateEnv();

const app = express();

// 1. CORS Configuration (MUST come before other middleware)
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://code-orbit-tech.vercel.app",
  "https://www.code-orbit-tech.vercel.app",
  "https://codeorbit.in",
  "http://localhost:3000"
].filter(Boolean).map(url => url.toLowerCase().replace(/\/$/, ""));

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    const normalizedOrigin = origin.toLowerCase().replace(/\/$/, "");
    if (allowedOrigins.includes(normalizedOrigin)) {
      callback(null, true);
    } else {
      console.warn(`CORS request from unauthorized origin: ${origin}`);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Content-Type", 
    "Authorization", 
    "X-Requested-With", 
    "Accept", 
    "Origin",
    "Access-Control-Allow-Headers",
    "Access-Control-Request-Method",
    "Access-Control-Request-Headers"
  ],
  exposedHeaders: ["Content-Disposition", "x-rtb-fingerprint-id"],
  optionsSuccessStatus: 200
}));

// 2. Core Parsers
app.use(express.json({ 
  limit: "50mb",
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(passport.initialize());
app.use(apiPerformanceMiddleware);

// 3. Security & Optimization Middleware
app.use(helmet({
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(mongoSanitize());
app.use(xss()); 
app.use(hpp({
  whitelist: [
    "status",
    "role",
    "page",
    "limit",
    "sort",
    "preferredDomain",
    "paymentStatus"
  ]
}));
app.use(compression());
app.use(morgan("dev"));

// Apply global maintenance middleware
app.use(maintenanceMiddleware);

// 4. Static Folders
app.use("/uploads", express.static(path.resolve(__dirname, "uploads")));
app.use("/assets", express.static(path.resolve(__dirname, "assets")));

// 4. Rate Limiting (Exclude Admin/Critical Routes)
app.use("/api", (req, res, next) => {
  const skipPaths = ["/internships", "/documents", "/admin", "/auth", "/applications", "/payments"];
  const isSkip = skipPaths.some(path => req.path.startsWith(path));
  if (isSkip) return next();
  return apiLimiter(req, res, next);
});

// 5. Routes
app.get("/api/ping", (req, res) => res.status(200).send("pong"));

// Public maintenance status endpoint
app.get("/api/maintenance/status", async (req, res) => {
  try {
    const SystemSetting = require("./models/SystemSetting");
    let settings = await SystemSetting.findOne({ key: "maintenance_config" });
    res.json({ maintenanceMode: settings ? settings.maintenanceMode : false });
  } catch {
    res.json({ maintenanceMode: false });
  }
});

// Apply stricter rate limiting to auth and payments
app.use("/api/auth", authLimiter);
app.use("/api/payments", authLimiter);

app.use("/api/contact", contactLimiter, require("./routes/contactRoutes"));
app.use("/api/internships", require("./routes/internshipRoutes"));
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/auth", require("./routes/authRoutes"));
app.use("/api/applications", require("./routes/applicationRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/admin/lms", require("./routes/lmsAdminRoutes"));
app.use("/api/lms", require("./routes/lmsStudentRoutes"));
app.use("/api/lms/assignment", require("./routes/assignmentRoutes"));
app.use("/api/admin/system", require("./routes/systemRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/documents", require("./routes/documentRoutes"));
app.use("/api/payments", require("./routes/paymentRoutes"));
app.use("/api/activity", require("./routes/activityRoutes"));
app.use("/api/attendance", require("./routes/attendanceRoutes"));

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

const startServer = async () => {
  try {
    // Connect to Database
    await connectDB();

    const server = app.listen(PORT, () => {
      console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
    });

    // Prevents Render Cold-Start spin down on free tiers and tracks health status
    const axios = require("axios");
    const mongoose = require("mongoose");
    const ColdStartWorker = mongoose.model("ColdStartWorker");
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${PORT}`;
    const pingInterval = process.env.NODE_ENV === "production" ? 10 * 60 * 1000 : 1 * 60 * 1000;

    const triggerSelfPing = async () => {
      const startTime = Date.now();
      const pingUrl = `${backendUrl.replace(/\/$/, "")}/api/ping`;
      try {
        await axios.get(pingUrl, { timeout: 10000 });
        const duration = Date.now() - startTime;
        
        await ColdStartWorker.findOneAndUpdate(
          { workerId: "main_worker" },
          {
            $set: {
              status: "Active",
              lastSuccessPing: new Date(),
              lastPingDuration: duration,
              lastPingTime: new Date()
            },
            $inc: { successCount: 1 }
          },
          { upsert: true, new: true }
        );
        console.log(`[Cold-Start Worker] Self-ping successful: ${pingUrl} in ${duration}ms`);
      } catch (pingErr) {
        const duration = Date.now() - startTime;
        await ColdStartWorker.findOneAndUpdate(
          { workerId: "main_worker" },
          {
            $set: {
              status: "Degraded",
              lastFailedPing: new Date(),
              lastPingDuration: duration,
              lastPingTime: new Date()
            },
            $inc: { failureCount: 1 }
          },
          { upsert: true, new: true }
        );
        console.warn(`[Cold-Start Worker] Self-ping failed: ${pingErr.message}`);
      }
    };

    console.log(`[Cold-Start Worker] Initializing self-ping worker for ${backendUrl}`);
    setTimeout(triggerSelfPing, 5000);
    setInterval(triggerSelfPing, pingInterval);

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (err) => {
      console.error(`Error: ${err.message}`);
      // Close server & exit process
      server.close(() => process.exit(1));
    });

    // Handle uncaught exceptions
    process.on("uncaughtException", (err) => {
      console.error(`Uncaught Exception: ${err.message}`);
      // Close server & exit process
      server.close(() => process.exit(1));
    });

  } catch (error) {
    console.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

module.exports = app;

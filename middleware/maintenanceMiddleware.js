const jwt = require("jsonwebtoken");
const User = require("../models/User");
const SystemSetting = require("../models/SystemSetting");

// In-memory cache for maintenance settings to avoid DB queries on every request
let cache = {
  maintenanceMode: false,
  allowedUsers: [],
  lastFetched: 0
};

const CACHE_TTL = 10000; // 10 seconds cache TTL

const getMaintenanceConfig = async () => {
  const now = Date.now();
  if (now - cache.lastFetched > CACHE_TTL) {
    try {
      let settings = await SystemSetting.findOne({ key: "maintenance_config" }).lean();
      if (!settings) {
        settings = { maintenanceMode: false, allowedUsers: [] };
      }
      cache = {
        maintenanceMode: settings.maintenanceMode || false,
        allowedUsers: settings.allowedUsers || [],
        lastFetched: now
      };
    } catch (err) {
      console.error("Error fetching maintenance settings:", err.message);
    }
  }
  return cache;
};

const updateMaintenanceCache = (config) => {
  cache = {
    maintenanceMode: config.maintenanceMode,
    allowedUsers: config.allowedUsers || [],
    lastFetched: Date.now()
  };
};

const maintenanceMiddleware = async (req, res, next) => {
  // Always allow CORS preflight requests
  if (req.method === "OPTIONS") {
    return next();
  }

  // Exempt paths that should never be blocked
  const exemptPaths = [
    "/api/ping",
    "/api/maintenance/status",
    "/auth/google",
    "/auth/google/callback",
    "/uploads/",
    "/assets/"
  ];

  const isExempt = exemptPaths.some((p) => {
    if (p.endsWith("/")) {
      return req.path.startsWith(p);
    }
    return req.path === p;
  });

  if (isExempt) {
    return next();
  }

  const config = await getMaintenanceConfig();

  // If maintenance mode is OFF, let everything pass
  if (!config.maintenanceMode) {
    return next();
  }

  // Check if user is Admin, Super Admin, or Whitelisted
  let isAllowed = false;
  let user = null;

  // 1. Identify user from Bearer Token in Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      const token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      user = await User.findById(decoded.id).select("-password");
    } catch (err) {
      // Invalid or expired token
    }
  }

  // 2. Identify user from login/register email in request body
  const isAuthRoute = req.path === "/api/auth/login" || req.path === "/auth/login" || req.path === "/api/auth/register";
  if (!user && isAuthRoute && req.body && req.body.email) {
    try {
      user = await User.findOne({ email: req.body.email.toLowerCase() });
    } catch (err) {
      // DB error
    }
  }

  // 3. Check roles and whitelist
  if (user) {
    const role = user.role ? user.role.toLowerCase() : "";
    if (role === "admin" || role === "superadmin" || role === "super_admin") {
      isAllowed = true;
    } else if (config.allowedUsers && config.allowedUsers.length > 0) {
      const userEmail = user.email ? user.email.toLowerCase().trim() : "";
      const userIdStr = user._id ? user._id.toString().trim() : "";
      
      const isWhitelisted = config.allowedUsers.some((allowed) => {
        const cleanAllowed = allowed.toLowerCase().trim();
        return cleanAllowed === userEmail || cleanAllowed === userIdStr;
      });

      if (isWhitelisted) {
        isAllowed = true;
      }
    }
  }

  if (isAllowed) {
    return next();
  }

  // Block the request with HTTP 503
  return res.status(503).json({
    success: false,
    message: "System under maintenance",
  });
};

module.exports = {
  maintenanceMiddleware,
  updateMaintenanceCache,
};

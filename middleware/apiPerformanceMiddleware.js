const RequestLog = require("../models/RequestLog");

const apiPerformanceMiddleware = (req, res, next) => {
  // Exclude OPTIONS, static uploads/assets, and system routes to avoid loops and bloat
  if (
    req.method === "OPTIONS" ||
    req.path.startsWith("/uploads") ||
    req.path.startsWith("/assets") ||
    req.path.startsWith("/api/admin/system")
  ) {
    return next();
  }

  const start = process.hrtime();

  res.on("finish", async () => {
    try {
      const diff = process.hrtime(start);
      const responseTime = Math.round((diff[0] * 1e9 + diff[1]) / 1e6); // in ms
      
      // Matched generic route if available (e.g. /api/internships/:id), fallback to request path
      const route = req.route ? (req.baseUrl + req.route.path) : req.path.split("?")[0];

      await RequestLog.create({
        route,
        method: req.method,
        statusCode: res.statusCode,
        responseTime,
        timestamp: new Date()
      });
    } catch (err) {
      console.error("Failed to log request performance metrics:", err.message);
    }
  });

  next();
};

module.exports = apiPerformanceMiddleware;

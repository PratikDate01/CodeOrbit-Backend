const jwt = require("jsonwebtoken");
const User = require("../models/User");
const SecurityEvent = require("../models/SecurityEvent");

const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(" ")[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Get user from the token
      req.user = await User.findById(decoded.id).select("-password");

      if (req.user) {
        const now = new Date();
        const lastActive = req.user.lastActive;
        // Limit DB writes: update lastActive only if it was not updated in the last 2 minutes
        if (!lastActive || (now - new Date(lastActive)) > 2 * 60 * 1000) {
          User.findByIdAndUpdate(req.user._id, { lastActive: now }).catch((err) => {
            console.error("Failed to update user lastActive:", err.message);
          });
        }
      }

      next();
    } catch (error) {
      console.error(error);
      // Log invalid JWT event asynchronously
      SecurityEvent.create({
        eventType: "invalid_jwt",
        action: `JWT verification failed: ${error.message}`,
        ipAddress: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress,
        details: { token: token ? `${token.substring(0, 10)}...` : null, error: error.message }
      }).catch(logErr => console.error("Failed to log invalid JWT event:", logErr.message));

      res.status(401);
      const err = new Error("Not authorized");
      next(err);
    }
  }

  if (!token) {
    // Log missing token event asynchronously
    SecurityEvent.create({
      eventType: "invalid_jwt",
      action: `Authorization token missing for path: ${req.originalUrl || req.url}`,
      ipAddress: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress,
    }).catch(logErr => console.error("Failed to log missing token event:", logErr.message));

    res.status(401);
    const err = new Error("Not authorized, no token");
    next(err);
  }
};

const admin = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    // Log unauthorized access attempt asynchronously
    SecurityEvent.create({
      eventType: "unauthorized_access",
      user: req.user ? req.user._id : undefined,
      email: req.user ? req.user.email : undefined,
      action: `Unauthorized admin route access attempt: ${req.originalUrl || req.url}`,
      ipAddress: req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      details: { path: req.originalUrl || req.url, role: req.user ? req.user.role : null }
    }).catch(logErr => console.error("Failed to log unauthorized access event:", logErr.message));

    res.status(403);
    const err = new Error("Not authorized as an admin");
    next(err);
  }
};

const staff = (req, res, next) => {
  if (
    req.user &&
    (req.user.role === "admin" ||
      req.user.role === "instructor" ||
      req.user.role === "moderator")
  ) {
    next();
  } else {
    res.status(403);
    const err = new Error("Not authorized as staff");
    next(err);
  }
};

module.exports = { protect, admin, staff };

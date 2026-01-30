const express = require("express");
const router = express.Router();
const passport = require("passport");
const {
  registerUser,
  loginUser,
  googleLogin,
  googleCallback,
  getUserProfile,
  updateUserProfile,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

router.post("/register", registerUser);
router.post("/login", loginUser);

// Google OAuth Routes
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["openid", "profile", "email"],
    prompt: "select_account",
    accessType: "offline",
  })
);
router.get(
  "/google/callback",
  passport.authenticate("google", { 
    session: false, 
    failureRedirect: `${process.env.FRONTEND_URL || "http://localhost:3000"}/login?error=auth_failed` 
  }),
  googleCallback
);

router.route("/profile").get(protect, getUserProfile).put(protect, updateUserProfile);

module.exports = router;

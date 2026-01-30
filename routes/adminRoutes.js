const express = require("express");
const router = express.Router();
const {
  getStats,
  getUsers,
  deleteUser,
} = require("../controllers/adminController");
const {
  createCoupon,
  getCoupons,
  getCouponById,
  updateCoupon,
  deleteCoupon,
  getCouponUsageHistory,
} = require("../controllers/couponController");
const { protect, admin } = require("../middleware/authMiddleware");

router.use(protect);
router.use(admin);

router.get("/stats", getStats);
router.get("/users", getUsers);
router.delete("/users/:id", deleteUser);

// Coupon routes
router.route("/coupons")
  .get(getCoupons)
  .post(createCoupon);

router.route("/coupons/usage-history")
  .get(getCouponUsageHistory);

router.route("/coupons/:id")
  .get(getCouponById)
  .put(updateCoupon)
  .delete(deleteCoupon);

module.exports = router;

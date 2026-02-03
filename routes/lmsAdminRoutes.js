const express = require("express");
const router = express.Router();
const {
  getPrograms,
  createProgram,
  updateProgram,
  deleteProgram,
  getCourses,
  createCourse,
  getModules,
  createModule,
  getActivities,
  createActivity,
  approveActivityProgress,
  getEnrollments,
  issueCertificate,
} = require("../controllers/lmsAdminController");
const { protect, admin, staff } = require("../middleware/authMiddleware");

// All routes here are protected and require staff or admin access
router.use(protect);

// Enrollment routes
router.get("/enrollments", staff, getEnrollments);
router.post("/enrollments/:id/issue-certificate", admin, issueCertificate);

// Program routes
router.route("/programs")
  .get(staff, getPrograms)
  .post(admin, createProgram);

router.route("/programs/:id")
  .put(admin, updateProgram)
  .delete(admin, deleteProgram);

// Course routes
router.route("/programs/:programId/courses")
  .get(staff, getCourses);
router.route("/courses")
  .post(admin, createCourse);

// Module routes
router.route("/courses/:courseId/modules")
  .get(staff, getModules);
router.route("/modules")
  .post(admin, createModule);

// Lesson/Activity routes (Simplified for now)
router.route("/lessons/:lessonId/activities")
  .get(staff, getActivities);
router.route("/activities")
  .post(admin, createActivity);

// Approval route
router.route("/progress/:id/approve")
  .patch(admin, approveActivityProgress);

module.exports = router;

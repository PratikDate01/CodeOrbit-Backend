const express = require("express");
const router = express.Router();
const {
  getPrograms,
  createProgram,
  updateProgram,
  deleteProgram,
  getCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  getModules,
  createModule,
  updateModule,
  deleteModule,
  getLessons,
  createLesson,
  updateLesson,
  deleteLesson,
  getActivities,
  createActivity,
  updateActivity,
  deleteActivity,
  getPendingApprovals,
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

router.route("/courses/:id")
  .put(admin, updateCourse)
  .delete(admin, deleteCourse);

// Module routes
router.route("/courses/:courseId/modules")
  .get(staff, getModules);

router.route("/modules")
  .post(admin, createModule);

router.route("/modules/:id")
  .put(admin, updateModule)
  .delete(admin, deleteModule);

// Lesson routes
router.route("/modules/:moduleId/lessons")
  .get(staff, getLessons);

router.route("/lessons")
  .post(admin, createLesson);

router.route("/lessons/:id")
  .put(admin, updateLesson)
  .delete(admin, deleteLesson);

// Activity routes
router.route("/lessons/:lessonId/activities")
  .get(staff, getActivities);

router.route("/activities")
  .post(admin, createActivity);

router.route("/activities/:id")
  .put(admin, updateActivity)
  .delete(admin, deleteActivity);

// Approval route
router.get("/approvals/pending", staff, getPendingApprovals);
router.route("/progress/:id/approve")
  .patch(admin, approveActivityProgress);

module.exports = router;
